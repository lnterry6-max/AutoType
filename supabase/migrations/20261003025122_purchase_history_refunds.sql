-- Purchase history, refunds, disputes, and refundable Coin accounting.

alter table public.wallets
  add column if not exists coin_debt bigint not null default 0 check (coin_debt >= 0);

alter table public.payment_orders
  add column if not exists refunded_amount_cents integer not null default 0 check (refunded_amount_cents >= 0),
  add column if not exists coins_reversed integer not null default 0 check (coins_reversed >= 0),
  add column if not exists dispute_amount_cents integer not null default 0 check (dispute_amount_cents >= 0),
  add column if not exists dispute_coins_reversed integer not null default 0 check (dispute_coins_reversed >= 0),
  add column if not exists last_adjusted_at timestamptz;

alter table public.payment_orders drop constraint if exists payment_orders_status_check;
alter table public.payment_orders
  add constraint payment_orders_status_check
  check (status in (
    'pending','paid','failed','cancelled',
    'partially_refunded','refunded',
    'disputed','dispute_won','dispute_lost'
  ));

create table if not exists public.payment_adjustments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.payment_orders(id) on delete cascade,
  provider text not null default 'stripe',
  provider_object_id text not null,
  kind text not null check (kind in ('refund','dispute')),
  status text not null,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  coins_reversed integer not null default 0 check (coins_reversed >= 0),
  coins_restored integer not null default 0 check (coins_restored >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,provider_object_id)
);
create index if not exists payment_adjustments_order_id_idx on public.payment_adjustments(order_id);

alter table public.payment_adjustments enable row level security;
drop policy if exists "payment adjustments readable by owner" on public.payment_adjustments;
create policy "payment adjustments readable by owner"
on public.payment_adjustments for select
using (
  exists(
    select 1 from public.payment_orders po
    where po.id=order_id and po.user_id=(select auth.uid())
  )
);
grant select on public.payment_adjustments to authenticated;
grant select,insert,update,delete on public.payment_adjustments to service_role;

create or replace function public.autotype_wallet_credit_coins(p_user uuid,p_amount bigint)
returns public.wallets
language plpgsql security definer set search_path=public
as $$
declare w public.wallets%rowtype; debt_paid bigint;
begin
  if p_amount < 0 then raise exception 'Credit amount must be non-negative'; end if;
  select * into w from public.wallets where user_id=p_user for update;
  if w.user_id is null then raise exception 'Wallet not found'; end if;
  debt_paid:=least(w.coin_debt,p_amount);
  update public.wallets
  set coin_debt=coin_debt-debt_paid,
      coins=coins+(p_amount-debt_paid),
      updated_at=now()
  where user_id=p_user
  returning * into w;
  return w;
end;
$$;
revoke execute on function public.autotype_wallet_credit_coins(uuid,bigint) from public,anon,authenticated;
grant execute on function public.autotype_wallet_credit_coins(uuid,bigint) to service_role;

create or replace function public.autotype_wallet_reverse_coins(p_user uuid,p_amount bigint)
returns public.wallets
language plpgsql security definer set search_path=public
as $$
declare w public.wallets%rowtype; removed bigint; debt_added bigint;
begin
  if p_amount < 0 then raise exception 'Reverse amount must be non-negative'; end if;
  select * into w from public.wallets where user_id=p_user for update;
  if w.user_id is null then raise exception 'Wallet not found'; end if;
  removed:=least(w.coins,p_amount);
  debt_added:=p_amount-removed;
  update public.wallets
  set coins=coins-removed,
      coin_debt=coin_debt+debt_added,
      updated_at=now()
  where user_id=p_user
  returning * into w;
  return w;
end;
$$;
revoke execute on function public.autotype_wallet_reverse_coins(uuid,bigint) from public,anon,authenticated;
grant execute on function public.autotype_wallet_reverse_coins(uuid,bigint) to service_role;

