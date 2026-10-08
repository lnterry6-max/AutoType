-- Level-based Quick Match matchmaking.

create table if not exists public.matchmaking_queue (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  level integer not null check(level >= 1),
  mode text not null default 'context' check(mode in ('context')),
  joined_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now()
);
create index if not exists matchmaking_queue_heartbeat_idx
on public.matchmaking_queue(heartbeat_at);
create index if not exists matchmaking_queue_level_idx
on public.matchmaking_queue(mode,level,joined_at);

alter table public.matchmaking_queue enable row level security;
drop policy if exists "matchmaking queue client deny" on public.matchmaking_queue;
create policy "matchmaking queue client deny"
on public.matchmaking_queue for all to anon,authenticated
using(false) with check(false);
grant select,insert,update,delete on public.matchmaking_queue to service_role;

alter table public.race_rooms
  add column if not exists match_type text not null default 'friend'
    check(match_type in ('friend','matchmaking')),
  add column if not exists matched_level_gap integer,
  add column if not exists winner_id uuid references public.profiles(id) on delete set null;

alter table public.race_players
  add column if not exists level_at_match integer;

create index if not exists race_rooms_winner_id_idx on public.race_rooms(winner_id);
create index if not exists race_rooms_match_type_idx on public.race_rooms(match_type,status,created_at);

create or replace function public.autotype_player_level(p_user uuid)
returns integer
language sql
stable
security definer
set search_path=public
as $$
  select greatest(
    1,
    floor((
      coalesce(s.words,0)*10
      + coalesce(s.rounds,0)*50
      + coalesce(s.best_streak,0)*20
      + coalesce(a.achievement_count,0)*200
    )::numeric / 500)::integer + 1
  )
  from public.player_stats s
  left join lateral (
    select count(*)::bigint as achievement_count
    from public.user_achievements ua
    where ua.user_id=s.user_id
  ) a on true
  where s.user_id=p_user;
$$;

revoke execute on function public.autotype_player_level(uuid)
from public,anon,authenticated;
grant execute on function public.autotype_player_level(uuid)
to service_role;

create or replace function public.autotype_matchmaking_tick(
  p_user uuid
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  my_level integer;
  my_joined timestamptz;
  my_wait integer;
  my_band integer;
  opponent record;
  room public.race_rooms%rowtype;
  sentence_row public.challenge_sentences%rowtype;
  active_match record;
begin
  select
    rr.id as race_id,
    rr.matched_level_gap,
    other.user_id as opponent_id,
    other.level_at_match as opponent_level,
    mine.level_at_match as my_match_level
  into active_match
  from public.race_rooms rr
  join public.race_players mine
    on mine.race_id=rr.id and mine.user_id=p_user
  join public.race_players other
    on other.race_id=rr.id and other.user_id<>p_user
  where rr.match_type='matchmaking'
    and rr.status in ('waiting','countdown','running')
    and rr.created_at>now()-interval '45 minutes'
  order by rr.created_at desc
  limit 1;

  if active_match.race_id is not null then
    return jsonb_build_object(
      'status','matched',
      'race_id',active_match.race_id,
      'level',coalesce(active_match.my_match_level,public.autotype_player_level(p_user)),
      'opponent_id',active_match.opponent_id,
      'opponent_level',active_match.opponent_level,
      'level_gap',active_match.matched_level_gap
    );
  end if;

  delete from public.matchmaking_queue
  where heartbeat_at<now()-interval '90 seconds';

  my_level:=coalesce(public.autotype_player_level(p_user),1);

  insert into public.matchmaking_queue(user_id,level,mode,joined_at,heartbeat_at)
  values(p_user,my_level,'context',now(),now())
  on conflict(user_id) do update
  set level=excluded.level,
      heartbeat_at=now();

  select joined_at into my_joined
  from public.matchmaking_queue
  where user_id=p_user;

  my_wait:=greatest(0,extract(epoch from (now()-my_joined))::integer);
  my_band:=case
    when my_wait<15 then 2
    when my_wait<30 then 5
    when my_wait<60 then 10
    else 9999
  end;

  select q.*,
         greatest(0,extract(epoch from (now()-q.joined_at))::integer) as wait_seconds
  into opponent
  from public.matchmaking_queue q
  where q.user_id<>p_user
    and q.mode='context'
    and q.heartbeat_at>now()-interval '20 seconds'
    and abs(q.level-my_level)<=my_band
    and abs(q.level-my_level)<=case
      when extract(epoch from (now()-q.joined_at))<15 then 2
      when extract(epoch from (now()-q.joined_at))<30 then 5
      when extract(epoch from (now()-q.joined_at))<60 then 10
      else 9999
    end
  order by abs(q.level-my_level),q.joined_at
  for update skip locked
  limit 1;

  if opponent.user_id is null then
    return jsonb_build_object(
      'status','searching',
      'level',my_level,
      'range',case when my_band>=9999 then null else my_band end,
      'wait_seconds',my_wait
    );
  end if;

  select * into sentence_row
  from public.challenge_sentences
  where active=true and pool='standard'
  order by random()
  limit 1;

  if sentence_row.id is null then
    raise exception 'No matchmaking sentence is available';
  end if;

  insert into public.race_rooms(
    host_id,mode,target_text,status,started_at,match_type,matched_level_gap
  )
  values(
    p_user,'context',sentence_row.target_text,'running',now(),'matchmaking',
    abs(opponent.level-my_level)
  )
  returning * into room;

  insert into public.race_players(race_id,user_id,progress,score,level_at_match)
  values
    (room.id,p_user,0,0,my_level),
    (room.id,opponent.user_id,0,0,opponent.level);

  delete from public.matchmaking_queue
  where user_id in (p_user,opponent.user_id);

  return jsonb_build_object(
    'status','matched',
    'race_id',room.id,
    'level',my_level,
    'opponent_id',opponent.user_id,
    'opponent_level',opponent.level,
    'level_gap',abs(opponent.level-my_level)
  );
end;
$$;

revoke execute on function public.autotype_matchmaking_tick(uuid)
from public,anon,authenticated;
grant execute on function public.autotype_matchmaking_tick(uuid)
to service_role;

create or replace function public.autotype_leave_matchmaking(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  delete from public.matchmaking_queue where user_id=p_user;
  return true;
end;
$$;

revoke execute on function public.autotype_leave_matchmaking(uuid)
from public,anon,authenticated;
grant execute on function public.autotype_leave_matchmaking(uuid)
to service_role;