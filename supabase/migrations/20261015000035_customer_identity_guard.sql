-- A change of customer type or an opening-balance rewrite can reinterpret the ledger.
create function public.trg_customer_identity_guard() returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'CUSTOMER_KIND_IMMUTABLE: customer ki qism seedha nahi badal sakte' using errcode = 'P0001';
  end if;
  if new.opening_balance is distinct from old.opening_balance and (
       exists (select 1 from public.milk_deliveries where customer_id = old.id)
       or exists (select 1 from public.company_bills where customer_id = old.id)
       or exists (select 1 from public.payments where customer_id = old.id)
     ) then
    raise exception 'CUSTOMER_BALANCE_IN_USE: opening balance purane hisaab se juda hai' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger customer_identity_guard before update of kind, opening_balance on public.customers
  for each row execute function public.trg_customer_identity_guard();
