# Restaurant POS & Inventory

A multi-merchant (SaaS) point-of-sale for restaurants and cafés. Businesses register themselves, choose whether they have branches, and get menu management, guest self-ordering by QR code, and **automatic ingredient stock deduction** per branch. The owner sees every branch from a headquarters overview.

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
npm run db:deploy           # apply migrations to your database (+ prisma generate)
npm run db:seed             # demo merchant "Kopi & Co." (HQ + 2 branches), owner account, menu
npm run demo:branches       # order history + live orders for every branch, and a 2nd demo merchant
npm run dev                 # http://localhost:3000
```

| URL | What |
| --- | --- |
| `/` | Platform home: register / sign in, and every shop's guest menus |
| `/register` | Merchant sign-up: business, shop URL, single outlet or HQ + branches, owner account, optional sample menu |
| `/s/<merchant>/<branch>` | Guest digital menu of one branch (mobile-first), e.g. `/s/kopi-co/mount-austin`. Add `?table=12` on table QR codes. |
| `/admin/login` | Back office for merchant owners. Demo: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. |
| `/order` | Old single-shop link — redirects to the first merchant's headquarters (keeps `?table=`) |

### Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Runtime connection. On Supabase use the **Transaction pooler** string (port `6543`, append `?pgbouncer=true`). |
| `DIRECT_URL` | Used by the Prisma CLI for migrations/seed. On Supabase use the **Session pooler** or direct connection (port `5432`). |
| `DATABASE_SCHEMA` | Schema that holds the POS tables (default `public`). Set e.g. `pos` to share a database with another app — migrations create the schema automatically and never touch `public`. Don't change it after deploying unless you migrate again. |
| `DATABASE_POOL_MAX` | Max connections per app instance (default 5). |
| `REALTIME_DATABASE_URL` | Optional. Connection used to LISTEN for live updates; defaults to `DIRECT_URL`. Must be a session/direct connection (port 5432), not the transaction pooler. |
| `SESSION_SECRET` | ≥ 32 random chars. Session tokens are stored only as an HMAC with this secret. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `SESSION_TTL_HOURS` | Admin session lifetime (default 12). |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Initial admin created by `npm run db:seed` (only if that email doesn't exist yet). Change the password afterwards in **Settings**. |
| `ORDER_RATE_LIMIT_MAX` / `ORDER_RATE_LIMIT_WINDOW_SECONDS` | Guest order submissions allowed per IP per window (default 10 / 300 s). |
| `TEST_DATABASE_URL` | A **separate, disposable** database for integration tests. |
| `NEXT_PUBLIC_PLATFORM_NAME` | Optional. Name of the service on the home, sign-up and sign-in pages (default "Restaurant POS"). Not secret. |

No secret is exposed to the browser.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm run db:deploy` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:migrate` | Create a new migration after editing `prisma/schema.prisma` (dev only) |
| `npm run db:seed` | Demo merchant + owner + sample menu, floor plan, two demo branches and sample orders (catalog is skipped if the merchant already has ingredients) |
| `npm run demo:branches` | Adds the demo branches *Mount Austin* and *Skudai* if missing, simulated history (90 days) + today so far + a few live orders for every branch, and a second single-outlet merchant *Teh Tarik Place* (owner `owner@teh-tarik-place.demo`, password = `SEED_ADMIN_PASSWORD`). Idempotent. `-- --merchant=<slug>`, `-- --days=60`, `-- --no-second-merchant` |
| `npm run db:reset` | **Drops all data**, re-applies migrations and seeds |
| `npm test` | Integration tests (needs `TEST_DATABASE_URL`) |
| `npm run orders:close-pending` | Close every Pending order (all merchants, or `-- --merchant=<slug>`): COMPLETED by default, `-- --cancel` to cancel (returns stock), `-- --dry-run` to preview |
| `npm run admin:password` | Create an owner account (for the first merchant, or `-- --merchant=<slug>`), or reset its password, from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` |
| `npm run db:check` | Read-only data check of one merchant (`-- --merchant=<slug>`, default the first): migrations, menu, recipes, costs, stock and history per branch, prep, running costs — shows what is empty |
| `npm run db:fill` | Check → fill everything still empty with **dummy** data (never overwrites) → check again. Writes `reports/db-fill-*.json`; undo with `npm run db:fill -- --undo=latest` |
| `npm run demo:history` | Generate a year of **simulated** order / prep / sold-out history per branch from real-data patterns (flagged `is_simulated`, stock untouched). `-- --merchant=<slug>`, `-- --branch=<slug>`, `-- --reset`, `-- --remove`, `-- --days=90`, `-- --scale=0.6` |
| `npm run patterns:build -- --source="…/bossbuddy-public-data"` | Rebuild `data/real-patterns.json` from the public datasets (only needed if the datasets change) |

