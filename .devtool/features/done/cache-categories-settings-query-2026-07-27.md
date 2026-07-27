---
id: "cache-categories-settings-query-2026-07-27"
status: "done"
priority: "critical"
assignee: "Cursor Grok"
epic: "Phase 0 — Stabilization"
dueDate: null
created: "2026-07-27T05:50:00.000Z"
modified: "2026-07-27T06:15:11.230Z"
completedAt: "2026-07-27T06:15:11.230Z"
labels: ["phase-0", "performance"]
order: "a1"
---

# Cache categories/settings — stop seeding flash on nav

As a user, I don't want to see "Preparing your ledger…" every time I switch tabs when data hasn't changed.

## Acceptance criteria
- Navigating between Dashboard, Ledger, Insights, Budget, and More does not re-trigger seeding/loading if categories and settings are already loaded this session.
- Data still refreshes after mutations without a full reload.
- Network tab shows zero duplicate categories/settings requests after first load.

## Technical notes
- Move fetch-on-mount into TanStack Query hooks with `staleTime` (~5 min).
- Gate seeding behind check-then-create (not unconditional upsert).
- Source: Roadmap Story A6 / Phase 0.