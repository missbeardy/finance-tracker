# Personal Finance Tracker — Build Specification

**Working name:** Randall Finance Tracker
**Target:** Installable PWA, local-first, free stack
**Audience:** Single user with accounts across multiple institutions, exporting CSVs from WeMoney
**Handover:** This document is the source of truth for Cursor. Build in the phase order given. Do not skip Phase 4.

---

## 1. The actual problem

Standard budget apps fail this user for one reason: money moves between their own accounts constantly, with no memo, and every one of those movements looks like a $500 expense and a $500 income. Aggregate spending is inflated, income is inflated, and every category chart is fiction.

So the core engineering problem is **not** charts. It is:

1. Reliable CSV ingestion from an unknown/variable schema
2. **Internal transfer reconciliation** — pairing the debit in Account A with the credit in Account B and removing both from spending maths
3. Correct expense recognition on credit cards (spend at purchase, not at payment)
4. Deterministic, correctable categorisation

Charts are the easy last mile. Build the ledger correctly first.

---

## 2. Tech stack

All free tier, no paid services required.

| Layer | Choice | Why |
|---|---|---|
| Build | Vite + React 18 + TypeScript | Fast, Cursor-friendly |
| Styling | Tailwind CSS v4 | Token-driven via CSS vars |
| Database | Supabase Postgres | Source of truth. Multi-device. Row Level Security scopes all data to the signed-in user |
| Auth | Supabase Auth (email + password) | Free to 50k MAU. Session persisted, so no repeated logins |
| Server logic | Supabase Edge Functions (Deno/TS) | Import commit, dedupe, transfer matching, push dispatch |
| Client cache | TanStack Query + IndexedDB persister | Offline reads and instant navigation. Not a sync engine, see §15 |
| CSV | PapaParse | Streaming parse, handles quoted commas |
| Charts | Recharts (bar/line/donut) + `d3-sankey` (flow diagram) | Recharts for standard, d3-sankey rendered as custom SVG for the signature view |
| Dates | date-fns | Timezone-safe, tree-shakes |
| PWA | `vite-plugin-pwa` (Workbox) | Manifest, service worker, offline shell |
| Hosting | Cloudflare Pages | Free, no cold starts, custom domain |
| Scheduler + keep-alive | GitHub Actions cron → Supabase Edge Function | Free, and solves two problems with one job. See §15.5 |

**Region: choose `ap-southeast-2` (Sydney)** at project creation. Data residency and latency. This cannot be changed later without a migration.

**Explicitly not used:** no ORM, no server-side rendering, no realtime subscriptions, no full offline-write sync engine. See §15.2 for why the last one is deliberate.

**Two free-tier constraints that shape the design, both confirmed current:**

1. <cite index="5-1">Free projects are paused after one week of inactivity and stay unreachable until manually restored from the dashboard</cite>. An app opened fortnightly will hit this. §15.5 handles it.
2. <cite index="2-1">The free tier has zero days of backup retention — no snapshot is kept</cite>. For a financial ledger this is unacceptable on its own. §15.6 handles it.

---

## 3. Data model (Postgres)

Every table carries `user_id uuid not null references auth.users(id) default auth.uid()`. Every table has RLS enabled with the same four policies. Write the migration as SQL files under `supabase/migrations/`, never through the dashboard UI, so the schema is version controlled.

```sql
-- one policy set, repeated verbatim for every table
alter table public.transactions enable row level security;

create policy "own rows select" on public.transactions
  for select using (auth.uid() = user_id);
create policy "own rows insert" on public.transactions
  for insert with check (auth.uid() = user_id);
create policy "own rows update" on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows delete" on public.transactions
  for delete using (auth.uid() = user_id);
```

**RLS is not optional and there is no service-role shortcut in the client.** The anon key ships in the bundle; RLS is the only thing standing between one user's ledger and another's. Edge Functions may use the service role key, but only after verifying the caller's JWT and scoping every query by the extracted `user_id`.

