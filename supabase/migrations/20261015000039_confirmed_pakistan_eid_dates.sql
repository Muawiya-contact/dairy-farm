-- Eid dates are entered only after Pakistan's Central Ruet-e-Hilal announcement.
-- NULL means unconfirmed: no greeting is shown from an estimated Hijri calendar.
alter table public.settings
  add column eid_fitr_start_date date,
  add column eid_adha_start_date date,
  add constraint settings_eid_dates_separate check (
    eid_fitr_start_date is null or eid_adha_start_date is null
    or abs(eid_fitr_start_date - eid_adha_start_date) > 2
  );
