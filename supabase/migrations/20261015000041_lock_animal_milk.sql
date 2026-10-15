-- Per-animal milk rows inherit their business date from milk_shifts. Protect
-- direct API writes too, including a move between two shifts.
create function public.trg_animal_milk_month_lock() returns trigger language plpgsql
security invoker set search_path = public, pg_temp as $$
declare d_new date; d_old date; v_month date;
begin
  if tg_op <> 'DELETE' then
    select milk_date into d_new from public.milk_shifts where id = new.shift_id;
  end if;
  if tg_op <> 'INSERT' then
    select milk_date into d_old from public.milk_shifts where id = old.shift_id;
  end if;
  for v_month in
    select distinct date_trunc('month', d)::date
    from (values (d_new), (d_old)) as dates(d)
    where d is not null order by 1
  loop
    perform pg_advisory_xact_lock(1499, (extract(year from v_month)::integer * 12 + extract(month from v_month)::integer));
  end loop;
  if exists (select 1 from public.month_locks m
             where m.month = date_trunc('month', d_new)::date
                or m.month = date_trunc('month', d_old)::date) then
    raise exception 'MONTH_LOCKED: yeh maheena band hai, pehle kholein' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger lock_animal_milk before insert or update or delete on public.animal_milk
  for each row execute function public.trg_animal_milk_month_lock();
