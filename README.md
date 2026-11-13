# Restaurant POS & Inventory

A web-based point-of-sale for small restaurants and cafés: admin menu management, guest self-ordering from a digital menu, and **automatic ingredient stock deduction** when orders are placed.

Built with Next.js 16 (App Router), TypeScript, PostgreSQL (Supabase), Prisma 7, Tailwind CSS 4 and Zod.

```
Admin creates ingredients → creates menu items → assigns recipes
Guest places order → server validates stock → order saved + ingredients deducted (one transaction)
Admin sees the order and the updated inventory; cancelling restores the exact quantities
```

---

## Quick start

Requirements: **Node.js 20.19+** (22 LTS recommended) and a PostgreSQL database (Supabase works out of the box).

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env        # then fill in the values (see below)
npm run db:deploy           # apply migrations to your database
npm run db:seed             # admin account + Malaysian café demo data
npm run dev                 # http://localhost:3000
```

| URL | What |
| --- | --- |
| `/order` | Guest digital menu (mobile-first). Add `?table=12` on table QR codes to prefill the table number at checkout. |
| `/admin/login` | Back office. Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. |

### Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Runtime connection. On Supabase use the **Transaction pooler** string (port `6543`, append `?pgbouncer=true`). |
| `DIRECT_URL` | Used by the Prisma CLI for migrations/seed. On Supabase use the **Session pooler** or direct connection (port `5432`). |
| `DATABASE_SCHEMA` | Schema that holds the POS tables (default `public`). Set e.g. `pos` to share a database with another app — migrations create the schema automatically and never touch `public`. Don't change it after deploying unless you migrate again. |
| `DATABASE_POOL_MAX` | Max connections per app instance (default 5). |
| `SESSION_SECRET` | ≥ 32 random chars. Session tokens are stored only as an HMAC with this secret. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `SESSION_TTL_HOURS` | Admin session lifetime (default 12). |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Initial admin created by `npm run db:seed` (only if that email doesn't exist yet). Change the password afterwards in **Settings**. |
| `ORDER_RATE_LIMIT_MAX` / `ORDER_RATE_LIMIT_WINDOW_SECONDS` | Guest order submissions allowed per IP per window (default 10 / 300 s). |
| `TEST_DATABASE_URL` | A **separate, disposable** database for integration tests. |

No secret is exposed to the browser — there are no `NEXT_PUBLIC_*` variables.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm run db:deploy` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:migrate` | Create a new migration after editing `prisma/schema.prisma` (dev only) |
| `npm run db:seed` | Seed admin + demo data (catalog is skipped if ingredients already exist) |
| `npm run db:reset` | **Drops all data**, re-applies migrations and seeds |
| `npm test` | Integration tests (needs `TEST_DATABASE_URL`) |

---

## Project structure

```
app/
  order/                      Guest ordering (public)
    page.tsx                  Menu (categories, items, live "sold out"/"only N left")
    cart/                     Cart + checkout
    success/[orderId]/        Confirmation + live status
    actions.ts                submitOrderAction (rate-limited)
    cart-store.ts             localStorage-backed cart
  admin/
    login/                    Sign in
    (panel)/                  Authenticated area (sidebar layout)
      dashboard/ orders/ menu/ ingredients/ inventory/movements/ settings/
    _actions/                 Server actions (each calls requireAdmin())
components/ui/                Small, flat UI primitives (button, form, table, dialog, toast)
lib/
  services/orders.ts          ★ createOrder / cancelOrder — stock deduction & restoration
  services/inventory.ts       Ingredients, restock / adjustments, low-stock queries
  services/menu.ts            Menu items + recipes, categories, guest menu availability
  auth/                       scrypt password hashing, DB-backed sessions
  validation.ts               Zod schemas for every input
  units.ts / format.ts        Unit conversion (kg→g, L→ml), money & quantity formatting
prisma/
  schema.prisma               Data model
  migrations/                 SQL migrations (incl. CHECK constraints & partial unique index)
  seed.ts                     Demo data
