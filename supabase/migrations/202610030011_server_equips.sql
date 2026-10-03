-- Server-validated cosmetic equips.

drop policy if exists "equipped cosmetics insertable by owner" on public.equipped_cosmetics;
drop policy if exists "equipped cosmetics editable by owner" on public.equipped_cosmetics;
revoke insert,update on public.equipped_cosmetics from authenticated;

create or replace function public.autotype_equip_item(p_user uuid,p_item text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare item public.shop_items%rowtype; e public.equipped_cosmetics%rowtype;
begin
  select * into item from public.shop_items where id=p_item and active=true;
  if item.id is null then raise exception 'Item not found'; end if;
  if not exists(select 1 from public.inventory where user_id=p_user and item_id=p_item) then
    raise exception 'You do not own this item';
  end if;

  if item.slot='title' then update public.equipped_cosmetics set title_id=p_item,updated_at=now() where user_id=p_user;
  elsif item.slot='banner' then update public.equipped_cosmetics set banner_id=p_item,updated_at=now() where user_id=p_user;
  elsif item.slot='frame' then update public.equipped_cosmetics set frame_id=p_item,updated_at=now() where user_id=p_user;
  elsif item.slot='arena' then update public.equipped_cosmetics set arena_id=p_item,updated_at=now() where user_id=p_user;
  elsif item.slot='trail' then update public.equipped_cosmetics set trail_id=p_item,updated_at=now() where user_id=p_user;
  elsif item.slot='cursor' then update public.equipped_cosmetics set cursor_id=p_item,updated_at=now() where user_id=p_user;
  elsif item.slot='predictor' then update public.equipped_cosmetics set predictor_id=p_item,updated_at=now() where user_id=p_user;
  elsif item.slot='result' then update public.equipped_cosmetics set victory_fx_id=p_item,updated_at=now() where user_id=p_user;
  else raise exception 'Unknown cosmetic slot';
  end if;

  select * into e from public.equipped_cosmetics where user_id=p_user;
  return to_jsonb(e);
end;
$$;
revoke execute on function public.autotype_equip_item(uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_equip_item(uuid,text) to service_role;

create or replace function public.autotype_equip_collection(p_user uuid,p_collection text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare rec record; e public.equipped_cosmetics%rowtype;
begin
  if exists(
    select 1 from public.shop_collection_items ci
    where ci.collection_id=p_collection
      and not exists(select 1 from public.inventory i where i.user_id=p_user and i.item_id=ci.item_id)
  ) then raise exception 'You do not own the full collection'; end if;

  for rec in
    select si.* from public.shop_collection_items ci
    join public.shop_items si on si.id=ci.item_id
    where ci.collection_id=p_collection order by ci.position
  loop
    perform public.autotype_equip_item(p_user,rec.id);
  end loop;
  select * into e from public.equipped_cosmetics where user_id=p_user;
  return to_jsonb(e);
end;
$$;
revoke execute on function public.autotype_equip_collection(uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_equip_collection(uuid,text) to service_role;
