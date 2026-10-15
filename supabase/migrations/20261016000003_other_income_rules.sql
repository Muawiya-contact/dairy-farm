-- Manual manure/other income reaches the same account ledger and profit report
-- as animal sales, but can never impersonate an animal sale.
create function public.guard_manual_income() returns trigger language plpgsql
security invoker set search_path = public, pg_temp as $$
declare v_opening date; v_active boolean;
begin
  if new.kind = 'animal_sale' then return new; end if;
  if new.kind not in ('manure', 'other') or new.animal_id is not null then
    raise exception 'INCOME_KIND_INVALID' using errcode = 'P0001';
  end if;
  if new.income_date > public.farm_today() then
    raise exception 'FUTURE_DATE' using errcode = 'P0001';
  end if;
  select opening_date, active into v_opening, v_active from public.accounts where id = new.account_id;
  if not coalesce(v_active, false) or new.income_date < v_opening then
    raise exception 'INCOME_ACCOUNT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger manual_income_rules before insert or update on public.other_income
for each row execute function public.guard_manual_income();
create index if not exists other_income_date_idx on public.other_income(income_date);
