alter table public.settings
  add column reminder_days integer not null default 7 check (reminder_days between 1 and 30),
  add column calving_reminder_days integer not null default 30 check (calving_reminder_days between 1 and 60);

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
  ), visible as (
    select *, due - p_today left_days from due
    where due <= p_today + window_days
  )
  select kind,
    case when left_days < 0 then 'overdue' when left_days = 0 then 'today'
      when left_days <= 3 then 'soon' else 'upcoming' end,
    due, animal, tag,
    tag || ': ' || action || ' — ' ||
      case when left_days < 0 then (-left_days)::text || ' din late'
        when left_days = 0 then 'Aaj' when left_days = 1 then 'Kal'
        else left_days::text || ' din baad' end ||
      ' (' || to_char(due, 'FMDD Mon') || ')',
    left_days
  from visible
  order by left_days, due, tag, kind
$$;
revoke all on function public.herd_alerts(date) from public, anon, authenticated;
grant execute on function public.herd_alerts(date) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id=1) then
    grant execute on function public.herd_alerts(date) to anon;
  end if;
end $$;
