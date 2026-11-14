# POS → BossBuddy data contract

BossBuddy reads the POS database **read-only**. All POS tables live in the schema set by `DATABASE_SCHEMA` (Kopi & Co. uses **`pos`**). Column names are snake_case; all timestamps are **UTC** (`timestamp(3)` without time zone); money and quantities are `numeric`. `null` always means *unknown / not recorded*, never zero.

Migration that added the fields below: `prisma/migrations/20261114000000_demand_planning` (additive only — nothing renamed or removed).

## ⚠️ Multi-merchant change (migration `20261116000000_saas_multi_tenant`) — read this first

The POS is now multi-merchant with branches. The existing Kopi & Co. data was moved into **one merchant** (`merchants.slug = 'kopi-co'`) with a **headquarters branch** (`branches.slug = 'hq'`); no rows were deleted. Queries written for the single-shop schema need these changes:

| Before | Now |
|---|---|
| `ingredients.current_stock`, `ingredients.low_stock_threshold` | **Removed.** Stock is per branch: `ingredient_stocks (branch_id, ingredient_id, current_stock, low_stock_threshold)`. Total for a merchant = `sum(current_stock)` over its branches. |
| `store_settings` single row `id = 1` | One row **per merchant**: `store_settings.merchant_id` (unique). `id` is now just a serial. |
| `orders`, `inventory_movements`, `daily_prep`, `sold_out_events` were shop-wide | Each has **`branch_id` → `branches.id`** (NOT NULL). `daily_prep` is unique on `(branch_id, date, menu_item_id)`. |
| `categories`, `menu_items`, `ingredients`, `expenses`, `floor_objects`, `admin_users` | Each has **`merchant_id` → `merchants.id`** (NOT NULL). Names / SKUs / table numbers are unique per merchant. |
| `menu_items.is_available` = on/off | Still the on/off switch **for all branches**. Per branch: `branch_menu_items (branch_id, menu_item_id, is_available)`; no row = available. Effective = both true. |
| NOTIFY payload `{schema, table, op}` | `{schema, table, op, m, b}` — merchant id / branch id of the rows changed (either may be null). |

Always filter by merchant (and branch when relevant). To keep reading only Kopi & Co. headquarters as before:

```sql
-- the old single shop = merchant kopi-co, branch hq
with hq as (
  select b.id from pos.branches b join pos.merchants m on m.id = b.merchant_id
  where m.slug = 'kopi-co' and b.slug = 'hq'
)
select o.* from pos.orders o where o.branch_id in (select id from hq);

-- current stock of every ingredient at that branch
select i.name, i.unit, s.current_stock, s.low_stock_threshold
from pos.ingredient_stocks s join pos.ingredients i on i.id = s.ingredient_id
where s.branch_id in (select id from hq);
```

New tables: `merchants (id, slug, name)`, `branches (id, merchant_id, slug, name, is_headquarters, address, is_active, sort_order)`, `ingredient_stocks`, `branch_menu_items`. The demo merchant also has branches `mount-austin` and `skudai` (`npm run demo:branches`), and there may be other merchants (e.g. `teh-tarik-place`).

## P0

### `ingredients.cost_per_unit` — `numeric(14,6)`, nullable
RM per **one base unit**, where the base unit is `ingredients.unit`:

| `unit` | cost is per | example |
|---|---|---|
| `G`   | gram       | chicken RM 11/kg → `0.011` |
| `ML`  | millilitre | santan RM 12/L → `0.012` |
| `PCS` | piece      | egg → `0.45` |

Staff enter it per kg / L / pcs in **Inventory → Edit**; the POS converts. Waste cost of a plate = Σ `menu_item_ingredients.quantity_required × ingredients.cost_per_unit`.

### `daily_prep`
| column | type | notes |
|---|---|---|
| `id` | text (cuid/uuid) | |
| `branch_id` | text → `branches.id` | the branch that prepared it |
| `date` | `date` | Business date in the merchant's time zone (`store_settings.timezone`, Malaysia) |
| `menu_item_id` | text → `menu_items.id` | |
| `plates_prepared` | int ≥ 0 | |
| `is_simulated` | bool | `true` = generated demo history |
| `created_at`, `updated_at` | timestamp (UTC) | |

