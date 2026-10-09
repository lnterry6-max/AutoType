-- Dedicated Sentence Mode RPC, leaving existing Word/Context/Evil scoring unchanged.
-- The phrase action is a single real tap and may accept multiple consecutive words.
-- This still relies on reported client metrics; it is not complete anti-cheat.
alter table public.round_results
  add column if not exists sentence_batch_words integer not null default 0,
  add column if not exists sentence_batch_actions integer not null default 0;
alter table public.round_results
  add constraint round_sentence_batch_metrics_valid
  check (sentence_batch_words >= 0 and sentence_batch_actions >= 0
         and sentence_batch_actions <= sentence_batch_words);

CREATE OR REPLACE FUNCTION public.autotype_record_sentence_round(p_user uuid, p_challenge uuid, p_round uuid, p_mode text, p_score bigint, p_words integer, p_erased integer, p_max_streak integer, p_total_keys integer, p_errors integer, p_duration_ms integer, p_one_clue boolean, p_batch_words integer, p_batch_actions integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ch public.round_challenges%rowtype;
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
  i integer;
  server_elapsed bigint;
begin
  select * into ch
  from public.round_challenges
  where id=p_challenge and user_id=p_user
  for update;

  if ch.id is null then raise exception 'Round challenge not found'; end if;
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

  if exists(select 1 from public.round_results where id=p_round and user_id=p_user) then
    select * into s from public.player_stats where user_id=p_user;
    select * into w from public.wallets where user_id=p_user;
    return jsonb_build_object(
      'duplicate',true,'verified',true,'stats',to_jsonb(s),'wallet',to_jsonb(w),
      'coins_earned',0,'tickets_earned',0,'new_achievements','[]'::jsonb
    );
  end if;

  for i in 0..greatest(0,p_words-1) loop
    max_score:=max_score+120+least(i*5,30);
  end loop;
  -- Automatically accepted words receive 20 points instead of 120.
  -- Restrict the score ceiling so batch acceptance never boosts rankings.
  max_score:=max_score-100*p_batch_words;

  server_elapsed:=greatest(0,(extract(epoch from (now()-ch.issued_at))*1000)::bigint);

  if p_score<0 or p_score>max_score then raise exception 'Score is outside the valid range'; end if;
  if p_words<=0 or p_words>200 then raise exception 'Invalid word count'; end if;
  if p_max_streak<0 or p_max_streak>p_words then raise exception 'Invalid streak'; end if;
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
    one_clue_finish,challenge_id,verified,server_elapsed_ms,sentence_batch_words,sentence_batch_actions
  )
  values(
    p_round,p_user,p_mode,p_score,p_words,p_erased,p_max_streak,p_total_keys,p_errors,p_duration_ms,
    p_one_clue,ch.id,true,server_elapsed,p_batch_words,p_batch_actions
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
    where tournament_id=ch.tournament_id and user_id=p_user;
  end if;

  insert into public.economy_transactions(
    user_id,kind,coins_delta,tickets_delta,metadata
  )
  values(
    p_user,'round_reward',reward_coins,reward_tickets,
    jsonb_build_object(
      'round_id',p_round,'mode',p_mode,'challenge_id',ch.id,
      'verified',true,'tournament_id',ch.tournament_id,'sentence_batch_words',p_batch_words
    )
  );

  return jsonb_build_object(
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
revoke execute on function public.autotype_record_sentence_round(
  uuid,uuid,uuid,text,bigint,integer,integer,integer,integer,integer,integer,boolean,integer,integer
) from public,anon,authenticated;
grant execute on function public.autotype_record_sentence_round(
  uuid,uuid,uuid,text,bigint,integer,integer,integer,integer,integer,integer,boolean,integer,integer
) to service_role;
notify pgrst, 'reload schema';
