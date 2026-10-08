-- Friends-only chat beta. No public channel, files, hyperlinks or paid features.
create table public.friend_chat_blocks(
 blocker_id uuid not null references auth.users(id) on delete cascade,
 blocked_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(blocker_id,blocked_id),
 constraint chat_blocks_no_self check(blocker_id<>blocked_id)
);
create index friend_chat_blocks_target_idx on public.friend_chat_blocks(blocked_id);

create table public.friend_chat_messages(
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(char_length(btrim(body)) between 1 and 600),
 created_at timestamptz not null default now(),
 constraint chat_messages_no_self check(sender_id<>recipient_id)
);
create index chat_msgs_sender_idx on public.friend_chat_messages(sender_id,recipient_id,created_at desc);
create index chat_msgs_recipient_idx on public.friend_chat_messages(recipient_id,sender_id,created_at desc);

create table public.friend_chat_reports(
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references auth.users(id) on delete cascade,
 message_id uuid not null references public.friend_chat_messages(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 body_snapshot text not null,
 reason text not null check(reason in ('bullying','spam','unsafe','other')),
 details text not null check(char_length(btrim(details)) between 10 and 1000),
 status text not null default 'new' check(status in ('new','reviewed','resolved')),
 created_at timestamptz not null default now(),
 unique(reporter_id,message_id)
);
create index chat_reports_recent_idx on public.friend_chat_reports(created_at desc);

alter table public.friend_chat_blocks enable row level security;
alter table public.friend_chat_messages enable row level security;
alter table public.friend_chat_reports enable row level security;
revoke all on public.friend_chat_blocks,public.friend_chat_messages,public.friend_chat_reports from public,anon,authenticated;
grant all on public.friend_chat_blocks,public.friend_chat_messages,public.friend_chat_reports to service_role;

create or replace function public.autotype_chat_allowed(p_a uuid,p_b uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select p_a is not null and p_b is not null and p_a<>p_b
  and exists(select 1 from public.friendships f
   where (f.user_a=p_a and f.user_b=p_b) or (f.user_a=p_b and f.user_b=p_a))
  and not exists(select 1 from public.friend_chat_blocks b
   where (b.blocker_id=p_a and b.blocked_id=p_b) or (b.blocker_id=p_b and b.blocked_id=p_a))
$$;
revoke all on function public.autotype_chat_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.autotype_chat_allowed(uuid,uuid) to service_role;

create or replace function public.autotype_chat_send(p_user uuid,p_friend uuid,p_body text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t text:=btrim(coalesce(p_body,'')); m public.friend_chat_messages%rowtype;
begin
 if not public.autotype_chat_allowed(p_user,p_friend) then
  raise exception 'You can only chat with an accepted friend who has not blocked you.';
 end if;
 if char_length(t) not between 1 and 600 then raise exception 'Message must be 1–600 characters.';end if;
 if t ~* '(https?://|www[.]|discord[.]gg|[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,})' then
  raise exception 'Links and contact addresses are not supported in beta chat.';
 end if;
 -- Serialize submissions per sender so simultaneous requests cannot bypass the cooldown.
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,10091));
 if exists(select 1 from public.friend_chat_messages where sender_id=p_user and created_at>now()-interval '2 seconds') then
  raise exception 'Please wait a moment before sending another message.';
 end if;
 if (select count(*) from public.friend_chat_messages where sender_id=p_user and created_at>now()-interval '5 minutes')>=40 then
  raise exception 'Too many messages. Please try again later.';
 end if;
 insert into public.friend_chat_messages(sender_id,recipient_id,body)
 values(p_user,p_friend,t) returning * into m;
 return to_jsonb(m);
end; $$;

create or replace function public.autotype_chat_history(p_user uuid,p_friend uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if not public.autotype_chat_allowed(p_user,p_friend) then
  raise exception 'This conversation is unavailable. Chat is only for accepted friends.';
 end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at,q.id),'[]'::jsonb) into result
 from (
  select id,sender_id,recipient_id,body,created_at
  from public.friend_chat_messages
  where (sender_id=p_user and recipient_id=p_friend) or (sender_id=p_friend and recipient_id=p_user)
  order by created_at desc,id desc limit 80
 ) q;
 return result;
end; $$;

create or replace function public.autotype_chat_block(p_user uuid,p_other uuid,p_block boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if p_user is null or p_other is null or p_user=p_other then raise exception 'Invalid player';end if;
 if p_block then
  insert into public.friend_chat_blocks(blocker_id,blocked_id) values(p_user,p_other) on conflict do nothing;
  delete from public.friendships where (user_a=p_user and user_b=p_other) or (user_a=p_other and user_b=p_user);
  delete from public.friend_requests where (sender_id=p_user and receiver_id=p_other) or (sender_id=p_other and receiver_id=p_user);
 else
  delete from public.friend_chat_blocks where blocker_id=p_user and blocked_id=p_other;
 end if;
 return jsonb_build_object('blocked',p_block);
end; $$;

create or replace function public.autotype_chat_blocked_list(p_user uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name)),'[]'::jsonb) into result
 from public.friend_chat_blocks b join public.profiles p on p.id=b.blocked_id where b.blocker_id=p_user;
 return result;
end; $$;

create or replace function public.autotype_chat_report(p_user uuid,p_message uuid,p_reason text,p_details text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m public.friend_chat_messages%rowtype; report public.friend_chat_reports%rowtype;
begin
 select * into m from public.friend_chat_messages where id=p_message and recipient_id=p_user;
 if m.id is null then raise exception 'Only received messages can be reported.';end if;
 if p_reason not in ('bullying','spam','unsafe','other') then raise exception 'Choose a report reason.';end if;
 if char_length(btrim(coalesce(p_details,''))) not between 10 and 1000 then raise exception 'Describe the concern in 10–1000 characters.';end if;
 insert into public.friend_chat_reports(reporter_id,message_id,sender_id,body_snapshot,reason,details)
 values(p_user,p_message,m.sender_id,m.body,p_reason,btrim(p_details))
 returning * into report;
 return jsonb_build_object('id',report.id,'status',report.status);
end; $$;

-- A block must also prevent sending or renewing friend requests.
create or replace function public.autotype_friend_request_block_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.friend_chat_blocks b
  where (b.blocker_id=new.sender_id and b.blocked_id=new.receiver_id)
     or (b.blocker_id=new.receiver_id and b.blocked_id=new.sender_id)) then
   raise exception 'A friendship request is not available for this player.';
 end if;
 return new;
end; $$;
create trigger friend_requests_block_guard before insert or update on public.friend_requests
for each row execute function public.autotype_friend_request_block_guard();

revoke all on function public.autotype_chat_send(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.autotype_chat_history(uuid,uuid) from public,anon,authenticated;
revoke all on function public.autotype_chat_block(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.autotype_chat_blocked_list(uuid) from public,anon,authenticated;
revoke all on function public.autotype_chat_report(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.autotype_friend_request_block_guard() from public,anon,authenticated;
grant execute on function public.autotype_chat_send(uuid,uuid,text) to service_role;
grant execute on function public.autotype_chat_history(uuid,uuid) to service_role;
grant execute on function public.autotype_chat_block(uuid,uuid,boolean) to service_role;
grant execute on function public.autotype_chat_blocked_list(uuid) to service_role;
grant execute on function public.autotype_chat_report(uuid,uuid,text,text) to service_role;

