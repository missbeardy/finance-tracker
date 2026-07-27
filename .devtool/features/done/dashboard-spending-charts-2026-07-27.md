---
id: "dashboard-spending-charts-2026-07-27"
status: "done"
priority: "high"
assignee: "Cursor Grok"
epic: "Epic B — Dashboard & Data Visualization"
dueDate: null
created: "2026-07-27T05:50:00.000Z"
modified: "2026-07-27T08:49:01.050Z"
completedAt: "2026-07-27T08:49:01.050Z"
labels: ["phase-2", "dashboard", "charts"]
order: "c0"
---

# Replace dashboard spending list with real charts

Dashboard "Monthly spending" is a text list with percentages — no chart. Insights already has good charts buried on a secondary page.

## Acceptance criteria
- Dashboard shows a real category breakdown chart (donut) and/or trend sparkline.
- Broken/missing chart icon glyph is fixed or removed.
- Best Insights visuals are surfaced higher (dashboard or clearer nav).

## Technical notes
- Recharts for donut/line/bar; lazy-load chart code so Dashboard paints first.
- Source: Roadmap Phase 2 / Epic B.