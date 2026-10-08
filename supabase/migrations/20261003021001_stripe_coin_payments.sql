-- AutoType Stripe coin-pack payments.
create table if not exists public.coin_packs (
  id text primary key,
  name text not null,
  coins integer not null check (coins > 0),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  active boolean not null default true,
  sort_order integer not null default 0
);
alter table public.coin_packs enable row level security;
drop policy if exists "coin packs readable" on public.coin_packs;
create policy "coin packs readable" on public.coin_packs for select using(active=true);
grant select on public.coin_packs to anon,authenticated;
grant select,insert,update,delete on public.coin_packs to service_role;

insert into public.coin_packs(id,name,coins,amount_cents,currency,active,sort_order)
values
('coins_500','500 Coins',500,99,'usd',true,1),
('coins_1800','1,800 Coins',1800,299,'usd',true,2),
('coins_3500','3,500 Coins',3500,499,'usd',true,3)
on conflict(id) do update set
  name=excluded.name,coins=excluded.coins,amount_cents=excluded.amount_cents,
  currency=excluded.currency,active=excluded.active,sort_order=excluded.sort_order;

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'stripe',
  pack_id text not null references public.coin_packs(id),
  coins integer not null check(coins > 0),
  amount_cents integer not null check(amount_cents > 0),
  currency text not null,
  status text not null default 'pending' check(status in ('pending','paid','failed','cancelled','refunded')),
  provider_session_id text unique,
  provider_payment_intent_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists payment_orders_user_id_idx on public.payment_orders(user_id);
alter table public.payment_orders enable row level security;
drop policy if exists "payment orders readable by owner" on public.payment_orders;
create policy "payment orders readable by owner"
on public.payment_orders for select
using((select auth.uid())=user_id);
grant select on public.payment_orders to authenticated;
grant select,insert,update,delete on public.payment_orders to service_role;

create table if not exists public.payment_events (
  provider text not null default 'stripe',
  event_id text not null,
  event_type text not null,
  processed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  primary key(provider,event_id)
);
alter table public.payment_events enable row level security;
drop policy if exists "payment events client deny" on public.payment_events;
create policy "payment events client deny"
on public.payment_events for all to anon,authenticated
using(false) with check(false);
grant select,insert,update,delete on public.payment_events to service_role;

create or replace function public.autotype_create_payment_order(
  p_user uuid,
  p_pack text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare pack public.coin_packs%rowtype; ord public.payment_orders%rowtype;
begin
  select * into pack from public.coin_packs where id=p_pack and active=true;
  if pack.id is null then raise exception 'Coin pack not found'; end if;

  insert into public.payment_orders(user_id,pack_id,coins,amount_cents,currency,status)
  values(p_user,pack.id,pack.coins,pack.amount_cents,pack.currency,'pending')
  returning * into ord;

  return jsonb_build_object(
    'order_id',ord.id,
    'pack_id',pack.id,
    'name',pack.name,
    'coins',pack.coins,
    'amount_cents',pack.amount_cents,
    'currency',pack.currency
  );
end;
$$;
revoke execute on function public.autotype_create_payment_order(uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_create_payment_order(uuid,text) to service_role;

create or replace function public.autotype_attach_checkout_session(
  p_order uuid,
  p_user uuid,
  p_session text
) returns boolean
language plpgsql security definer set search_path=public
as $$
begin
  update public.payment_orders
  set provider_session_id=p_session
  where id=p_order and user_id=p_user and status='pending' and provider_session_id is null;
  if not found then raise exception 'Payment order not found'; end if;
  return true;
end;
$$;
revoke execute on function public.autotype_attach_checkout_session(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_attach_checkout_session(uuid,uuid,text) to service_role;

create or replace function public.autotype_credit_coin_purchase(
  p_event_id text,
  p_event_type text,
  p_user uuid,
  p_session text,
  p_payment_intent text,
  p_pack text,
  p_amount_total integer,
  p_currency text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare pack public.coin_packs%rowtype; ord public.payment_orders%rowtype; w public.wallets%rowtype;
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

  if ord.status='paid' then
    return jsonb_build_object('duplicate',true,'order',to_jsonb(ord));
  end if;

  update public.payment_orders set
    status='paid',
    provider_payment_intent_id=p_payment_intent,
    completed_at=now()
  where id=ord.id
  returning * into ord;

  update public.wallets
  set coins=coins+pack.coins,updated_at=now()
  where user_id=p_user
  returning * into w;

  insert into public.economy_transactions(user_id,kind,coins_delta,metadata)
  values(
    p_user,'stripe_coin_purchase',pack.coins,
    jsonb_build_object('pack_id',pack.id,'session_id',p_session,'order_id',ord.id,'amount_cents',p_amount_total,'currency',p_currency)
  );

  return jsonb_build_object('duplicate',false,'order',to_jsonb(ord),'wallet',to_jsonb(w),'coins_added',pack.coins);
end;
$$;
revoke execute on function public.autotype_credit_coin_purchase(text,text,uuid,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.autotype_credit_coin_purchase(text,text,uuid,text,text,text,integer,text) to service_role;
