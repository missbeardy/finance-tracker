---
id: "save-as-rule-from-review-2026-07-27"
status: "done"
priority: "high"
assignee: "Cursor Grok"
epic: "Epic A — Categorization & Data Quality"
dueDate: null
created: "2026-07-27T05:50:00.000Z"
modified: "2026-07-27T06:36:37.013Z"
completedAt: "2026-07-27T06:36:37.013Z"
labels: ["phase-1", "categorization", "rules"]
order: "b2"
---

# Save as rule from review queue

As a user, when I categorize manually I want the option to save that as a rule so similar future txns auto-categorize.

## Acceptance criteria
- After assign in the review queue, prompt: "Always categorize [pattern] as [category]?"
- Creates `rules` row with sensible default pattern (strip trailing reference numbers) and `match_type: contains`.
- User can edit the suggested pattern before saving.
- New rules appear in existing rules/category management.

## Technical notes
- Pattern helper e.g. `DBF*ITSOURTIME BEAUDESERT 0724` → `DBF*ITSOURTIME BEAUDESERT`.
- Optionally reuse A2 RPC to apply retroactively in the same action.
- Source: Roadmap Story A3.