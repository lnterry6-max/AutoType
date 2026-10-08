create or replace function public.autotype_claim_daily_first(
  p_user uuid,
  p_day date
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  top_score bigint;
  mine bigint;
  w public.wallets%rowtype;
begin
  select max(score) into top_score
  from public.round_results
  where mode='daily'
    and verified=true
    and created_at::date=p_day;

  select max(score) into mine
  from public.round_results
  where mode='daily'
    and verified=true
    and user_id=p_user
    and created_at::date=p_day;

  if coalesce(mine,0)<=0 or mine is distinct from top_score then
    raise exception 'You are not currently #1 for that Daily Challenge';
  end if;

  insert into public.daily_reward_claims(score_date,user_id,reward_coins)
  values(p_day,p_user,150)
  on conflict do nothing;

  if not found then
    raise exception 'Daily #1 reward already claimed';
  end if;

  select * into w
  from public.autotype_wallet_credit_coins(p_user,150);

  insert into public.economy_transactions(
    user_id,kind,coins_delta,metadata
  )
  values(
    p_user,'daily_first_reward',150,
    jsonb_build_object('day',p_day,'verified',true)
  );

  return jsonb_build_object(
    'wallet',to_jsonb(w),
    'reward',150,
    'day',p_day,
    'claimed',true
  );
end;
$$;

revoke execute on function public.autotype_claim_daily_first(uuid,date)
from public,anon,authenticated;
grant execute on function public.autotype_claim_daily_first(uuid,date)
to service_role;