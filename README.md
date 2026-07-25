# Randall Finance Tracker

Personal finance ledger PWA. Spec: [ledger-spec.md](ledger-spec.md).

## Stack

Vite + React 18 + TypeScript, Tailwind CSS v4, Supabase (Sydney), Cloudflare Pages.

## Setup

```bash
npm install
cp .env.example .env.local
```

### Local Supabase (Phase 0.5)

Docker Desktop must be running.

```bash
npx supabase start
# copy Project URL + anon key into .env.local (see `npx supabase status`)
npm run db:types
npm run verify:rls
npm run dev
```

### Hosted Supabase (when you create the free account)

1. Create a project in **Sydney (`ap-southeast-2`)** — region cannot change later.
2. Put the project URL and **anon** key in `.env.local` (never the service role key).
3. Link and push migrations:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

4. Re-run `npm run verify:rls` against the remote URL/keys.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build + PWA service worker |
| `npm run db:start` / `db:stop` | Local Supabase |
| `npm run db:reset` | Re-apply migrations + seed |
| `npm run db:types` | Regenerate `src/types/database.ts` |
| `npm run verify:rls` | Confirm two users cannot see each other's rows |

## Phases

Build in phase order from the spec. Do not skip Phase 4 (transfer reconciliation).

When you return from being away, start with **[HANDOFF.md](HANDOFF.md)** — schema apply steps and a test checklist.
