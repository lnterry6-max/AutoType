-- Durable test-only inbox. Existing orders, events, balances and history stay intact.
create table public.stripe_event_inbox(
 event_id text primary key,event_type text not null,kind text not null check(kind in ('credit','refund','dispute','expired')),
 payment_intent text,payload jsonb not null,livemode boolean not null check(livemode=false),
 state text not null default 'received' check(state in ('received','pending','applied')),
 received_at timestamptz not null default now(),applied_at timestamptz,
 attempts integer not null default 0,last_error text
);
alter table public.stripe_event_inbox enable row level security;
revoke all on public.stripe_event_inbox from public,anon,authenticated;
grant select,insert,update on public.stripe_event_inbox to service_role;
create index stripe_event_pending_intent_idx on public.stripe_event_inbox(payment_intent,received_at) where state<>'applied';
-- Fail closed on conflicting historical bindings; review these in preflight.
create unique index payment_orders_unique_intent on public.payment_orders(provider_payment_intent_id)
 where provider_payment_intent_id is not null and provider_payment_intent_id<>'';

create function public.autotype_apply_stripe_inbox(p_event text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.stripe_event_inbox%rowtype; ord public.payment_orders%rowtype;
 adj public.payment_adjustments%rowtype; w public.wallets%rowtype;
 refunded integer; refund_coins integer; dispute_coins integer; desired integer; delta integer;
 amount integer; object_id text; object_status text; affected integer;
begin
 select * into e from public.stripe_event_inbox where event_id=p_event for update;
 if e.event_id is null then raise exception 'Stripe event not found'; end if;
 if e.state='applied' then return jsonb_build_object('state','already_processed','duplicate',true); end if;
 update public.stripe_event_inbox set attempts=attempts+1,last_error=null where event_id=p_event;
 if e.kind in ('credit','expired') then
  select * into ord from public.payment_orders where provider_session_id=e.payload->>'session'
    or (nullif(e.payload->>'order_id','') is not null and id=(e.payload->>'order_id')::uuid) for update;
 else
  select * into ord from public.payment_orders where provider_payment_intent_id=e.payment_intent for update;
 end if;
 if ord.id is null or (e.kind in ('refund','dispute') and ord.completed_at is null and ord.status not in ('paid','partially_refunded','refunded','disputed','dispute_won','dispute_lost')) then
  update public.stripe_event_inbox set state='pending' where event_id=p_event;
  return jsonb_build_object('state','pending','received',true,'reason','order_not_linked_or_credited');
 end if;
 if e.kind='credit' then
  if ord.user_id is distinct from (e.payload->>'user_id')::uuid or ord.pack_id is distinct from e.payload->>'pack_id'
     or ord.amount_cents is distinct from (e.payload->>'amount')::integer or lower(ord.currency) is distinct from lower(e.payload->>'currency')
     or (ord.provider_session_id is not null and ord.provider_session_id<>e.payload->>'session')
     or (ord.provider_payment_intent_id is not null and ord.provider_payment_intent_id<>e.payment_intent) then
   raise exception 'Checkout does not match the original order';
  end if;
  if ord.completed_at is null and ord.status not in ('paid','partially_refunded','refunded','disputed','dispute_won','dispute_lost') then
   update public.payment_orders set status='paid',provider_session_id=e.payload->>'session',
    provider_payment_intent_id=e.payment_intent,completed_at=now() where id=ord.id returning * into ord;
   select * into w from public.autotype_wallet_credit_coins(ord.user_id,ord.coins::bigint);
   insert into public.economy_transactions(user_id,kind,coins_delta,metadata)
    values(ord.user_id,'stripe_coin_purchase',ord.coins,jsonb_build_object('order_id',ord.id,'session_id',ord.provider_session_id,'event_id',p_event));
  end if;
 elsif e.kind='expired' then
  update public.payment_orders set status='cancelled' where id=ord.id and status='pending';
 else
  object_id:=e.payload->>'object_id';object_status:=e.payload->>'status';amount:=(e.payload->>'amount')::integer;
  if amount is null or amount<0 or amount>ord.amount_cents or nullif(object_id,'') is null or object_status is null then
   raise exception 'Invalid Stripe adjustment';
  end if;
  if (e.kind='refund' and object_status not in ('pending','requires_action','succeeded','failed','canceled')) or
     (e.kind='dispute' and object_status not in ('warning_needs_response','warning_under_review','warning_closed','needs_response','under_review','won','lost')) then
   raise exception 'Unsupported Stripe adjustment status';
  end if;
  select * into adj from public.payment_adjustments where provider='stripe' and provider_object_id=object_id for update;
  if adj.id is not null and (adj.order_id<>ord.id or adj.kind<>e.kind or adj.amount_cents<>amount) then
   raise exception 'Stripe adjustment is bound to a different order or amount';
  end if;
  -- Hydrated objects are canonical. Also reject regression from terminal states
  -- when overlapping deliveries fetched an older snapshot before the row lock.
  if adj.id is null or not ((e.kind='refund' and adj.status in ('succeeded','failed','canceled') and object_status in ('pending','requires_action'))
     or (e.kind='dispute' and adj.status in ('won','lost','warning_closed') and object_status not in ('won','lost','warning_closed'))) then
   insert into public.payment_adjustments(order_id,provider,provider_object_id,kind,status,amount_cents,metadata)
    values(ord.id,'stripe',object_id,e.kind,object_status,amount,jsonb_build_object('event_id',p_event))
    on conflict(provider,provider_object_id) do update set status=excluded.status,metadata=payment_adjustments.metadata||excluded.metadata,updated_at=now();
  end if;
  -- Recompute from unique objects, not event counts. Zero-coin partial refunds
  -- cannot be counted twice. Refunds plus dispute holds never exceed this pack.
  select least(ord.amount_cents,coalesce(sum(amount_cents),0))::integer into refunded from public.payment_adjustments
   where order_id=ord.id and kind='refund' and status='succeeded';
  refund_coins:=floor(ord.coins*refunded::numeric/ord.amount_cents)::integer;
  select least(ord.coins-refund_coins,coalesce(sum(floor(ord.coins*amount_cents::numeric/ord.amount_cents)),0))::integer into dispute_coins
   from public.payment_adjustments where order_id=ord.id and kind='dispute' and status in ('needs_response','under_review','lost');
  desired:=refund_coins+dispute_coins;
  delta:=desired-ord.coins_reversed-ord.dispute_coins_reversed;
  if delta>0 then select * into w from public.autotype_wallet_reverse_coins(ord.user_id,delta::bigint);
  elsif delta<0 then select * into w from public.autotype_wallet_credit_coins(ord.user_id,(-delta)::bigint);
  end if;
  if delta<>0 then
   insert into public.economy_transactions(user_id,kind,coins_delta,metadata)
    values(ord.user_id,'stripe_adjustment_reconcile',-delta,jsonb_build_object('order_id',ord.id,'object_id',object_id,'event_id',p_event,'kind',e.kind));
  end if;
  update public.payment_orders set refunded_amount_cents=refunded,coins_reversed=refund_coins,
   dispute_coins_reversed=dispute_coins,dispute_amount_cents=coalesce((select sum(amount_cents) from public.payment_adjustments where order_id=ord.id and kind='dispute' and status in ('needs_response','under_review','lost')),0),
   status=case
    when exists(select 1 from public.payment_adjustments where order_id=ord.id and kind='dispute' and status='lost') then 'dispute_lost'
    when exists(select 1 from public.payment_adjustments where order_id=ord.id and kind='dispute' and status in ('needs_response','under_review')) then 'disputed'
    when refunded>=ord.amount_cents then 'refunded' when refunded>0 then 'partially_refunded'
    when exists(select 1 from public.payment_adjustments where order_id=ord.id and kind='dispute' and status='won') then 'dispute_won' else 'paid' end,
   last_adjusted_at=now() where id=ord.id returning * into ord;
  -- Retain previous per-object history counters; append reconciliation deltas
  -- rather than pretending an overlapping hold belongs entirely to one object.
  update public.payment_adjustments set coins_reversed=coins_reversed+greatest(delta,0),coins_restored=coins_restored+greatest(-delta,0)
   where provider='stripe' and provider_object_id=object_id;
  get diagnostics affected=row_count;if affected<>1 then raise exception 'Adjustment could not save'; end if;
 end if;
 insert into public.payment_events(provider,event_id,event_type,payload) values('stripe',e.event_id,e.event_type,e.payload||jsonb_build_object('order_id',ord.id)) on conflict do nothing;
 update public.stripe_event_inbox set state='applied',applied_at=now(),last_error=null where event_id=p_event;
 return jsonb_build_object('state','applied','received',true,'order',to_jsonb(ord));
end; $$;
revoke all on function public.autotype_apply_stripe_inbox(text) from public,anon,authenticated;
-- Intentionally no client/service grant: this is called by the owning RPC only.

create function public.autotype_reconcile_stripe_events(p_payment_intent text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e record; result jsonb; results jsonb:='[]';
begin
 if nullif(p_payment_intent,'') is null then raise exception 'Missing PaymentIntent'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_payment_intent,12503));
 -- Credit first regardless of arrival order, then apply retained adjustments.
 for e in select event_id from public.stripe_event_inbox where payment_intent=p_payment_intent and state<>'applied'
  order by case when kind='credit' then 0 else 1 end,received_at,event_id loop
  begin
   result:=public.autotype_apply_stripe_inbox(e.event_id);
  exception when others then
   update public.stripe_event_inbox set state='pending',attempts=attempts+1,last_error=sqlerrm where event_id=e.event_id;
   result:=jsonb_build_object('state','pending','error',sqlerrm);
  end;
  results:=results||jsonb_build_array(result||jsonb_build_object('event_id',e.event_id));
 end loop;
 return results;
