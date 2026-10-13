-- The semen register records an actual dry date separately from the predicted date.
alter table public.inseminations add column dry_off_date date;
alter table public.inseminations add constraint insem_dry_after_service
  check (dry_off_date is null or dry_off_date >= service_date);
