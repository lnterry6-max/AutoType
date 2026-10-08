-- Private player reports and replayable built-in tournament resets.
create table if not exists public.player_reports(
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('harassment','spam','inappropriate','other')),
  details text not null check (char_length(btrim(details)) between 10 and 1500),
  status text not null default 'new' check (status in ('new','reviewed','resolved')),
  created_at timestamptz not null default now(),
  constraint player_reports_not_self check (reporter_id<>reported_user_id)
);
create index if not exists player_reports_recent_idx on public.player_reports(created_at desc);
alter table public.player_reports enable row level security;
revoke all on public.player_reports from public,anon,authenticated;
grant insert(reporter_id,reported_user_id,reason,details) on public.player_reports to authenticated;
grant select on public.player_reports to authenticated;
grant update(status) on public.player_reports to authenticated;
grant all on public.player_reports to service_role;

create policy "Players submit only their own reports" on public.player_reports
for insert to authenticated with check(reporter_id=(select auth.uid()));
create policy "Only staff may view reports" on public.player_reports
for select to authenticated using(exists(
  select 1 from public.user_roles where user_id=(select auth.uid())
  and role in ('developer','admin')
));
create policy "Only staff may triage reports" on public.player_reports
for update to authenticated using(exists(
  select 1 from public.user_roles where user_id=(select auth.uid())
  and role in ('developer','admin')
)) with check(exists(
  select 1 from public.user_roles where user_id=(select auth.uid())
  and role in ('developer','admin')
));

create or replace function public.autotype_throttle_player_reports()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.player_reports
           where reporter_id=new.reporter_id and created_at>now()-interval '60 seconds')
 then raise exception 'Please wait a minute before reporting again.'; end if;
 return new;
end;$$;
revoke all on function public.autotype_throttle_player_reports() from public,anon,authenticated;
create trigger player_report_rate_limit before insert on public.player_reports
for each row execute function public.autotype_throttle_player_reports();

-- Keep snapshots of earlier entry scores and winners before each built-in reset.
create table if not exists public.tournament_reset_archives(
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null,
  reset_by uuid not null references auth.users(id) on delete cascade,
  previous_tournament jsonb not null,
  previous_entries jsonb not null default '[]'::jsonb,
  reset_at timestamptz not null default now()
);
alter table public.tournament_reset_archives enable row level security;
revoke all on public.tournament_reset_archives from public,anon,authenticated;
grant all on public.tournament_reset_archives to service_role;

create or replace function public.autotype_reset_builtin_tournaments(p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 t public.tournaments%rowtype;
 e public.tournament_entries%rowtype;
begin
 if p_actor is null or not exists(select 1 from public.user_roles
   where user_id=p_actor and role in ('developer','admin')) then
   raise exception 'Developer access required';
 end if;

 for t in select * from public.tournaments
  where id in (
   '11111111-1111-4111-8111-111111111111'::uuid,
   '22222222-2222-4222-8222-222222222222'::uuid,
   '33333333-3333-4333-8333-333333333333'::uuid)
  for update
 loop
  insert into public.tournament_reset_archives(tournament_id,reset_by,previous_tournament,previous_entries)
  values(t.id,p_actor,to_jsonb(t),coalesce(
   (select jsonb_agg(to_jsonb(x)) from public.tournament_entries x where x.tournament_id=t.id),
   '[]'::jsonb
  ));
  -- Return unused tickets for registrations that never played.
  if t.entry_type='ticket' and t.entry_cost>0 and t.status in ('open','scheduled') then
   for e in select * from public.tournament_entries
    where tournament_id=t.id and status='registered'
   loop
    update public.wallets
     set tournament_tickets=tournament_tickets+t.entry_cost,updated_at=now()
     where user_id=e.user_id;
    insert into public.economy_transactions(user_id,kind,tickets_delta,metadata)
     values(e.user_id,'tournament_refund',t.entry_cost,
      jsonb_build_object('tournament',coalesce(t.slug,t.id::text),'reason','builtin_reset'));
   end loop;
  end if;
  delete from public.tournament_entries where tournament_id=t.id;
 end loop;

 insert into public.tournaments
  (id,slug,built_in,name,description,status,entry_type,entry_cost,
   reward_coins,reward_crate_tokens,reward_title,max_players,schedule_label,created_by,winner_id)
 values
  ('11111111-1111-4111-8111-111111111111','daily_open',true,'Daily Open',
   'A free-entry daily bracket for anyone who wants a competitive run.','open','free',0,
   300,1,'Daily Champion',32,'Daily',p_actor,null),
  ('22222222-2222-4222-8222-222222222222','ranked_circuit',true,'Ranked Circuit',
   'Earn Tournament Tickets through regular play, then use one to register.','open','ticket',1,
   800,2,'Circuit Winner',16,'Friday',p_actor,null),
  ('33333333-3333-4333-8333-333333333333','weekend_championship',true,'Weekend Championship',
   'The larger weekend event with higher cosmetic and coin rewards.','open','ticket',2,
   1500,3,'Weekend Champion',16,'Saturday',p_actor,null)
 on conflict(id) do update set
  slug=excluded.slug,built_in=true,name=excluded.name,description=excluded.description,
  status='open',entry_type=excluded.entry_type,entry_cost=excluded.entry_cost,
  reward_coins=excluded.reward_coins,reward_crate_tokens=excluded.reward_crate_tokens,
  reward_title=excluded.reward_title,max_players=excluded.max_players,
  schedule_label=excluded.schedule_label,created_by=excluded.created_by,
  winner_id=null,starts_at=null,updated_at=now();

 return (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
    from public.tournaments x
    where id in (
     '11111111-1111-4111-8111-111111111111'::uuid,
     '22222222-2222-4222-8222-222222222222'::uuid,
     '33333333-3333-4333-8333-333333333333'::uuid));
end;
$$;
revoke all on function public.autotype_reset_builtin_tournaments(uuid)
from public,anon,authenticated;
grant execute on function public.autotype_reset_builtin_tournaments(uuid) to service_role;

