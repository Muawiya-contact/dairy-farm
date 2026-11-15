-- Saved milk entries are corrected through one auditable transaction. This is
-- deliberately not a separate waste ledger: the resulting shift is the truth.
create table private.milk_entry_audit (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.milk_shifts(id) on delete restrict,
  milk_date date not null,
  shift text not null check (shift in ('morning','noon','evening')),
  before_row jsonb not null,
  after_row jsonb not null,
  reason text not null check (length(trim(reason)) between 3 and 500),
  actor_id uuid,
  changed_at timestamptz not null default now()
);
revoke all on private.milk_entry_audit from public, anon, authenticated;

create function public.correct_milk_entry_checked(
  p_date date, p_shift text, p_total numeric, p_mode text, p_animals jsonb,
  p_deliveries jsonb, p_expected_updated_at timestamptz, p_notes text, p_reason text
) returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_shift public.milk_shifts%rowtype; v_before jsonb; v_after jsonb; v_updated timestamptz;
begin
  if not (private.is_app_owner() or private.demo_access_enabled()) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_expected_updated_at is null or length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'MILK_CORRECTION_REASON' using errcode = 'P0001';
  end if;
  select * into v_shift from public.milk_shifts where milk_date = p_date and shift = p_shift for update;
  if v_shift.id is null or v_shift.updated_at is distinct from p_expected_updated_at then
    raise exception 'MILK_STALE: yeh shift badal chuki hai' using errcode = 'P0001';
  end if;
  select jsonb_build_object(
    'shift', to_jsonb(v_shift),
    'animals', coalesce((select jsonb_agg(to_jsonb(a) order by a.animal_id) from public.animal_milk a where a.shift_id = v_shift.id), '[]'::jsonb),
    'deliveries', coalesce((select jsonb_agg(to_jsonb(d) order by d.customer_id) from public.milk_deliveries d where d.delivery_date = p_date and d.shift = p_shift), '[]'::jsonb)
  ) into v_before;
  v_updated := public.save_milk_entry_checked(p_date, p_shift, p_total, p_mode, p_animals, p_deliveries, p_expected_updated_at, p_notes);
  select jsonb_build_object(
    'shift', to_jsonb(s),
    'animals', coalesce((select jsonb_agg(to_jsonb(a) order by a.animal_id) from public.animal_milk a where a.shift_id = s.id), '[]'::jsonb),
    'deliveries', coalesce((select jsonb_agg(to_jsonb(d) order by d.customer_id) from public.milk_deliveries d where d.delivery_date = p_date and d.shift = p_shift), '[]'::jsonb)
  ) into v_after from public.milk_shifts s where s.id = v_shift.id;
  insert into private.milk_entry_audit(shift_id, milk_date, shift, before_row, after_row, reason, actor_id)
    values(v_shift.id, p_date, p_shift, v_before, v_after, trim(p_reason), auth.uid());
  return v_updated;
end $$;
revoke all on function public.correct_milk_entry_checked(date,text,numeric,text,jsonb,jsonb,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.correct_milk_entry_checked(date,text,numeric,text,jsonb,jsonb,timestamptz,text,text) to authenticated;
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function public.correct_milk_entry_checked(date,text,numeric,text,jsonb,jsonb,timestamptz,text,text) to anon;
  end if;
end $$;
