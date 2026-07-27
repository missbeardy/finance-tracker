---
id: "apply-rules-retroactively-2026-07-27"
status: "done"
priority: "high"
assignee: "Cursor Grok"
epic: "Epic A — Categorization & Data Quality"
dueDate: null
created: "2026-07-27T05:50:00.000Z"
modified: "2026-07-27T06:36:37.013Z"
completedAt: "2026-07-27T06:36:37.013Z"
labels: ["phase-1", "categorization", "rules"]
order: "b1"
---

# Apply rules retroactively

As a user, I want existing rules to run against transactions imported before the rule existed.

## Acceptance criteria
- Creating/editing a rule offers "Apply to existing transactions" (uncategorized or all — user choice).
- Preview shows how many transactions would be affected before commit.
- Action logged to `audit_log` (rule id, count, timestamp).
- 500+ transactions complete without freezing the UI (batched/server-side).

## Technical notes
- Postgres RPC `apply_rule_to_transactions(rule_id, scope)` — match server-side, not client loops.
- Preview via `SELECT COUNT(*)` then confirm.
- One audit_log summary row per batch.
- Source: Roadmap Story A2.