```sql
create table public.accounts (
  id                       bigint generated always as identity primary key,
  user_id                  uuid not null references auth.users(id) default auth.uid(),
  name                     text not null,
  institution              text not null,
  type                     text not null check (type in
                             ('transaction','savings','credit_card','offset','loan','investment')),
  is_own                   boolean not null default true,
  is_imported              boolean not null default true,
  external_match_patterns  text[] not null default '{}',
  opening_balance          bigint,          -- cents
  currency                 text not null default 'AUD',
  color_token              text not null,
  created_at               timestamptz not null default now()
);

create table public.transactions (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users(id) default auth.uid(),
  account_id       bigint not null references public.accounts(id) on delete cascade,
  date             date not null,
  posted_date      date,
  amount           bigint not null,          -- SIGNED CENTS. negative = money out
  description      text not null,            -- raw, never modified
  merchant         text not null,            -- normalised, see §5.5
  balance          bigint,
  category_id      bigint references public.categories(id),
  category_source  text check (category_source in ('rule','manual','import','llm')),
  transfer_id      bigint references public.transfers(id) on delete set null,
  status           text not null default 'active'
                     check (status in ('active','pending_transfer_review','excluded')),
  notes            text,
  split_parent_id  bigint references public.transactions(id) on delete cascade,
  dedupe_key       text not null,
  import_id        bigint not null references public.imports(id) on delete cascade,
  created_at       timestamptz not null default now()
);

create index on public.transactions (user_id, date desc);
create index on public.transactions (user_id, account_id, date);
create index on public.transactions (user_id, dedupe_key);
create index on public.transactions (user_id, category_id);
create index on public.transactions (user_id, transfer_id) where transfer_id is not null;
create index on public.transactions (user_id, status) where status <> 'active';
```

Remaining tables (`categories`, `rules`, `transfers`, `imports`, `budgets`, `settings`, `merchant_aliases`, `commitments`, `push_subscriptions`) follow the same pattern: identity PK, `user_id`, RLS, `created_at`. Field lists are given below.

### `accounts`
```ts
{
  id: number
  name: string              // "Everyday Offset"
  institution: string       // "ING"
  type: 'transaction' | 'savings' | 'credit_card' | 'offset' | 'loan' | 'investment'
  isOwn: boolean            // true = user controls it, transfers to it are NOT spending
  isImported: boolean       // false = user owns it but does not import a CSV for it
  externalMatchPatterns: string[]  // descriptions that indicate a transfer to this account
  openingBalance: number | null
  currency: 'AUD'
  colorToken: string
}
```

`isImported: false` is critical. If the user owns nine accounts but only exports eight, transfers to the ninth arrive one-sided and will otherwise be counted as spending. Those are matched by `externalMatchPatterns` instead of by pairing.

### `transactions`

DDL above is authoritative. Generate TypeScript types with `supabase gen types typescript` into `src/types/database.ts` and regenerate on every migration. Do not hand-write row types.

**Sign convention is absolute:** money out is negative on every account type including credit cards. A credit card purchase is negative; a payment received into the card is positive. Normalise at import time. Never store unsigned amounts with a separate direction column.

### `categories`
Two-level. Seed set:

- **Housing** — Rent/Mortgage, Rates & Strata, Home Insurance, Repairs
- **Utilities** — Electricity, Gas, Water, Internet, Mobile
- **Food** — Groceries, Takeaway & Delivery, Restaurants & Cafes, Alcohol
- **Transport** — Fuel, Rego & Insurance, Servicing, Tolls & Parking, Public Transport
- **Health** — Health Insurance, Medical, Pharmacy, Fitness
- **Subscriptions** — Streaming, Software, Memberships
- **Shopping** — Clothing, Household, Electronics, Gifts
- **Personal** — Hair & Beauty, Hobbies, Pets
- **Financial** — Interest, Bank Fees, Loan Repayment, Investment Contribution
- **Income** — Salary, Interest Earned, Refunds, Other Income
- **Uncategorised**
- **Internal Transfer** *(system category, never counted)*
- **Cash Withdrawal**

`kind: 'expense' | 'income' | 'transfer' | 'system'`

---

## 4. CSV ingestion

The WeMoney export schema is not assumed. Build a mapping layer that works with any bank or aggregator CSV.

### 4.1 Import flow

1. **Drop file** → PapaParse with `header: true`, preview first 20 rows
2. **Detect** → attempt auto-match of column headers against known aliases:
   - date: `date`, `Date`, `Transaction Date`, `Posted Date`, `Value Date`
   - amount: `amount`, `Amount`, `Value`
   - debit/credit split: `Debit`, `Credit`, `Withdrawal`, `Deposit`, `Money In`, `Money Out`
   - description: `description`, `Description`, `Narrative`, `Details`, `Transaction Details`, `Merchant`
   - balance: `Balance`, `Running Balance`
   - account: `Account`, `Account Name`
   - category: `Category` (import as a *hint* only, never as truth)
