---
id: "error-retry-toast-handling-2026-07-27"
status: "done"
priority: "critical"
assignee: "Cursor Grok"
epic: "Phase 0 — Stabilization"
dueDate: null
created: "2026-07-27T05:50:00.000Z"
modified: "2026-07-27T06:15:11.230Z"
completedAt: "2026-07-27T06:15:11.230Z"
labels: ["phase-0", "reliability"]
order: "a0"
---

# Add error boundaries + retry/toast for Supabase

As a user, I want clear errors and a retry option when a save or load fails, so I never wonder whether my money data actually saved.

## Acceptance criteria
- Failed Supabase reads show an inline error state with a Retry button (not an infinite spinner or blank section).
- Failed writes (category assignment, rule creation, CSV import) show a toast and do not silently discard the action.
- Optimistic UI updates roll back visibly if the write fails.
- Top-level React error boundary around the app shell catches render failures gracefully.

## Technical notes
- Wrap data-fetching in TanStack Query (isError / error / efetch).
- Lightweight toast system from mutation `onError` callbacks.
- Source: Roadmap Story A4 / Phase 0.