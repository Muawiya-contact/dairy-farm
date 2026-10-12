-- Add a customer and their first rate together, so the milk entry form never
-- sees a chargeable customer without a rate.
create function public.create_customer(
  p_name text, p_kind text, p_phone text, p_morning numeric,
  p_evening numeric, p_rate numeric
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if p_kind not in ('regular','contractor','company','cash','free')
     or nullif(trim(p_name), '') is null or p_morning < 0 or p_evening < 0 then
    raise exception 'Invalid customer';
  end if;
  if p_kind not in ('free','company') and (p_rate is null or p_rate <= 0) then
    raise exception 'Customer rate must be positive';
  end if;
  insert into public.customers (name, kind, free_reason, phone, default_morning, default_evening)
  values (trim(p_name), p_kind, case when p_kind = 'free' then 'other' else null end,
          nullif(trim(p_phone), ''), p_morning, p_evening)
  returning id into v_id;
  if p_kind not in ('free','company') then
    insert into public.customer_rates (customer_id, rate, effective_from)
    values (v_id, p_rate, public.farm_today());
  end if;
  return v_id;
end $$;
revoke all on function public.create_customer(text,text,text,numeric,numeric,numeric) from public;
grant execute on function public.create_customer(text,text,text,numeric,numeric,numeric) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.create_customer(text,text,text,numeric,numeric,numeric) to anon;
  end if;
end $$;