3. **Mapping screen** → show detected mapping with dropdowns per field over a live 5-row preview. User corrects anything wrong.
4. **Date format picker** → auto-detect between `DD/MM/YYYY` and `MM/DD/YYYY` by scanning for any day value > 12. If ambiguous across the whole file, prompt. **Default to `DD/MM/YYYY`** (Australian). Getting this wrong silently corrupts everything.
5. **Amount handling** → support three shapes:
   - single signed column
   - single unsigned column + a direction column
   - separate debit and credit columns
   Strip `$`, commas, and handle `(123.45)` as negative.
6. **Account assignment** → if the file contains an account column, group rows by it and let the user map each distinct value to an existing or new account. Otherwise assign the whole file to one selected account.
7. **Save mapping profile** → keyed by the hash of the header row. Next import with the same headers skips steps 2–6 entirely.
8. **Preview summary** → "412 rows, 1 Mar – 30 Jun, 38 duplicates skipped, 12 new merchants". User confirms before commit.
9. **Commit.** The client parses and normalises, then POSTs the normalised rows to the `commit-import` Edge Function in batches of 500. The function runs inside one Postgres transaction and performs, in order: insert the `imports` row, dedupe (§4.2), apply categorisation rules (§6), run transfer matching (§5.1), return a summary. Roll back entirely on any error.

**Import is an online-only operation.** It is batch work with cross-account dedupe and matching; running it optimistically on a device and reconciling later is how you end up with duplicate ledgers. If offline, block the action with a clear message rather than queueing it.

Doing this server-side also means the result is identical regardless of which device imported, and a phone importing a 5,000 row file does not have to hold it all in memory.

### 4.2 Deduplication

Overlapping export ranges are the norm. But two identical $4.50 coffees on the same day are legitimate, so a naive unique-key check destroys real data.

```
dedupeKey = sha1(accountId | date | amount | normalisedDescription)
```

**Rule:** for each `dedupe_key`, count occurrences in the incoming file (`n_new`) and occurrences already stored **on that same date** (`n_existing`). Insert `max(0, n_new - n_existing)` rows.

Runs inside `commit-import`. Do **not** add a unique constraint on `dedupe_key` — genuine same-day duplicates are legal and a constraint would reject them. The count-delta rule is the whole mechanism.

If the export provides a running `balance`, use it as a tiebreaker for exact identification and flag any imported sequence where the balance deltas do not reconcile with the amounts — that indicates a gap in the export.

### 4.3 Import ledger

Every import writes an `imports` row and every transaction carries `importId`. The Imports screen lists each import with row count and date range and offers **Undo import**, which deletes exactly those rows and unwinds any transfer links they created. Non-negotiable: without this, one bad mapping means starting over.

---

## 5. Transfer reconciliation

This is the feature the app exists for. Give it real UI, not a background heuristic.

### 5.1 Matching algorithm

Implemented in TypeScript inside the `commit-import` Edge Function (shared module, also callable standalone as `rematch-transfers`). Written once, testable with plain unit tests, and device-independent. Do not implement it as plpgsql and do not implement it on the client.

Run after every import, over transactions within the affected date range ± 7 days.

**Candidate generation.** For each transaction `A` where `A.amount < 0` and `A.transferId == null` and `A.account.isOwn`:

Find all `B` where:
- `B.amount > 0`
- `B.transferId == null`
- `B.accountId != A.accountId`
- `B.account.isOwn == true`
- `|B.date - A.date| <= 5 days`
- `B.amount == |A.amount|` (exact pass)

**Scoring.** Score each candidate pair 0–100:

| Signal | Points |
|---|---|
| Same day | 40 |
| 1 day apart | 32 |
| 2–3 days apart | 22 |
| 4–5 days apart | 10 |
| Exact amount | 30 |
| Amount within $2 (fee) | 12 |
| Either description contains `TRANSFER`, `TFR`, `OSKO`, `PAYID`, `PAY ANYONE`, `INTERNAL`, `BPAY`, `DIRECT DEBIT` | 12 |
| Either description contains the other account's name, nickname, or last 4 digits | 15 |
| This is the only candidate for both A and B | 15 |
| Destination account is a credit card and description suggests payment | 10 |

**Assignment.** Sort all candidate pairs by score descending. Greedily assign, skipping any pair where either side is already linked. This prevents a $500 debit from claiming a $500 credit that belongs to a different transfer on the same day.

**Thresholds.**
- Score ≥ 80 → auto-link, `confidence: 'high'`, `method: 'auto'`
- Score 50–79 → create link with `status: 'pending_transfer_review'` on both sides. Excluded from totals but surfaced in the review queue with a badge
- Score < 50 → no link. Both transactions remain normal