---

## Project structure

```
app/
  page.tsx                    Platform home (shops, register / sign in)
  register/                   Merchant sign-up
  s/[merchant]/[branch]/      Guest ordering for one branch (public)
    page.tsx                  Menu (categories, items, live "sold out"/"only N left" from this branch's stock)
    cart/                     Cart + checkout
    success/[orderId]/        Confirmation + live status
    actions.ts                submitOrderAction (rate-limited)
    cart-store.ts             localStorage-backed cart (one per branch)
  order/[[...rest]]/          Redirect for old single-shop links
  admin/
    login/                    Sign in
    switch/                   Plain-link branch switch (/admin/switch?to=<branch|all>&next=…)
    (panel)/                  Authenticated area (sidebar layout, branch selector)
      dashboard/ orders/ floor/ prep/ menu/ ingredients/ inventory/movements/ costs/ branches/ settings/
    _actions/                 Server actions (each calls requireContext() and checks ownership)
components/ui/                Small, flat UI primitives (button, form, table, dialog, toast)
lib/
  tenant.ts                   ★ Tenancy: requireContext(), branch selection, ownership checks, guest shop lookup
  services/merchants.ts       Merchant sign-up;  services/branches.ts  open / edit / close branches
  sample-catalog.ts           Sample café menu (seed, sign-up)
  services/orders.ts          ★ createOrder / cancelOrder — stock deduction & restoration
  services/inventory.ts       Ingredients, restock / adjustments, low-stock queries
  services/menu.ts            Menu items + recipes, categories, guest menu availability
  auth/                       scrypt password hashing, DB-backed sessions
  validation.ts               Zod schemas for every input
  units.ts / format.ts        Unit conversion (kg→g, L→ml), money & quantity formatting
prisma/
  schema.prisma               Data model
  migrations/                 SQL migrations (incl. CHECK constraints & partial unique index)
  seed.ts                     Demo merchant, branches and data
scripts/                      demo:branches, demo:history, db:check / db:fill, admin:password, …
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

## Merchants & branches (SaaS)

- **Sign-up** (`/register`): business name, shop URL (`/s/<slug>/…`), *single outlet* or *headquarters with branches* (branch names, one per line), owner name / email / password, and optionally a sample café menu, ingredients and floor plan. More branches can be added later in **Branches**.
- **Shared by all branches of a merchant**: menu, prices, categories, recipes, ingredient list (name, SKU, unit, cost), settings (business name, opening hours, time zone, accepting orders, order alert), floor plan, running costs, owner accounts.
- **Per branch**: orders, ingredient **stock** and low-stock threshold, stock movements, today's prep, sold-out events, and *Hide / Show* of menu items. A guest order deducts only that branch's stock; cancelling restores it there.
- **One role — the owner**, with full rights over every branch. The **branch selector** in the header switches the whole back office between one branch and **All branches (HQ view)**: dashboard with a per-branch table (orders, sales, open orders, low stock, share), all orders with a Branch column, total stock with per-branch figures, sales by branch in Costs. Floor and Today's prep work on one branch at a time. Restocking in the HQ view asks which branch.
- **Isolation**: every page, server action and SSE stream is scoped to the signed-in merchant (`lib/tenant.ts` — `requireContext()`, `branchFilter()`, `assert*()`); ids from the browser are checked for ownership. Guest URLs only show that branch's menu and that branch's orders.
- **Branches page**: guest link per branch (copy / open), orders, sales, open orders, items switched off, last order; add, rename, change URL name, close (HQ can't be closed).
- **Data model**: `merchants`, `branches` (one `is_headquarters` per merchant), `ingredient_stocks (branch_id, ingredient_id)`, `branch_menu_items`; `merchant_id` on settings / categories / menu items / ingredients / expenses / floor objects / owner accounts; `branch_id` on orders / movements / daily prep / sold-out events. Names, SKUs and table numbers are unique per merchant. Migration `20261116000000_saas_multi_tenant` moves an existing single-shop database into one merchant with a headquarters branch — nothing is lost.

## Live floor view (`/admin/floor`)

A 3D model of the shop floor (three.js): tables with chairs, counter, drinks bar, kitchen, pickup point, entrance, walls and plants.

- **Colours**: a table is **green** when it has no open order. With an open order (Pending / Preparing / Ready) it turns **yellow**, then gradually **red** as its oldest order waits; at the alert time (Settings → *Order alert*, default 20 min) it is fully red and pulses — the kitchen may have missed it. Orders without a table number colour the pickup point.
- **Interaction**: drag to rotate, scroll / pinch to zoom, right-drag to pan, toolbar for zoom, reset and top view. Click a table for a tooltip with its orders, waiting time and a one-click next step (Start → Ready → Complete). The side panel lists waiting tables (oldest first), takeaway orders and table numbers that aren't on the plan.
- **Layout editor** (*Edit layout*): drag objects (0.1 m snap), `R` rotates, `Del` deletes, arrows nudge; add tables (2 / 4 / round / 6 seats) and fixtures; set table number, seats, shape, size and floor size. Table numbers are matched loosely, so `T05`, `Table 5` and `5` are the same table. New stores can start from the sample café layout (also added by `db:seed` / `db:fill`).
- The layout is shared by all branches of a merchant; each branch's floor shows its own open orders.
- Data: `floor_objects` (positions in metres, rotation in degrees) and `store_settings.floor_width / floor_depth / order_alert_minutes`.

## Real-time updates

Every admin page (dashboard, orders, floor, prep, inventory, movements, costs) and the guest pages update by themselves within about a second of a change — including changes from another device, the kitchen, or scripts.

- Database triggers send a Postgres `NOTIFY` on the `pos_changes` channel for every write to orders, stock, menu, prep, sold-out events, costs, floor plan, settings and branches — one per statement and merchant / branch touched, tagged `m` / `b` (migration `20261116000000_saas_multi_tenant`).
- Each server process keeps **one** `LISTEN` connection (`lib/realtime.ts`) and streams changes to browsers over Server-Sent Events: `/admin/events` (signed-in owners — only their merchant's changes) and `/s/<merchant>/<branch>/events` (guests — only "menu changed" for that branch and their own order's status; no order data).
- The header shows **● Live** when this works. If the database connection can't `LISTEN` (e.g. `DIRECT_URL` points at the transaction pooler on port 6543), it shows **Every 15 s** and pages fall back to polling. A self-test notification confirms delivery when connecting and every minute.
- On serverless hosts the event stream reconnects automatically when a function times out; a long-running `npm start` server is the best fit.

## Simulated history from real-data patterns

The shop's order history is **simulated**, but its patterns come from open datasets (all CC BY 4.0). Following the datasets' own rule, it borrows **patterns, never sales volumes**; every generated row has `is_simulated = true` and the admin shows a "Simulated data" banner with the attribution and a **Data sources** page.

| Pattern | Dataset |
|---|---|
| Day-of-week shape and day-to-day swings per dish | Yaz restaurant, Stuttgart — 760 days (Taigel 2019, Mendeley Data) |
| Items per order, food / drink mix, drinks' daily swings, hour-of-day curve | Indonesian F&B POS — 53,820 receipts (Engel et al. 2026, Mendeley Data) |
| Shop size (RM 283 revenue per F&B worker per day × salaried staff) and growth trend | DOSM services statistics, F&B subsector 56 |
| Seasons (JB busiest Dec / Jun, quietest Feb) | Imigresen: Singapore residents entering Johor |
| Daily JB crowd surges on the exact date | KTMB Shuttle Tebrau ridership |

- `scripts/build-patterns.ts` turns the raw CSVs into `data/real-patterns.json` (69 KB, committed). `scripts/lib/demo.ts` generates orders from it.
- Seasons and crowd surges are applied at half strength (`JB_EXPOSURE = 0.5`), since a JB shop doesn't follow every Singapore visitor.
- The simulated staff prepare a fixed weekday / weekend amount with a 10–30% buffer, ignoring busy Saturdays, holidays and crowd surges. That produces realistic leftovers and sell-outs for forecasting to improve on.
- Limitation: the Indonesian dataset shows an identical item mix every hour and no weekday differences, so it appears anonymised. Only its order sizes, mix, daily swings and broad hour curve are used.
- History is generated **per branch**. Branch size: headquarters ×1, demo branches *Mount Austin* ×0.8 and *Skudai* ×0.6 (other branches ×0.7, or `--scale`).
- One year for the sample menu is about 46k orders and about 100 MB in the database per full-size branch. `demo:branches` uses 90 days for branches (about 17k orders for the two demo branches + 4k for the second merchant, roughly 40 MB).

> Simulated shop. Patterns from Yaz restaurant sales data (Taigel 2019, Mendeley Data, CC BY 4.0) and an Indonesian F&B POS dataset (Engel et al. 2026, Mendeley Data, CC BY 4.0). Malaysian scale and JB crossings from DOSM, Imigresen and KTMB via data.gov.my (CC BY 4.0).

## Demand planning (BossBuddy)

- **Today's prep** (`/admin/prep`): staff record plates prepared each morning per dish; shows sold, left over and sold-out time.
- **Sold-out events**: switching a dish off in Menu records the time automatically.
- **Costs** (`/admin/costs`): running costs — rent, utilities, salaries, licences — as one-time, daily, weekly, monthly or yearly amounts with start/end dates, plus a monthly estimate of sales − ingredient cost − overheads and the break-even sales per day.
- **Ingredient cost** (RM per kg / L / pcs) in Inventory; **prepared ahead / made to order** and **aliases** in the menu editor; **opening hours & time zone** in Settings.

Data contract for consumers: [`docs/bossbuddy-integration.md`](docs/bossbuddy-integration.md).

---

## Security

- Admin passwords hashed with **scrypt** (Node built-in); constant-time comparison; timing-safe on unknown emails.
- Sessions: random 256-bit token in an **HttpOnly, SameSite=Lax, Secure (production)** cookie; only an HMAC-SHA256 of the token is stored in `admin_sessions`. Logout and password change revoke sessions.
- Every admin page and every admin server action validates the session against the database and loads the merchant (`requireContext()`); every id from the browser is checked to belong to that merchant. `proxy.ts` is only an optimistic redirect.
- Sign-up is rate-limited (5 per hour per IP); shop URLs can't use reserved words (`admin`, `register`, …).
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

Coverage (83 tests): merchants & branches (stock deducted / restored only at the ordering branch, per-branch availability, no cross-merchant ordering, sign-up, branch creation, isolation of ingredients / floor plans / branches), spec scenario (2 × Chicken Burger), cart-wide aggregation, insufficient stock rollback, exact-zero stock, decimal precision, unavailable/inactive items, DB CHECK constraint, cancellation restoring snapshot quantities after a recipe change, single restoration under 5 concurrent cancels, concurrent ordering without overselling or deadlocks, idempotent retries (sequential and concurrent), key reuse with a different cart, unit conversion, low-stock detection, recipe editing, password hashing.

> ⚠️ Tests `TRUNCATE` every table in `TEST_DATABASE_URL`. Never point it at real data.

---

## Notes

- **Payments** are out of scope: orders are created `UNPAID`; staff mark them paid in **Orders**.
- **Images**: menu items take an optional image URL. Items without one show a neutral initials tile.
- **Supabase**: the app connects through Prisma as the table owner (the default `postgres.[ref]` user). A migration enables Row Level Security with no policies on every table, so Supabase's public Data API (`anon` key) cannot read or write them while the app is unaffected. If you connect with a different, non-owner role, grant it `BYPASSRLS` or add policies.
