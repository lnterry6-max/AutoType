-- Enforce the same Eastern-time shop choices as shop-rotation.js.
create or replace function public.autotype_shop_today_item_ids(p_day date)
returns setof text language sql stable security invoker set search_path to 'public'
as $offers$
  with slots(slot_name, slot_order) as (
    values ('title',0),('banner',1),('frame',2),('trail',3),('arena',4),('fx',5)
  ),
  eligible as (
    select si.id,
      case when si.slot in ('cursor','predictor','result') then 'fx' else si.slot end as slot_name
    from public.shop_items si
    where si.active=true and si.price>0 and not si.collection_only and not si.earned_only
  ),
  ranked as (
    select id,slot_name,
      row_number() over(partition by slot_name order by id collate "C")-1 as zero_index,
      count(*) over(partition by slot_name) as pool_size
    from eligible
  )
  select ranked.id from slots
  join ranked on ranked.slot_name=slots.slot_name
   and ranked.zero_index=mod(((p_day-date '1970-01-01')+slots.slot_order*7)::bigint,ranked.pool_size)
  order by slots.slot_order;
$offers$;

create or replace function public.autotype_shop_today_collection_id(p_day date)
returns text language sql stable security invoker set search_path to 'public'
as $offers$
  with ranked as (
    select c.id,
      row_number() over(order by c.id collate "C")-1 as zero_index,
      count(*) over() as pool_size
    from public.shop_collections c
    where c.active=true and exists(select 1 from public.shop_collection_items ci where ci.collection_id=c.id)
  )
  select id from ranked
  where zero_index=mod((p_day-date '1970-01-01')::bigint,pool_size)
  limit 1;
$offers$;

revoke all on function public.autotype_shop_today_item_ids(date) from public,anon,authenticated;
revoke all on function public.autotype_shop_today_collection_id(date) from public,anon,authenticated;
grant execute on function public.autotype_shop_today_item_ids(date) to service_role;
grant execute on function public.autotype_shop_today_collection_id(date) to service_role;

CREATE OR REPLACE FUNCTION public.autotype_purchase_item(p_user uuid, p_item text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare item public.shop_items%rowtype; w public.wallets%rowtype; dev boolean;
begin
  select * into item from public.shop_items where id=p_item and active=true;
  if item.id is null then raise exception 'Item not found'; end if;
  if item.collection_only or item.earned_only then raise exception 'Item cannot be purchased directly'; end if;
  if not exists(select 1 from public.autotype_shop_today_item_ids((now() at time zone 'America/New_York')::date) offer where offer=p_item)
    then raise exception 'This cosmetic is not in today''s Eastern-time shop'; end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.autotype_purchase_collection(p_user uuid, p_collection text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare coll public.shop_collections%rowtype; w public.wallets%rowtype; total_count int; missing_count int; price_paid int; dev boolean;
begin
  select * into coll from public.shop_collections where id=p_collection and active=true;
  if coll.id is null then raise exception 'Collection not found'; end if;
  if p_collection is distinct from public.autotype_shop_today_collection_id((now() at time zone 'America/New_York')::date)
    then raise exception 'This collection is not in today''s Eastern-time shop'; end if;
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
$function$;