Unique `(branch_id, date, menu_item_id)`. Entered on **Admin → Today's prep**. A blank entry deletes the row (unknown ≠ 0).

Sold for a date = `sum(order_items.quantity)` of orders with `status <> 'CANCELLED'` whose `created_at` falls in that local date:
```sql
-- leftover per item per day (Malaysia)
select p.branch_id, p.date, p.menu_item_id, p.plates_prepared,
       coalesce(sum(oi.quantity), 0) as sold,
       p.plates_prepared - coalesce(sum(oi.quantity), 0) as leftover
from pos.daily_prep p
left join pos.orders o
       on (o.created_at at time zone 'UTC' at time zone 'Asia/Kuala_Lumpur')::date = p.date
      and o.branch_id = p.branch_id
      and o.status <> 'CANCELLED'
left join pos.order_items oi on oi.order_id = o.id and oi.menu_item_id = p.menu_item_id
group by p.branch_id, p.date, p.menu_item_id, p.plates_prepared;
```

### `sold_out_events`
| column | type | notes |
|---|---|---|
| `id` | text | |
| `branch_id` | text → `branches.id` | |
| `menu_item_id` | text → `menu_items.id` | |
| `sold_out_at` | timestamp (UTC) | |
| `is_simulated` | bool | |

Written automatically, in the same transaction, whenever an item goes from available → unavailable at a branch (Menu → Hide with that branch selected), or for every branch still selling it when it is switched off for all branches (Hide in *All branches*, or unticking *Available* in the editor). Repeated clicks don't create duplicates; switching back on writes nothing. An item can sell out more than once a day — use the first event per day.

## P1

| column | type | meaning |
|---|---|---|
| `menu_items.is_prepared_ahead` | bool, nullable | `true` cooked in bulk (nasi lemak), `false` made to order (teh tarik), `null` not set → use your fallback |
| `menu_items.aliases` | `text[]`, default `{}` | lowercase, de-duplicated, e.g. `{"nl ayam","ayam"}` |
| `store_settings.open_time` / `close_time` | text `HH:MM` (24h), nullable | CHECK-constrained format; local to `timezone` |
| `store_settings.timezone` | text, default `Asia/Kuala_Lumpur` | IANA name |

`store_settings` has one row per merchant (`merchant_id`), shared by all its branches.

## Running costs — `expenses`

Rent, utilities, salaries etc., entered on **Admin → Costs** (migration `20261114010000_expenses`).

| column | type | notes |
|---|---|---|
| `id` | text | |
| `merchant_id` | text → `merchants.id` | running costs are per merchant (shared by its branches) |
| `name` | text | e.g. "Salary – Cook" |
| `category` | enum | `RENT`, `UTILITIES`, `STAFF`, `EQUIPMENT`, `MAINTENANCE`, `MARKETING`, `LICENSES`, `OTHER` |
| `amount` | `numeric(12,2)` > 0 | RM **per occurrence of `frequency`** |
| `frequency` | enum | `ONE_TIME`, `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY` |
| `start_date` | `date` | first day it applies (the charge date for `ONE_TIME`) |
| `end_date` | `date`, nullable | last day it applies, inclusive; `null` = ongoing (always `null` for `ONE_TIME`) |
| `notes` | text | |
| `is_simulated` | bool | `true` = illustrative demo cost from `demo:history` |
| `created_at`, `updated_at` | timestamp (UTC) | |

Cost on a local date `d` (start ≤ d ≤ end): `DAILY` → amount; `WEEKLY` → amount / 7; `MONTHLY` → amount / days in d's month; `YEARLY` → amount / days in d's year; `ONE_TIME` → amount only on `start_date`. A full month of a monthly cost therefore sums to exactly `amount`.

