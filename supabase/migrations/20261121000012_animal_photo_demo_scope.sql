-- Demo photo access is granted only on projects already configured for the
-- shared demo when this migration is applied. Enabling demo access later on a
-- production project must not expose existing private animal photos.
drop policy if exists animal_photos_read on storage.objects;
drop policy if exists animal_photos_add on storage.objects;
drop policy if exists animal_photos_change on storage.objects;
drop policy if exists animal_photos_remove on storage.objects;

revoke all on function private.can_access_animal_photo(text) from public, anon, authenticated;
grant execute on function private.can_access_animal_photo(text) to authenticated;

create policy animal_photos_owner_read on storage.objects
  for select to authenticated
  using (bucket_id = 'animal-photos' and (select private.is_app_owner()));

create policy animal_photos_owner_add on storage.objects
  for insert to authenticated
  with check (bucket_id = 'animal-photos' and (select private.is_app_owner()));

create policy animal_photos_owner_change on storage.objects
  for update to authenticated
  using (bucket_id = 'animal-photos' and (select private.is_app_owner()))
  with check (bucket_id = 'animal-photos' and (select private.is_app_owner()));

create policy animal_photos_owner_remove on storage.objects
  for delete to authenticated
  using (bucket_id = 'animal-photos' and (select private.is_app_owner()));

do $$ begin
  if (select enabled from private.demo_access where id = 1) then
    grant execute on function private.can_access_animal_photo(text) to anon;

    create policy animal_photos_demo_read on storage.objects
      for select to anon
      using (
        bucket_id = 'animal-photos'
        and private.can_access_animal_photo(split_part(name, '/', 1))
      );

    create policy animal_photos_demo_add on storage.objects
      for insert to anon
      with check (
        bucket_id = 'animal-photos'
        and private.can_access_animal_photo(split_part(name, '/', 1))
      );

    create policy animal_photos_demo_change on storage.objects
      for update to anon
      using (
        bucket_id = 'animal-photos'
        and private.can_access_animal_photo(split_part(name, '/', 1))
      )
      with check (
        bucket_id = 'animal-photos'
        and private.can_access_animal_photo(split_part(name, '/', 1))
      );

    create policy animal_photos_demo_remove on storage.objects
      for delete to anon
      using (
        bucket_id = 'animal-photos'
        and private.can_access_animal_photo(split_part(name, '/', 1))
      );
  end if;
end $$;
