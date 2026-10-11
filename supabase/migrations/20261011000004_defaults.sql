-- Generic data needed by entry forms. Farm and people names are configured later.
insert into accounts (name, kind, is_farm_cash, sort_order)
values ('Farm galla', 'cash', true, 1);

insert into expense_categories (name, is_farm_cost, is_salary, sort_order) values
  ('Farm ka kharcha', true, false, 1),
  ('Wanda',           true, false, 2),
  ('Silage',          true, false, 3),
  ('Toori',           true, false, 4),
  ('Green fodder',    true, false, 5),
  ('Khal',            true, false, 6),
  ('Chokar',          true, false, 7),
  ('Tankhwah',        true, true,  8),
  ('Bijli bill',      true, false, 9),
  ('Dawai / vet',     true, false, 10),
  ('Diesel',          true, false, 11),
  ('Marammat',        true, false, 12),
  ('Dukan bill',      false,false,20);
