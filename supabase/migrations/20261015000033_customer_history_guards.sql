-- Customer opening dates and dated prices define the boundary for new entries.
-- Existing ledger rows and rate snapshots are deliberately not rewritten.
create function public.trg_customer_opening_date() returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
begin
  if new.opening_date > public.farm_today() then
    raise exception 'CUSTOMER_FUTURE_OPENING: aaj se aage opening nahi ho sakti' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.opening_date is distinct from old.opening_date then
    if exists (select 1 from public.customer_rates where customer_id = old.id)
       or exists (select 1 from public.milk_deliveries where customer_id = old.id)
       or exists (select 1 from public.company_bills where customer_id = old.id)
       or exists (select 1 from public.payments where customer_id = old.id) then
      raise exception 'CUSTOMER_OPENING_IN_USE: opening date purane hisaab se judi hai' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger customer_opening_date before insert or update of opening_date on public.customers
  for each row execute function public.trg_customer_opening_date();

create function public.trg_customer_activity_date() returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
declare v_opening date; v_activity date;
begin
  -- A rate edit locks the same customer row, so a new delivery cannot race it.
  if tg_table_name = 'milk_deliveries' then
    select opening_date into v_opening from public.customers where id = new.customer_id for update;
  else
    select opening_date into v_opening from public.customers where id = new.customer_id;
  end if;
  v_activity := (to_jsonb(new) ->> tg_argv[0])::date;
  if v_activity < v_opening then
    raise exception 'CUSTOMER_BEFORE_OPENING: customer ki opening date se pehle entry nahi ho sakti' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger customer_delivery_date before insert or update of customer_id, delivery_date on public.milk_deliveries
  for each row execute function public.trg_customer_activity_date('delivery_date');
create trigger customer_payment_date before insert or update of customer_id, payment_date on public.payments
  for each row execute function public.trg_customer_activity_date('payment_date');
create trigger customer_bill_date before insert or update of customer_id, from_date on public.company_bills
  for each row execute function public.trg_customer_activity_date('from_date');

create function public.trg_customer_rate_history() returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
declare v_opening date; v_kind text; v_next date; v_existing_rate numeric;
begin
  if tg_op = 'DELETE' then
    raise exception 'RATE_HISTORY_IMMUTABLE: rate history delete nahi ho sakti' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (new.customer_id is distinct from old.customer_id
                            or new.effective_from is distinct from old.effective_from) then
    raise exception 'RATE_IDENTITY_IMMUTABLE: rate ki tareekh aur customer nahi badal sakte' using errcode = 'P0001';
  end if;
  select opening_date, kind into v_opening, v_kind from public.customers
    where id = new.customer_id for update;
  if v_kind in ('free', 'company') then
    raise exception 'RATE_KIND_NOT_CHARGEABLE: is customer ka litre rate nahi hota' using errcode = 'P0001';
  end if;
  if new.effective_from < v_opening then
    raise exception 'RATE_BEFORE_CUSTOMER_OPENING: opening se pehle rate nahi ho sakta' using errcode = 'P0001';
  end if;
  if new.effective_from > public.farm_today() + 365 then
    raise exception 'RATE_TOO_FAR_AHEAD: aik saal se aage ka rate nahi ho sakta' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.rate = old.rate then return new; end if;
  if tg_op = 'INSERT' then
    -- INSERT ... ON CONFLICT DO UPDATE fires this trigger before the UPDATE.
    select rate into v_existing_rate from public.customer_rates
      where customer_id = new.customer_id and effective_from = new.effective_from;
    if found and v_existing_rate = new.rate then return new; end if;
  end if;
  select min(effective_from) into v_next from public.customer_rates
    where customer_id = new.customer_id and effective_from > new.effective_from;
  if exists (select 1 from public.milk_deliveries d
             where d.customer_id = new.customer_id and d.delivery_date >= new.effective_from
               and (v_next is null or d.delivery_date < v_next)) then
    raise exception 'RATE_ALREADY_USED: saved delivery ki rate history nahi badal sakte' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger customer_rate_history before insert or update or delete on public.customer_rates
  for each row execute function public.trg_customer_rate_history();
