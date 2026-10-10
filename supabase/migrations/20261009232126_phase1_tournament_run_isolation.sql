-- Run identity separates current registration/attempts from previous tournaments.
alter table public.tournaments add column run_id uuid not null default gen_random_uuid();
alter table public.tournament_entries add column run_id uuid;
update public.tournament_entries e set run_id=t.run_id from public.tournaments t where e.tournament_id=t.id;
alter table public.tournament_entries alter column run_id set not null;
alter table public.round_challenges add column tournament_run_id uuid;
alter table public.round_results add column tournament_run_id uuid;
-- Legacy issued tournament challenges have no trustworthy run binding. Require
-- a fresh challenge, preserving entries, completed scores and all rewards.
update public.round_challenges set status='abandoned' where mode='tournament' and status='issued';
create unique index round_challenges_one_tournament_attempt on public.round_challenges(user_id,tournament_id,tournament_run_id)
 where mode='tournament' and status='issued' and tournament_run_id is not null;

-- Retain previous standings for custom events reopened without the built-in
-- reset RPC. Registration may replace the current-entry row only after archival.
create table public.tournament_run_history(
 tournament_id uuid not null,run_id uuid not null,archived_at timestamptz not null default now(),
 tournament jsonb not null,entries jsonb not null,primary key(tournament_id,run_id)
);
alter table public.tournament_run_history enable row level security;
revoke all on public.tournament_run_history from public,anon,authenticated;
grant select,insert on public.tournament_run_history to service_role;

create function public.autotype_rotate_tournament_run() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.run_id is distinct from old.run_id or
    (old.status in ('closed','cancelled','running') and new.status in ('open','scheduled')) or
    (old.status in ('closed','cancelled') and new.status='running') then
  if new.run_id=old.run_id then new.run_id:=gen_random_uuid(); end if;
  insert into public.tournament_run_history(tournament_id,run_id,tournament,entries)
   values(old.id,old.run_id,to_jsonb(old),coalesce((select jsonb_agg(to_jsonb(e)) from public.tournament_entries e where tournament_id=old.id and run_id=old.run_id),'[]'::jsonb))
   on conflict(tournament_id,run_id) do nothing;
  new.winner_id:=null;
 end if;
 return new;
end; $$;
revoke all on function public.autotype_rotate_tournament_run() from public,anon,authenticated;
create trigger phase1_tournament_run before update on public.tournaments
 for each row execute function public.autotype_rotate_tournament_run();

create function public.autotype_invalidate_tournament_challenges() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then
  update public.round_challenges set status='abandoned' where tournament_id=old.id and status='issued';
  return old;
 end if;
 if new.run_id is distinct from old.run_id or new.status in ('closed','cancelled') then
  update public.round_challenges set status='abandoned' where tournament_id=new.id and status='issued';
 end if;
 return new;
end; $$;
revoke all on function public.autotype_invalidate_tournament_challenges() from public,anon,authenticated;
create trigger phase1_tournament_challenges after update on public.tournaments
 for each row execute function public.autotype_invalidate_tournament_challenges();
create trigger phase1_tournament_delete before delete on public.tournaments
 for each row execute function public.autotype_invalidate_tournament_challenges();

create function public.autotype_lock_tournament_challenge(p_user uuid,p_challenge uuid,p_completion boolean)
returns void language plpgsql security definer set search_path='' as $$
declare ch public.round_challenges%rowtype;t public.tournaments%rowtype;e public.tournament_entries%rowtype;
begin
 select * into ch from public.round_challenges where id=p_challenge and user_id=p_user;
 if ch.id is null then raise exception 'Round challenge not found'; end if;
 if ch.mode<>'tournament' and ch.tournament_id is null then return; end if;
 if ch.mode<>'tournament' or ch.tournament_id is null then raise exception 'Tournament run is no longer available'; end if;
 -- Always lock tournament before challenge/entry. Reset/cancel uses that order.
 select * into t from public.tournaments where id=ch.tournament_id for update;
 select * into ch from public.round_challenges where id=p_challenge and user_id=p_user for update;
 if t.id is null or ch.tournament_run_id is distinct from t.run_id then raise exception 'Tournament run changed; start a new registered attempt'; end if;
 if p_completion then
  if t.status<>'running' then raise exception 'Tournament is not running'; end if;
  select * into e from public.tournament_entries where tournament_id=t.id and user_id=p_user for update;
  if e.run_id is distinct from t.run_id or e.status not in ('registered','playing') or e.score is not null then
   raise exception 'You are not eligible for this tournament attempt';
  end if;
 end if;