end; $$;
revoke all on function public.autotype_reconcile_stripe_events(text) from public,anon,authenticated;
grant execute on function public.autotype_reconcile_stripe_events(text) to service_role;

create function public.autotype_receive_stripe_event(p_event_id text,p_event_type text,p_kind text,p_payload jsonb,p_livemode boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.stripe_event_inbox%rowtype; intent text; reconciled jsonb; result jsonb;
begin
 if p_livemode is distinct from false then raise exception 'Live payments are disabled during beta'; end if;
 if nullif(p_event_id,'') is null or nullif(p_event_type,'') is null or p_kind is null or p_kind not in ('credit','refund','dispute','expired') or p_payload is null then raise exception 'Invalid Stripe event'; end if;
 intent:=nullif(p_payload->>'payment_intent','');
 if p_kind<>'expired' and intent is null then raise exception 'Missing PaymentIntent'; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(intent,p_payload->>'session'),12503));
 insert into public.stripe_event_inbox(event_id,event_type,kind,payment_intent,payload,livemode)
  values(p_event_id,p_event_type,p_kind,intent,p_payload,false) on conflict do nothing;
 select * into old from public.stripe_event_inbox where event_id=p_event_id for update;
 -- Canonical object status can change between retries. Event identity and order
 -- bindings must not change; an applied event is already processed.
 if old.kind<>p_kind or old.event_type<>p_event_type or old.payment_intent is distinct from intent or
    old.payload-'status'-'order_id' is distinct from p_payload-'status'-'order_id' or
    (nullif(old.payload->>'order_id','') is not null and nullif(p_payload->>'order_id','') is not null and old.payload->>'order_id'<>p_payload->>'order_id') then raise exception 'Stripe event identity mismatch'; end if;
 if old.state='applied' then
  -- A previous credit may have committed while a pending adjustment failed.
  -- Its delivery retry must still drain that adjustment, never re-credit.
  if p_kind='credit' then reconciled:=public.autotype_reconcile_stripe_events(intent); end if;
  return jsonb_build_object('received',true,'state','already_processed','duplicate',true,'reconciled',reconciled);
 end if;
 update public.stripe_event_inbox set payload=p_payload where event_id=p_event_id;
 if intent is not null then reconciled:=public.autotype_reconcile_stripe_events(intent);
 else
  begin result:=public.autotype_apply_stripe_inbox(p_event_id);
  exception when others then
   update public.stripe_event_inbox set state='pending',attempts=attempts+1,last_error=sqlerrm where event_id=p_event_id;
  end;
 end if;
 select * into old from public.stripe_event_inbox where event_id=p_event_id;
 return jsonb_build_object('received',true,'state',old.state,'error',old.last_error,'reconciled',reconciled);
