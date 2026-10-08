create or replace function public.autotype_award_tournament(
  p_actor uuid,
  p_tournament text,
  p_winner uuid
) returns jsonb
language plpgsql security definer set search_path=public
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

  if role_name not in ('developer','admin') then
    raise exception 'Developer access required';
  end if;

  select * into t
  from public.tournaments
  where slug=p_tournament or id::text=p_tournament
  limit 1
  for update;

  if t.id is null then raise exception 'Tournament not found'; end if;
  if t.winner_id is not null then raise exception 'Winner already awarded'; end if;

  select score into winner_score
  from public.tournament_entries
  where tournament_id=t.id
    and user_id=p_winner
    and status not in ('withdrawn','disqualified');

  if winner_score is null then
    raise exception 'Winner must have a completed verified tournament score';
  end if;

  select max(score) into top_score
  from public.tournament_entries
  where tournament_id=t.id
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
  where tournament_id=t.id;

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
      'verified_score',winner_score
    )
  );

  insert into public.admin_audit_log(
    actor_id,action,target_type,target_id,details
  )
  values(
    p_actor,'award_tournament','profile',p_winner::text,
    jsonb_build_object(
      'tournament',coalesce(t.slug,t.id::text),
      'verified_score',winner_score
    )
  );

  return jsonb_build_object(
    'wallet',to_jsonb(w),
    'reward_title',t.reward_title,
    'verified_score',winner_score
  );
end;
$$;

revoke execute on function public.autotype_award_tournament(uuid,text,uuid)
from public,anon,authenticated;
grant execute on function public.autotype_award_tournament(uuid,text,uuid)
to service_role;