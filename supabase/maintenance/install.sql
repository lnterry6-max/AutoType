-- Operational prerequisite, NOT a hosted migration or automatic activation.
-- Install with reviewed database-owner SQL before deploying maintenance-aware
-- handlers. Default is OPEN; reinstallation preserves state and active leases.
create schema if not exists autotype_maintenance;
revoke all on schema autotype_maintenance from public,anon,authenticated,service_role;
create table if not exists autotype_maintenance.control (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 changed_at timestamptz not null default clock_timestamp()
);
insert into autotype_maintenance.control(singleton) values(true) on conflict do nothing;
create table if not exists autotype_maintenance.operations (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('checkout','refund','webhook','delete-account')),
 started_at timestamptz not null default clock_timestamp()
);
alter table autotype_maintenance.control enable row level security;
alter table autotype_maintenance.operations enable row level security;
revoke all on all tables in schema autotype_maintenance from public,anon,authenticated,service_role;

create or replace function autotype_maintenance.assert_writable() returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare closed boolean;
begin
 -- Acquire before touching protected rows; held to COMMIT/ROLLBACK. A pending
 -- exclusive close waits for existing writers and queues subsequent writers.
 perform pg_advisory_xact_lock_shared(1096111184,1);
 -- Locking read refreshes READ COMMITTED snapshots and raises 40001 for stale
 -- REPEATABLE READ/SERIALIZABLE snapshots instead of accepting a stale OPEN.
 select enabled into strict closed from autotype_maintenance.control where singleton for share;
 if closed and not (
  session_user in ('postgres','supabase_admin')
  and current_setting('role') in ('none','postgres','supabase_admin')
  and coalesce(current_setting('autotype.maintenance_bypass',true),'')='on'
 ) then
  raise exception using errcode='PT503',message='AutoType maintenance: writes paused';
 end if;
end $$;
create or replace function autotype_maintenance.guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin perform autotype_maintenance.assert_writable(); return null; end $$;

-- Blanket public-table protection includes old RPCs, direct service writes,
-- staff actions, cascades, and TRUNCATE. Auth sessions are outside public, so
-- existing users can sign in, refresh and read. Signup may fail closed because
-- its account initializer writes public rewards/profile tables.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' loop
  execute format('drop trigger if exists autotype_maintenance_guard on public.%I',t.tablename);
  execute format('create trigger autotype_maintenance_guard before insert or update or delete or truncate on public.%I for each statement execute function autotype_maintenance.guard()',t.tablename);
  execute format('alter table public.%I enable always trigger autotype_maintenance_guard',t.tablename);
 end loop;
end $$;

create or replace function public.autotype_maintenance_status() returns boolean
language sql security definer set search_path=pg_catalog as $$
 select enabled from autotype_maintenance.control where singleton
$$;
create or replace function public.autotype_begin_operation(p_kind text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare lease uuid; begin
 perform autotype_maintenance.assert_writable();
 insert into autotype_maintenance.operations(kind) values(p_kind) returning id into lease;
 return lease;
end $$;
create or replace function public.autotype_end_operation(p_id uuid) returns void
language sql security definer set search_path=pg_catalog as $$
 delete from autotype_maintenance.operations where id=p_id
$$;

-- Database owner only. A close that times out or sees an external operation
-- does not claim success. No TTL silently drops crashed financial operations.
create or replace function autotype_maintenance.set_enabled(p_enabled boolean) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if session_user not in ('postgres','supabase_admin')
    or current_setting('role') not in ('none','postgres','supabase_admin') then
  raise exception 'Database owner required' using errcode='42501';
 end if;
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'Maintenance toggle requires READ COMMITTED';
 end if;
 perform pg_advisory_xact_lock(1096111184,1);
 if p_enabled and exists(select 1 from autotype_maintenance.operations) then
  raise exception 'Unfinished external operations: drain or investigate before closing' using errcode='55000';
 end if;
 update autotype_maintenance.control set enabled=p_enabled,changed_at=clock_timestamp() where singleton;
 return p_enabled;
end $$;
revoke all on all functions in schema autotype_maintenance from public,anon,authenticated,service_role;
revoke all on function public.autotype_maintenance_status(),public.autotype_begin_operation(text),public.autotype_end_operation(uuid) from public,anon,authenticated;
grant execute on function public.autotype_maintenance_status(),public.autotype_begin_operation(text),public.autotype_end_operation(uuid) to service_role;
notify pgrst,'reload schema';
