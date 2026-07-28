-- Mortgages: loan basics needed to derive balance, payment, and amortization
-- schedule. Balance/payment/payoff date are computed in the app from these
-- fields rather than stored, so they never drift out of sync.

create table public.mortgages (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name              text not null,
  lender            text not null,
  account_id        bigint references public.accounts(id) on delete set null,
  original_balance  bigint not null check (original_balance > 0),
  interest_rate     numeric(6,3) not null check (interest_rate >= 0),
  term_years        integer not null check (term_years > 0),
  start_date        date not null,
  created_at        timestamptz not null default now()
);

create index mortgages_user_idx on public.mortgages (user_id);

alter table public.mortgages enable row level security;

create policy "own rows select" on public.mortgages
  for select using (auth.uid() = user_id);
create policy "own rows insert" on public.mortgages
  for insert with check (auth.uid() = user_id);
create policy "own rows update" on public.mortgages
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows delete" on public.mortgages
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.mortgages to authenticated;
grant all on public.mortgages to service_role;
grant usage, select on sequence public.mortgages_id_seq to authenticated, service_role;
