-- Cosmetic surprise drops are free verified-play rewards, not wagers.
alter table public.crate_definitions
  add column if not exists rounds_per_drop integer not null default 0;

alter table public.crate_definitions
  drop constraint if exists crate_definitions_key_cost_check;

alter table public.crate_definitions
  add constraint crate_cost_or_free_drop_check
    check ((key_cost>=1 and rounds_per_drop=0) or
           (key_cost=0 and rounds_per_drop between 1 and 100));

-- Legacy fixed packs disappear without removing anyone's owned cosmetics.
update public.crate_definitions set active=false
  where id in ('pixel_supply_pack','mint_supply_pack','star_supply_pack');

insert into public.crate_definitions
 (id,name,description,key_cost,categories,odds,active,rounds_per_drop)
values
 ('neon_nights_crate','Neon Nights Crate','Bright banners, typing trails, and game effects.',0,array['Banners','Typing Trails','Game FX']::text[],'{"Common":33,"Uncommon":29,"Rare":22,"Epic":13,"Legendary":3}'::jsonb,true,5),
 ('cosmic_crate','Cosmic Crate','Cosmic arenas, distinctive titles, and game effects.',0,array['Titles','Arena Skins','Game FX']::text[],'{"Common":32,"Uncommon":30,"Rare":22,"Epic":13,"Legendary":3}'::jsonb,true,5),
 ('color_shuffle_crate','Color Shuffle Crate','A mix of banners, avatar frames, and typing trails.',0,array['Banners','Frames','Typing Trails']::text[],'{"Common":33,"Uncommon":31,"Rare":21,"Epic":12,"Legendary":3}'::jsonb,true,5)
on conflict(id) do nothing;

-- Existing service-role-only function; no privileges are widened.
CREATE OR REPLACE FUNCTION public.autotype_open_crate(p_user uuid, p_crate text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cr public.crate_definitions%rowtype;
  w public.wallets%rowtype;
  roll numeric;
  rolled_rarity text;
  chosen text;
  chosen_rarity text;
  dup boolean;
  comp int:=0;
  v_verified int:=0;
  v_claims int:=0;
begin
  select * into cr from public.crate_definitions where id=p_crate and active=true;
  if cr.id is null then raise exception 'Crate not found'; end if;

  select * into w from public.wallets where user_id=p_user for update;
  if cr.rounds_per_drop>0 then
    select count(*) into v_verified from public.round_results
      where user_id=p_user and verified=true;
    select count(*) into v_claims from public.economy_transactions
      where user_id=p_user and kind='crate_open'
        and metadata->>'free_drop'='true';
    if v_verified < (v_claims+1)*cr.rounds_per_drop then
      raise exception 'Complete more verified rounds to earn your next free surprise drop';
    end if;
  end if;
  if w.crate_tokens<cr.key_cost then raise exception 'You need an earned Crate Token'; end if;

  if cr.guaranteed_item_id is not null then
    select id,rarity into chosen,chosen_rarity
    from public.shop_items
    where id=cr.guaranteed_item_id and active=true and price>0 and not collection_only and not earned_only;
    if chosen is null then raise exception 'This fixed pack is currently unavailable'; end if;
    if exists(select 1 from public.inventory where user_id=p_user and item_id=chosen)
      then raise exception 'You already own this cosmetic'; end if;
  else
  roll:=random()*100;
  if roll < coalesce((cr.odds->>'Common')::numeric,0) then rolled_rarity:='Common';
  elsif roll < coalesce((cr.odds->>'Common')::numeric,0)+coalesce((cr.odds->>'Uncommon')::numeric,0) then rolled_rarity:='Uncommon';
  elsif roll < coalesce((cr.odds->>'Common')::numeric,0)+coalesce((cr.odds->>'Uncommon')::numeric,0)+coalesce((cr.odds->>'Rare')::numeric,0) then rolled_rarity:='Rare';
  elsif roll < 100-coalesce((cr.odds->>'Legendary')::numeric,0) then rolled_rarity:='Epic';
  else rolled_rarity:='Legendary';
  end if;

  select si.id,si.rarity into chosen,chosen_rarity
  from public.shop_items si
  where si.active=true
    and si.price>0
    and not si.collection_only
    and not si.earned_only
    and si.category=any(cr.categories)
    and si.rarity=rolled_rarity
  order by
    (exists(
      select 1 from public.inventory i
      where i.user_id=p_user and i.item_id=si.id
    )) asc,
    random()
  limit 1;

  if chosen is null then
    select si.id,si.rarity into chosen,chosen_rarity
    from public.shop_items si
    where si.active=true
      and si.price>0
      and not si.collection_only
      and not si.earned_only
      and si.category=any(cr.categories)
    order by random()
    limit 1;
  end if;

  if chosen is null then raise exception 'No crate rewards available'; end if;
  end if;

  dup:=exists(
    select 1 from public.inventory
    where user_id=p_user and item_id=chosen
  );

  if dup then
    comp:=case chosen_rarity
      when 'Common' then 60
      when 'Uncommon' then 90
      when 'Rare' then 140
      when 'Epic' then 240
      when 'Legendary' then 425
      else 60
    end;
  else
    insert into public.inventory(user_id,item_id,source)
    values(p_user,chosen,'crate');
  end if;

  update public.wallets
  set crate_tokens=crate_tokens-cr.key_cost,
      updated_at=now()
  where user_id=p_user
  returning * into w;

  if comp>0 then
    select * into w from public.autotype_wallet_credit_coins(p_user,comp);
  end if;

  insert into public.economy_transactions(
    user_id,kind,coins_delta,crate_tokens_delta,item_id,metadata
  )
  values(
    p_user,'crate_open',comp,-cr.key_cost,chosen,
    jsonb_build_object('crate_id',p_crate,'duplicate',dup,'rarity',chosen_rarity,'free_drop',(cr.rounds_per_drop>0))
  );

  return jsonb_build_object(
    'wallet',to_jsonb(w),
    'item_id',chosen,
    'rarity',chosen_rarity,
    'duplicate',dup,
    'compensation',comp
  );
end;
$function$;
