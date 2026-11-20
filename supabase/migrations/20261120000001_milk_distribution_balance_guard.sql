-- Every delivery must belong to the shift whose production and audit version
-- it changes. Keep the relation at the date/shift key used by the ledger.
alter table public.milk_deliveries
  add constraint milk_deliveries_milk_shift_fkey
  foreign key (delivery_date, shift)
  references public.milk_shifts (milk_date, shift)
  on update restrict on delete restrict
  not valid;
alter table public.milk_deliveries
  validate constraint milk_deliveries_milk_shift_fkey;

-- Day-level waste is intentionally not assigned to a single shift. Recheck the
-- running stock balance whenever any production, delivery, or disposition row
-- changes so a later shift edit cannot spend milk already recorded as waste.
-- A single transaction-scoped lock serializes balance checks across dates; the
-- check runs at commit and therefore sees earlier committed milk movements.
create function public.trg_milk_distribution_daily_balance_check()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_from date;
  v_negative_date date;
begin
  if tg_table_name = 'milk_shifts' then
    if tg_op = 'INSERT' then v_from := new.milk_date;
    elsif tg_op = 'DELETE' then v_from := old.milk_date;
    else v_from := least(old.milk_date, new.milk_date);
    end if;
  elsif tg_table_name = 'milk_deliveries' then
    if tg_op = 'INSERT' then v_from := new.delivery_date;
    elsif tg_op = 'DELETE' then v_from := old.delivery_date;
    else v_from := least(old.delivery_date, new.delivery_date);
    end if;
  else
    if tg_op = 'INSERT' then v_from := new.milk_date;
    elsif tg_op = 'DELETE' then v_from := old.milk_date;
    else v_from := least(old.milk_date, new.milk_date);
    end if;
  end if;

  perform pg_advisory_xact_lock(59429, 1);

  with prior_balance as (
    select coalesce(sum(movement_litres), 0) as litres
    from (
      select total_litres as movement_litres from public.milk_shifts where milk_date < v_from
      union all select -litres from public.milk_deliveries where delivery_date < v_from
      union all select -litres from public.milk_dispositions where milk_date < v_from
    ) prior
  ), daily_movements as (
    select movement_date, sum(movement_litres) as litres
    from (
      select milk_date as movement_date, total_litres as movement_litres
        from public.milk_shifts where milk_date >= v_from
      union all
      select delivery_date, -litres from public.milk_deliveries where delivery_date >= v_from
      union all
      select milk_date, -litres from public.milk_dispositions where milk_date >= v_from
    ) movements
    group by movement_date
  ), closing_balances as (
    select movement_date,
      prior_balance.litres + sum(daily_movements.litres) over (order by movement_date) as litres
    from daily_movements cross join prior_balance
  )
  select movement_date into v_negative_date
  from closing_balances where litres < 0
  order by movement_date limit 1;

  if v_negative_date is not null then
    raise exception 'MILK_DISTRIBUTION_EXCEEDS_AVAILABLE'
      using errcode = 'P0001', detail = v_negative_date::text;
  end if;
  return null;
end $$;

create constraint trigger milk_shift_daily_balance_check
  after insert or update or delete on public.milk_shifts
  deferrable initially deferred for each row execute function public.trg_milk_distribution_daily_balance_check();
create constraint trigger milk_delivery_daily_balance_check
  after insert or update or delete on public.milk_deliveries
  deferrable initially deferred for each row execute function public.trg_milk_distribution_daily_balance_check();
create constraint trigger milk_disposition_daily_balance_check
  after insert or update or delete on public.milk_dispositions
  deferrable initially deferred for each row execute function public.trg_milk_distribution_daily_balance_check();

revoke all on function public.trg_milk_distribution_daily_balance_check() from public, anon, authenticated;