**Second pass — one-sided transfers.** For unmatched negative transactions, test `description` against every account's `externalMatchPatterns`. A hit links the transaction to that account as a one-sided transfer (`method: 'pattern'`, `inTxnId: null`). Same exclusion from spending. This covers accounts the user owns but does not import.

**Third pass — recurring identical transfers.** If the user confirms a link between two accounts for a specific amount and description, offer: *"Always treat payments matching this from Everyday to Mortgage Offset as a transfer."* Store as a rule, apply on future imports automatically at high confidence.

### 5.2 Review queue UI

A dedicated screen, not a modal. Card per proposed pair:

```
┌──────────────────────────────────────────────┐
│  Likely transfer            confidence 74    │
│                                              │
│   ING Everyday          →   UBank Save       │
│   14 Jun                    15 Jun           │
│   −1,200.00                 +1,200.00        │
│   "OSKO PAYMENT TO SAVE"    "OSKO DEPOSIT"   │
│                                              │
│  [ Confirm transfer ]  [ Not a transfer ]    │
│  [ Always match transfers like this ]        │
└──────────────────────────────────────────────┘
```

Keyboard: `J`/`K` to move, `Y` to confirm, `N` to reject. This user will be clearing dozens of these after the first bulk import — make it fast.

Also provide **manual linking**: select any two transactions in the ledger and press "Link as transfer". Every auto-match must be reversible from the transaction detail view.

### 5.3 Credit cards

Expense is recognised at the **card purchase**, never at the payment. Therefore:

- Card purchases → normal spending, categorised normally
- Payment from a transaction account to a card → **transfer**, matched by the same algorithm
- If the user imports card statements but not the paying account (or vice versa), the payment shows one-sided — handle via `externalMatchPatterns`
- Never let both the card spend and the card payment count. Add an automated integrity check (§10) that flags this

### 5.4 Cash withdrawals

ATM withdrawals map to `Cash Withdrawal`, a category flagged `isOpaque: true`. Show it in reports as a distinct grey band labelled "Cash — untracked" rather than folding it into a spending category. Offer optional manual splitting of a withdrawal into categories.

### 5.5 Merchant normalisation

Applied at import, stored alongside the raw description. Never overwrite the raw value.

```
uppercase
strip: card numbers, "VISA PURCHASE", "EFTPOS", "DEBIT CARD PURCHASE", "VALUE DATE", trailing dates
strip prefixes: "SQ *", "SP *", "PAYPAL *", "TFR ", "DIRECT DEBIT "
strip trailing location tokens (suburb + state, e.g. "BEAUDESERT QLD", "AU")
collapse whitespace, trim
```

Store a `merchantAliases` map so the user can merge `WOOLWORTHS 1234` and `WOOLWORTHS ONLINE` into one merchant, once.

---

## 6. Categorisation engine

Deterministic and inspectable. No black boxes.

**Rules table**, evaluated by ascending `priority`, first match wins:

```ts
{
  priority: number
  matchType: 'contains' | 'starts_with' | 'regex' | 'exact_merchant'
  pattern: string
  accountScope: number | null   // null = all accounts
  amountMin: number | null      // optional amount band
  amountMax: number | null
  categoryId: number
  enabled: boolean
}
```

Seed with ~80 Australian merchant rules (Woolworths, Coles, Aldi, IGA, BP, Ampol, 7-Eleven, Bunnings, Kmart, Officeworks, Telstra, Optus, Origin, AGL, Netflix, Spotify, Uber, DoorDash, Menulog, Chemist Warehouse, Medicare, etc.).

**Correction loop.** Recategorising a transaction always prompts: *"Apply to all 14 matching transactions?"* and *"Create a rule for future imports?"* Manual categorisation (`categorySource: 'manual'`) is never overwritten by a rule on re-run.

**Rules manager screen:** list, reorder by drag, test a pattern against the existing ledger showing live match count before saving.

**Optional LLM assist (Phase 8, opt-in, off by default).** Batch uncategorised merchants, send merchant strings only (no amounts, no dates, no account names) to the Anthropic API using the user's own key stored in IndexedDB. Returns suggested category per merchant. Presented as *suggestions* that create rules on acceptance. Never auto-applied.

---

## 7. Budget model

The goal is a sustainable budget, so the model must separate what is genuinely discretionary.

### 7.1 Recurrence detection

