-- Expose ledger tables to the Data API roles.
-- RLS still scopes every row to auth.uid(); grants only allow the API to reach the tables.

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

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
