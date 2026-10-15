-- The reminder is advisory. Owners can match the estimated Hijri date to
-- their local Ruet-e-Hilal announcement without altering milk records.
alter table public.settings
  add column gyarhwin_reminder_enabled boolean not null default true,
  add column hijri_date_adjustment smallint not null default 0
    check (hijri_date_adjustment between -2 and 2);
