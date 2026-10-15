-- Local browser tests need a complete previous month even near month boundaries.
-- This is synthetic data and is loaded only by the localhost E2E runner.
update public.settings set go_live_date = public.farm_today() - 90 where id = 1;
insert into public.accounts (name, kind, opening_date, sort_order)
values ('Test bank', 'bank', public.farm_today() - 90, 3);
