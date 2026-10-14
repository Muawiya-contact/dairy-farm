-- A whitespace variant of the home category must not split home expenses
-- across two category IDs or make the form pick an arbitrary one.
do $$
begin
  if (select count(*) from public.expense_categories
      where lower(btrim(name)) = 'ghar ka kharcha') > 1 then
    raise exception 'HOME_CATEGORY_DUPLICATE: review duplicate home categories before migrating'
      using errcode = 'P0001';
  end if;
end $$;

create unique index expense_categories_home_name_uq
  on public.expense_categories ((lower(btrim(name))))
  where lower(btrim(name)) = 'ghar ka kharcha';
