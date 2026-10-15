-- An exit and its sale income must be one transaction. Table writes from the
-- browser must not bypass close_animal or later change the financial record.
create function public.guard_animal_exit_write() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.life_status <> 'active' or new.exit_date is not null or
       new.exit_reason is not null or new.sale_price is not null then
      raise exception 'ANIMAL_EXIT_USE_RPC';
    end if;
  elsif old.life_status <> 'active' then
    if new.life_status is distinct from old.life_status or
       new.exit_date is distinct from old.exit_date or
       new.exit_reason is distinct from old.exit_reason or
       new.sale_price is distinct from old.sale_price then
      raise exception 'ANIMAL_EXIT_IMMUTABLE';
    end if;
  elsif new.life_status <> 'active' then
    if current_setting('app.close_animal', true) is distinct from 'on' then
      raise exception 'ANIMAL_EXIT_USE_RPC';
    end if;
  elsif new.sale_price is not null or new.exit_reason is not null then
    raise exception 'ANIMAL_EXIT_USE_RPC';
  end if;
  return new;
end $$;

create trigger guard_animal_exit_insert before insert on public.animals
for each row execute function public.guard_animal_exit_write();
create trigger guard_animal_exit_update before update of life_status, exit_date, exit_reason, sale_price on public.animals
for each row execute function public.guard_animal_exit_write();

create function public.guard_animal_sale_income() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_animal public.animals%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.kind <> 'animal_sale' then return new; end if;
    if current_setting('app.close_animal', true) is distinct from 'on' then
      raise exception 'ANIMAL_SALE_USE_RPC';
    end if;
    select * into v_animal from public.animals where id = new.animal_id;
    if v_animal.life_status is distinct from 'sold' or
       v_animal.sale_price is distinct from new.amount or
       v_animal.exit_date is distinct from new.income_date then
      raise exception 'ANIMAL_SALE_MISMATCH';
    end if;
  elsif tg_op = 'DELETE' then
    if old.kind = 'animal_sale' then raise exception 'ANIMAL_SALE_IMMUTABLE'; end if;
    return old;
  elsif old.kind = 'animal_sale' or new.kind = 'animal_sale' then
    raise exception 'ANIMAL_SALE_IMMUTABLE';
  end if;
  return new;
end $$;

create trigger guard_animal_sale_income before insert or update or delete on public.other_income
for each row execute function public.guard_animal_sale_income();

create or replace function public.close_animal(
  p_animal_id uuid, p_status text, p_exit_date date, p_reason text,
  p_sale_price numeric, p_account_id uuid
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_animal_id is null or p_status not in ('sold', 'dead', 'removed')
     or p_exit_date is null or p_exit_date > public.farm_today()
     or (p_status = 'sold' and (p_sale_price is null or p_sale_price <= 0 or p_account_id is null))
     or (p_status = 'sold' and p_sale_price <> round(p_sale_price, 2))
     or (p_status <> 'sold' and (p_sale_price is not null or p_account_id is not null))
     or (p_status = 'removed' and nullif(trim(p_reason), '') is null) then
    raise exception 'Invalid animal exit';
  end if;
  if p_status = 'sold' and not exists (
    select 1 from public.accounts where id = p_account_id and active and opening_date <= p_exit_date
  ) then
    raise exception 'ANIMAL_SALE_ACCOUNT_UNAVAILABLE';
  end if;

  perform set_config('app.close_animal', 'on', true);
  update public.animals
     set life_status = p_status, exit_date = p_exit_date,
         exit_reason = nullif(trim(p_reason), ''), sale_price = p_sale_price,
         milking_status = 'none'
   where id = p_animal_id and life_status = 'active'
     and (birth_date is null or birth_date <= p_exit_date)
     and (arrival_date is null or arrival_date <= p_exit_date);
  if not found then
    raise exception 'Active animal not found or exit date precedes arrival/birth';
  end if;

  if p_status = 'sold' then
    insert into public.other_income (income_date, kind, amount, account_id, animal_id, note)
    values (p_exit_date, 'animal_sale', p_sale_price, p_account_id, p_animal_id, nullif(trim(p_reason), ''));
  end if;
  return p_animal_id;
end $$;
