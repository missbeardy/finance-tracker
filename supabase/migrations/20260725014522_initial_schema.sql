-- Tributary initial schema
-- Tables first without circular FKs; constraints added at the end.
-- RLS: identical own-row policies on every table.

create table public.accounts (
  id                       bigint generated always as identity primary key,
  user_id                  uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name                     text not null,
  institution              text not null,
  type                     text not null check (type in
                             ('transaction','savings','credit_card','offset','loan','investment')),
  is_own                   boolean not null default true,
  is_imported              boolean not null default true,
  external_match_patterns  text[] not null default '{}',
  opening_balance          bigint,
  currency                 text not null default 'AUD',
  color_token              text not null,
  created_at               timestamptz not null default now()
);

create table public.categories (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name         text not null,
  parent_id    bigint references public.categories(id) on delete cascade,
  kind         text not null check (kind in ('expense','income','transfer','system')),
  color_token  text,
  is_opaque    boolean not null default false,
  is_system    boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.imports (
  id                    bigint generated always as identity primary key,
  user_id               uuid not null references auth.users(id) on delete cascade default auth.uid(),
  account_id            bigint references public.accounts(id) on delete set null,
  filename              text not null,
  row_count             integer not null default 0,
  date_min              date,
  date_max              date,
  duplicates_skipped    integer not null default 0,
  mapping_profile_hash  text,
  created_at            timestamptz not null default now()
);

create table public.transfers (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users(id) on delete cascade default auth.uid(),
  out_txn_id      bigint,
  in_txn_id       bigint,
  account_out_id  bigint references public.accounts(id) on delete set null,
  account_in_id   bigint references public.accounts(id) on delete set null,
  amount          bigint not null,
  confidence      text not null default 'high'
                    check (confidence in ('high','medium','low')),
  method          text not null default 'auto'
                    check (method in ('auto','manual','pattern','rule')),
  status          text not null default 'confirmed'
                    check (status in ('confirmed','pending','rejected')),
  created_at      timestamptz not null default now()
);

create table public.transactions (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users(id) on delete cascade default auth.uid(),
  account_id       bigint not null references public.accounts(id) on delete cascade,
  date             date not null,
  posted_date      date,
  amount           bigint not null,
  description      text not null,
  merchant         text not null,
  balance          bigint,
  category_id      bigint references public.categories(id) on delete set null,
  category_source  text check (category_source in ('rule','manual','import','llm')),
  transfer_id      bigint,
  status           text not null default 'active'
                     check (status in ('active','pending_transfer_review','excluded')),
  notes            text,
  split_parent_id  bigint references public.transactions(id) on delete cascade,
  dedupe_key       text not null,
  import_id        bigint not null references public.imports(id) on delete cascade,
  created_at       timestamptz not null default now()
);

create table public.rules (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users(id) on delete cascade default auth.uid(),
  priority       integer not null default 100,
  match_type     text not null check (match_type in ('contains','starts_with','regex','exact_merchant')),
  pattern        text not null,
  account_scope  bigint references public.accounts(id) on delete cascade,
  amount_min     bigint,
  amount_max     bigint,
  category_id    bigint not null references public.categories(id) on delete cascade,
  enabled        boolean not null default true,
  created_at     timestamptz not null default now()
);

create table public.budgets (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  category_id   bigint not null references public.categories(id) on delete cascade,
  period_start  date not null,
  period_type   text not null default 'calendar_month'
                  check (period_type in ('calendar_month','pay_cycle')),
  amount        bigint not null,
  created_at    timestamptz not null default now(),
  unique (user_id, category_id, period_start, period_type)
);

create table public.settings (
  id                      bigint generated always as identity primary key,
  user_id                 uuid not null references auth.users(id) on delete cascade default auth.uid(),
  period_type             text not null default 'calendar_month'
                            check (period_type in ('calendar_month','pay_cycle')),
  payday                  date,
  savings_target_cents    bigint,
  savings_target_percent  numeric(5,2),
  reminder_cadence_days   integer not null default 14,
  import_mappings         jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id)
);

