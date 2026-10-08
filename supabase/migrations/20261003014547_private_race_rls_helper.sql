create schema if not exists private;

drop policy if exists "race rooms readable by participants" on public.race_rooms;
drop policy if exists "race players readable by participants" on public.race_players;

drop function if exists public.is_race_participant(uuid);

create or replace function private.is_race_participant(p_race uuid)
returns boolean
language sql stable security definer
set search_path=public,private
as $$
  select exists(
    select 1 from public.race_players
    where race_id=p_race and user_id=(select auth.uid())
  );
$$;

revoke all on function private.is_race_participant(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.is_race_participant(uuid) to authenticated;

create policy "race rooms readable by participants"
on public.race_rooms for select to authenticated
using(private.is_race_participant(id));

create policy "race players readable by participants"
on public.race_players for select to authenticated
using(private.is_race_participant(race_id));
