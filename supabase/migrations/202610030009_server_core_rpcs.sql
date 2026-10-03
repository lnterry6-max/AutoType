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
    rounds=new_rounds,
    words=new_words,
    erased=s.erased+p_erased,
    best_score=greatest(s.best_score,p_score),
    best_streak=greatest(s.best_streak,p_max_streak),
    fastest_seconds=case when s.fastest_seconds is null then p_duration_ms/1000.0 else least(s.fastest_seconds,p_duration_ms/1000.0) end,
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

  update public.wallets set
    coins=coins+reward_coins,
    tournament_tickets=tournament_tickets+reward_tickets,
    updated_at=now()
  where user_id=p_user
  returning * into w;

  insert into public.economy_transactions(user_id,kind,coins_delta,tickets_delta,metadata)
  values(p_user,'round_reward',reward_coins,reward_tickets,jsonb_build_object('round_id',p_round,'mode',p_mode));

  return jsonb_build_object(
    'duplicate',false,'stats',to_jsonb(s),'wallet',to_jsonb(w),
    'coins_earned',reward_coins,'tickets_earned',reward_tickets,
    'new_achievements',to_jsonb(unlocked)
  );
end;
$$;
revoke execute on function public.autotype_record_round(uuid,uuid,text,bigint,integer,integer,integer,integer,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.autotype_record_round(uuid,uuid,text,bigint,integer,integer,integer,integer,integer,integer,boolean) to service_role;

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
  if not coalesce(dev,false) and w.coins<item.price then raise exception 'Not enough coins'; end if;
  update public.wallets set coins=coins-(case when coalesce(dev,false) then 0 else item.price end),updated_at=now()
  where user_id=p_user returning * into w;
  insert into public.inventory(user_id,item_id,source) values(p_user,p_item,'shop');
  insert into public.economy_transactions(user_id,kind,coins_delta,item_id)
  values(p_user,'shop_purchase',-(case when coalesce(dev,false) then 0 else item.price end),p_item);
  return jsonb_build_object('wallet',to_jsonb(w),'item_id',p_item,'price_paid',(case when coalesce(dev,false) then 0 else item.price end));
end;
$$;
revoke execute on function public.autotype_purchase_item(uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_purchase_item(uuid,text) to service_role;

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
revoke execute on function public.autotype_purchase_collection(uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_purchase_collection(uuid,text) to service_role;

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

  update public.wallets set
    crate_tokens=crate_tokens-cr.key_cost,
    coins=coins+comp,
    updated_at=now()
  where user_id=p_user returning * into w;

  insert into public.economy_transactions(user_id,kind,coins_delta,crate_tokens_delta,item_id,metadata)
  values(p_user,'crate_open',comp,-cr.key_cost,chosen,jsonb_build_object('crate_id',p_crate,'duplicate',dup,'rarity',chosen_rarity));

  return jsonb_build_object('wallet',to_jsonb(w),'item_id',chosen,'rarity',chosen_rarity,'duplicate',dup,'compensation',comp);
end;
$$;
revoke execute on function public.autotype_open_crate(uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_open_crate(uuid,text) to service_role;

create or replace function public.autotype_admin_set_balances(p_actor uuid,p_target uuid,p_coins bigint,p_tickets bigint,p_tokens bigint)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare role_name text; w public.wallets%rowtype;
begin
  select role into role_name from public.user_roles where user_id=p_actor;
  if role_name not in ('developer','admin') then raise exception 'Developer access required'; end if;
  update public.wallets set
    coins=greatest(0,least(999999999,p_coins)),
    tournament_tickets=greatest(0,least(999999999,p_tickets)),
    crate_tokens=greatest(0,least(999999999,p_tokens)),
    updated_at=now()
  where user_id=p_target returning * into w;
  insert into public.admin_audit_log(actor_id,action,target_type,target_id,details)
  values(p_actor,'set_balances','profile',p_target::text,jsonb_build_object('coins',w.coins,'tickets',w.tournament_tickets,'tokens',w.crate_tokens));
  return to_jsonb(w);
end;
$$;
revoke execute on function public.autotype_admin_set_balances(uuid,uuid,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.autotype_admin_set_balances(uuid,uuid,bigint,bigint,bigint) to service_role;

create or replace function public.autotype_admin_grant_all(p_actor uuid,p_target uuid)
returns integer language plpgsql security definer set search_path=public
as $$
declare role_name text; n integer;
begin
  select role into role_name from public.user_roles where user_id=p_actor;
  if role_name not in ('developer','admin') then raise exception 'Developer access required'; end if;
  insert into public.inventory(user_id,item_id,source)
  select p_target,id,'admin' from public.shop_items where active=true
  on conflict do nothing;
  get diagnostics n=row_count;
  insert into public.admin_audit_log(actor_id,action,target_type,target_id,details)
  values(p_actor,'grant_all_cosmetics','profile',p_target::text,jsonb_build_object('granted',n));
  return n;
end;
$$;
revoke execute on function public.autotype_admin_grant_all(uuid,uuid) from public,anon,authenticated;
grant execute on function public.autotype_admin_grant_all(uuid,uuid) to service_role;