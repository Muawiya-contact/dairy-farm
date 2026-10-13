-- Farm cash is required for the expense and payment workflows.
alter table public.accounts
  add constraint accounts_farm_cash_active check (not is_farm_cash or active);