proxy.ts                      Optimistic redirect for /admin/* without a session cookie
tests/                        Vitest integration tests against real PostgreSQL
```

---

## How stock deduction works

All logic runs on the server in `lib/services/orders.ts`. The client only sends menu item IDs, quantities, name/table and an idempotency key — **never prices or quantities of ingredients**.

`createOrder()` in a single PostgreSQL transaction:

1. Loads the menu items and recipes from the database; rejects unavailable/archived items.
2. Computes prices and the total with exact decimals (`NUMERIC`, `Prisma.Decimal` — no floats).
3. **Aggregates ingredient requirements across the whole cart** (recipe qty × item qty, summed per ingredient).
4. Inserts the order row first, claiming the unique `idempotency_key`.
5. Locks the required ingredient rows with `SELECT … FOR UPDATE` **in id order** (prevents deadlocks).
6. If any ingredient is short or inactive → throws `InsufficientStockError`; the whole transaction rolls back and the guest sees which items can't be fulfilled.
7. Deducts with a conditional update (`… WHERE current_stock >= qty`), writes `order_items`, the `order_ingredients` snapshot and one `inventory_movements` row per ingredient (with balance after).

Guarantees and safety nets:

- **No overselling under concurrency** — row locks + conditional update; tested with 12 simultaneous orders for 5 remaining portions.
- **Never negative** — also enforced by `CHECK (current_stock >= 0)` in the database.
- **Idempotent submission** — the checkout reuses one UUID per cart; retries (or double taps, even concurrent) return the original order and deduct once. Reusing a key with a different cart is rejected (request hash check).
- **Historical snapshots** — item names/prices and exact ingredient quantities are stored per order, so later recipe or price changes don't alter history.
- **Cancellation** (`cancelOrder()`) locks the order, restores exactly the snapshot quantities, records `ORDER_CANCELLATION` movements and sets `stock_restored_at`. A partial unique index on `(order_id, ingredient_id, movement_type)` makes double deduction/restoration impossible at the database level. Completed orders cannot be cancelled.

### Units

Each ingredient has a base unit — **pcs**, **g** or **ml** — and all stock math happens in that unit (up to 3 decimals). Admins may enter recipe and restock quantities in **kg** or **L**; they are converted on the server.

### Deleting things safely

- Menu items with order history are **archived** (hidden everywhere, history kept); never-ordered items are deleted.
- Ingredients used in recipes or orders cannot be deleted — deactivate them instead (items using an inactive ingredient show as sold out).
- Categories can only be deleted when empty; otherwise hide them.
- Foreign keys use `RESTRICT` on all historical data.

---

## Security

- Admin passwords hashed with **scrypt** (Node built-in); constant-time comparison; timing-safe on unknown emails.
- Sessions: random 256-bit token in an **HttpOnly, SameSite=Lax, Secure (production)** cookie; only an HMAC-SHA256 of the token is stored in `admin_sessions`. Logout and password change revoke sessions.
- Every admin page and every admin server action validates the session against the database (`requireAdmin()`); `proxy.ts` is only an optimistic redirect.
- All input validated with Zod; all queries via Prisma or tagged-template (parameterized) SQL.
- Login (10 / 15 min) and guest order submission are rate-limited per IP. The limiter is in-memory per instance — for multi-instance/serverless deployments, back it with Redis/Upstash (`lib/rate-limit.ts`).

> Running `npm start` (production mode) over plain `http://` on a host other than `localhost` will not keep the Secure session cookie. Use HTTPS in production.

---

## Tests

Integration tests run against a real PostgreSQL database because they verify locking and transactions.

```bash
# 1. Create an empty database, e.g. "pos_test" (a second Supabase project or local Postgres)
# 2. Apply migrations to it
DIRECT_URL="postgresql://…/pos_test" npx prisma migrate deploy
# 3. Point the tests at it (in .env) and run
TEST_DATABASE_URL="postgresql://…/pos_test"
npm test
```

Coverage (26 tests): spec scenario (2 × Chicken Burger), cart-wide aggregation, insufficient stock rollback, exact-zero stock, decimal precision, unavailable/inactive items, DB CHECK constraint, cancellation restoring snapshot quantities after a recipe change, single restoration under 5 concurrent cancels, concurrent ordering without overselling or deadlocks, idempotent retries (sequential and concurrent), key reuse with a different cart, unit conversion, low-stock detection, recipe editing, password hashing.

> ⚠️ Tests `TRUNCATE` every table in `TEST_DATABASE_URL`. Never point it at real data.

---

## Notes

- **Payments** are out of scope: orders are created `UNPAID`; staff mark them paid in **Orders**.
- **Images**: menu items take an optional image URL. Items without one show a neutral initials tile.
- **Supabase**: the app connects through Prisma as the table owner (the default `postgres.[ref]` user). A migration enables Row Level Security with no policies on every table, so Supabase's public Data API (`anon` key) cannot read or write them while the app is unaffected. If you connect with a different, non-owner role, grant it `BYPASSRLS` or add policies.
