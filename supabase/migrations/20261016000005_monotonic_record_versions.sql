-- A fast follow-up write (or a backward clock adjustment) must still change
-- the version used by optimistic saves. The same trigger serves animals,
-- milk shifts, inseminations, and salary periods.
create or replace function public.trg_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end $$;

revoke all on function public.trg_touch() from public, anon, authenticated;
