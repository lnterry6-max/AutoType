-- Phase 1: friend-race creation and immutable results commit atomically.
create or replace function public.autotype_create_friend_race(p_user uuid,p_friend uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare room public.race_rooms%rowtype; sentences text[]:=array[
 'the moon looked bright over the quiet city',
 'our code worked perfectly until somebody touched one line',
 'the final answer looked obvious only after we solved it',
 'the keyboard sounded louder in the empty computer lab'];
begin
 if p_user is null or p_friend is null or p_user=p_friend or not exists(
  select 1 from public.friendships where user_a=least(p_user,p_friend) and user_b=greatest(p_user,p_friend)
 ) then raise exception 'You can only race a friend'; end if;
 insert into public.race_rooms(host_id,mode,target_text,status,match_type)
 values(p_user,'context',sentences[1+floor(random()*array_length(sentences,1))::integer],'waiting','friend')
 returning * into room;
 insert into public.race_players(race_id,user_id,progress,score)
 values(room.id,p_user,0,0),(room.id,p_friend,0,0);
 return to_jsonb(room);
end; $$;
revoke all on function public.autotype_create_friend_race(uuid,uuid) from public,anon,authenticated;
grant execute on function public.autotype_create_friend_race(uuid,uuid) to service_role;

create or replace function public.autotype_submit_race_result(
 p_user uuid,p_race uuid,p_score bigint,p_duration_ms integer,p_errors integer,p_erased integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 room public.race_rooms%rowtype; mine public.race_players%rowtype;
 first_player public.race_players%rowtype; second_player public.race_players%rowtype;
 players jsonb; complete boolean; winner uuid; duplicate boolean:=false;
 word_count integer; ceiling bigint:=0; bonus bigint:=0; i integer; affected integer;
begin
 if p_user is null or p_race is null or p_score is null or p_duration_ms is null
    or p_errors is null or p_erased is null then raise exception 'Missing race metrics'; end if;
 -- Every finish for this room locks the same row before reading any participant.
 select * into room from public.race_rooms where id=p_race for update;
 if room.id is null then raise exception 'Race not found'; end if;
 if room.status not in ('waiting','running','finished') then raise exception 'Race is cancelled or not accepting results'; end if;
 select * into mine from public.race_players where race_id=p_race and user_id=p_user for update;
 if mine.user_id is null then raise exception 'You are not in this race'; end if;
 if (select count(*) from public.race_players where race_id=p_race)<>2 then
  raise exception 'Race must have exactly two participants';
 end if;
 if mine.finished_at is not null then
  if mine.score is distinct from p_score or mine.duration_ms is distinct from p_duration_ms or
     mine.errors is distinct from p_errors or mine.erased is distinct from p_erased then
   raise exception 'Your race result is already finalized';
  end if;
  duplicate:=true;
 else
  if room.status='finished' then raise exception 'Race is already finalized'; end if;
  word_count:=array_length(regexp_split_to_array(btrim(room.target_text),'\s+'),1);
  if word_count is null or word_count not between 1 and 200 then raise exception 'Invalid race target'; end if;
  for i in 0..word_count-1 loop ceiling:=ceiling+120+least(i*5,30); bonus:=bonus+least(i*5,30); end loop;
  if p_score<word_count*20 or p_score>ceiling or p_score%5<>0 then raise exception 'Race score is outside the valid range'; end if;
  if p_errors=0 and ((p_score-bonus)%20<>0 or p_score<word_count*20+bonus) then
   raise exception 'Race score does not match a perfect-round streak';
  end if;
  if p_duration_ms<greatest(250,word_count*120) or p_duration_ms>1800000 or
     p_duration_ms>(extract(epoch from (now()-room.created_at))*1000)::bigint+5000 then
   raise exception 'Race time is outside the valid range';
  end if;
  if p_errors<0 or p_errors>5000 or p_erased<0 or p_erased>20000 then raise exception 'Invalid race input metrics'; end if;
  update public.race_players set progress=1,score=p_score,duration_ms=p_duration_ms,
   errors=p_errors,erased=p_erased,finished_at=now()
   where race_id=p_race and user_id=p_user and finished_at is null;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Race result could not be saved'; end if;
 end if;
 complete:=not exists(select 1 from public.race_players where race_id=p_race and finished_at is null);
 if complete then
  select * into first_player from public.race_players where race_id=p_race
   order by score desc,duration_ms,errors,user_id limit 1;
  select * into second_player from public.race_players where race_id=p_race
   order by score desc,duration_ms,errors,user_id offset 1 limit 1;
  if first_player.score=second_player.score and first_player.duration_ms=second_player.duration_ms and first_player.errors=second_player.errors then
   winner:=null;
  else winner:=first_player.user_id; end if;
  update public.race_rooms set status='finished',finished_at=coalesce(finished_at,now()),winner_id=winner where id=p_race;
 else
  winner:=null;
  update public.race_rooms set status='running',started_at=coalesce(started_at,now()) where id=p_race;
 end if;
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Race state could not be saved'; end if;
 select jsonb_agg(to_jsonb(p) order by p.user_id) into players from public.race_players p where race_id=p_race;
 return jsonb_build_object('outcome','practice','saved',true,'duplicate',duplicate,
  'players',players,'winnerId',winner,'finished',complete,'matchType',room.match_type);
end; $$;
revoke all on function public.autotype_submit_race_result(uuid,uuid,bigint,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.autotype_submit_race_result(uuid,uuid,bigint,integer,integer,integer) to service_role;
notify pgrst,'reload schema';
