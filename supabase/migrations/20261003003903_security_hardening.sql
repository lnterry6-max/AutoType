-- AutoType security hardening after backend foundation

create schema if not exists extensions;

alter extension citext set schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

grant execute on function public.handle_new_auth_user() to postgres, service_role;

-- This Dashboard-managed helper is optional on CLI/self-hosted installations.
-- Keep its existing hardening when present without requiring a fake function
-- or failing an otherwise valid fresh installation. Application RLS is enabled
-- explicitly by the foundation and subsequent migrations.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
    grant execute on function public.rls_auto_enable() to postgres, service_role;
  end if;
end;
$$;
