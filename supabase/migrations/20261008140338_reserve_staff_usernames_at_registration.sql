-- Keep reserved staff/official-looking names unavailable at account creation too.
create or replace function public.autotype_username_registration_guard()
returns trigger language plpgsql set search_path=public as $$
begin
  if lower(new.username::text)=any(array[
    'admin','administrator','developer','autotype','support','moderator','mod',
    'staff','system','official','security','owner','root','help','helper'
  ]) then
    raise exception 'This username is reserved.';
  end if;
  return new;
end;
$$;
revoke all on function public.autotype_username_registration_guard() from public,anon,authenticated;
drop trigger if exists profiles_username_registration_guard on public.profiles;
create trigger profiles_username_registration_guard before insert on public.profiles
for each row execute function public.autotype_username_registration_guard();