Scan the ledger for repeating patterns: same normalised merchant, amount within ±5%, interval clustering around 7 / 14 / 28–31 / 90 / 365 days, at least 3 occurrences.

Output a **Commitments** screen: detected recurring bills and subscriptions with merchant, amount, cadence, next expected date, annualised cost, and the account it hits. Let the user confirm, dismiss, or edit each. Flag anything not seen in 2× its expected interval as *possibly cancelled*, and anything whose amount rose more than 10% as *price increased*.

For this user specifically, this screen answers "what am I actually locked into across all these accounts", which is the precondition for a real budget.

### 7.2 The sustainable budget calculation

```
Verified income      = Σ positive transactions, kind=income, transfers excluded
Committed outflow    = Σ confirmed recurring commitments (monthly-normalised)
Debt minimums        = Σ loan/card minimum repayments
Savings target       = user-set (% of income or fixed amount)
─────────────────────────────────────────────────────────
Discretionary pool   = income − committed − debt − savings
```

Then allocate the discretionary pool across variable categories. Seed each allocation with the **median** of the last 3 months (median, not mean — one holiday should not set the baseline). Show a live running total against the pool with a clear over-allocation state.

### 7.3 Budget period

Calendar month by default. Support a **pay-cycle period** (fortnightly, anchored to a user-set payday) because that is how this user's money actually arrives. Store `periodType` in settings.

---

## 8. Screens

### 8.1 Dashboard
- Period selector (this month / last month / pay cycle / custom)
- Four figures, set large: **In**, **Out**, **Net**, **Discretionary left**
- Signature: the **Sankey flow diagram** (§9)
- Top 5 categories with month-over-month delta
- Alerts strip: uncategorised count, pending transfer reviews, days since last import
- Net position across all accounts, single line chart

### 8.2 Ledger
Virtualised table. Columns: date, merchant (raw on hover), account, category, amount. Filters for account, category, date range, amount range, text search. Toggles: *Show transfers*, *Show excluded*. Bulk select → recategorise, exclude, link as transfer. Inline category edit.

### 8.3 Accounts
Cards per account: name, institution, type, latest balance, last import date, transaction count. Import button per account. Edit `isOwn`, `isImported`, `externalMatchPatterns`.

### 8.4 Transfers
The review queue (§5.2), plus a confirmed-links list with unlink, plus a flow summary: how much moved between which accounts this period.

### 8.5 Commitments
Recurrence detection output (§7.1).

### 8.6 Budget
Allocation builder against the discretionary pool. Per-category progress bars with pace indicator ("you are 3 days ahead of pace"). Not just a percentage bar — pace is what makes it actionable mid-month.

### 8.7 Insights
- Category trend over 12 months
- Merchant leaderboard by total and by frequency
- Weekday spending pattern
- "Spending without a category" callout
- Annualised subscription cost total

### 8.8 Settings
Import mappings, rules manager, categories, reminder config, export/import backup, danger zone (wipe).

---

## 9. Visual direction

The brief is "visually appealing". That must not resolve into a generic dashboard: cream background, serif headline, terracotta accent, three stat cards with a gradient. Do not build that.

**Thesis:** the numerals are the typography. This is a ledger — the figures are the content, everything else is scaffolding. Set money large, tabular, and confident; keep every other element quiet.

**Signature element: the Sankey flow.** One diagram showing income sources on the left, flowing through accounts in the middle, out to category groups on the right, with internal transfers rendered as a distinct returning ribbon. This is the literal answer to "where does my money go" and it is the one thing this app is remembered by. Spend the visual budget here and nowhere else. Interactive: hover a ribbon to highlight the path and show the amount; click a category node to filter the ledger.

### Tokens

```css
:root {
  /* ground */
  --paper:      #EEF1F4;   /* app background, cool statement-grey */
  --surface:    #FFFFFF;
  --ink:        #14161C;   /* primary text, Sankey ground */
  --ink-muted:  #5C6470;
  --hairline:   #D5DBE2;

  /* semantic */
  --flow:       #2F6F6B;   /* money in motion, primary accent */
  --inbound:    #3A7D5C;   /* income */
  --outbound:   #8E3murder; /* REPLACE — see note */
  --signal:     #A33049;   /* over budget, deep rose */
  --caution:    #B0842A;   /* approaching limit, ochre */
  --neutral:    #7A7F87;   /* transfers, cash, opaque */

  /* category ramp — mineral, deliberately not a rainbow */
  --cat-1: #A9694F;  --cat-2: #6B7F4E;  --cat-3: #4A6A8A;  --cat-4: #6E4A63;
  --cat-5: #B0842A;  --cat-6: #2F6F6B;  --cat-7: #8E4A34;  --cat-8: #7A7F87;

  --r-sm: 4px; --r-md: 8px; --r-lg: 14px;
  --space: 4px; /* all spacing in multiples of 4 */
}
```

