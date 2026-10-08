-- Fix live round_results schema drift and crate rarity ambiguity.

do $$
begin
  if exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='round_results' and column_name='keys'
  ) and not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='round_results' and column_name='total_keys'
  ) then
    alter table public.round_results rename column keys to total_keys;
  end if;

  if exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='round_results' and column_name='elapsed_ms'
  ) and not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='round_results' and column_name='duration_ms'
  ) then
    alter table public.round_results rename column elapsed_ms to duration_ms;
  end if;

  if exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='round_results' and column_name='mind_reader'
  ) and not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='round_results' and column_name='one_clue_finish'
  ) then
    alter table public.round_results rename column mind_reader to one_clue_finish;
  end if;
end $$;

create or replace function public.autotype_open_crate(p_user uuid,p_crate text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  cr public.crate_definitions%rowtype;
  w public.wallets%rowtype;
  roll numeric;
  rolled_rarity text;
  chosen text;
  chosen_rarity text;
  dup boolean;
  comp int:=0;
begin
  select * into cr from public.crate_definitions where id=p_crate and active=true;
  if cr.id is null then raise exception 'Crate not found'; end if;

  select * into w from public.wallets where user_id=p_user for update;
  if w.crate_tokens<cr.key_cost then raise exception 'You need an earned Crate Token'; end if;

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

  update public.wallets set
    crate_tokens=crate_tokens-cr.key_cost,
    coins=coins+comp,
    updated_at=now()
  where user_id=p_user
  returning * into w;

  insert into public.economy_transactions(
    user_id,kind,coins_delta,crate_tokens_delta,item_id,metadata
  )
  values(
    p_user,'crate_open',comp,-cr.key_cost,chosen,
    jsonb_build_object('crate_id',p_crate,'duplicate',dup,'rarity',chosen_rarity)
  );

  return jsonb_build_object(
    'wallet',to_jsonb(w),
    'item_id',chosen,
    'rarity',chosen_rarity,
    'duplicate',dup,
    'compensation',comp
  );
end;
$$;

revoke execute on function public.autotype_open_crate(uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_open_crate(uuid,text) to service_role;
