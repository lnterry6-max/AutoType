create or replace function public.is_race_participant(p_race uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from public.race_players
    where race_id=p_race and user_id=auth.uid()
  );
$$;
revoke all on function public.is_race_participant(uuid) from public;
grant execute on function public.is_race_participant(uuid) to authenticated;

drop policy if exists "race rooms readable by everyone" on public.race_rooms;
drop policy if exists "race rooms readable by participants" on public.race_rooms;
create policy "race rooms readable by participants"
on public.race_rooms for select to authenticated
using(public.is_race_participant(id));

drop policy if exists "race players readable by everyone" on public.race_players;
drop policy if exists "race players readable by participants" on public.race_players;
create policy "race players readable by participants"
on public.race_players for select to authenticated
using(public.is_race_participant(race_id));

revoke select on public.race_rooms from anon;
revoke select on public.race_players from anon;
grant select on public.race_rooms to authenticated;
grant select on public.race_players to authenticated;
