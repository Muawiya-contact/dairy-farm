-- Keep the eight-argument RPC for already deployed clients during rollout.
create function public.create_customer(
  p_name text, p_kind text, p_phone text, p_morning numeric,
  p_evening numeric, p_rate numeric, p_opening_balance numeric,
  p_opening_date date, p_free_reason text
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if p_kind = 'free' then
    if p_free_reason is null or p_free_reason not in ('owner','staff','charity','calves','other') then
      raise exception 'CUSTOMER_FREE_REASON: muft doodh ki wajah chunein' using errcode = 'P0001';
    end if;
  elsif p_free_reason is not null then
    raise exception 'CUSTOMER_FREE_REASON: wajah sirf muft customer ke liye hai' using errcode = 'P0001';
  end if;
  v_id := public.create_customer(p_name, p_kind, p_phone, p_morning,
                                  p_evening, p_rate, p_opening_balance, p_opening_date);
  if p_kind = 'free' then
    update public.customers set free_reason = p_free_reason where id = v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.create_customer(text,text,text,numeric,numeric,numeric,numeric,date,text) from public;
grant execute on function public.create_customer(text,text,text,numeric,numeric,numeric,numeric,date,text) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.create_customer(text,text,text,numeric,numeric,numeric,numeric,date,text) to anon;
  end if;
end $$;