> Fix `--outbound` to `#8E4A34` when implementing. Deliberate placeholder to confirm the tokens were read rather than pasted.

**Type.** All from Google Fonts, self-hosted via `@fontsource`.

| Role | Face | Notes |
|---|---|---|
| Money figures, display | **Bricolage Grotesque** | Variable. Use `wdth` and `opsz`. Large balances at 44–64px, weight 600 |
| UI, body | **Inter Tight** | `font-feature-settings: 'tnum' 1, 'ss01' 1` |
| Ledger rows and tables | **DM Mono** | Amounts must align on the decimal. Mono is functional here, not decorative |

Type scale: 12 / 14 / 16 / 20 / 28 / 44 / 64. Nothing between.

**Rules.**
- Every currency figure uses tabular figures. Negative amounts in `--ink`, not red. Reserve `--signal` for budget breaches only, or the whole ledger screams
- Category colour comes from the ramp and is used consistently across every chart, badge, and the Sankey. Colour encodes category and nothing else
- One accent per screen. Charts are not decorated with gradients
- Dark mode: swap ground and ink, keep the category ramp, lift its lightness by ~10%
- Motion: the Sankey draws its ribbons in sequence on first paint (600ms, staggered). That is the only orchestrated animation in the app. Everything else is 120ms state transitions. Respect `prefers-reduced-motion`

**Copy.** Plain and active. "Import transactions", not "Submit data". "Two transfers need your review", not "Pending reconciliation items". Empty states are instructions: "No transactions yet. Import a CSV from WeMoney to get started." Errors say what broke and what to do: "Row 42 has no date. Check the date column mapping."

**Mobile.** Phone is the primary target. Bottom tab bar: Dashboard, Ledger, Transfers, Budget, More. The Sankey becomes a vertical flow on narrow screens or falls back to a stacked bar with a "view flow" full-screen landscape option. Review queue is thumb-reachable with swipe-to-confirm.

---

## 10. Data integrity checks

Run on demand from Settings and after every import. Surface results as a health panel.

1. **Balance reconciliation** — if the export provides running balances, verify `balance[n] - balance[n-1] == amount[n]` for each account. Report gaps, which mean a missing date range
2. **Orphan transfers** — negative transactions matching transfer keywords with no link and no pattern match
3. **Double-counted card spend** — a credit card account with both purchases and an unlinked payment of a similar magnitude
4. **Symmetry check** — sum of all linked transfer legs should be ~0. Report the residual
5. **Uncategorised ratio** — flag if over 5% of spend by value
6. **Date outliers** — transactions outside the file's stated range, which usually means a `DD/MM` vs `MM/DD` parse error

Check 6 catches the single most destructive silent failure. Do not omit it.

---

## 11. Reminders

Be honest about the constraint: a PWA cannot reliably wake itself on a schedule with no server.

**Three layers, build all three.**

**Layer 1 — In-app nudge (Phase 1, zero infra).**
On launch, compute `daysSinceLastImport` per account. Show a persistent banner when overdue. Always works, requires nothing.

**Layer 2 — Calendar invite (Phase 7, zero infra, most reliable).**
Generate a downloadable `.ics` with a recurring event ("Update finance tracker") matching the user's chosen cadence, with a 1-day alarm. User adds it once to their phone calendar. This is the reminder that will actually still be firing in six months. Offer it during onboarding.

**Layer 3 — Web push (Phase 7).**
- Service worker + VAPID keys. Subscription stored in `push_subscriptions` (endpoint, p256dh, auth, device label, cadence, last_notified_at), one row per device
- The `daily-check` Edge Function evaluates the trigger logic below and dispatches push via `web-push`. Fired by the GitHub Actions cron in §15.5
- VAPID private key lives in Supabase secrets, never in the client bundle
- Notification payload contains counts only, never amounts or merchant names. Lock screens are public
- Android: works well once installed to home screen
- iOS: requires iOS 16.4+ **and** the app installed to home screen. Will not work in Safari tabs. State this in the UI rather than failing silently

**Trigger logic — smarter than a fixed interval:**

