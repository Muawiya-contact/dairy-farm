-- Optional public-facing number printed on customer statements and receipts.
alter table public.settings
  add column contact_phone text not null default ''
  constraint settings_contact_phone_format
  check (contact_phone = '' or contact_phone ~ '^\+[1-9][0-9]{6,14}$');