end; $$;
revoke all on function public.autotype_lock_tournament_challenge(uuid,uuid,boolean) from public,anon,authenticated;
create or replace function public.autotype_start_round(
  p_user uuid,
  p_mode text,
  p_tournament text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  chosen public.challenge_sentences%rowtype;
  ch public.round_challenges%rowtype;
  t public.tournaments%rowtype;
  word_count integer;
  pool_count integer;
  daily_offset integer;
begin
  if p_user is null or p_mode is null then raise exception 'Missing round identity'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,12504));
  if p_mode not in ('classic','context','sentence','evil','daily','tournament') then
    raise exception 'This mode does not use server challenges';
  end if;

  if (
    select count(*)
    from public.round_challenges
    where user_id=p_user and issued_at>now()-interval '5 minutes'
  ) >= 30 then
    raise exception 'Too many round starts. Try again in a few minutes.';
  end if;

  if p_mode='tournament' then
    if coalesce(trim(p_tournament),'')='' then raise exception 'Tournament is required'; end if;

    select * into t
    from public.tournaments
    where slug=p_tournament
       or id::text=p_tournament
    limit 1 for update;

    if t.id is null then raise exception 'Tournament not found'; end if;
    if t.status<>'running' then raise exception 'Tournament is not running'; end if;

    if not exists(
      select 1 from public.tournament_entries
      where tournament_id=t.id and user_id=p_user and run_id=t.run_id
        and status in ('registered','playing')
    ) then raise exception 'You are not registered for this tournament'; end if;

    if exists(
      select 1 from public.tournament_entries
      where tournament_id=t.id and user_id=p_user and run_id=t.run_id and score is not null
    ) then raise exception 'Your tournament attempt is already complete'; end if;

    select * into ch
    from public.round_challenges
    where user_id=p_user and tournament_id=t.id and tournament_run_id=t.run_id and status='issued' and expires_at>now()
    order by issued_at desc limit 1;

    if ch.id is not null then
      return jsonb_build_object(
        'challenge_id',ch.id,'mode',ch.mode,'target_text',ch.target_text,
        'expires_at',ch.expires_at,'tournament_id',ch.tournament_id,'tournament_run_id',ch.tournament_run_id
      );
    end if;
  end if;

  if p_mode='daily' then
    select * into ch
    from public.round_challenges
    where user_id=p_user and mode='daily' and daily_key=current_date
      and status='issued' and expires_at>now()
    order by issued_at desc limit 1;

    if ch.id is not null then
      return jsonb_build_object(
        'challenge_id',ch.id,'mode',ch.mode,'target_text',ch.target_text,
        'expires_at',ch.expires_at,'daily_key',ch.daily_key
      );
    end if;

    select count(*) into pool_count
    from public.challenge_sentences
    where pool='standard' and active=true;

    if pool_count=0 then raise exception 'No challenge sentences are available'; end if;

    daily_offset:=mod(
      (hashtextextended(current_date::text,0) & 9223372036854775807),
      pool_count
    )::integer;

    select * into chosen
    from public.challenge_sentences
    where pool='standard' and active=true
    order by id
    offset daily_offset limit 1;
  elsif p_mode='evil' then
    select * into chosen
    from public.challenge_sentences
    where active=true and pool in ('standard','evil')
    order by
      case when pool='evil' then random()*0.65 else random() end
    limit 1;
  else
    select * into chosen
    from public.challenge_sentences
    where pool='standard' and active=true
    order by random()
    limit 1;
  end if;

  if chosen.id is null then raise exception 'No challenge sentence is available'; end if;

  word_count:=array_length(regexp_split_to_array(trim(chosen.target_text),'\s+'),1);

  update public.round_challenges
  set status='abandoned'
  where user_id=p_user
    and status='issued'
    and mode=p_mode
    and (p_mode<>'tournament' or tournament_id=t.id);

  insert into public.round_challenges(
    user_id,mode,target_text,target_words,tournament_id,daily_key,tournament_run_id
  )
  values(
    p_user,p_mode,chosen.target_text,word_count,
    case when p_mode='tournament' then t.id else null end,
    case when p_mode='daily' then current_date else null end,
    case when p_mode='tournament' then t.run_id else null end
  )
  returning * into ch;

  if p_mode='tournament' then
    update public.tournament_entries
    set status='playing'
    where tournament_id=t.id and user_id=p_user and run_id=t.run_id and status in ('registered','playing') and score is null;
    if not found then raise exception 'Tournament entry could not start'; end if;
  end if;

  return jsonb_build_object(
    'challenge_id',ch.id,
    'mode',ch.mode,
    'target_text',ch.target_text,
    'expires_at',ch.expires_at,
    'daily_key',ch.daily_key,
    'tournament_id',ch.tournament_id,'tournament_run_id',ch.tournament_run_id
  );
end;
$$;

