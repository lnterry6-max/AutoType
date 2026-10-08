-- Fix built-in tournament metadata.
update public.tournaments
set name='Weekend Championship',
    description='The larger weekend event with higher cosmetic and coin rewards.'
where slug='weekend_championship';

alter table public.profiles add column if not exists last_tournament_title text not null default '';

create or replace function public.autotype_set_security_question(p_user uuid,p_question text,p_answer text)
returns boolean language plpgsql security definer set search_path=public,extensions
as $$
begin
  if char_length(trim(p_question))<5 or char_length(trim(p_question))>160 then raise exception 'Invalid security question'; end if;
  if char_length(trim(p_answer))<2 or char_length(trim(p_answer))>120 then raise exception 'Security answer is too short'; end if;
  insert into public.security_questions(user_id,question,answer_hash)
  values(p_user,trim(p_question),crypt(lower(trim(p_answer)),gen_salt('bf',10)))
  on conflict(user_id) do update set question=excluded.question,answer_hash=excluded.answer_hash,updated_at=now();
  return true;
end;
$$;
revoke execute on function public.autotype_set_security_question(uuid,text,text) from public,anon,authenticated;
grant execute on function public.autotype_set_security_question(uuid,text,text) to service_role;

create or replace function public.autotype_verify_security_answer(p_user uuid,p_answer text)
returns boolean language sql security definer set search_path=public,extensions
as $$
  select coalesce(
    (select answer_hash=crypt(lower(trim(p_answer)),answer_hash)
     from public.security_questions where user_id=p_user),
    false
  );
