-- Role titles are badges only; user_roles remains the independent security boundary.
create table public.role_badges (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(btrim(name)) between 2 and 28),
 color text not null default '#4BA6D8' check (color ~ '^#[0-9A-Fa-f]{6}$'),
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now()
);
create unique index role_badges_name_ci_idx on public.role_badges(lower(btrim(name)));

create table public.player_role_badges(
 user_id uuid not null references auth.users(id) on delete cascade,
 role_id uuid not null references public.role_badges(id) on delete cascade,
 assigned_by uuid not null references auth.users(id) on delete restrict,
 assigned_at timestamptz not null default now(),
 primary key(user_id,role_id)
);
create index player_role_badges_role_idx on public.player_role_badges(role_id);

alter table public.role_badges enable row level security;
alter table public.player_role_badges enable row level security;
revoke all on public.role_badges,public.player_role_badges from public,anon,authenticated;
grant select on public.role_badges,public.player_role_badges to anon,authenticated;
grant all on public.role_badges,public.player_role_badges to service_role;
create policy "Public badges are readable" on public.role_badges for select using(true);
create policy "Public player badges are readable" on public.player_role_badges for select using(true);

-- Admins can edit only their own in-game wallet values; never another player's.
create or replace function public.autotype_admin_set_balances(
 p_actor uuid,p_target uuid,p_coins bigint,p_tickets bigint,p_tokens bigint
) returns jsonb language plpgsql security definer set search_path=public as $$
declare role_name text; w public.wallets%rowtype;
begin
 select role into role_name from public.user_roles where user_id=p_actor;
 if role_name='admin' then
  if p_actor is distinct from p_target then raise exception 'Admins may only edit their own in-game wallet.';end if;
 elsif role_name is distinct from 'developer' then raise exception 'Developer access required';end if;
 if p_coins is null or p_tickets is null or p_tokens is null then raise exception 'Wallet amounts required';end if;
 update public.wallets set
  coins=greatest(0,least(999999999,p_coins)),
  tournament_tickets=greatest(0,least(999999999,p_tickets)),
  crate_tokens=greatest(0,least(999999999,p_tokens)),updated_at=now()
 where user_id=p_target returning * into w;
 if w.user_id is null then raise exception 'Wallet not found';end if;
 insert into public.admin_audit_log(actor_id,action,target_type,target_id,details)
 values(p_actor,'set_balances','profile',p_target::text,
 jsonb_build_object('coins',w.coins,'tickets',w.tournament_tickets,'tokens',w.crate_tokens));
 return to_jsonb(w);
end;
$$;

-- Cosmetic grants may affect other player inventories, so developer only.
create or replace function public.autotype_admin_grant_all(p_actor uuid,p_target uuid)
 returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if not exists(select 1 from public.user_roles where user_id=p_actor and role='developer') then
  raise exception 'Developer access required';
 end if;
 insert into public.inventory(user_id,item_id,source)
 select p_target,id,'admin' from public.shop_items where active=true on conflict do nothing;
 get diagnostics n=row_count;
 insert into public.admin_audit_log(actor_id,action,target_type,target_id,details)
 values(p_actor,'grant_all_cosmetics','profile',p_target::text,jsonb_build_object('granted',n));
 return n;
end;
$$;

-- Feedback is developer-only; admins can review player/chat reports, not private suggestions.
drop policy if exists "Only staff may view feedback" on public.beta_feedback;
drop policy if exists "Only staff may triage feedback" on public.beta_feedback;
create policy "Only developer may view feedback" on public.beta_feedback
 for select to authenticated using(exists(select 1 from public.user_roles
 where user_id=(select auth.uid()) and role='developer'));
create policy "Only developer may triage feedback" on public.beta_feedback
 for update to authenticated using(exists(select 1 from public.user_roles
 where user_id=(select auth.uid()) and role='developer'))
 with check(exists(select 1 from public.user_roles
 where user_id=(select auth.uid()) and role='developer'));

