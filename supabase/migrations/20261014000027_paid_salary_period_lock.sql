-- Once a salary period has a payment, keep its agreed amount as a historical
-- snapshot. Corrections need a separate audited workflow.
create or replace function public.trg_salary_period_rules() returns trigger language plpgsql
security invoker set search_path = public, pg_temp as $$
declare v_paid numeric;
begin
  if new.salary_month > date_trunc('month', public.farm_today())::date then
    raise exception 'SALARY_FUTURE_MONTH: aane wale mahine ki tankhwah abhi na kholein'
      using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if new.staff_id <> old.staff_id or new.salary_month <> old.salary_month then
      raise exception 'SALARY_PERIOD_FIXED: staff aur maheena badal nahi sakte'
        using errcode = 'P0001';
    end if;
    select coalesce(sum(amount), 0) into v_paid
      from public.expenses where salary_period_id = old.id;
    if new.agreed_amount < v_paid then
      raise exception 'SALARY_BELOW_PAID: tay shuda raqam ada shuda raqam se kam hai'
        using errcode = 'P0001';
    end if;
    if v_paid > 0 and new.agreed_amount <> old.agreed_amount then
      raise exception 'SALARY_PERIOD_PAID: adaigi ke baad tay shuda tankhwah nahi badal sakte'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
