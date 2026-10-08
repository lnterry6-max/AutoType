-- AutoType synced background images.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('backgrounds','backgrounds',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public=excluded.public,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "users upload own backgrounds" on storage.objects;
create policy "users upload own backgrounds"
on storage.objects for insert to authenticated
with check (
  bucket_id='backgrounds'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
);

drop policy if exists "users update own backgrounds" on storage.objects;
create policy "users update own backgrounds"
on storage.objects for update to authenticated
using (
  bucket_id='backgrounds'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
)
with check (
  bucket_id='backgrounds'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
);

drop policy if exists "users delete own backgrounds" on storage.objects;
create policy "users delete own backgrounds"
on storage.objects for delete to authenticated
using (
  bucket_id='backgrounds'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
);