Amount changes are stored as history: changing rent from 1 Dec ends the old row on 30 Nov and inserts a new row from 1 Dec, so past months stay correct. Reference implementation: `lib/services/expenses.ts` (`costOnDay`, `overheadsForRange`, `monthSummary`).

## Live change notifications (optional)

BossBuddy can react to changes instead of polling: `LISTEN pos_changes` on a session connection (port 5432). Each write to a POS table sends `{"schema":"pos","table":"orders","op":"INSERT","m":null,"b":"<branch id>"}` (one per statement and merchant / branch touched; `m` is set for merchant-level tables, `b` for branch-level ones); order status / payment changes also send `{"schema":"pos","table":"orders","op":"UPDATE","b":"…","id":"…","status":"READY","paymentStatus":"UNPAID"}`. Filter on `schema` and your branch / merchant. Payloads never contain other data — re-read the table you care about.

## P2 — demo history

`npm run demo:history` generates **365 days** before today, **per branch** (`--merchant=`, `--branch=`), from real-data patterns (see README → *Simulated history from real-data patterns*, and **Admin → Data sources**):

- `orders` (`status = COMPLETED`, `payment_status = PAID`, **`is_simulated = true`**) + `order_items` + `order_ingredients`
- `daily_prep` for items with `is_prepared_ahead = true` (`is_simulated = true`)
- `sold_out_events` on days simulated demand reached the plates prepared (`is_simulated = true`)

Patterns: Yaz weekday shape (Sat ×1.51, Sun ×0.68) and real day-to-day swings per dish; Indonesian POS order sizes (85% one item), food/drink mix and hour curve; DOSM shop size (RM 283 per worker per day × staff) and trend; Imigresen monthly JB season; KTMB daily crowd surges on the exact date. Simulated staff prep a fixed weekday/weekend amount + 10–30% buffer. Simulated orders **do not change ingredient stock or `inventory_movements`**. Real orders/prep are never touched; real `daily_prep` rows win over simulated ones.

```
npm run demo:history -- --reset       # regenerate
npm run demo:history -- --days=90     # lighter: 90 days
npm run demo:history -- --remove      # delete all simulated data
```

To exclude demo data: `where not is_simulated`.

`npm run db:check` (read-only) lists what is still empty; `npm run db:fill` fills it with dummy values and simulated history and records every change in `reports/db-fill-*.json` (`--undo=latest` reverts values that haven't been edited since). Field-level dummy values (ingredient costs, `is_prepared_ahead`, aliases, store hours) have no flag column — the report file is the record of which values are dummy. Recipes are never invented.

`--demo-defaults` (on by default; `--no-demo-defaults` to skip) fills **illustrative** values from `scripts/demo-catalog.ts` — ingredient costs, `is_prepared_ahead`, aliases, opening hours, and 13 running costs (only if `expenses` is empty, flagged `is_simulated`) — **only where the field is empty**, and only for the seeded Kopi & Co. items. Replace them with real figures when known.

`menu_item_ingredients.quantity_required` is the amount **per one serving**, in the ingredient's base unit (`ingredients.unit`).

## Exposing `pos` to the Supabase Data API — check first

`admin_users` holds password hashes and `admin_sessions` holds session token HMACs. Every POS table has **RLS enabled with no policies**, so `anon` / `authenticated` read nothing even if the schema is exposed. Before adding `pos` under *Settings → API → Exposed schemas*, confirm in the SQL Editor:

```sql
-- 1. Must return 0 rows: no table privileges for anon/authenticated on pos
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'pos' and grantee in ('anon', 'authenticated');

-- 2. Must be false/false: no schema access
select has_schema_privilege('anon', 'pos', 'USAGE')          as anon_usage,
       has_schema_privilege('authenticated', 'pos', 'USAGE') as auth_usage;

-- 3. Must all be true: RLS on every POS table (_prisma_migrations is Prisma's bookkeeping, not sensitive)
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'pos' and c.relkind = 'r'
order by 1;
```

BossBuddy should read with a server-side key/role (e.g. a dedicated read-only role granted `SELECT` on the tables it needs, **excluding `admin_users` and `admin_sessions`**), never the public anon key.
