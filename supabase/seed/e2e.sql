-- Local browser tests need a complete previous month even near month boundaries.
-- This is synthetic data and is only loaded by the local CLI config.
update public.settings set go_live_date = public.farm_today() - 90 where id = 1;
insert into public.accounts (name, kind, opening_date, sort_order)
values ('Test bank', 'bank', public.farm_today() - 90, 3);