```
remind IF
     daysSinceLastImport >= cadenceDays
  OR (expected payday has passed AND no import since)
  OR uncategorisedCount > 20
  OR pendingTransferReviews > 10
AND not remindedWithin(3 days)
```

Configurable cadence: weekly, fortnightly (default, matched to pay cycle), monthly.

---

## 12. Build phases

Ship each phase working before moving on. Do not build the dashboard early.

| Phase | Deliverable | Done when |
|---|---|---|
| **0** | Vite + React + TS + Tailwind scaffold, design tokens, PWA manifest, service worker, app shell with nav | Installs to home screen, loads offline |
| **0.5** | Supabase project (Sydney), migrations for all tables, RLS on every table, generated types, auth screens, session persistence, protected routes | Two test accounts cannot see each other's rows. Verify by querying with the other user's JWT |
| **1** | Accounts CRUD, seed categories, settings, TanStack Query + IndexedDB persister, JSON export/import | Sign in on a second device and see the same accounts. Full backup round-trips |
| **2** | CSV import: parse, column mapping UI, date format detection, amount normalisation, `commit-import` Edge Function with dedupe, import ledger with undo | Importing the same file twice adds zero rows. Undo removes exactly that import. Import on phone, visible on desktop |
| **3** | Categorisation: rules engine, seed rules, merchant normalisation, ledger view, inline recategorise, bulk edit, rules manager | Under 10% uncategorised on a real import |
| **4** | **Transfer reconciliation**: matching algorithm, review queue, manual link/unlink, external patterns, card payment handling | On a real multi-account import, transfers are excluded and spending totals are believable |
| **5** | Dashboard, Sankey flow, category charts, insights, trends | Sankey renders real data and filters the ledger on click |
| **6** | Recurrence detection, commitments screen, budget builder, pace tracking | Correctly detects known subscriptions and produces a discretionary pool figure |
| **7** | Reminders: in-app banner, `.ics` generator, service worker push, `daily-check` Edge Function, GitHub Actions cron (§15.5), automated backup job (§15.6) | Push arrives on the phone on schedule. Backup artifact appears in the repo. Project has not paused after two idle weeks |
| **8** | Integrity checks panel, dark mode, keyboard shortcuts, app PIN lock, optional LLM categorisation, polish | All §10 checks pass on real data |
| **9** *(optional)* | Offline write queue for lightweight actions only (§15.2) | Deferred. Do not build unless asked |

---

## 13. Test fixtures

Before Phase 4, create `src/fixtures/seed.ts` with a synthetic dataset that includes every hard case:

1. A same-day exact transfer pair between two accounts
2. A transfer pair split across 3 days
3. Two identical-amount transfers on the same day between different account pairs (tests greedy assignment)
4. A one-sided transfer to a non-imported account
5. A credit card purchase plus its later payment from a transaction account
6. Two legitimate identical purchases on the same day (must not dedupe)
7. An overlapping re-import of an existing date range
8. A file with `MM/DD/YYYY` dates where day values exceed 12
9. A file with separate debit and credit columns
10. A file with amounts formatted as `(1,234.56)` and `$1,234.56`
11. A recurring subscription with a mid-year price increase
12. An ATM withdrawal

Write assertions against these. Phase 4 is not complete until cases 1–5 pass.

---

## 14. Notes for the implementer

