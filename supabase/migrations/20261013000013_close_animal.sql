-- Close a herd record and record a paid sale together, so accounts cannot drift.
create function public.close_animal(
  p_animal_id uuid, p_status text, p_exit_date date, p_reason text,
  p_sale_price numeric, p_account_id uuid
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_animal_id is null or p_status not in ('sold', 'dead')
     or p_exit_date is null or p_exit_date > public.farm_today()
     or (p_status = 'sold' and (p_sale_price is null or p_sale_price <= 0 or p_account_id is null))
     or (p_status = 'dead' and (p_sale_price is not null or p_account_id is not null)) then
    raise exception 'Invalid animal exit';
  end if;

  update public.animals
     set life_status = p_status,
         exit_date = p_exit_date,
         exit_reason = nullif(trim(p_reason), ''),
         sale_price = p_sale_price,
         milking_status = 'none'
   where id = p_animal_id and life_status = 'active'
     and (birth_date is null or birth_date <= p_exit_date);
  if not found then
    raise exception 'Active animal not found or exit date precedes birth';
  end if;

  if p_status = 'sold' then
    insert into public.other_income (income_date, kind, amount, account_id, animal_id, note)
    values (p_exit_date, 'animal_sale', p_sale_price, p_account_id, p_animal_id, nullif(trim(p_reason), ''));
  end if;
  return p_animal_id;
end $$;

revoke all on function public.close_animal(uuid,text,date,text,numeric,uuid) from public;
grant execute on function public.close_animal(uuid,text,date,text,numeric,uuid) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.close_animal(uuid,text,date,text,numeric,uuid) to anon;
  end if;
end $$;
