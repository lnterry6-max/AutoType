-- Player personalization: usernames remain unique, with server-controlled renames.
alter table public.profiles
 add column if not exists username_changed_at timestamptz,
 add column if not exists profile_accent text not null default '#4BA6D8';
alter table public.profiles
 add constraint profiles_accent_format check (profile_accent ~ '^#[0-9A-Fa-f]{6}$');

alter table public.user_preferences
 add column if not exists high_contrast boolean not null default false,
 add column if not exists text_scale integer not null default 100;
alter table public.user_preferences
 add constraint user_preferences_text_scale_check check (text_scale in (100,115,130));

-- Authenticated users must not directly rename themselves or tamper with the cooldown.
create or replace function public.autotype_profile_username_guard()
returns trigger language plpgsql set search_path=public as $$
begin
  if auth.role() is distinct from 'service_role' then
    if new.username::text is distinct from old.username::text then
      raise exception 'Use the Change Username action to update your username.';
    end if;
    new.username_changed_at:=old.username_changed_at;
  end if;
  return new;
end;
$$;
revoke all on function public.autotype_profile_username_guard() from public,anon,authenticated;
drop trigger if exists profiles_username_change_guard on public.profiles;
create trigger profiles_username_change_guard before update on public.profiles
 for each row execute function public.autotype_profile_username_guard();

-- Called only from the authenticated Edge Function with the server's service-role key.
create or replace function public.autotype_change_username(p_user uuid,p_new text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  before_row public.profiles%rowtype;
  proposed text:=btrim(coalesce(p_new,''));
  used boolean;
  updated_row public.profiles%rowtype;
begin
  if p_user is null then raise exception 'Sign in first.';end if;
  if proposed !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception 'Username must use 3-24 letters, numbers, or underscores.';
  end if;
  if lower(proposed) = any(array['admin','administrator','developer','autotype','support','moderator','mod','staff','system','official','security','owner','root','help','helper']) then
    raise exception 'This username is reserved.';
  end if;
  select * into before_row from public.profiles where id=p_user for update;
  if before_row.id is null then raise exception 'Account profile not found.';end if;
  if lower(before_row.username::text)=lower(proposed) then
    raise exception 'Choose a different username.';
  end if;
  if before_row.username_changed_at is not null
    and before_row.username_changed_at>now()-interval '14 days' then
    raise exception 'You can change your username once every 14 days. Try again after %.',
      to_char(before_row.username_changed_at + interval '14 days','YYYY-MM-DD');
  end if;
  select exists(select 1 from public.profiles
     where username=proposed::citext and id<>p_user) into used;
  if used then raise exception 'That username is already taken.';end if;
  update public.profiles
    set username=proposed::citext,username_changed_at=now(),updated_at=now()
    where id=p_user returning * into updated_row;
  return jsonb_build_object(
    'username',updated_row.username::text,
    'changed_at',updated_row.username_changed_at,
    'next_change_at',updated_row.username_changed_at+interval '14 days'
  );
end;
$$;
revoke all on function public.autotype_change_username(uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_change_username(uuid,text) to service_role;

