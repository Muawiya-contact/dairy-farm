alter table public.animals
  add column seller_name text,
  add column purchase_location text,
  add column photo_path text;

alter table public.animals
  add constraint animals_seller_name_check
    check (seller_name is null or (source = 'purchased' and length(trim(seller_name)) between 1 and 120)),
  add constraint animals_purchase_location_check
    check (purchase_location is null or (source = 'purchased' and length(trim(purchase_location)) between 1 and 160)),
  add constraint animals_photo_path_check
    check (photo_path is null or (
      split_part(photo_path, '/', 1) = id::text
      and array_length(string_to_array(photo_path, '/'), 1) = 2
      and split_part(photo_path, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png)$'
    ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('animal-photos', 'animal-photos', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set name = excluded.name,
      public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create function private.can_access_animal_photo(p_animal_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_app_owner()
    or (private.demo_access_enabled() and exists (
      select 1 from public.animals a where a.id::text = p_animal_id
    ))
$$;
revoke all on function private.can_access_animal_photo(text) from public;
grant execute on function private.can_access_animal_photo(text) to authenticated, anon;

create policy animal_photos_read on storage.objects
  for select to authenticated, anon
  using (
    bucket_id = 'animal-photos'
    and private.can_access_animal_photo(split_part(name, '/', 1))
  );

create policy animal_photos_add on storage.objects
  for insert to authenticated, anon
  with check (
    bucket_id = 'animal-photos'
    and private.can_access_animal_photo(split_part(name, '/', 1))
  );

create policy animal_photos_change on storage.objects
  for update to authenticated, anon
  using (
    bucket_id = 'animal-photos'
    and private.can_access_animal_photo(split_part(name, '/', 1))
  )
  with check (
    bucket_id = 'animal-photos'
    and private.can_access_animal_photo(split_part(name, '/', 1))
  );

create policy animal_photos_remove on storage.objects
  for delete to authenticated, anon
  using (
    bucket_id = 'animal-photos'
    and private.can_access_animal_photo(split_part(name, '/', 1))
  );
