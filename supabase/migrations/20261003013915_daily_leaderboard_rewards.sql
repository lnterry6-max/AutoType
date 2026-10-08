-- Public round-result reads power shared Daily leaderboards.
drop policy if exists "round results readable by owner" on public.round_results;
create policy "round results readable"
on public.round_results for select using(true);
grant select on public.round_results to anon,authenticated;

create table if not exists public.daily_reward_claims (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  claimed_at timestamptz not null default now(),
  primary key(user_id,day)
);
alter table public.daily_reward_claims enable row level security;
drop policy if exists "daily claims readable by owner" on public.daily_reward_claims;
create policy "daily claims readable by owner"
on public.daily_reward_claims for select using(auth.uid()=user_id);
grant select on public.daily_reward_claims to authenticated;
grant select,insert,update,delete on public.daily_reward_claims to service_role;

create or replace function public.autotype_claim_daily_first(p_user uuid,p_day date)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare top_score bigint; mine bigint; w public.wallets%rowtype;
begin
  select max(score) into top_score from public.round_results
  where mode='daily' and created_at::date=p_day;
  select max(score) into mine from public.round_results
  where mode='daily' and user_id=p_user and created_at::date=p_day;
  if coalesce(mine,0)<=0 or mine is distinct from top_score then
    raise exception 'You are not currently #1 for that Daily Challenge';
  end if;
  insert into public.daily_reward_claims(user_id,day) values(p_user,p_day)
  on conflict do nothing;
  if not found then raise exception 'Daily #1 reward already claimed'; end if;
  update public.wallets set coins=coins+150,updated_at=now() where user_id=p_user returning * into w;
  insert into public.economy_transactions(user_id,kind,coins_delta,metadata)
  values(p_user,'daily_first_reward',150,jsonb_build_object('day',p_day));
  return jsonb_build_object('wallet',to_jsonb(w),'reward',150);
end;
$$;
revoke execute on function public.autotype_claim_daily_first(uuid,date) from public,anon,authenticated;
grant execute on function public.autotype_claim_daily_first(uuid,date) to service_role;
