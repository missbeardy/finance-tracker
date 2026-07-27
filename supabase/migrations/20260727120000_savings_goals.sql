-- Multiple savings goals (Epic C) — sinking funds alongside settings.savings_target_*.

create table public.savings_goals (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name          text not null,
  target_cents  bigint not null check (target_cents > 0),
  current_cents bigint not null default 0 check (current_cents >= 0),
  target_date   date,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index savings_goals_user_idx on public.savings_goals (user_id, sort_order);

alter table public.savings_goals enable row level security;

create policy "own rows select" on public.savings_goals
  for select using (auth.uid() = user_id);
create policy "own rows insert" on public.savings_goals
  for insert with check (auth.uid() = user_id);
create policy "own rows update" on public.savings_goals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows delete" on public.savings_goals
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.savings_goals to authenticated;
grant all on public.savings_goals to service_role;
grant usage, select on sequence public.savings_goals_id_seq to authenticated, service_role;