$$;
revoke execute on function public.autotype_verify_security_answer(uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_verify_security_answer(uuid,text) to service_role;

create or replace function public.autotype_send_friend_request(p_user uuid,p_username text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare target uuid; req public.friend_requests%rowtype;
begin
  select id into target from public.profiles where lower(username::text)=lower(trim(p_username)) limit 1;
  if target is null then raise exception 'Player not found'; end if;
  if target=p_user then raise exception 'You cannot friend yourself'; end if;
  if exists(select 1 from public.friendships where (user_a=least(p_user,target) and user_b=greatest(p_user,target))) then
    raise exception 'You are already friends';
  end if;
  insert into public.friend_requests(sender_id,receiver_id,status)
  values(p_user,target,'pending')
  returning * into req;
  return to_jsonb(req);
end;
$$;
revoke execute on function public.autotype_send_friend_request(uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_send_friend_request(uuid,text) to service_role;

create or replace function public.autotype_respond_friend_request(p_user uuid,p_request uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare req public.friend_requests%rowtype;
begin
  select * into req from public.friend_requests where id=p_request and receiver_id=p_user and status='pending' for update;
  if req.id is null then raise exception 'Friend request not found'; end if;
  update public.friend_requests
  set status=case when p_accept then 'accepted' else 'declined' end,updated_at=now()
  where id=req.id returning * into req;
  if p_accept then
    insert into public.friendships(user_a,user_b)
    values(least(req.sender_id,req.receiver_id),greatest(req.sender_id,req.receiver_id))
    on conflict do nothing;
  end if;
  return to_jsonb(req);
end;
$$;
revoke execute on function public.autotype_respond_friend_request(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.autotype_respond_friend_request(uuid,uuid,boolean) to service_role;

create or replace function public.autotype_cancel_friend_request(p_user uuid,p_request uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
begin
  update public.friend_requests set status='cancelled',updated_at=now()
  where id=p_request and sender_id=p_user and status='pending';
  if not found then raise exception 'Friend request not found'; end if;
  return true;
end;
$$;
revoke execute on function public.autotype_cancel_friend_request(uuid,uuid) from public,anon,authenticated;
grant execute on function public.autotype_cancel_friend_request(uuid,uuid) to service_role;

create or replace function public.autotype_remove_friend(p_user uuid,p_other uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
begin
  delete from public.friendships
  where user_a=least(p_user,p_other) and user_b=greatest(p_user,p_other);
  return found;
end;
$$;
revoke execute on function public.autotype_remove_friend(uuid,uuid) from public,anon,authenticated;
grant execute on function public.autotype_remove_friend(uuid,uuid) to service_role;

create or replace function public.autotype_join_tournament(p_user uuid,p_tournament text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare t public.tournaments%rowtype; w public.wallets%rowtype; entrants integer; e public.tournament_entries%rowtype;
begin
  select * into t from public.tournaments
  where slug=p_tournament or id::text=p_tournament limit 1 for update;
  if t.id is null then raise exception 'Tournament not found'; end if;
  if t.status not in ('open','scheduled') then raise exception 'Registration is closed'; end if;
  if exists(select 1 from public.tournament_entries where tournament_id=t.id and user_id=p_user and status not in ('withdrawn','disqualified')) then
    raise exception 'Already registered';
  end if;
  select count(*) into entrants from public.tournament_entries
  where tournament_id=t.id and status not in ('withdrawn','disqualified');
  if entrants>=t.max_players then raise exception 'Tournament is full'; end if;

  select * into w from public.wallets where user_id=p_user for update;
  if t.entry_type='ticket' and w.tournament_tickets<t.entry_cost then raise exception 'Not enough Tournament Tickets'; end if;
  if t.entry_type='ticket' and t.entry_cost>0 then
    update public.wallets set tournament_tickets=tournament_tickets-t.entry_cost,updated_at=now()
    where user_id=p_user returning * into w;
    insert into public.economy_transactions(user_id,kind,tickets_delta,metadata)
    values(p_user,'tournament_entry',-t.entry_cost,jsonb_build_object('tournament',coalesce(t.slug,t.id::text)));
  end if;

  insert into public.tournament_entries(tournament_id,user_id,status)
  values(t.id,p_user,'registered')
  on conflict(tournament_id,user_id) do update set status='registered',joined_at=now(),finished_at=null
  returning * into e;
  return jsonb_build_object('entry',to_jsonb(e),'wallet',to_jsonb(w),'tournament',coalesce(t.slug,t.id::text));
end;
$$;
revoke execute on function public.autotype_join_tournament(uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_join_tournament(uuid,text) to service_role;

create or replace function public.autotype_leave_tournament(p_user uuid,p_tournament text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare t public.tournaments%rowtype; e public.tournament_entries%rowtype; w public.wallets%rowtype; refund integer:=0;
begin
  select * into t from public.tournaments where slug=p_tournament or id::text=p_tournament limit 1;
  if t.id is null then raise exception 'Tournament not found'; end if;
  select * into e from public.tournament_entries
  where tournament_id=t.id and user_id=p_user and status='registered' for update;
  if e.user_id is null then raise exception 'Registration not found'; end if;
  update public.tournament_entries set status='withdrawn' where tournament_id=t.id and user_id=p_user;
  if t.entry_type='ticket' and t.entry_cost>0 and t.status in ('open','scheduled') then refund:=t.entry_cost; end if;
  update public.wallets set tournament_tickets=tournament_tickets+refund,updated_at=now()
  where user_id=p_user returning * into w;
  if refund>0 then
    insert into public.economy_transactions(user_id,kind,tickets_delta,metadata)
    values(p_user,'tournament_refund',refund,jsonb_build_object('tournament',coalesce(t.slug,t.id::text)));
  end if;
  return jsonb_build_object('wallet',to_jsonb(w),'refund',refund);
end;
$$;
revoke execute on function public.autotype_leave_tournament(uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_leave_tournament(uuid,text) to service_role;

create or replace function public.autotype_award_tournament(p_actor uuid,p_tournament text,p_winner uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare role_name text; t public.tournaments%rowtype; w public.wallets%rowtype;
begin
  select role into role_name from public.user_roles where user_id=p_actor;
  if role_name not in ('developer','admin') then raise exception 'Developer access required'; end if;
  select * into t from public.tournaments where slug=p_tournament or id::text=p_tournament limit 1 for update;
  if t.id is null then raise exception 'Tournament not found'; end if;
  if t.winner_id is not null then raise exception 'Winner already awarded'; end if;
  if not exists(select 1 from public.tournament_entries where tournament_id=t.id and user_id=p_winner and status not in ('withdrawn','disqualified')) then
    raise exception 'Winner must be an entrant';
  end if;
  update public.wallets set coins=coins+t.reward_coins,crate_tokens=crate_tokens+t.reward_crate_tokens,updated_at=now()
  where user_id=p_winner returning * into w;
  update public.player_stats set tournament_wins=tournament_wins+1,updated_at=now() where user_id=p_winner;
  update public.profiles set last_tournament_title=t.reward_title where id=p_winner;
  update public.tournament_entries set status=case when user_id=p_winner then 'winner' else status end where tournament_id=t.id;
  update public.tournaments set winner_id=p_winner,status='closed',updated_at=now() where id=t.id;
  insert into public.economy_transactions(user_id,kind,coins_delta,crate_tokens_delta,metadata)
  values(p_winner,'tournament_prize',t.reward_coins,t.reward_crate_tokens,jsonb_build_object('tournament',coalesce(t.slug,t.id::text),'title',t.reward_title));
  insert into public.admin_audit_log(actor_id,action,target_type,target_id,details)
  values(p_actor,'award_tournament','profile',p_winner::text,jsonb_build_object('tournament',coalesce(t.slug,t.id::text)));
  return jsonb_build_object('wallet',to_jsonb(w),'reward_title',t.reward_title);
end;
$$;
revoke execute on function public.autotype_award_tournament(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.autotype_award_tournament(uuid,text,uuid) to service_role;