end; $$;
revoke all on function public.autotype_receive_stripe_event(text,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.autotype_receive_stripe_event(text,text,text,jsonb,boolean) to service_role;

-- Compatible restricted wrappers for old deployed gateways during rollout.
create or replace function public.autotype_credit_coin_purchase(p_event_id text,p_event_type text,p_user uuid,p_session text,p_payment_intent text,p_pack text,p_amount_total integer,p_currency text)
returns jsonb language sql security definer set search_path='' as $$
 select public.autotype_receive_stripe_event(p_event_id,p_event_type,'credit',jsonb_build_object('user_id',p_user,'session',p_session,'payment_intent',p_payment_intent,'pack_id',p_pack,'amount',p_amount_total,'currency',p_currency),false); $$;
create or replace function public.autotype_apply_stripe_refund(p_event_id text,p_event_type text,p_refund_id text,p_payment_intent text,p_amount integer,p_status text)
returns jsonb language sql security definer set search_path='' as $$
 select public.autotype_receive_stripe_event(p_event_id,p_event_type,'refund',jsonb_build_object('object_id',p_refund_id,'payment_intent',p_payment_intent,'amount',p_amount,'status',p_status),false); $$;
create or replace function public.autotype_apply_stripe_dispute(p_event_id text,p_event_type text,p_dispute_id text,p_payment_intent text,p_amount integer,p_status text)
returns jsonb language sql security definer set search_path='' as $$
 select public.autotype_receive_stripe_event(p_event_id,p_event_type,'dispute',jsonb_build_object('object_id',p_dispute_id,'payment_intent',p_payment_intent,'amount',p_amount,'status',p_status),false); $$;

create or replace function public.autotype_attach_checkout_session(p_order uuid,p_user uuid,p_session text)
returns boolean language plpgsql security definer set search_path='' as $$
declare ord public.payment_orders%rowtype; pending_intent text;
begin
 if nullif(p_session,'') is null then raise exception 'Missing session'; end if;
 -- Match the ingress lock order: intent(s), then order. This supports older
 -- gateways whose credit event had only a session binding.
 for pending_intent in select distinct payment_intent from public.stripe_event_inbox
  where payload->>'session'=p_session and state<>'applied' and payment_intent is not null order by payment_intent loop
  perform pg_advisory_xact_lock(hashtextextended(pending_intent,12503));
 end loop;
 select * into ord from public.payment_orders where id=p_order and user_id=p_user for update;
 if ord.id is null then raise exception 'Payment order not found'; end if;
 if ord.provider_session_id=p_session then return true; end if;
 if ord.provider_session_id is not null or ord.status<>'pending' then raise exception 'Order already bound or finalized'; end if;
 update public.payment_orders set provider_session_id=p_session where id=p_order;
 if not found then raise exception 'Session could not attach'; end if;
 for pending_intent in select distinct payment_intent from public.stripe_event_inbox
  where payload->>'session'=p_session and state<>'applied' and payment_intent is not null order by payment_intent loop
  perform public.autotype_reconcile_stripe_events(pending_intent);
 end loop;
 return true;
end; $$;
notify pgrst,'reload schema';
