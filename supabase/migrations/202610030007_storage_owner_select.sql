-- Allow signed-in users to read/list only their own stored profile assets.
-- Required by Storage upsert when replacing an existing object.

drop policy if exists "users read own avatars" on storage.objects;
create policy "users read own avatars"
on storage.objects for select to authenticated
using (
  bucket_id='avatars'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
);

drop policy if exists "users read own backgrounds" on storage.objects;
create policy "users read own backgrounds"
on storage.objects for select to authenticated
using (
  bucket_id='backgrounds'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
);
