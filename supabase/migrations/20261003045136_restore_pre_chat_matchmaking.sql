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
  update public.race_rooms
  set status='cancelled',finished_at=coalesce(finished_at,now())
  where match_type='matchmaking'
    and status in ('waiting','countdown','running')
    and created_at<now()-interval '10 minutes';

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
    and rr.created_at>now()-interval '10 minutes'
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