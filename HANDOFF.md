# Handoff — Randall Finance Tracker

## Built now (through Phase 5)

- Multi-account WeMoney-style import + account name mapping (editable later)
- Commit import, ledger, transfers review, undo
- **Dashboard**: In / Out / Net / Discretionary, Sankey flow, top categories, alerts, net line
- **Insights**: month trend, weekday pattern, merchant leaderboard

## What you should do

1. Import `sample-data/wemoney-all-accounts-june.csv` (or your real export later)
2. Open **Dashboard** and **More → Insights**
3. When your real CSV arrives, tweak account name mappings if WeMoney labels differ

## Next (Phase 6)

Commitments / recurrence detection + budget builder with pace.

## Tests

```bash
npm test
```
