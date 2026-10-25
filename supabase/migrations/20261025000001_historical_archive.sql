-- The old workbooks are source evidence, not operational milk, khata or galla.
-- Only a database administrator may import/correct this archive. App users read it.
create table public.historical_records (
  source_key text primary key check (source_key ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('milk_day', 'expense_day', 'customer_month', 'breeding', 'animal_event')),
  record_date date,
  source_label text,
  canonical_label text,
  source_workbook text not null check (length(trim(source_workbook)) > 0),
  source_sheet text not null check (length(trim(source_sheet)) > 0),
  source_cell text not null check (length(trim(source_cell)) > 0),
  source_file_sha256 text not null check (source_file_sha256 ~ '^[0-9a-f]{64}$'),
  row_sha256 text not null check (row_sha256 ~ '^[0-9a-f]{64}$'),
  litres numeric(12,2) check (litres >= 0),
  charged_rs numeric(14,2) check (charged_rs >= 0),
  paid_rs numeric(14,2) check (paid_rs >= 0),
  remaining_rs numeric(14,2),
  farm_debit_rs numeric(14,2) check (farm_debit_rs >= 0),
  home_debit_rs numeric(14,2) check (home_debit_rs >= 0),
  daily_credit_rs numeric(14,2) check (daily_credit_rs >= 0),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  flags text[] not null default '{}',
  imported_at timestamptz not null default now(),
  constraint historical_dated_money check (
    kind not in ('milk_day', 'expense_day', 'customer_month') or record_date is not null
  )
);
create index historical_records_month_kind on public.historical_records (record_date, kind);
create index historical_records_label on public.historical_records (source_label, record_date);
create index historical_records_canonical_label on public.historical_records (canonical_label, record_date);
alter table public.historical_records enable row level security;
revoke all on public.historical_records from public, anon, authenticated;
grant select on public.historical_records to authenticated;
create policy historical_owner_read on public.historical_records for select to authenticated
  using ((select private.is_app_owner()));

-- Staging's explicitly enabled demo can show only anonymized imported rows.
-- No browser role receives INSERT, UPDATE or DELETE permissions.
do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant select on public.historical_records to anon;
    create policy historical_demo_read on public.historical_records for select to anon
      using ((select private.demo_access_enabled()));
  end if;
end $$;

-- Preserve the same read-only subscription behavior as every other public table,
-- including database-admin writes made after an unpaid expiry.
create trigger subscription_write_guard before insert or update or delete on public.historical_records
  for each row execute function private.guard_subscription_write();
