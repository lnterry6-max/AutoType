-- Ensure free crate claims spend rounds only from their matching game mode.
-- Preserve all old cosmetic grants and untagged historical claims.
-- Privileged function's existing EXECUTE ACL remains restricted to service_role.
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
    if cr.game_mode is null or cr.game_mode not in ('classic','context','sentence','evil') then
      raise exception 'This crate has no valid game mode';
    end if;
    -- Only this game's verified rounds count toward this game's crate.
    select count(*) into v_verified from public.round_results
      where user_id=p_user and verified=true and mode=cr.game_mode;
    -- Before mode-specific crates, legacy free claims had no mode.
    -- Those grants stay intact but are not falsely charged to any mode.
    select count(*) into v_claims from public.economy_transactions
      where user_id=p_user and kind='crate_open'
        and metadata->>'free_drop'='true'
        and metadata->>'mode'=cr.game_mode;
    if v_verified < (v_claims+1)*cr.rounds_per_drop then
      raise exception 'Complete 5 verified % rounds for this mode crate before claiming',cr.game_mode;
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
      || case when cr.rounds_per_drop>0 then jsonb_build_object('mode',cr.game_mode) else '{}'::jsonb end
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
