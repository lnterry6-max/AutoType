-- Player identities, achievement showcases, accessible controls, and read receipts.
alter table public.profiles
  add column if not exists status_message text not null default '',
  add column if not exists showcase_achievements text[] not null default '{}'::text[];
alter table public.profiles
  add constraint profiles_status_message_length check (char_length(status_message)<=110),
  add constraint profiles_showcase_length check (coalesce(array_length(showcase_achievements,1),0)<=3);

create or replace function public.autotype_validate_showcase()
returns trigger language plpgsql security definer set search_path=public as $$
declare desired integer; approved integer;
begin
  if new.showcase_achievements is distinct from old.showcase_achievements then
    desired:=coalesce(array_length(new.showcase_achievements,1),0);
    if desired>3 then raise exception 'Showcase allows at most three achievements.';end if;
    if desired>0 then
      select count(distinct ua.achievement_id) into approved
      from public.user_achievements ua
      where ua.user_id=new.id and ua.achievement_id=any(new.showcase_achievements);
      if desired<>approved then
        raise exception 'You can only showcase achievements you have unlocked.';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.autotype_validate_showcase() from public,anon,authenticated;
create trigger profiles_showcase_guard before update on public.profiles
  for each row execute function public.autotype_validate_showcase();

alter table public.user_preferences
  add column if not exists confirm_key text not null default 'Space',
  add column if not exists erase_key text not null default 'Backspace',
  add column if not exists prediction_key text not null default 'F2';
alter table public.user_preferences
  add constraint prefs_confirm_key_choice check (confirm_key in ('Space','Enter')),
  add constraint prefs_erase_key_choice check (erase_key in ('Backspace','Delete')),
  add constraint prefs_prediction_key_choice check (prediction_key in ('F2','F4'));

create table public.friend_chat_reads(
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key(user_id,friend_id),
  constraint chat_reads_distinct check(user_id<>friend_id)
);
alter table public.friend_chat_reads enable row level security;
revoke all on public.friend_chat_reads from public,anon,authenticated;
grant all on public.friend_chat_reads to service_role;

create or replace function public.autotype_chat_mark_read(p_user uuid,p_friend uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.autotype_chat_allowed(p_user,p_friend) then
    raise exception 'Conversation unavailable.';
  end if;
  insert into public.friend_chat_reads(user_id,friend_id,last_read_at)
  values(p_user,p_friend,now()) on conflict(user_id,friend_id)
  do update set last_read_at=excluded.last_read_at;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.autotype_chat_unread_summary(p_user uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'friend_id',p.id,'username',p.username::text,
    'display_name',p.display_name,'unread',unread_count.n,
    'last_message_at',unread_count.latest
  ) order by unread_count.latest desc),'[]'::jsonb) into result
  from (
    select m.sender_id, count(*)::integer as n,max(m.created_at) as latest
    from public.friend_chat_messages m
    left join public.friend_chat_reads r
      on r.user_id=p_user and r.friend_id=m.sender_id
    where m.recipient_id=p_user
      and m.created_at>coalesce(r.last_read_at,'epoch'::timestamptz)
      and public.autotype_chat_allowed(p_user,m.sender_id)
    group by m.sender_id
  ) unread_count
  join public.profiles p on p.id=unread_count.sender_id;
  return result;
end;
$$;
revoke all on function public.autotype_chat_mark_read(uuid,uuid) from public,anon,authenticated;
revoke all on function public.autotype_chat_unread_summary(uuid) from public,anon,authenticated;
grant execute on function public.autotype_chat_mark_read(uuid,uuid) to service_role;
grant execute on function public.autotype_chat_unread_summary(uuid) to service_role;

