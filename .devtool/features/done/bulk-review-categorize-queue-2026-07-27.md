---
id: "bulk-review-categorize-queue-2026-07-27"
status: "done"
priority: "critical"
assignee: "Cursor Grok"
epic: "Epic A — Categorization & Data Quality"
dueDate: null
created: "2026-07-27T05:50:00.000Z"
modified: "2026-07-27T06:36:37.013Z"
completedAt: "2026-07-27T06:36:37.013Z"
labels: ["phase-1", "categorization", "usability"]
order: "b0"
---

# Bulk Review & Categorize queue

As a user, I want a dedicated screen of only uncategorized transactions so I can clear the backlog fast instead of hunting the full ledger.

~27% of monthly spend is currently uncategorized — this is the highest-leverage usability fix.

## Acceptance criteria
- View at e.g. `/review` lists `category_id IS NULL`, most recent first.
- Each row: description, date, amount, account; category is a single tap (dropdown or quick-pick chips).
- Assigning a category removes the row immediately (optimistic update).
- Running counter: remaining count + total $ value.
- Bulk-select assigns one category to many rows.

## Technical notes
- `useUncategorizedTransactions` TanStack Query hook.
- Reuse ledger row; local checkbox state.
- Batch update via `.in('id', [...])`; invalidate uncategorized + dashboard/insights queries.
- Source: Roadmap Story A1.