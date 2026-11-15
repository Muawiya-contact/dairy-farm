-- Infrequent walk-in buyers stay in the normal, auditable customer ledger but
-- are visually separated from standing deliveries in Doodh.
alter table public.customers add column is_local boolean not null default false;
create index customers_local_active on public.customers(is_local, active) where is_local;

create function public.create_local_customer_once(
  p_request_id uuid, p_name text, p_kind text, p_phone text,
  p_rate numeric, p_opening_date date, p_free_reason text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_payload jsonb; v_request private.customer_create_requests%rowtype; v_id uuid;
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'CUSTOMER_REQUEST_REQUIRED'; end if;
  if p_kind not in ('cash','free') then raise exception 'LOCAL_CUSTOMER_KIND'; end if;
  if p_opening_date is null or p_opening_date > public.farm_today() or nullif(trim(p_name), '') is null then
    raise exception 'CUSTOMER_INVALID';
  end if;
  if p_kind = 'cash' and (p_rate is null or p_rate <= 0) then raise exception 'RATE_MISSING'; end if;
  if p_kind = 'free' and p_free_reason not in ('owner','staff','charity','calves','other') then
    raise exception 'CUSTOMER_FREE_REASON';
  end if;
  if p_kind <> 'free' and p_free_reason is not null then raise exception 'CUSTOMER_FREE_REASON'; end if;
  v_payload := jsonb_build_array(trim(p_name), p_kind, nullif(trim(p_phone), ''), p_rate, p_opening_date, p_free_reason);
  insert into private.customer_create_requests(request_id, payload) values (p_request_id, v_payload)
    on conflict(request_id) do nothing;
  select * into v_request from private.customer_create_requests where request_id = p_request_id for update;
  if v_request.payload is distinct from v_payload then raise exception 'CUSTOMER_REQUEST_CHANGED'; end if;
  if v_request.customer_id is not null then return v_request.customer_id; end if;
  select id into v_id from public.customers where lower(trim(name)) = lower(trim(p_name));
  if v_id is not null then
    if not exists (select 1 from public.customers where id = v_id and is_local and kind = p_kind) then
      raise exception 'CUSTOMER_NAME_EXISTS';
    end if;
  else
    v_id := public.create_customer(trim(p_name), p_kind, p_phone, 0, 0,
      case when p_kind = 'free' then 0 else p_rate end, 0, p_opening_date, p_free_reason, 0);
    update public.customers set is_local = true where id = v_id;
  end if;
  update private.customer_create_requests set customer_id = v_id where request_id = p_request_id;
  return v_id;
end $$;

revoke all on function public.create_local_customer_once(uuid,text,text,text,numeric,date,text) from public, anon, authenticated;
grant execute on function public.create_local_customer_once(uuid,text,text,text,numeric,date,text) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.create_local_customer_once(uuid,text,text,text,numeric,date,text) to anon;
  end if;
end $$;