create or replace function public.autotype_record_verified_round(
  p_user uuid,
  p_challenge uuid,
  p_round uuid,
  p_mode text,
  p_score bigint,
  p_words integer,
  p_erased integer,
  p_max_streak integer,
  p_total_keys integer,
  p_errors integer,
  p_duration_ms integer,
  p_one_clue boolean
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  ch public.round_challenges%rowtype;
  existing_result public.round_results%rowtype;
  s public.player_stats%rowtype;
  w public.wallets%rowtype;
  new_rounds bigint;
  new_words bigint;
  reward_coins bigint:=20;
  reward_tickets bigint:=0;
  unlocked text[]:=array[]::text[];
  ach text;
  inserted_count integer;
  max_score bigint:=0;
  streak_bonus bigint:=0;
  i integer;
  server_elapsed bigint;
begin
  if p_user is null or p_challenge is null or p_round is null or p_mode is null or
     p_score is null or p_words is null or p_erased is null or p_max_streak is null or
     p_total_keys is null or p_errors is null or p_duration_ms is null or p_one_clue is null then
    raise exception 'Missing round metrics';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_round::text,12501));
  perform public.autotype_lock_tournament_challenge(p_user,p_challenge,false);
  select * into ch
  from public.round_challenges
  where id=p_challenge and user_id=p_user
  for update;

  if ch.id is null then raise exception 'Round challenge not found'; end if;
  select * into existing_result from public.round_results where id=p_round;
  if existing_result.id is not null then
    if existing_result.user_id is distinct from p_user or
       existing_result.challenge_id is distinct from p_challenge or
       existing_result.mode is distinct from p_mode or
       existing_result.score is distinct from p_score or
       existing_result.words is distinct from p_words or
       existing_result.erased is distinct from p_erased or
       existing_result.max_streak is distinct from p_max_streak or
       existing_result.total_keys is distinct from p_total_keys or
       existing_result.errors is distinct from p_errors or
       existing_result.duration_ms is distinct from p_duration_ms or
       existing_result.one_clue_finish is distinct from p_one_clue then
      raise exception 'Round id is already bound to another completion';
    end if;
    select * into s from public.player_stats where user_id=p_user;
    select * into w from public.wallets where user_id=p_user;
    return jsonb_build_object('outcome','verified','saved',true,'duplicate',true,
      'verified',true,'stats',to_jsonb(s),'wallet',to_jsonb(w),
      'coins_earned',0,'tickets_earned',0,'new_achievements','[]'::jsonb);
  end if;
  perform public.autotype_lock_tournament_challenge(p_user,p_challenge,true);
  if ch.status<>'issued' then raise exception 'This round challenge is no longer active'; end if;
  if ch.expires_at<now() then
    update public.round_challenges set status='expired' where id=ch.id;
    raise exception 'This round challenge expired';
  end if;
  if ch.mode<>p_mode then raise exception 'Round mode does not match challenge'; end if;
  if ch.target_words<>p_words then raise exception 'Round word count does not match challenge'; end if;

  for i in 0..greatest(0,p_words-1) loop
    max_score:=max_score+120+least(i*5,30);
    streak_bonus:=streak_bonus+least(i*5,30);
  end loop;

  server_elapsed:=greatest(0,(extract(epoch from (now()-ch.issued_at))*1000)::bigint);

  if p_score<p_words*20 or p_score%5<>0 or p_score>max_score then raise exception 'Score is outside the valid range'; end if;
  if p_errors=0 and ((p_score-streak_bonus)%20<>0 or p_score<p_words*20+streak_bonus
    or (p_one_clue and p_score<p_words*20+streak_bonus+100)
    or (not p_one_clue and p_score>p_words*100+streak_bonus)) then
    raise exception 'Score does not match a perfect-round streak and clue metrics';
  end if;
  if p_errors=0 and p_total_keys<p_words*2+(p_words*120-(p_score-streak_bonus))/20 then
    raise exception 'Key count does not match the reported score';
  end if;
  if p_words<=0 or p_words>200 then raise exception 'Invalid word count'; end if;
  if p_max_streak<=0 or p_max_streak>p_words or (p_errors=0 and p_max_streak<>p_words) then raise exception 'Invalid streak'; end if;
  if p_total_keys<p_words*2 or p_total_keys>20000 then raise exception 'Invalid key count'; end if;
  if p_erased<0 or p_erased>p_total_keys then raise exception 'Invalid erased count'; end if;
  if p_errors<0 or p_errors>p_total_keys then raise exception 'Invalid error count'; end if;
  if p_duration_ms<greatest(250,p_words*120) or p_duration_ms>1800000 then raise exception 'Invalid round duration'; end if;
  if p_duration_ms>server_elapsed+5000 then raise exception 'Round duration does not match server timing'; end if;

  update public.round_challenges
  set status='consumed',consumed_at=now()
  where id=ch.id;

  insert into public.round_results(
    id,user_id,mode,score,words,erased,max_streak,total_keys,errors,duration_ms,
    one_clue_finish,challenge_id,verified,server_elapsed_ms,tournament_run_id
  )
  values(
    p_round,p_user,p_mode,p_score,p_words,p_erased,p_max_streak,p_total_keys,p_errors,p_duration_ms,
    p_one_clue,ch.id,true,server_elapsed,ch.tournament_run_id
  );

  select * into s from public.player_stats where user_id=p_user for update;
  new_rounds:=s.rounds+1;
  new_words:=s.words+p_words;

  update public.player_stats set
    rounds=new_rounds,
    words=new_words,
    erased=s.erased+p_erased,
    best_score=greatest(s.best_score,p_score),
    verified_best_score=greatest(s.verified_best_score,p_score),
    verified_rounds=s.verified_rounds+1,
    best_streak=greatest(s.best_streak,p_max_streak),
    fastest_seconds=case
      when s.fastest_seconds is null then p_duration_ms/1000.0
      else least(s.fastest_seconds,p_duration_ms/1000.0)
    end,
    best_erased_round=greatest(s.best_erased_round,p_erased),
    mind_reader_count=s.mind_reader_count+(case when p_one_clue then 1 else 0 end),
    perfect_rounds=s.perfect_rounds+(case when p_errors=0 then 1 else 0 end),
    total_keys=s.total_keys+p_total_keys,
    total_errors=s.total_errors+p_errors,
    total_score=s.total_score+p_score,
    updated_at=now()
  where user_id=p_user
  returning * into s;

  if p_errors=0 then reward_coins:=reward_coins+10; end if;
  if p_max_streak>=5 then reward_coins:=reward_coins+5; end if;
  if p_mode='daily' then reward_coins:=reward_coins+15; end if;
  if new_rounds % 10=0 then reward_tickets:=1; end if;

  foreach ach in array array['mindReader','backspaceWarrior','perfectRead','marathon','century','comboKing'] loop
    if (ach='mindReader' and p_one_clue)
       or (ach='backspaceWarrior' and p_erased>=50)
       or (ach='perfectRead' and p_errors=0)
       or (ach='marathon' and new_rounds>=25)
       or (ach='century' and new_words>=100)
       or (ach='comboKing' and p_max_streak>=10) then
      insert into public.user_achievements(user_id,achievement_id)
      values(p_user,ach) on conflict do nothing;
      get diagnostics inserted_count=row_count;
      if inserted_count>0 then
        unlocked:=array_append(unlocked,ach);
        reward_coins:=reward_coins+75;
      end if;
    end if;
  end loop;

  if 'mindReader'=any(unlocked) then
    insert into public.inventory(user_id,item_id,source)
    values(p_user,'title_mindreader','achievement')
    on conflict do nothing;
  end if;

  select * into w from public.autotype_wallet_credit_coins(p_user,reward_coins);

  update public.wallets
  set tournament_tickets=tournament_tickets+reward_tickets,updated_at=now()
  where user_id=p_user
  returning * into w;

  if ch.tournament_id is not null then
    update public.tournament_entries
    set score=p_score,status='finished',finished_at=now()
    where tournament_id=ch.tournament_id and user_id=p_user and run_id=ch.tournament_run_id
      and status in ('registered','playing') and score is null;
    if not found then raise exception 'Tournament completion could not save'; end if;
  end if;

  insert into public.economy_transactions(
    user_id,kind,coins_delta,tickets_delta,metadata
  )
  values(
    p_user,'round_reward',reward_coins,reward_tickets,
    jsonb_build_object(
      'round_id',p_round,'mode',p_mode,'challenge_id',ch.id,
      'verified',true,'tournament_id',ch.tournament_id,'tournament_run_id',ch.tournament_run_id
    )
  );

  return jsonb_build_object(
    'outcome','verified',
    'saved',true,
    'duplicate',false,
    'verified',true,
    'stats',to_jsonb(s),
    'wallet',to_jsonb(w),
    'coins_earned',reward_coins,
    'tickets_earned',reward_tickets,
    'new_achievements',to_jsonb(unlocked),
    'server_elapsed_ms',server_elapsed
  );
