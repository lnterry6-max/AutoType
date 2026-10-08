-- Friends beta: private, account-attributed feedback inbox.
-- The browser may submit on its own behalf; only developers/admins may read or triage.
create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('bug','idea','other')),
  message text not null check (char_length(btrim(message)) between 10 and 2000),
  page_path text not null default '/' check (char_length(page_path) between 1 and 200),
  status text not null default 'new' check (status in ('new','reviewed','resolved')),
  created_at timestamptz not null default now()
);

create index if not exists beta_feedback_created_idx on public.beta_feedback (created_at desc);
create index if not exists beta_feedback_user_created_idx on public.beta_feedback (user_id,created_at desc);

alter table public.beta_feedback enable row level security;
revoke all on public.beta_feedback from public, anon, authenticated;

grant insert (user_id,category,message,page_path) on public.beta_feedback to authenticated;
grant select on public.beta_feedback to authenticated;
grant update (status) on public.beta_feedback to authenticated;
grant all on public.beta_feedback to service_role;

create policy "Players can submit own feedback"
on public.beta_feedback for insert to authenticated
with check (user_id=(select auth.uid()));

create policy "Only staff may view feedback"
on public.beta_feedback for select to authenticated
using (exists (
  select 1 from public.user_roles
  where user_roles.user_id=(select auth.uid())
    and user_roles.role in ('developer','admin')
));

create policy "Only staff may triage feedback"
on public.beta_feedback for update to authenticated
using (exists (
  select 1 from public.user_roles
  where user_roles.user_id=(select auth.uid())
    and user_roles.role in ('developer','admin')
))
with check (exists (
  select 1 from public.user_roles
  where user_roles.user_id=(select auth.uid())
    and user_roles.role in ('developer','admin')
));

-- Basic spam throttle applies to normal clients and requires no public read access.
create or replace function public.autotype_throttle_beta_feedback()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if exists(
    select 1 from public.beta_feedback f
    where f.user_id=new.user_id and f.created_at>now()-interval '60 seconds'
  ) then
    raise exception 'Please wait a minute before sending another report.';
  end if;
  return new;
end;
$$;

revoke all on function public.autotype_throttle_beta_feedback() from public,anon,authenticated;
drop trigger if exists beta_feedback_submission_throttle on public.beta_feedback;
create trigger beta_feedback_submission_throttle
before insert on public.beta_feedback
for each row execute function public.autotype_throttle_beta_feedback();

