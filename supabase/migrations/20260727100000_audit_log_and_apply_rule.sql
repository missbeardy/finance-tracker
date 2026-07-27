-- Phase 1 / Epic A: audit trail for batch categorisation actions.
-- Own-row RLS (helper from initial migration was dropped after bootstrap).

create table public.audit_log (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  action       text not null,
  entity_type  text,
  entity_id    text,
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index audit_log_user_created_idx on public.audit_log (user_id, created_at desc);

alter table public.audit_log enable row level security;

create policy "own rows select" on public.audit_log
  for select using (auth.uid() = user_id);
create policy "own rows insert" on public.audit_log
  for insert with check (auth.uid() = user_id);
create policy "own rows update" on public.audit_log
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows delete" on public.audit_log
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
grant usage, select on sequence public.audit_log_id_seq to authenticated, service_role;

-- Optional single-rule apply RPC (uses same match semantics as src/lib/ledger/categorise.ts).
-- Prefer the client batch path for multi-rule apply; this keeps one-rule apply available server-side.

create or replace function public.apply_rule_to_transactions(
  p_rule_id bigint,
  p_scope text default 'uncategorized',
  p_dry_run boolean default false
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rule public.rules%rowtype;
  v_uncat_id bigint;
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_scope not in ('uncategorized', 'all') then
    raise exception 'Invalid scope: %', p_scope;
  end if;

  select * into v_rule
  from public.rules
  where id = p_rule_id and user_id = v_uid and enabled = true;

  if not found then
    raise exception 'Rule not found or disabled';
  end if;

  select id into v_uncat_id
  from public.categories
  where user_id = v_uid and name = 'Uncategorised' and parent_id is null
  limit 1;

  with candidates as (
    select t.id
    from public.transactions t
    where t.user_id = v_uid
      and t.transfer_id is null
      and t.status <> 'excluded'
      and (v_rule.account_scope is null or t.account_id = v_rule.account_scope)
      and (v_rule.amount_min is null or abs(t.amount) >= v_rule.amount_min)
      and (v_rule.amount_max is null or abs(t.amount) <= v_rule.amount_max)
      and (
        p_scope = 'all'
        or t.category_id is null
        or (v_uncat_id is not null and t.category_id = v_uncat_id)
      )
      and (
        case v_rule.match_type
          when 'exact_merchant' then upper(t.merchant) = upper(v_rule.pattern)
          when 'starts_with' then
            upper(t.merchant) like upper(v_rule.pattern) || '%'
            or upper(t.description) like upper(v_rule.pattern) || '%'
          when 'contains' then
            strpos(upper(t.merchant), upper(v_rule.pattern)) > 0
            or strpos(upper(t.description), upper(v_rule.pattern)) > 0
          when 'regex' then
            t.merchant ~* v_rule.pattern or t.description ~* v_rule.pattern
          else false
        end
      )
  )
  select count(*)::integer into v_count from candidates;

  if p_dry_run or v_count = 0 then
    return v_count;
  end if;

  update public.transactions t
  set category_id = v_rule.category_id,
      category_source = 'rule'
  where t.id in (
    select c.id from (
      select t2.id
      from public.transactions t2
      where t2.user_id = v_uid
        and t2.transfer_id is null
        and t2.status <> 'excluded'
        and (v_rule.account_scope is null or t2.account_id = v_rule.account_scope)
        and (v_rule.amount_min is null or abs(t2.amount) >= v_rule.amount_min)
        and (v_rule.amount_max is null or abs(t2.amount) <= v_rule.amount_max)
        and (
          p_scope = 'all'
          or t2.category_id is null
          or (v_uncat_id is not null and t2.category_id = v_uncat_id)
        )
        and (
          case v_rule.match_type
            when 'exact_merchant' then upper(t2.merchant) = upper(v_rule.pattern)
            when 'starts_with' then
              upper(t2.merchant) like upper(v_rule.pattern) || '%'
              or upper(t2.description) like upper(v_rule.pattern) || '%'
            when 'contains' then
              strpos(upper(t2.merchant), upper(v_rule.pattern)) > 0
              or strpos(upper(t2.description), upper(v_rule.pattern)) > 0
            when 'regex' then
              t2.merchant ~* v_rule.pattern or t2.description ~* v_rule.pattern
            else false
          end
        )
    ) c
  );

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (
    v_uid,
    'apply_rule',
    'rules',
    p_rule_id::text,
    jsonb_build_object('scope', p_scope, 'updated', v_count, 'dry_run', false)
  );

  return v_count;
end;
$$;

grant execute on function public.apply_rule_to_transactions(bigint, text, boolean) to authenticated;
