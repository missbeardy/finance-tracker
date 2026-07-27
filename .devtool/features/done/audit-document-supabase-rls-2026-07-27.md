---
id: "audit-document-supabase-rls-2026-07-27"
status: "done"
priority: "high"
assignee: "Cursor Grok"
epic: "Phase 0 — Stabilization"
dueDate: null
created: "2026-07-27T05:50:00.000Z"
modified: "2026-07-27T06:15:11.230Z"
completedAt: "2026-07-27T06:15:11.230Z"
labels: ["phase-0", "security"]
order: "a3"
---

# Audit and document Supabase RLS policies

Confirm every finance table has RLS scoped to `auth.uid() = user_id` at Postgres — not only client-side `user_id=eq.<uuid>` filters.

## Acceptance criteria
- All tables with financial data have RLS enabled and verified.
- Policies documented in repo (migration comments or short security note).
- Confirm Supabase PITR / backups posture for accidental bad imports.

## Technical notes
- Anon key in the client is only safe if RLS is correct — highest-priority security check.
- Source: Roadmap Phase 0 / Section 3.3.