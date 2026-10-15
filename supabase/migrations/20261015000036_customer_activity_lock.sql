-- All customer ledger writes must serialize with opening-date and balance edits.
-- FK key-share locks alone do not conflict with ordinary customer updates.
create or replace function public.trg_customer_activity_date() returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $$
declare v_opening date; v_activity date;
begin
  select opening_date into v_opening from public.customers
    where id = new.customer_id for update;
  v_activity := (to_jsonb(new) ->> tg_argv[0])::date;
  if v_activity < v_opening then
    raise exception 'CUSTOMER_BEFORE_OPENING: customer ki opening date se pehle entry nahi ho sakti' using errcode = 'P0001';
  end if;
  return new;
end $$;
