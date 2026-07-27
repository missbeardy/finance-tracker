# Security — Randall Finance Tracker

## Row Level Security (RLS)

Every user-scoped table enforces **own-row** access at Postgres:

```sql
auth.uid() = user_id
```

Policies cover `SELECT`, `INSERT`, `UPDATE`, and `DELETE`. Client queries may also filter by `user_id`, but **RLS is the real boundary** — the anon key in the browser bundle is only safe because these policies are enforced server-side.

### Tables with own-row RLS

| Table | Notes |
|-------|--------|
| `accounts` | |
| `categories` | |
| `imports` | Cascade-deletes related transactions |
| `transfers` | |
| `transactions` | |
| `rules` | |
| `budgets` | |
| `settings` | One row per user (`unique (user_id)`) |
| `merchant_aliases` | |
| `commitments` | |
| `push_subscriptions` | |

Defined in `supabase/migrations/20260725014522_initial_schema.sql` via `apply_own_row_rls()`.

### Locked-down table

| Table | Policy |
|-------|--------|
| `keep_alive` | RLS enabled, **no** policies for `anon` / `authenticated` — service-role only |

### Verification

```bash
npm run verify:rls
```

Creates two auth users, inserts rows as user A, and asserts user B cannot read them across the finance tables listed above. Requires a reachable Supabase project (`SUPABASE_URL` / `SUPABASE_ANON_KEY` or `VITE_*` equivalents).

## Import deduplication

Re-imports are guarded in the app by count-delta matching on `transactions.dedupe_key` (SHA-1 of `accountId|date|amount|normalisedDescription`). See `src/lib/ledger/dedupe.ts` and `src/lib/import/commit.ts`.

A **unique** constraint on `dedupe_key` is intentionally **not** used: legitimate same-day duplicate purchases share a key, and count-delta allows `n_new - n_existing` inserts. Import history records `duplicates_skipped` per batch.

## Audit log

`audit_log` records batch categorisation actions (apply rules). Migration: `supabase/migrations/20260727100000_audit_log_and_apply_rule.sql`. Also exposes `apply_rule_to_transactions(rule_id, scope, dry_run)` for single-rule server-side apply; the Review screen primarily uses the client batch path so match logic stays in `src/lib/ledger/categorise.ts`.

## Secrets & client data

- The Supabase **anon** key may ship in the client; never put the **service_role** key in the frontend.
- Do not log full transaction descriptions or amounts to third-party error trackers without scrubbing.
- Confirm Supabase **point-in-time recovery** (PITR) / backups in the project dashboard — that is an ops setting, not enforced in this repo.

## Auth

Sign-out clears the persisted TanStack Query cache (`clearQueryCache`) so another account on the same device cannot see cached ledger data.