end;
$$;

CREATE OR REPLACE FUNCTION public.autotype_record_sentence_round(p_user uuid, p_challenge uuid, p_round uuid, p_mode text, p_score bigint, p_words integer, p_erased integer, p_max_streak integer, p_total_keys integer, p_errors integer, p_duration_ms integer, p_one_clue boolean, p_batch_words integer, p_batch_actions integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ch public.round_challenges%rowtype;
  existing_result public.round_results%rowtype;
  s public.player_stats%rowtype;
  w public.wallets%rowtype;
  new_rounds bigint;
  new_words bigint;
  reward_coins bigint:=20;
  reward_tickets bigint:=0;
  unlocked text[]:=array[]::text[];
  ach text;
  inserted_count integer;
  max_score bigint:=0;
  streak_bonus bigint:=0;
  i integer;
  server_elapsed bigint;
begin
  if p_user is null or p_challenge is null or p_round is null or p_mode is null or
     p_score is null or p_words is null or p_erased is null or p_max_streak is null or
     p_total_keys is null or p_errors is null or p_duration_ms is null or p_one_clue is null then
    raise exception 'Missing round metrics';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_round::text,12501));
  perform public.autotype_lock_tournament_challenge(p_user,p_challenge,false);
  select * into ch
  from public.round_challenges
  where id=p_challenge and user_id=p_user
  for update;

  if ch.id is null then raise exception 'Round challenge not found'; end if;
  select * into existing_result from public.round_results where id=p_round;
  if existing_result.id is not null then
    if existing_result.user_id is distinct from p_user or
       existing_result.challenge_id is distinct from p_challenge or
       existing_result.mode is distinct from p_mode or
       existing_result.score is distinct from p_score or
       existing_result.words is distinct from p_words or
       existing_result.erased is distinct from p_erased or
       existing_result.max_streak is distinct from p_max_streak or
       existing_result.total_keys is distinct from p_total_keys or
       existing_result.errors is distinct from p_errors or
       existing_result.duration_ms is distinct from p_duration_ms or
       existing_result.one_clue_finish is distinct from p_one_clue or
       existing_result.sentence_batch_words is distinct from p_batch_words or
       existing_result.sentence_batch_actions is distinct from p_batch_actions then
      raise exception 'Round id is already bound to another completion';
    end if;
    select * into s from public.player_stats where user_id=p_user;
    select * into w from public.wallets where user_id=p_user;
    return jsonb_build_object('outcome','verified','saved',true,'duplicate',true,
      'verified',true,'stats',to_jsonb(s),'wallet',to_jsonb(w),
      'coins_earned',0,'tickets_earned',0,'new_achievements','[]'::jsonb);
  end if;
  perform public.autotype_lock_tournament_challenge(p_user,p_challenge,true);
  if ch.status<>'issued' then raise exception 'This round challenge is no longer active'; end if;
  if ch.expires_at<now() then
    update public.round_challenges set status='expired' where id=ch.id;
    raise exception 'This round challenge expired';
  end if;
  if p_mode <> 'sentence' then raise exception 'Phrase acceptance is only for Sentence Mode'; end if;
  if p_batch_words is null or p_batch_actions is null or
     p_batch_words < 0 or p_batch_words >= p_words or
     p_batch_actions < 0 or p_batch_actions > p_batch_words or
     ((p_batch_words = 0) <> (p_batch_actions = 0)) then
    raise exception 'Invalid accepted phrase metrics';
  end if;
  if ch.mode<>p_mode then raise exception 'Round mode does not match challenge'; end if;
  if ch.target_words<>p_words then raise exception 'Round word count does not match challenge'; end if;

  for i in 0..greatest(0,p_words-1) loop
    max_score:=max_score+120+least(i*5,30);
    streak_bonus:=streak_bonus+least(i*5,30);
  end loop;
  -- Automatically accepted words receive 20 points instead of 120.
  -- Restrict the score ceiling so batch acceptance never boosts rankings.
  max_score:=max_score-100*p_batch_words;

  server_elapsed:=greatest(0,(extract(epoch from (now()-ch.issued_at))*1000)::bigint);

  if p_score<p_words*20 or p_score%5<>0 or p_score>max_score then raise exception 'Score is outside the valid range'; end if;
  if p_errors=0 and ((p_score-streak_bonus)%20<>0 or p_score<p_words*20+streak_bonus
    or (p_one_clue and p_score<p_words*20+streak_bonus+100)
    or (not p_one_clue and p_score>p_words*100-80*p_batch_words+streak_bonus)) then
    raise exception 'Score does not match a perfect-round streak and clue metrics';
  end if;
  if p_errors=0 and p_total_keys<(p_words-p_batch_words)*2+p_batch_actions+((p_words-p_batch_words)*120-(p_score-streak_bonus-p_batch_words*20))/20 then
    raise exception 'Key count does not match the reported score';
  end if;
  if p_words<=0 or p_words>200 then raise exception 'Invalid word count'; end if;
  if p_max_streak<=0 or p_max_streak>p_words or (p_errors=0 and p_max_streak<>p_words) then raise exception 'Invalid streak'; end if;
  if p_total_keys < (p_words-p_batch_words)*2+p_batch_actions or p_total_keys>20000 then raise exception 'Invalid key count'; end if;
  if p_erased<0 or p_erased>p_total_keys then raise exception 'Invalid erased count'; end if;
  if p_errors<0 or p_errors>p_total_keys then raise exception 'Invalid error count'; end if;
  if p_duration_ms<greatest(250,(p_words-p_batch_words)*120+p_batch_actions*80) or p_duration_ms>1800000 then raise exception 'Invalid round duration'; end if;
  if p_duration_ms>server_elapsed+5000 then raise exception 'Round duration does not match server timing'; end if;

  update public.round_challenges
  set status='consumed',consumed_at=now()
  where id=ch.id;

  insert into public.round_results(
    id,user_id,mode,score,words,erased,max_streak,total_keys,errors,duration_ms,
    one_clue_finish,challenge_id,verified,server_elapsed_ms,tournament_run_id,sentence_batch_words,sentence_batch_actions
  )
  values(
    p_round,p_user,p_mode,p_score,p_words,p_erased,p_max_streak,p_total_keys,p_errors,p_duration_ms,
    p_one_clue,ch.id,true,server_elapsed,ch.tournament_run_id,p_batch_words,p_batch_actions
  );

  select * into s from public.player_stats where user_id=p_user for update;
  new_rounds:=s.rounds+1;
  new_words:=s.words+p_words;

  update public.player_stats set
    rounds=new_rounds,
    words=new_words,
    erased=s.erased+p_erased,
    best_score=greatest(s.best_score,p_score),
    verified_best_score=greatest(s.verified_best_score,p_score),
    verified_rounds=s.verified_rounds+1,
    best_streak=greatest(s.best_streak,p_max_streak),
    fastest_seconds=case
      when s.fastest_seconds is null then p_duration_ms/1000.0
      else least(s.fastest_seconds,p_duration_ms/1000.0)
    end,
    best_erased_round=greatest(s.best_erased_round,p_erased),
    mind_reader_count=s.mind_reader_count+(case when p_one_clue then 1 else 0 end),
    perfect_rounds=s.perfect_rounds+(case when p_errors=0 then 1 else 0 end),
    total_keys=s.total_keys+p_total_keys,
    total_errors=s.total_errors+p_errors,
    total_score=s.total_score+p_score,
    updated_at=now()
  where user_id=p_user
  returning * into s;

  if p_errors=0 then reward_coins:=reward_coins+10; end if;
  if p_max_streak>=5 then reward_coins:=reward_coins+5; end if;
  if p_mode='daily' then reward_coins:=reward_coins+15; end if;
  if new_rounds % 10=0 then reward_tickets:=1; end if;

  foreach ach in array array['mindReader','backspaceWarrior','perfectRead','marathon','century','comboKing'] loop
    if (ach='mindReader' and p_one_clue)
       or (ach='backspaceWarrior' and p_erased>=50)
       or (ach='perfectRead' and p_errors=0)
       or (ach='marathon' and new_rounds>=25)
       or (ach='century' and new_words>=100)
       or (ach='comboKing' and p_max_streak>=10) then
      insert into public.user_achievements(user_id,achievement_id)
      values(p_user,ach) on conflict do nothing;
      get diagnostics inserted_count=row_count;
      if inserted_count>0 then
        unlocked:=array_append(unlocked,ach);
        reward_coins:=reward_coins+75;
      end if;
    end if;
  end loop;

  if 'mindReader'=any(unlocked) then
    insert into public.inventory(user_id,item_id,source)
    values(p_user,'title_mindreader','achievement')
    on conflict do nothing;
  end if;

  select * into w from public.autotype_wallet_credit_coins(p_user,reward_coins);

  update public.wallets
  set tournament_tickets=tournament_tickets+reward_tickets,updated_at=now()
  where user_id=p_user
  returning * into w;

  if ch.tournament_id is not null then
    update public.tournament_entries
    set score=p_score,status='finished',finished_at=now()
    where tournament_id=ch.tournament_id and user_id=p_user and run_id=ch.tournament_run_id
      and status in ('registered','playing') and score is null;
    if not found then raise exception 'Tournament completion could not save'; end if;
  end if;

  insert into public.economy_transactions(
    user_id,kind,coins_delta,tickets_delta,metadata
  )
  values(
    p_user,'round_reward',reward_coins,reward_tickets,
    jsonb_build_object(
      'round_id',p_round,'mode',p_mode,'challenge_id',ch.id,
      'verified',true,'tournament_id',ch.tournament_id,'tournament_run_id',ch.tournament_run_id,'sentence_batch_words',p_batch_words
    )
  );

  return jsonb_build_object(
    'outcome','verified',
    'saved',true,
    'duplicate',false,
    'verified',true,
    'stats',to_jsonb(s),
    'wallet',to_jsonb(w),
    'coins_earned',reward_coins,
    'tickets_earned',reward_tickets,
    'new_achievements',to_jsonb(unlocked),
    'server_elapsed_ms',server_elapsed
  );
