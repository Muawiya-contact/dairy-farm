export const INSERT_HISTORICAL_ROWS_SQL = `insert into public.historical_records
  (source_key, kind, record_date, source_label, canonical_label, source_workbook, source_sheet, source_cell,
   source_file_sha256, row_sha256, litres, charged_rs, paid_rs, remaining_rs,
   farm_debit_rs, home_debit_rs, daily_credit_rs, details, flags)
  select x.source_key, x.kind, nullif(x.record_date, '')::date, x.source_label, x.canonical_label,
         x.source_workbook, x.source_sheet, x.source_cell, x.source_file_sha256,
         x.row_sha256, nullif(x.litres, '')::numeric, nullif(x.charged_rs, '')::numeric,
         nullif(x.paid_rs, '')::numeric, nullif(x.remaining_rs, '')::numeric,
         nullif(x.farm_debit_rs, '')::numeric, nullif(x.home_debit_rs, '')::numeric,
         nullif(x.daily_credit_rs, '')::numeric, x.details, x.flags
  from jsonb_to_recordset($1::jsonb) as x(
    source_key text, kind text, record_date text, source_label text, canonical_label text, source_workbook text,
    source_sheet text, source_cell text, source_file_sha256 text, row_sha256 text,
    litres text, charged_rs text, paid_rs text, remaining_rs text, farm_debit_rs text,
    home_debit_rs text, daily_credit_rs text, details jsonb, flags text[])
  on conflict (source_key) do nothing`;