create or replace function public.autotype_credit_coin_purchase(
  p_event_id text,p_event_type text,p_user uuid,p_session text,p_payment_intent text,
  p_pack text,p_amount_total integer,p_currency text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare pack public.coin_packs%rowtype; ord public.payment_orders%rowtype; w public.wallets%rowtype; debt_before bigint;
begin
  if exists(select 1 from public.payment_events where provider='stripe' and event_id=p_event_id) then
    select * into ord from public.payment_orders where provider_session_id=p_session;
    return jsonb_build_object('duplicate',true,'order',to_jsonb(ord));
  end if;

  select * into pack from public.coin_packs where id=p_pack and active=true;
  if pack.id is null then raise exception 'Unknown coin pack'; end if;
  if pack.amount_cents<>p_amount_total or lower(pack.currency)<>lower(p_currency) then
    raise exception 'Payment amount does not match coin pack';
  end if;

  select * into ord from public.payment_orders
  where provider_session_id=p_session and user_id=p_user and pack_id=p_pack
  for update;
  if ord.id is null then raise exception 'Payment order not found'; end if;

  insert into public.payment_events(provider,event_id,event_type,payload)
  values('stripe',p_event_id,p_event_type,jsonb_build_object('session',p_session,'order_id',ord.id));

  if ord.status in ('paid','partially_refunded','refunded','disputed','dispute_won','dispute_lost') then
    return jsonb_build_object('duplicate',true,'order',to_jsonb(ord));
  end if;

  update public.payment_orders set
    status='paid',
    provider_payment_intent_id=p_payment_intent,
    completed_at=now()
  where id=ord.id
  returning * into ord;

  select coin_debt into debt_before from public.wallets where user_id=p_user;
  select * into w from public.autotype_wallet_credit_coins(p_user,pack.coins);

  insert into public.economy_transactions(user_id,kind,coins_delta,metadata)
  values(
    p_user,'stripe_coin_purchase',pack.coins,
    jsonb_build_object(
      'pack_id',pack.id,'session_id',p_session,'order_id',ord.id,
      'amount_cents',p_amount_total,'currency',p_currency,
      'debt_applied',least(coalesce(debt_before,0),pack.coins)
    )
  );

  return jsonb_build_object('duplicate',false,'order',to_jsonb(ord),'wallet',to_jsonb(w),'coins_added',pack.coins);
end;
$$;
revoke execute on function public.autotype_credit_coin_purchase(text,text,uuid,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.autotype_credit_coin_purchase(text,text,uuid,text,text,text,integer,text) to service_role;

create or replace function public.autotype_apply_stripe_refund(
  p_event_id text,p_event_type text,p_refund_id text,p_payment_intent text,
  p_amount integer,p_status text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  ord public.payment_orders%rowtype;
  adj public.payment_adjustments%rowtype;
  w public.wallets%rowtype;
  new_refunded integer;
  target_coins integer;
  reverse_now integer;
  restore_now integer;
begin
  if exists(select 1 from public.payment_events where provider='stripe' and event_id=p_event_id) then
    return jsonb_build_object('duplicate',true);
  end if;

  select * into ord from public.payment_orders
  where provider_payment_intent_id=p_payment_intent
  for update;

  insert into public.payment_events(provider,event_id,event_type,payload)
  values('stripe',p_event_id,p_event_type,jsonb_build_object(
    'refund_id',p_refund_id,'payment_intent',p_payment_intent,'order_id',ord.id
  ));

  if ord.id is null then
    return jsonb_build_object('ignored',true,'reason','order_not_found');
  end if;

  insert into public.payment_adjustments(order_id,provider,provider_object_id,kind,status,amount_cents)
  values(ord.id,'stripe',p_refund_id,'refund',p_status,greatest(0,p_amount))
  on conflict(provider,provider_object_id) do update
    set status=excluded.status,amount_cents=excluded.amount_cents,updated_at=now()
  returning * into adj;

  if p_status='succeeded' and adj.coins_reversed=0 then
    new_refunded:=least(ord.amount_cents,ord.refunded_amount_cents+greatest(0,p_amount));
    if new_refunded>=ord.amount_cents then
      target_coins:=ord.coins;
    else
      target_coins:=floor(ord.coins*(new_refunded::numeric/ord.amount_cents))::integer;
    end if;
    reverse_now:=greatest(0,target_coins-ord.coins_reversed);

    if reverse_now>0 then
      select * into w from public.autotype_wallet_reverse_coins(ord.user_id,reverse_now);
      insert into public.economy_transactions(user_id,kind,coins_delta,metadata)
      values(ord.user_id,'stripe_refund',-reverse_now,jsonb_build_object(
        'order_id',ord.id,'refund_id',p_refund_id,'amount_cents',p_amount
      ));
    else
      select * into w from public.wallets where user_id=ord.user_id;
    end if;

    update public.payment_orders
    set refunded_amount_cents=new_refunded,
        coins_reversed=target_coins,
        status=case when new_refunded>=amount_cents then 'refunded' else 'partially_refunded' end,
        last_adjusted_at=now()
    where id=ord.id
    returning * into ord;

    update public.payment_adjustments
    set coins_reversed=reverse_now,updated_at=now()
    where id=adj.id
    returning * into adj;

  elsif p_status='failed' and adj.coins_reversed>adj.coins_restored then
    restore_now:=adj.coins_reversed-adj.coins_restored;
    select * into w from public.autotype_wallet_credit_coins(ord.user_id,restore_now);

    update public.payment_orders
    set refunded_amount_cents=greatest(0,refunded_amount_cents-adj.amount_cents),
        coins_reversed=greatest(0,coins_reversed-restore_now),
        status=case
          when greatest(0,refunded_amount_cents-adj.amount_cents)=0 then 'paid'
          else 'partially_refunded'
        end,
        last_adjusted_at=now()
    where id=ord.id
    returning * into ord;

    update public.payment_adjustments
    set coins_restored=coins_reversed,updated_at=now()
    where id=adj.id
    returning * into adj;

    insert into public.economy_transactions(user_id,kind,coins_delta,metadata)
    values(ord.user_id,'stripe_refund_failed_restore',restore_now,jsonb_build_object(
      'order_id',ord.id,'refund_id',p_refund_id
    ));
  else
    select * into w from public.wallets where user_id=ord.user_id;
  end if;

  return jsonb_build_object('order',to_jsonb(ord),'adjustment',to_jsonb(adj),'wallet',to_jsonb(w));
end;
$$;
revoke execute on function public.autotype_apply_stripe_refund(text,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.autotype_apply_stripe_refund(text,text,text,text,integer,text) to service_role;

create or replace function public.autotype_apply_stripe_dispute(
  p_event_id text,p_event_type text,p_dispute_id text,p_payment_intent text,
  p_amount integer,p_status text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  ord public.payment_orders%rowtype;
  adj public.payment_adjustments%rowtype;
  w public.wallets%rowtype;
  target_coins integer;
  reverse_now integer;
  restore_now integer;
begin
  if exists(select 1 from public.payment_events where provider='stripe' and event_id=p_event_id) then
    return jsonb_build_object('duplicate',true);
  end if;

  select * into ord from public.payment_orders
  where provider_payment_intent_id=p_payment_intent
  for update;

  insert into public.payment_events(provider,event_id,event_type,payload)
  values('stripe',p_event_id,p_event_type,jsonb_build_object(
    'dispute_id',p_dispute_id,'payment_intent',p_payment_intent,'order_id',ord.id,'status',p_status
  ));

  if ord.id is null then
    return jsonb_build_object('ignored',true,'reason','order_not_found');
  end if;

  insert into public.payment_adjustments(order_id,provider,provider_object_id,kind,status,amount_cents)
  values(ord.id,'stripe',p_dispute_id,'dispute',p_status,greatest(0,p_amount))
  on conflict(provider,provider_object_id) do update
    set status=excluded.status,amount_cents=excluded.amount_cents,updated_at=now()
  returning * into adj;

  if p_status in ('warning_needs_response','warning_under_review','warning_closed') then
    select * into w from public.wallets where user_id=ord.user_id;
    return jsonb_build_object('order',to_jsonb(ord),'adjustment',to_jsonb(adj),'wallet',to_jsonb(w));
  end if;

  if p_status in ('needs_response','under_review') and adj.coins_reversed=0 then
    target_coins:=least(
      greatest(0,ord.coins-ord.coins_reversed),
      case
        when p_amount>=ord.amount_cents then greatest(0,ord.coins-ord.coins_reversed)
        else floor(ord.coins*(greatest(0,p_amount)::numeric/ord.amount_cents))::integer
      end
    );
    reverse_now:=greatest(0,target_coins);

    if reverse_now>0 then
      select * into w from public.autotype_wallet_reverse_coins(ord.user_id,reverse_now);
      insert into public.economy_transactions(user_id,kind,coins_delta,metadata)
      values(ord.user_id,'stripe_dispute_hold',-reverse_now,jsonb_build_object(
        'order_id',ord.id,'dispute_id',p_dispute_id,'amount_cents',p_amount
      ));
    else
      select * into w from public.wallets where user_id=ord.user_id;
    end if;

    update public.payment_orders
    set dispute_amount_cents=greatest(dispute_amount_cents,p_amount),
        dispute_coins_reversed=dispute_coins_reversed+reverse_now,
        status='disputed',
        last_adjusted_at=now()
    where id=ord.id
    returning * into ord;

    update public.payment_adjustments
    set coins_reversed=reverse_now,updated_at=now()
    where id=adj.id
    returning * into adj;

  elsif p_status='won' and adj.coins_reversed>adj.coins_restored then
    restore_now:=adj.coins_reversed-adj.coins_restored;
    select * into w from public.autotype_wallet_credit_coins(ord.user_id,restore_now);

    update public.payment_orders
    set dispute_coins_reversed=greatest(0,dispute_coins_reversed-restore_now),
        dispute_amount_cents=0,
        status=case
          when refunded_amount_cents>=amount_cents then 'refunded'
          when refunded_amount_cents>0 then 'partially_refunded'
          else 'dispute_won'
        end,
        last_adjusted_at=now()
    where id=ord.id
    returning * into ord;

    update public.payment_adjustments
    set coins_restored=coins_reversed,updated_at=now()
    where id=adj.id
    returning * into adj;

    insert into public.economy_transactions(user_id,kind,coins_delta,metadata)
    values(ord.user_id,'stripe_dispute_won_restore',restore_now,jsonb_build_object(
      'order_id',ord.id,'dispute_id',p_dispute_id
    ));

  elsif p_status='lost' then
    update public.payment_orders
    set status='dispute_lost',last_adjusted_at=now()
    where id=ord.id
    returning * into ord;
    select * into w from public.wallets where user_id=ord.user_id;
  else
    select * into w from public.wallets where user_id=ord.user_id;
  end if;

  return jsonb_build_object('order',to_jsonb(ord),'adjustment',to_jsonb(adj),'wallet',to_jsonb(w));
end;
$$;
revoke execute on function public.autotype_apply_stripe_dispute(text,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.autotype_apply_stripe_dispute(text,text,text,text,integer,text) to service_role;

create or replace function public.autotype_purchase_item(p_user uuid,p_item text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare item public.shop_items%rowtype; w public.wallets%rowtype; dev boolean;
begin
  select * into item from public.shop_items where id=p_item and active=true;
  if item.id is null then raise exception 'Item not found'; end if;
  if item.collection_only or item.earned_only then raise exception 'Item cannot be purchased directly'; end if;
  if exists(select 1 from public.inventory where user_id=p_user and item_id=p_item) then raise exception 'You already own this item'; end if;
  select role in ('developer','admin') into dev from public.user_roles where user_id=p_user;
  select * into w from public.wallets where user_id=p_user for update;
  if not coalesce(dev,false) and w.coin_debt>0 then raise exception 'A refunded Coin balance is still being reconciled'; end if;
  if not coalesce(dev,false) and w.coins<item.price then raise exception 'Not enough coins'; end if;
  update public.wallets set coins=coins-(case when coalesce(dev,false) then 0 else item.price end),updated_at=now()
  where user_id=p_user returning * into w;
  insert into public.inventory(user_id,item_id,source) values(p_user,p_item,'shop');
  insert into public.economy_transactions(user_id,kind,coins_delta,item_id)
  values(p_user,'shop_purchase',-(case when coalesce(dev,false) then 0 else item.price end),p_item);
  return jsonb_build_object('wallet',to_jsonb(w),'item_id',p_item,'price_paid',(case when coalesce(dev,false) then 0 else item.price end));
end;
$$;

create or replace function public.autotype_purchase_collection(p_user uuid,p_collection text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare coll public.shop_collections%rowtype; w public.wallets%rowtype; total_count int; missing_count int; price_paid int; dev boolean;
begin
  select * into coll from public.shop_collections where id=p_collection and active=true;
  if coll.id is null then raise exception 'Collection not found'; end if;
  select count(*) into total_count from public.shop_collection_items where collection_id=p_collection;
  select count(*) into missing_count from public.shop_collection_items ci
    where ci.collection_id=p_collection and not exists(select 1 from public.inventory i where i.user_id=p_user and i.item_id=ci.item_id);
  if missing_count=0 then raise exception 'You already own this collection'; end if;
  price_paid:=greatest(1,round(coll.price*(missing_count::numeric/total_count))::int);
  select role in ('developer','admin') into dev from public.user_roles where user_id=p_user;
  select * into w from public.wallets where user_id=p_user for update;
  if not coalesce(dev,false) and w.coin_debt>0 then raise exception 'A refunded Coin balance is still being reconciled'; end if;
  if not coalesce(dev,false) and w.coins<price_paid then raise exception 'Not enough coins'; end if;
  if coalesce(dev,false) then price_paid:=0; end if;
  update public.wallets set coins=coins-price_paid,updated_at=now() where user_id=p_user returning * into w;
  insert into public.inventory(user_id,item_id,source)
  select p_user,ci.item_id,'collection' from public.shop_collection_items ci
  where ci.collection_id=p_collection
  on conflict do nothing;
  insert into public.economy_transactions(user_id,kind,coins_delta,metadata)
  values(p_user,'collection_purchase',-price_paid,jsonb_build_object('collection_id',p_collection));
  return jsonb_build_object('wallet',to_jsonb(w),'collection_id',p_collection,'price_paid',price_paid);
end;
$$;

create or replace function public.autotype_record_round(
  p_user uuid,p_round uuid,p_mode text,p_score bigint,p_words integer,p_erased integer,
  p_max_streak integer,p_total_keys integer,p_errors integer,p_duration_ms integer,p_one_clue boolean
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  s public.player_stats%rowtype;
  new_rounds bigint;
  new_words bigint;
  reward_coins bigint := 20;
  reward_tickets bigint := 0;
  unlocked text[] := array[]::text[];
  ach text;
  inserted_count integer;
  w public.wallets%rowtype;
begin
  if p_user is null or p_round is null then raise exception 'Missing user or round id'; end if;
  if p_mode not in ('classic','context','sentence','evil','daily','custom','race') then raise exception 'Invalid mode'; end if;
  if p_score<0 or p_score>1000000 or p_words<0 or p_words>200 or p_erased<0 or p_erased>20000
     or p_max_streak<0 or p_max_streak>200 or p_total_keys<0 or p_total_keys>20000
     or p_errors<0 or p_errors>5000 or p_duration_ms<250 or p_duration_ms>7200000 then
    raise exception 'Invalid round metrics';
  end if;

  if exists(select 1 from public.round_results where id=p_round and user_id=p_user) then
    select * into s from public.player_stats where user_id=p_user;
    select * into w from public.wallets where user_id=p_user;
    return jsonb_build_object('duplicate',true,'stats',to_jsonb(s),'wallet',to_jsonb(w),'coins_earned',0,'tickets_earned',0,'new_achievements','[]'::jsonb);
  end if;

  insert into public.round_results(id,user_id,mode,score,words,erased,max_streak,total_keys,errors,duration_ms,one_clue_finish)
  values(p_round,p_user,p_mode,p_score,p_words,p_erased,p_max_streak,p_total_keys,p_errors,p_duration_ms,p_one_clue);

  select * into s from public.player_stats where user_id=p_user for update;
  new_rounds:=s.rounds+1;
  new_words:=s.words+p_words;

  update public.player_stats set
    rounds=new_rounds,words=new_words,erased=s.erased+p_erased,
    best_score=greatest(s.best_score,p_score),best_streak=greatest(s.best_streak,p_max_streak),
    fastest_seconds=case when s.fastest_seconds is null then p_duration_ms/1000.0 else least(s.fastest_seconds,p_duration_ms/1000.0) end,
    best_erased_round=greatest(s.best_erased_round,p_erased),
    mind_reader_count=s.mind_reader_count+(case when p_one_clue then 1 else 0 end),
    perfect_rounds=s.perfect_rounds+(case when p_errors=0 then 1 else 0 end),
    total_keys=s.total_keys+p_total_keys,total_errors=s.total_errors+p_errors,total_score=s.total_score+p_score,
    updated_at=now()
  where user_id=p_user returning * into s;

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
      get diagnostics inserted_count = row_count;
      if inserted_count>0 then
        unlocked:=array_append(unlocked,ach);
        reward_coins:=reward_coins+75;
      end if;
    end if;
  end loop;

  if 'mindReader'=any(unlocked) then
    insert into public.inventory(user_id,item_id,source)
    values(p_user,'title_mindreader','achievement') on conflict do nothing;
  end if;

  select * into w from public.autotype_wallet_credit_coins(p_user,reward_coins);
  update public.wallets set tournament_tickets=tournament_tickets+reward_tickets,updated_at=now()
  where user_id=p_user returning * into w;

  insert into public.economy_transactions(user_id,kind,coins_delta,tickets_delta,metadata)
  values(p_user,'round_reward',reward_coins,reward_tickets,jsonb_build_object('round_id',p_round,'mode',p_mode));

  return jsonb_build_object(
    'duplicate',false,'stats',to_jsonb(s),'wallet',to_jsonb(w),
    'coins_earned',reward_coins,'tickets_earned',reward_tickets,'new_achievements',to_jsonb(unlocked)
  );
end;
$$;

create or replace function public.autotype_claim_daily_first(p_user uuid,p_day date)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare top_score bigint; mine bigint; w public.wallets%rowtype;
begin
  select max(score) into top_score from public.round_results where mode='daily' and created_at::date=p_day;
  select max(score) into mine from public.round_results where mode='daily' and user_id=p_user and created_at::date=p_day;
  if coalesce(mine,0)<=0 or mine is distinct from top_score then raise exception 'You are not currently #1 for that Daily Challenge'; end if;
  insert into public.daily_reward_claims(user_id,day) values(p_user,p_day) on conflict do nothing;
  if not found then raise exception 'Daily #1 reward already claimed'; end if;
  select * into w from public.autotype_wallet_credit_coins(p_user,150);
  insert into public.economy_transactions(user_id,kind,coins_delta,metadata)
  values(p_user,'daily_first_reward',150,jsonb_build_object('day',p_day));
  return jsonb_build_object('wallet',to_jsonb(w),'reward',150);
end;
$$;

create or replace function public.autotype_award_tournament(p_actor uuid,p_tournament text,p_winner uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare role_name text; t public.tournaments%rowtype; w public.wallets%rowtype;
begin
  select role into role_name from public.user_roles where user_id=p_actor;
  if role_name not in ('developer','admin') then raise exception 'Developer access required'; end if;
  select * into t from public.tournaments where slug=p_tournament or id::text=p_tournament limit 1 for update;
  if t.id is null then raise exception 'Tournament not found'; end if;
  if t.winner_id is not null then raise exception 'Winner already awarded'; end if;
  if not exists(select 1 from public.tournament_entries where tournament_id=t.id and user_id=p_winner and status not in ('withdrawn','disqualified')) then
    raise exception 'Winner must be an entrant';
  end if;
  select * into w from public.autotype_wallet_credit_coins(p_winner,t.reward_coins);
  update public.wallets set crate_tokens=crate_tokens+t.reward_crate_tokens,updated_at=now()
  where user_id=p_winner returning * into w;
  update public.player_stats set tournament_wins=tournament_wins+1,updated_at=now() where user_id=p_winner;
  update public.profiles set last_tournament_title=t.reward_title where id=p_winner;
  update public.tournament_entries set status=case when user_id=p_winner then 'winner' else status end where tournament_id=t.id;
  update public.tournaments set winner_id=p_winner,status='closed',updated_at=now() where id=t.id;
  insert into public.economy_transactions(user_id,kind,coins_delta,crate_tokens_delta,metadata)
  values(p_winner,'tournament_prize',t.reward_coins,t.reward_crate_tokens,jsonb_build_object('tournament',coalesce(t.slug,t.id::text),'title',t.reward_title));
  insert into public.admin_audit_log(actor_id,action,target_type,target_id,details)
  values(p_actor,'award_tournament','profile',p_winner::text,jsonb_build_object('tournament',coalesce(t.slug,t.id::text)));
  return jsonb_build_object('wallet',to_jsonb(w),'reward_title',t.reward_title);
end;
$$;

create or replace function public.autotype_open_crate(p_user uuid,p_crate text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare cr public.crate_definitions%rowtype; w public.wallets%rowtype; roll numeric; rarity text; chosen text; chosen_rarity text; dup boolean; comp int:=0;
begin
  select * into cr from public.crate_definitions where id=p_crate and active=true;
  if cr.id is null then raise exception 'Crate not found'; end if;
  select * into w from public.wallets where user_id=p_user for update;
  if w.crate_tokens<cr.key_cost then raise exception 'You need an earned Crate Token'; end if;
  roll:=random()*100;
  if roll < coalesce((cr.odds->>'Common')::numeric,0) then rarity:='Common';
  elsif roll < coalesce((cr.odds->>'Common')::numeric,0)+coalesce((cr.odds->>'Uncommon')::numeric,0) then rarity:='Uncommon';
  elsif roll < coalesce((cr.odds->>'Common')::numeric,0)+coalesce((cr.odds->>'Uncommon')::numeric,0)+coalesce((cr.odds->>'Rare')::numeric,0) then rarity:='Rare';
  elsif roll < 100-coalesce((cr.odds->>'Legendary')::numeric,0) then rarity:='Epic';
  else rarity:='Legendary'; end if;

  select si.id,si.rarity into chosen,chosen_rarity
  from public.shop_items si
  where si.active=true and si.price>0 and not si.collection_only and not si.earned_only
    and si.category=any(cr.categories) and si.rarity=rarity
  order by (exists(select 1 from public.inventory i where i.user_id=p_user and i.item_id=si.id)) asc, random()
  limit 1;

  if chosen is null then
    select si.id,si.rarity into chosen,chosen_rarity
    from public.shop_items si
    where si.active=true and si.price>0 and not si.collection_only and not si.earned_only
      and si.category=any(cr.categories)
    order by random() limit 1;
  end if;
  if chosen is null then raise exception 'No crate rewards available'; end if;

  dup:=exists(select 1 from public.inventory where user_id=p_user and item_id=chosen);
  if dup then
    comp:=case chosen_rarity when 'Common' then 60 when 'Uncommon' then 90 when 'Rare' then 140 when 'Epic' then 240 when 'Legendary' then 425 else 60 end;
  else
    insert into public.inventory(user_id,item_id,source) values(p_user,chosen,'crate');
  end if;

  update public.wallets set crate_tokens=crate_tokens-cr.key_cost,updated_at=now()
  where user_id=p_user returning * into w;
  if comp>0 then
    select * into w from public.autotype_wallet_credit_coins(p_user,comp);
  end if;

  insert into public.economy_transactions(user_id,kind,coins_delta,crate_tokens_delta,item_id,metadata)
  values(p_user,'crate_open',comp,-cr.key_cost,chosen,jsonb_build_object('crate_id',p_crate,'duplicate',dup,'rarity',chosen_rarity));

  return jsonb_build_object('wallet',to_jsonb(w),'item_id',chosen,'rarity',chosen_rarity,'duplicate',dup,'compensation',comp);
end;
$$;

-- Re-apply service-role-only execution after replacing functions.
revoke execute on function public.autotype_purchase_item(uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_purchase_item(uuid,text) to service_role;
revoke execute on function public.autotype_purchase_collection(uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_purchase_collection(uuid,text) to service_role;
revoke execute on function public.autotype_record_round(uuid,uuid,text,bigint,integer,integer,integer,integer,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.autotype_record_round(uuid,uuid,text,bigint,integer,integer,integer,integer,integer,integer,boolean) to service_role;
revoke execute on function public.autotype_claim_daily_first(uuid,date) from public,anon,authenticated;
grant execute on function public.autotype_claim_daily_first(uuid,date) to service_role;
revoke execute on function public.autotype_award_tournament(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.autotype_award_tournament(uuid,text,uuid) to service_role;
revoke execute on function public.autotype_open_crate(uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_open_crate(uuid,text) to service_role;
