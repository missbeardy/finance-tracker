# Handoff — Randall Finance Tracker

## Built now (through Phase 6)

- Multi-account WeMoney-style import + account name mapping (editable later)
- Commit import, ledger, transfers review, undo
- **Dashboard**: In / Out / Net / Discretionary, Sankey flow, top categories, alerts, net line
- **Insights**: month trend, weekday pattern, merchant leaderboard
- **Commitments**: recurrence detection (merchant/amount/cadence clustering) with confirm/dismiss,
  possibly-cancelled and price-increased flags
- **Budget**: sustainable budget calc (verified income − committed − debt minimums − savings target
  = discretionary pool), allocation builder seeded from the 3-month category median, per-category
  pace indicator

## What you should do

1. Import `sample-data/wemoney-all-accounts-june.csv` (or your real export later)
2. Open **Dashboard** and **More → Insights**
3. When your real CSV arrives, tweak account name mappings if WeMoney labels differ
4. On **Budget**, run a scan on the Commitments page and confirm the bills that are real

## Tests

```bash
npm test
npm run verify:rls   # RLS isolation across finance tables (needs Supabase URL + anon key)
```

Security posture (RLS, import dedupe, secrets): see `docs/SECURITY.md`.
