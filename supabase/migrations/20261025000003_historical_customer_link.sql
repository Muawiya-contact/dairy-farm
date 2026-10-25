-- A verified identity link is separate from the immutable workbook evidence.
-- Unknown names remain unlinked; this does not post historic amounts to Khata.
alter table public.historical_records
  add column customer_id uuid references public.customers(id) on delete set null,
  add constraint historical_customer_kind check (
    customer_id is null or kind in ('milk_day', 'customer_month')
  );

create index historical_records_customer_date
  on public.historical_records (customer_id, record_date desc)
  where customer_id is not null;
