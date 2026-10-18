-- Client-confirmed schedule: ultrasound AI+35; checkup ultrasound+75;
-- dry AI+210; calving AI+270. Existing individual offsets stay frozen.
alter table public.settings alter column ultrasound_days set default 35;
update public.settings set ultrasound_days = 35 where id = 1 and ultrasound_days = 30;

create or replace function public.trg_insem_due_dates() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare s public.settings; v_gap integer;
begin
  if tg_op = 'INSERT' then
    select * into s from public.settings where id = 1;
    new.ultrasound_due := new.service_date + s.ultrasound_days;
    new.checkup_due := new.ultrasound_due + s.checkup_days;
    new.dry_off_due := new.service_date + s.dry_off_days;
    new.calving_due := new.service_date + s.calving_days;
  else
    v_gap := old.checkup_due - coalesce(old.ultrasound_date, old.ultrasound_due);
    if new.service_date is distinct from old.service_date then
      new.ultrasound_due := old.ultrasound_due + (new.service_date - old.service_date);
      new.dry_off_due := old.dry_off_due + (new.service_date - old.service_date);
      new.calving_due := old.calving_due + (new.service_date - old.service_date);
    else
      new.ultrasound_due := old.ultrasound_due;
      new.dry_off_due := old.dry_off_due;
      new.calving_due := old.calving_due;
    end if;
    new.checkup_due := coalesce(new.ultrasound_date, new.ultrasound_due) + v_gap;
  end if;
  return new;
end $$;

-- Only open records receive the new schedule. Disable this one calculation
-- trigger during the backfill so its frozen-gap logic cannot reuse the old gap.
alter table public.inseminations disable trigger insem_due_dates;
update public.inseminations
set ultrasound_due = case when ultrasound_date is null
    and ultrasound_due = service_date + 30 then service_date + 35 else ultrasound_due end,
    checkup_due = case when checkup_date is null then
      coalesce(ultrasound_date, case when ultrasound_date is null and ultrasound_due = service_date + 30
        then service_date + 35 else ultrasound_due end) + 75 else checkup_due end
where status in ('pending','pregnant');
alter table public.inseminations enable trigger insem_due_dates;
