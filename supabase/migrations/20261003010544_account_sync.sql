-- AutoType account data sync: preferences, favorite modes, and avatar storage.

alter table public.profiles
  add column if not exists favorite_modes text[] not null default '{}'::text[];

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  animations boolean not null default true,
  reduced_fx boolean not null default false,
  show_prediction boolean not null default true,
  background_type text not null default 'solid' check (background_type in ('solid','image')),
  background_color text not null default '#1f2328',
  background_image_url text not null default '',
  background_dim integer not null default 64 check (background_dim between 0 and 100),
  background_luminance numeric,
  updated_at timestamptz not null default now(),
  constraint background_color_format check (background_color ~ '^#[0-9A-Fa-f]{6}$')
);

alter table public.user_preferences enable row level security;

drop trigger if exists preferences_updated_at on public.user_preferences;
create trigger preferences_updated_at
before update on public.user_preferences
for each row execute procedure public.set_updated_at();

drop policy if exists "preferences readable by owner" on public.user_preferences;
create policy "preferences readable by owner"
on public.user_preferences for select
using (auth.uid() = user_id);

drop policy if exists "preferences editable by owner" on public.user_preferences;
create policy "preferences editable by owner"
on public.user_preferences for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, update on table public.user_preferences to authenticated;
grant select, insert, update, delete on table public.user_preferences to service_role;

insert into public.user_preferences(user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired_username text;
  desired_display_name text;
begin
  desired_username := nullif(trim(coalesce(new.raw_user_meta_data ->> 'username','')), '');
  if desired_username is null then
    desired_username := 'player_' || substr(new.id::text, 1, 8);
  end if;

  desired_display_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name','')), '');
  if desired_display_name is null then
    desired_display_name := desired_username;
  end if;

  insert into public.profiles(id,username,display_name)
  values (new.id,desired_username,desired_display_name);

  insert into public.user_roles(user_id,role) values (new.id,'player');
  insert into public.player_stats(user_id) values (new.id);
  insert into public.wallets(user_id) values (new.id);
  insert into public.user_preferences(user_id) values (new.id);
  insert into public.equipped_cosmetics(
    user_id,title_id,banner_id,frame_id,arena_id,trail_id,cursor_id,predictor_id,victory_fx_id
  ) values (
    new.id,'title_none','banner_default','frame_default','arena_default','trail_default','cursor_default','predictor_default','result_default'
  );

  insert into public.inventory(user_id,item_id,source)
  values
    (new.id,'title_none','starter'),
    (new.id,'banner_default','starter'),
    (new.id,'frame_default','starter'),
    (new.id,'arena_default','starter'),
    (new.id,'trail_default','starter'),
    (new.id,'cursor_default','starter'),
    (new.id,'predictor_default','starter'),
    (new.id,'result_default','starter');

  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
grant execute on function public.handle_new_auth_user() to postgres, service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('avatars','avatars',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public=excluded.public,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "users upload own avatars" on storage.objects;
create policy "users upload own avatars"
on storage.objects for insert to authenticated
with check (
  bucket_id='avatars'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
);

drop policy if exists "users update own avatars" on storage.objects;
create policy "users update own avatars"
on storage.objects for update to authenticated
using (
  bucket_id='avatars'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
)
with check (
  bucket_id='avatars'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
);

drop policy if exists "users delete own avatars" on storage.objects;
create policy "users delete own avatars"
on storage.objects for delete to authenticated
using (
  bucket_id='avatars'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
);
