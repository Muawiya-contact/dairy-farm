-- Use an adjustable farm-wide threshold; keep the first usable default conservative.
alter table public.settings
  add column milk_drop_threshold_percent integer not null default 20
    check (milk_drop_threshold_percent between 5 and 80);

drop function public.herd_alerts(date);
create function public.herd_alerts(p_today date)
returns table(alert_kind text, severity text, due_date date, animal_id uuid,
  tag text, message text, days_left integer)
language sql stable security invoker set search_path = public, pg_temp as $$
  with due as (
    select 'ultrasound'::text kind, i.ultrasound_due due, a.id animal, a.tag,
      'ultrasound'::text action, s.reminder_days window_days
    from public.inseminations i join public.animals a on a.id=i.animal_id
      cross join public.settings s
    where a.life_status='active' and i.status='pending' and i.ultrasound_date is null
    union all
    select 'checkup', i.checkup_due, a.id, a.tag, 'checkup', s.reminder_days
    from public.inseminations i join public.animals a on a.id=i.animal_id
      cross join public.settings s
    where a.life_status='active' and i.status='pregnant' and i.checkup_date is null
    union all
    select 'dry_off', i.dry_off_due, a.id, a.tag, 'khushk karna', s.reminder_days
    from public.inseminations i join public.animals a on a.id=i.animal_id
      cross join public.settings s
    where a.life_status='active' and i.status='pregnant'
      and a.milking_status='milking' and i.dry_off_date is null
    union all
    select 'calving', i.calving_due, a.id, a.tag, 'bachay ki paidaish', s.calving_reminder_days
    from public.inseminations i join public.animals a on a.id=i.animal_id
      cross join public.settings s
    where a.life_status='active' and i.status='pregnant'
    union all
    select 'health', h.next_due_date, a.id, a.tag, h.title, s.reminder_days
    from public.health_events h join public.animals a on a.id=h.animal_id
      cross join public.settings s
    where a.life_status='active' and h.next_due_date is not null
      and not exists (select 1 from public.health_events h2
        where h2.animal_id=h.animal_id and lower(h2.title)=lower(h.title)
          and (h2.event_date,h2.created_at,h2.id) > (h.event_date,h.created_at,h.id))
  ), baselines as (
    -- Missing shifts remain missing; require five comparable days inside the seven-day window.
    select am.animal_id, ms.shift, count(distinct ms.milk_date) recorded_days,
      avg(am.litres) baseline_litres
    from public.animal_milk am
      join public.milk_shifts ms on ms.id=am.shift_id
      join public.animals a on a.id=am.animal_id
    where ms.milk_date between p_today - 7 and p_today - 1
      and ms.mode='per_animal'
      and a.life_status='active' and a.milking_status='milking'
    group by am.animal_id, ms.shift
    having count(distinct ms.milk_date) >= 5
  ), today_milk as (
    select am.animal_id, ms.shift, sum(am.litres) current_litres
    from public.animal_milk am
      join public.milk_shifts ms on ms.id=am.shift_id
      join public.animals a on a.id=am.animal_id
    where ms.milk_date=p_today and ms.mode='per_animal'
      and a.life_status='active' and a.milking_status='milking'
    group by am.animal_id, ms.shift
  ), drops as (
    select 'milk_drop_' || t.shift kind, p_today due, a.id animal, a.tag, t.shift,
      b.baseline_litres, t.current_litres,
      round((b.baseline_litres - t.current_litres), 2) litres_drop,
      round((b.baseline_litres - t.current_litres) / b.baseline_litres * 100, 1) percent_drop
    from today_milk t
      join baselines b on b.animal_id=t.animal_id and b.shift=t.shift
      join public.animals a on a.id=t.animal_id
      cross join public.settings s
    where a.life_status='active' and a.milking_status='milking'
      and b.baseline_litres > 0
      and t.current_litres <= b.baseline_litres * (100 - s.milk_drop_threshold_percent) / 100.0
  ), visible as (
    select *, due - p_today left_days from due
    where due <= p_today + window_days
  ), combined as (
    select kind alert_kind,
      case when left_days < 0 then 'overdue' when left_days = 0 then 'today'
        when left_days <= 3 then 'soon' else 'upcoming' end severity,
      due due_date, animal animal_id, tag,
      tag || ': ' || action || ' — ' ||
        case when left_days < 0 then (-left_days)::text || ' din late'
          when left_days = 0 then 'Aaj' when left_days = 1 then 'Kal'
          else left_days::text || ' din baad' end ||
        ' (' || to_char(due, 'FMDD Mon') || ')' message,
      left_days days_left
    from visible
    union all
    select kind, 'today', due, animal, tag,
      tag || ': ' || case when shift='morning' then 'subah' else 'shaam' end ||
        ' ka doodh 7 din ke ausat se kam — ausat ' || to_char(baseline_litres, 'FM999999990.00') ||
        ' L, aaj ' || to_char(current_litres, 'FM999999990.00') || ' L; ' ||
        to_char(litres_drop, 'FM999999990.00') || ' L (' ||
        to_char(percent_drop, 'FM990.0') || '%) kam — ' || to_char(due, 'FMDD Mon'),
      0
    from drops
  )
  select alert_kind, severity, due_date, animal_id, tag, message, days_left
  from combined
  order by days_left, due_date, tag, alert_kind
$$;

revoke all on function public.herd_alerts(date) from public, anon, authenticated;
grant execute on function public.herd_alerts(date) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id=1) then
    grant execute on function public.herd_alerts(date) to anon;
  end if;
end $$;
