---
id: "import-deduplication-safeguard-2026-07-27"
status: "done"
priority: "high"
assignee: "Cursor Grok"
epic: "Phase 0 — Stabilization"
dueDate: null
created: "2026-07-27T05:50:00.000Z"
modified: "2026-07-27T06:15:11.230Z"
completedAt: "2026-07-27T06:15:11.230Z"
labels: ["phase-0", "data-quality", "import"]
order: "a2"
---

# Import deduplication safeguard

As a user, I want re-importing the same CSV to skip duplicates so my totals stay accurate.

## Acceptance criteria
- Re-importing rows already in the ledger skips them and reports "X duplicates skipped" in the import summary.
- Duplicate detection is account + date + amount + description (not file match only).
- Import history records new vs skipped counts.

## Technical notes
- Add `dedupe_hash` on transactions (e.g. sha256 of account_id || date || amount || description), unique per user.
- `ON CONFLICT DO NOTHING` (or equivalent) on insert; surface skipped count in import history UI.
- Source: Roadmap Story A5 / Phase 0.