end;
$function$
;

create or replace function public.autotype_join_tournament(p_user uuid,p_tournament text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare t public.tournaments%rowtype; w public.wallets%rowtype; entrants integer; e public.tournament_entries%rowtype;
begin
  select * into t from public.tournaments
  where slug=p_tournament or id::text=p_tournament limit 1 for update;
  if t.id is null then raise exception 'Tournament not found'; end if;
  if t.status not in ('open','scheduled') then raise exception 'Registration is closed'; end if;
  if exists(select 1 from public.tournament_entries where tournament_id=t.id and user_id=p_user and run_id=t.run_id and status not in ('withdrawn','disqualified')) then
    raise exception 'Already registered';
  end if;
  select count(*) into entrants from public.tournament_entries
  where tournament_id=t.id and run_id=t.run_id and status not in ('withdrawn','disqualified');
  if entrants>=t.max_players then raise exception 'Tournament is full'; end if;

  select * into w from public.wallets where user_id=p_user for update;
  if w.user_id is null then raise exception 'Wallet not found'; end if;
  if t.entry_type='ticket' and w.tournament_tickets<t.entry_cost then raise exception 'Not enough Tournament Tickets'; end if;
  if t.entry_type='ticket' and t.entry_cost>0 then
    update public.wallets set tournament_tickets=tournament_tickets-t.entry_cost,updated_at=now()
    where user_id=p_user returning * into w;
    insert into public.economy_transactions(user_id,kind,tickets_delta,metadata)
    values(p_user,'tournament_entry',-t.entry_cost,jsonb_build_object('tournament',coalesce(t.slug,t.id::text)));
  end if;

  insert into public.tournament_entries(tournament_id,user_id,status,run_id)
  values(t.id,p_user,'registered',t.run_id)
  on conflict(tournament_id,user_id) do update set status='registered',run_id=excluded.run_id,score=null,joined_at=now(),finished_at=null
  returning * into e;
  return jsonb_build_object('entry',to_jsonb(e),'wallet',to_jsonb(w),'tournament',coalesce(t.slug,t.id::text));
end;
$$;

create or replace function public.autotype_leave_tournament(p_user uuid,p_tournament text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare t public.tournaments%rowtype; e public.tournament_entries%rowtype; w public.wallets%rowtype; refund integer:=0;
begin
  select * into t from public.tournaments where slug=p_tournament or id::text=p_tournament limit 1 for update;
  if t.id is null then raise exception 'Tournament not found'; end if;
  select * into e from public.tournament_entries
  where tournament_id=t.id and user_id=p_user and run_id=t.run_id and status='registered' for update;
  if e.user_id is null then raise exception 'Registration not found'; end if;
  update public.tournament_entries set status='withdrawn' where tournament_id=t.id and user_id=p_user and run_id=t.run_id;
  if t.entry_type='ticket' and t.entry_cost>0 and t.status in ('open','scheduled') then refund:=t.entry_cost; end if;
  update public.wallets set tournament_tickets=tournament_tickets+refund,updated_at=now()
  where user_id=p_user returning * into w;
  if w.user_id is null then raise exception 'Wallet not found'; end if;
  if refund>0 then
    insert into public.economy_transactions(user_id,kind,tickets_delta,metadata)
    values(p_user,'tournament_refund',refund,jsonb_build_object('tournament',coalesce(t.slug,t.id::text)));
  end if;
  return jsonb_build_object('wallet',to_jsonb(w),'refund',refund);
end;
$$;

create or replace function public.autotype_reset_builtin_tournaments(p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 t public.tournaments%rowtype;
 e public.tournament_entries%rowtype;
begin
 if p_actor is null or not exists(select 1 from public.user_roles
   where user_id=p_actor and role in ('developer','admin')) then
   raise exception 'Developer access required';
 end if;

 -- Lock the whole built-in set before touching any challenge or wallet.
 perform 1 from public.tournaments where id in (
  '11111111-1111-4111-8111-111111111111'::uuid,
  '22222222-2222-4222-8222-222222222222'::uuid,
  '33333333-3333-4333-8333-333333333333'::uuid) order by id for update;
 for t in select * from public.tournaments
  where id in (
   '11111111-1111-4111-8111-111111111111'::uuid,
   '22222222-2222-4222-8222-222222222222'::uuid,
   '33333333-3333-4333-8333-333333333333'::uuid)
  order by id for update
 loop
  insert into public.tournament_reset_archives(tournament_id,reset_by,previous_tournament,previous_entries)
  values(t.id,p_actor,to_jsonb(t),coalesce(
   (select jsonb_agg(to_jsonb(x)) from public.tournament_entries x where x.tournament_id=t.id),
   '[]'::jsonb
  ));
  -- Return unused tickets for registrations that never played.
  if t.entry_type='ticket' and t.entry_cost>0 and t.status in ('open','scheduled') then
   for e in select * from public.tournament_entries
    where tournament_id=t.id and run_id=t.run_id and status='registered'
   loop
    update public.wallets
     set tournament_tickets=tournament_tickets+t.entry_cost,updated_at=now()
     where user_id=e.user_id;
    if not found then raise exception 'Ticket refund could not save'; end if;
    insert into public.economy_transactions(user_id,kind,tickets_delta,metadata)
     values(e.user_id,'tournament_refund',t.entry_cost,
      jsonb_build_object('tournament',coalesce(t.slug,t.id::text),'reason','builtin_reset'));
   end loop;
  end if;
  update public.tournaments set run_id=gen_random_uuid(),winner_id=null where id=t.id;
  if not found then raise exception 'Tournament reset could not save'; end if;
  delete from public.tournament_entries where tournament_id=t.id;
 end loop;

 insert into public.tournaments
  (id,slug,built_in,name,description,status,entry_type,entry_cost,
   reward_coins,reward_crate_tokens,reward_title,max_players,schedule_label,created_by,winner_id)
 values
  ('11111111-1111-4111-8111-111111111111','daily_open',true,'Daily Open',
   'A free-entry daily bracket for anyone who wants a competitive run.','open','free',0,
   300,1,'Daily Champion',32,'Daily',p_actor,null),
  ('22222222-2222-4222-8222-222222222222','ranked_circuit',true,'Ranked Circuit',
   'Earn Tournament Tickets through regular play, then use one to register.','open','ticket',1,
   800,2,'Circuit Winner',16,'Friday',p_actor,null),
  ('33333333-3333-4333-8333-333333333333','weekend_championship',true,'Weekend Championship',
   'The larger weekend event with higher cosmetic and coin rewards.','open','ticket',2,
   1500,3,'Weekend Champion',16,'Saturday',p_actor,null)
 on conflict(id) do update set
  slug=excluded.slug,built_in=true,name=excluded.name,description=excluded.description,
  status='open',entry_type=excluded.entry_type,entry_cost=excluded.entry_cost,
  reward_coins=excluded.reward_coins,reward_crate_tokens=excluded.reward_crate_tokens,
  reward_title=excluded.reward_title,max_players=excluded.max_players,
  schedule_label=excluded.schedule_label,created_by=excluded.created_by,
  winner_id=null,starts_at=null,updated_at=now();

 return (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
    from public.tournaments x
    where id in (
     '11111111-1111-4111-8111-111111111111'::uuid,
     '22222222-2222-4222-8222-222222222222'::uuid,
     '33333333-3333-4333-8333-333333333333'::uuid));
end;
$$;

create or replace function public.autotype_award_tournament(
  p_actor uuid,
  p_tournament text,
  p_winner uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  role_name text;
  t public.tournaments%rowtype;
  w public.wallets%rowtype;
  winner_score bigint;
  top_score bigint;
begin
  select role into role_name
  from public.user_roles
  where user_id=p_actor;

  if role_name is null or role_name not in ('developer','admin') then
    raise exception 'Developer access required';
  end if;

  select * into t
  from public.tournaments
  where slug=p_tournament or id::text=p_tournament
  limit 1
  for update;

  if t.id is null then raise exception 'Tournament not found'; end if;
  if t.status<>'running' then raise exception 'Tournament is not running'; end if;
  if t.winner_id is not null then raise exception 'Winner already awarded'; end if;

  select score into winner_score
  from public.tournament_entries
  where tournament_id=t.id and run_id=t.run_id
    and user_id=p_winner
    and status not in ('withdrawn','disqualified');

  if winner_score is null then
    raise exception 'Winner must have a completed verified tournament score';
  end if;

  select max(score) into top_score
  from public.tournament_entries
  where tournament_id=t.id and run_id=t.run_id
    and score is not null
    and status not in ('withdrawn','disqualified');

  if winner_score is distinct from top_score then
    raise exception 'Winner must have the top verified score';
  end if;

  select * into w
  from public.autotype_wallet_credit_coins(p_winner,t.reward_coins);

  update public.wallets
  set crate_tokens=crate_tokens+t.reward_crate_tokens,
      updated_at=now()
  where user_id=p_winner
  returning * into w;

  update public.player_stats
  set tournament_wins=tournament_wins+1,updated_at=now()
  where user_id=p_winner;

  update public.profiles
  set last_tournament_title=t.reward_title
  where id=p_winner;

  update public.tournament_entries
  set status=case when user_id=p_winner then 'winner' else status end
  where tournament_id=t.id and run_id=t.run_id;

  update public.tournaments
  set winner_id=p_winner,status='closed',updated_at=now()
  where id=t.id;

  insert into public.economy_transactions(
    user_id,kind,coins_delta,crate_tokens_delta,metadata
  )
  values(
    p_winner,'tournament_prize',t.reward_coins,t.reward_crate_tokens,
    jsonb_build_object(
      'tournament',coalesce(t.slug,t.id::text),
      'title',t.reward_title,
      'verified_score',winner_score,'tournament_run_id',t.run_id
    )
  );

  insert into public.admin_audit_log(
    actor_id,action,target_type,target_id,details
  )
  values(
    p_actor,'award_tournament','profile',p_winner::text,
    jsonb_build_object(
      'tournament',coalesce(t.slug,t.id::text),
      'verified_score',winner_score,'tournament_run_id',t.run_id
    )
  );

  return jsonb_build_object(
    'wallet',to_jsonb(w),
    'reward_title',t.reward_title,
    'verified_score',winner_score,'tournament_run_id',t.run_id
  );
end;
$$;
revoke all on function public.autotype_start_round(uuid,text,text) from public,anon,authenticated;
grant execute on function public.autotype_start_round(uuid,text,text) to service_role;
revoke all on function public.autotype_record_verified_round(uuid,uuid,uuid,text,bigint,integer,integer,integer,integer,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.autotype_record_verified_round(uuid,uuid,uuid,text,bigint,integer,integer,integer,integer,integer,integer,boolean) to service_role;
revoke all on function public.autotype_record_sentence_round(uuid,uuid,uuid,text,bigint,integer,integer,integer,integer,integer,integer,boolean,integer,integer) from public,anon,authenticated;
grant execute on function public.autotype_record_sentence_round(uuid,uuid,uuid,text,bigint,integer,integer,integer,integer,integer,integer,boolean,integer,integer) to service_role;
revoke all on function public.autotype_join_tournament(uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_join_tournament(uuid,text) to service_role;
revoke all on function public.autotype_leave_tournament(uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_leave_tournament(uuid,text) to service_role;
revoke all on function public.autotype_reset_builtin_tournaments(uuid) from public,anon,authenticated;
grant execute on function public.autotype_reset_builtin_tournaments(uuid) to service_role;
revoke all on function public.autotype_award_tournament(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.autotype_award_tournament(uuid,text,uuid) to service_role;
notify pgrst,'reload schema';