create table public.merchant_aliases (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null references auth.users(id) on delete cascade default auth.uid(),
  pattern             text not null,
  canonical_merchant  text not null,
  created_at          timestamptz not null default now(),
  unique (user_id, pattern)
);

create table public.commitments (
  id                   bigint generated always as identity primary key,
  user_id              uuid not null references auth.users(id) on delete cascade default auth.uid(),
  merchant             text not null,
  amount               bigint not null,
  cadence_days         integer not null,
  next_expected_date   date,
  account_id           bigint references public.accounts(id) on delete set null,
  status               text not null default 'detected'
                         check (status in ('detected','confirmed','dismissed','possibly_cancelled','price_increased')),
  annualised_cents     bigint,
  created_at           timestamptz not null default now()
);

create table public.push_subscriptions (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint          text not null,
  p256dh            text not null,
  auth              text not null,
  device_label      text,
  cadence_days      integer not null default 14,
  last_notified_at  timestamptz,
  created_at        timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- Keep-alive touch table for daily-check (Phase 7)
create table public.keep_alive (
  id          bigint generated always as identity primary key,
  touched_at  timestamptz not null default now()
);

-- Circular FKs between transfers and transactions
alter table public.transfers
  add constraint transfers_out_txn_id_fkey
    foreign key (out_txn_id) references public.transactions(id) on delete set null,
  add constraint transfers_in_txn_id_fkey
    foreign key (in_txn_id) references public.transactions(id) on delete set null;

alter table public.transactions
  add constraint transactions_transfer_id_fkey
    foreign key (transfer_id) references public.transfers(id) on delete set null;

-- Indexes
create index on public.accounts (user_id);
create index on public.categories (user_id);
create index on public.categories (user_id, parent_id);
create index on public.imports (user_id);
create index on public.transfers (user_id);
create index on public.transactions (user_id, date desc);
create index on public.transactions (user_id, account_id, date);
create index on public.transactions (user_id, dedupe_key);
create index on public.transactions (user_id, category_id);
create index on public.transactions (user_id, transfer_id) where transfer_id is not null;
create index on public.transactions (user_id, status) where status <> 'active';
create index on public.rules (user_id, priority);
create index on public.budgets (user_id, period_start);
create index on public.commitments (user_id);
create index on public.merchant_aliases (user_id);
create index on public.push_subscriptions (user_id);

-- RLS helper: identical own-row policies
create or replace function public.apply_own_row_rls(table_name text)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', table_name);
  execute format(
    'create policy "own rows select" on public.%I for select using (auth.uid() = user_id)',
    table_name
  );
  execute format(
    'create policy "own rows insert" on public.%I for insert with check (auth.uid() = user_id)',
    table_name
  );
  execute format(
    'create policy "own rows update" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
    table_name
  );
  execute format(
    'create policy "own rows delete" on public.%I for delete using (auth.uid() = user_id)',
    table_name
  );
end;
$$;

select public.apply_own_row_rls('accounts');
select public.apply_own_row_rls('categories');
select public.apply_own_row_rls('imports');
select public.apply_own_row_rls('transfers');
select public.apply_own_row_rls('transactions');
select public.apply_own_row_rls('rules');
select public.apply_own_row_rls('budgets');
select public.apply_own_row_rls('settings');
select public.apply_own_row_rls('merchant_aliases');
select public.apply_own_row_rls('commitments');
select public.apply_own_row_rls('push_subscriptions');

-- keep_alive is service-only; lock down public access
alter table public.keep_alive enable row level security;
-- no policies for anon/authenticated → denied by default

drop function public.apply_own_row_rls(text);

-- Expose tables to Data API roles (RLS still enforces per-user access)
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on
  public.accounts,
  public.categories,
  public.imports,
  public.transfers,
  public.transactions,
  public.rules,
  public.budgets,
  public.settings,
  public.merchant_aliases,
  public.commitments,
  public.push_subscriptions
to authenticated;

grant all on
  public.accounts,
  public.categories,
  public.imports,
  public.transfers,
  public.transactions,
  public.rules,
  public.budgets,
  public.settings,
  public.merchant_aliases,
  public.commitments,
  public.push_subscriptions,
  public.keep_alive
to service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;
