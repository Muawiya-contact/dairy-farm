-- A request ID is reserved before creation. Concurrent retries wait on the
-- primary key and then return the committed customer, including its first rate.
create table private.customer_create_requests (
  request_id uuid primary key,
  payload jsonb not null,
  customer_id uuid unique references public.customers(id) on delete restrict
);
revoke all on private.customer_create_requests from public, anon, authenticated;

create function public.create_customer_once(
  p_request_id uuid, p_name text, p_kind text, p_phone text,
  p_morning numeric, p_evening numeric, p_rate numeric,
  p_opening_balance numeric, p_opening_date date, p_free_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_payload jsonb; v_request private.customer_create_requests%rowtype; v_id uuid;
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'CUSTOMER_REQUEST_REQUIRED'; end if;
  v_payload := jsonb_build_array(trim(p_name), p_kind, nullif(trim(p_phone), ''),
    p_morning, p_evening, p_rate, p_opening_balance, p_opening_date, p_free_reason);
  insert into private.customer_create_requests(request_id, payload)
    values (p_request_id, v_payload) on conflict (request_id) do nothing;
  select * into v_request from private.customer_create_requests where request_id = p_request_id for update;
  if v_request.payload is distinct from v_payload then
    raise exception 'CUSTOMER_REQUEST_CHANGED';
  end if;
  if v_request.customer_id is not null then return v_request.customer_id; end if;
  v_id := public.create_customer(p_name, p_kind, p_phone, p_morning, p_evening,
    p_rate, p_opening_balance, p_opening_date, p_free_reason);
  update private.customer_create_requests set customer_id = v_id where request_id = p_request_id;
  return v_id;
end $$;
revoke all on function public.create_customer_once(uuid,text,text,text,numeric,numeric,numeric,numeric,date,text) from public, anon, authenticated;
grant execute on function public.create_customer_once(uuid,text,text,text,numeric,numeric,numeric,numeric,date,text) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.create_customer_once(uuid,text,text,text,numeric,numeric,numeric,numeric,date,text) to anon;
  end if;
end $$;