- **The WeMoney export schema is unverified.** Do not hardcode it. The mapping wizard in §4.1 handles any schema. Before Phase 2, paste one real header row and two sample rows into the mapping profile seed
- Store money as **integer cents** internally. Format at the render boundary only. Do not use floats for currency
- All dates are date-only ISO strings. No `Date` objects in storage, no timezone arithmetic
- Every destructive action is undoable or confirmed. This is a ledger — silent data loss is the worst possible failure
- Virtualise the ledger table from day one. Multi-year, multi-account history is tens of thousands of rows
- Do not add features not in this spec. Ask first
- Secrets: only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` may appear in the client. The service role key and the VAPID private key live in Supabase secrets and GitHub Actions secrets. If the service role key ever appears in `src/`, the build is wrong

---

## 15. Backend, sync and operations

### 15.1 What moved and what did not

The ledger now lives in Supabase Postgres. The client is a thin, cached view over it. Nothing about §5 transfer matching, §6 categorisation, or §7 budgeting changes in behaviour — only where the code runs.

Accept the trade honestly: transaction-level financial history is now sitting in a hosted Postgres instance rather than only on a phone. Mitigations are RLS, the Sydney region, no service-role key in the client, and notification payloads that carry counts rather than amounts. That is a reasonable posture for personal finance data, but it is a different posture from local-only.

### 15.2 Sync model: server-authoritative, not offline-first

**Do not build a bidirectional offline sync engine.** For a ledger with cross-account dedupe and transfer matching, two devices editing offline and merging later produces duplicate transactions and broken transfer links, and the conflict resolution is genuinely hard. The complexity is not worth it for one person on two or three devices.

Instead:

- **Reads:** TanStack Query with an IndexedDB persister. The app opens instantly and shows the last known ledger with an "offline, last synced 2h ago" indicator. Stale-while-revalidate on reconnect
- **Writes:** require connectivity. Optimistic update in the cache, rollback with a toast on failure
- **Imports:** online only, hard blocked offline (§4.1 step 9)
- **Phase 9 (optional):** a small outbox for idempotent single-row actions — recategorise, confirm/reject transfer, edit note. These are safe to replay because each is a targeted update keyed by row id. Nothing else goes in the outbox

### 15.3 Auth

- Email + password. Session persisted via Supabase's refresh token, so sign-in is rare
- No email confirmation loop needed for a single-user app, but leave confirmations on — it costs nothing and prevents typo lockout
- **App lock:** optional 6-digit PIN or WebAuthn/biometric gate on app resume, held in the service worker. This protects the visible ledger on an unlocked phone. It is a UI lock, not encryption. Do not claim otherwise in the UI
- Sign-out clears the IndexedDB query cache. A cached ledger surviving sign-out is a bug

### 15.4 Edge Functions

| Function | Trigger | Job |
|---|---|---|
| `commit-import` | Client POST | Dedupe, categorise, transfer-match, insert. One transaction |
| `rematch-transfers` | Client POST | Re-run §5.1 over a date range after the user edits account settings or patterns |
| `daily-check` | GitHub Actions cron | Evaluate reminder triggers, dispatch web push, touch the keep-alive table |
| `export-snapshot` | GitHub Actions cron | Return the full ledger as JSON for backup |

Every function verifies the caller's JWT and derives `user_id` from it. Never trust a `user_id` in the request body. The two cron-invoked functions authenticate with a shared secret header instead and iterate all users.

### 15.5 Keeping the project alive

The free tier pauses a project after seven days without incoming API requests, and a paused project is unreachable until manually restored from the dashboard. An app used fortnightly will hit this, and it will hit it exactly when a reminder was supposed to fire.

Fix it with one GitHub Actions workflow that does double duty:

```yaml
# .github/workflows/daily.yml
name: daily
on:
  schedule:
    - cron: '0 21 * * *'   # 07:00 AEST
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Run daily check
        run: |
          curl -fsS -X POST "${{ secrets.SUPABASE_URL }}/functions/v1/daily-check" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json"
```

One HTTP request per day. It resets the inactivity timer **and** runs the reminder evaluation. Do not use `pg_cron` for the keep-alive — internal database activity is not an incoming API request, and the whole point is to look active from outside.

Two failure modes to handle rather than ignore:

- GitHub disables scheduled workflows in repos with no activity for 60 days. Add a `workflow_dispatch` trigger and check it quarterly, or accept the manual restore
- If the ping fails three days running, `daily.yml` should open a GitHub issue. Silent cron death is how the project pauses anyway

### 15.6 Backups

<cite index="2-1">The free tier keeps no backups at all</cite>. For a financial ledger that is the single largest risk in this architecture, larger than the pause.

Three layers, build all three in Phase 7:

1. **Weekly automated snapshot.** A second GitHub Actions job calls `export-snapshot` and commits the JSON to a **private** repo, timestamped. Free, versioned, and gives you point-in-time recovery. Keep 26 weeks
2. **Manual export.** The Settings screen exports the full ledger as JSON and as CSV per account, at any time
3. **Restore path.** An import routine that takes a snapshot JSON and rebuilds every table. **Test the restore into a scratch Supabase project before trusting it.** An untested backup is not a backup

The 500MB database cap is not a concern here. Multi-year history across eight accounts is on the order of tens of thousands of rows and a few tens of megabytes.

### 15.7 Local development

- `supabase start` for a local stack. Seed with §13 fixtures via `supabase/seed.sql`
- All schema changes go through `supabase migration new`, applied with `supabase db push`. Never edit the schema in the dashboard — it desyncs the repo and Cursor will then generate against stale types
- Regenerate `src/types/database.ts` after every migration
- Write the §5.1 matching algorithm as a pure function with no Supabase imports, so it unit tests against the fixtures without a database
