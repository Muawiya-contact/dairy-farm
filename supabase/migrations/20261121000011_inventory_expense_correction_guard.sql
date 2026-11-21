-- Inventory purchases have one immutable stock movement linked to one Kharcha
-- expense. Editing the expense alone would make the two ledgers disagree.
create function public.prevent_inventory_purchase_expense_correction()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (
    select 1 from public.inventory_movements movement
    where movement.expense_id = old.id
  ) then
    raise exception 'EXPENSE_LINK_IMMUTABLE'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke all on function public.prevent_inventory_purchase_expense_correction()
  from public, anon, authenticated;
create trigger inventory_purchase_expense_immutable
  before update on public.expenses
  for each row execute function public.prevent_inventory_purchase_expense_correction();
