-- AutoType backend foundation
-- Supabase / PostgreSQL
-- This migration creates the shared data model and locks server-authoritative
-- systems (wallets, inventory rewards, tournament payouts) against direct
-- client writes.

create extension if not exists pgcrypto;
create extension if not exists citext;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique,
  display_name text not null,
  bio text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_length check (char_length(username::text) between 3 and 24),
  constraint username_chars check (username::text ~ '^[A-Za-z0-9_]+$'),
  constraint display_name_length check (char_length(display_name) between 1 and 40),
  constraint bio_length check (char_length(bio) <= 240)
);

create table if not exists public.user_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'player' check (role in ('player','developer','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  rounds bigint not null default 0 check (rounds >= 0),
  words bigint not null default 0 check (words >= 0),
  erased bigint not null default 0 check (erased >= 0),
  best_score bigint not null default 0 check (best_score >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  fastest_seconds numeric,
  best_erased_round integer not null default 0 check (best_erased_round >= 0),
  mind_reader_count bigint not null default 0 check (mind_reader_count >= 0),
  perfect_rounds bigint not null default 0 check (perfect_rounds >= 0),
  total_keys bigint not null default 0 check (total_keys >= 0),
  total_errors bigint not null default 0 check (total_errors >= 0),
  total_score bigint not null default 0 check (total_score >= 0),
  tournament_wins bigint not null default 0 check (tournament_wins >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  coins bigint not null default 500 check (coins >= 0),
  tournament_tickets bigint not null default 2 check (tournament_tickets >= 0),
  crate_tokens bigint not null default 0 check (crate_tokens >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null,
  source text not null default 'system',
  obtained_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists public.equipped_cosmetics (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  title_id text,
  banner_id text,
  frame_id text,
  arena_id text,
  trail_id text,
  cursor_id text,
  predictor_id text,
  victory_fx_id text,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);

create unique index if not exists friend_requests_one_pending
on public.friend_requests (least(sender_id,receiver_id), greatest(sender_id,receiver_id))
where status = 'pending';

create table if not exists public.friendships (
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a <> user_b),
  check (user_a < user_b)
);

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  name text not null,
  description text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled','open','running','closed','cancelled')),
  entry_type text not null default 'free' check (entry_type in ('free','ticket')),
  entry_cost integer not null default 0 check (entry_cost >= 0),
  reward_coins bigint not null default 0 check (reward_coins >= 0),
  reward_crate_tokens bigint not null default 0 check (reward_crate_tokens >= 0),
  reward_title text not null default '',
  max_players integer not null default 16 check (max_players between 2 and 512),
  starts_at timestamptz,
  winner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tournament_entries (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'registered' check (status in ('registered','playing','finished','winner','disqualified','withdrawn')),
  score bigint,
  joined_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (tournament_id, user_id)
);

create table if not exists public.race_rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null default 'sentence',
  target_text text not null,
  status text not null default 'waiting' check (status in ('waiting','countdown','running','finished','cancelled')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.race_players (
  race_id uuid not null references public.race_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  progress numeric not null default 0 check (progress between 0 and 1),
  score bigint not null default 0,
  finished_at timestamptz,
  primary key (race_id, user_id)
);

create table if not exists public.prediction_suggestions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete set null,
  prefix text not null,
  word text not null,
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  constraint prediction_prefix_format check (prefix ~ '^[a-z]{1,8}$'),
  constraint prediction_word_format check (word ~ '^[a-z''’]{2,31}$')
);

create table if not exists public.prediction_votes (
  suggestion_id uuid not null references public.prediction_suggestions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (suggestion_id, user_id)
);

create table if not exists public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  active boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcement_length check (char_length(message) between 1 and 180)
);

create table if not exists public.admin_audit_log (
  id bigint generated by default as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Create a complete starter record whenever Supabase Auth creates a user.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired_username text;
  desired_display_name text;
begin
  desired_username := nullif(trim(coalesce(new.raw_user_meta_data ->> 'username','')), '');
  if desired_username is null then
    desired_username := 'player_' || substr(new.id::text, 1, 8);
  end if;

  desired_display_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name','')), '');
  if desired_display_name is null then
    desired_display_name := desired_username;
  end if;

  insert into public.profiles(id,username,display_name)
  values (new.id,desired_username,desired_display_name);

  insert into public.user_roles(user_id,role) values (new.id,'player');
  insert into public.player_stats(user_id) values (new.id);
  insert into public.wallets(user_id) values (new.id);
  insert into public.equipped_cosmetics(
    user_id,title_id,banner_id,frame_id,arena_id,trail_id,cursor_id,predictor_id,victory_fx_id
  ) values (
    new.id,'title_none','banner_default','frame_default','arena_default','trail_default','cursor_default','predictor_default','result_default'
  );

  insert into public.inventory(user_id,item_id,source)
  values
    (new.id,'title_none','starter'),
    (new.id,'banner_default','starter'),
    (new.id,'frame_default','starter'),
    (new.id,'arena_default','starter'),
    (new.id,'trail_default','starter'),
    (new.id,'cursor_default','starter'),
    (new.id,'predictor_default','starter'),
    (new.id,'result_default','starter');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

-- updated_at triggers
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists roles_updated_at on public.user_roles;
create trigger roles_updated_at before update on public.user_roles
for each row execute procedure public.set_updated_at();

drop trigger if exists stats_updated_at on public.player_stats;
create trigger stats_updated_at before update on public.player_stats
for each row execute procedure public.set_updated_at();

drop trigger if exists wallets_updated_at on public.wallets;
create trigger wallets_updated_at before update on public.wallets
for each row execute procedure public.set_updated_at();

drop trigger if exists equipped_updated_at on public.equipped_cosmetics;
create trigger equipped_updated_at before update on public.equipped_cosmetics
for each row execute procedure public.set_updated_at();

drop trigger if exists requests_updated_at on public.friend_requests;
create trigger requests_updated_at before update on public.friend_requests
for each row execute procedure public.set_updated_at();

drop trigger if exists tournaments_updated_at on public.tournaments;
create trigger tournaments_updated_at before update on public.tournaments
for each row execute procedure public.set_updated_at();

drop trigger if exists announcements_updated_at on public.site_announcements;
create trigger announcements_updated_at before update on public.site_announcements
for each row execute procedure public.set_updated_at();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.player_stats enable row level security;
alter table public.wallets enable row level security;
alter table public.inventory enable row level security;
alter table public.equipped_cosmetics enable row level security;
alter table public.user_achievements enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.race_rooms enable row level security;
alter table public.race_players enable row level security;
alter table public.prediction_suggestions enable row level security;
alter table public.prediction_votes enable row level security;
alter table public.site_announcements enable row level security;
alter table public.admin_audit_log enable row level security;

-- Public player-facing reads
create policy "profiles readable by everyone"
on public.profiles for select using (true);

create policy "profiles editable by owner"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "roles readable by owner"
on public.user_roles for select
using (auth.uid() = user_id);

create policy "stats readable by everyone"
on public.player_stats for select using (true);

create policy "wallet readable by owner"
on public.wallets for select
using (auth.uid() = user_id);

create policy "inventory readable by owner"
on public.inventory for select
using (auth.uid() = user_id);

create policy "equipped cosmetics readable by everyone"
on public.equipped_cosmetics for select using (true);

create policy "equipped cosmetics insertable by owner"
on public.equipped_cosmetics for insert
with check (auth.uid() = user_id);

create policy "equipped cosmetics editable by owner"
on public.equipped_cosmetics for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "achievements readable by everyone"
on public.user_achievements for select using (true);

create policy "friend requests readable by participants"
on public.friend_requests for select
using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "friend requests creatable by sender"
on public.friend_requests for insert
with check (auth.uid() = sender_id and status = 'pending');

create policy "friend requests cancellable by sender or answerable by receiver"
on public.friend_requests for update
using (auth.uid() = sender_id or auth.uid() = receiver_id)
with check (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "friendships readable by participants"
on public.friendships for select
using (auth.uid() = user_a or auth.uid() = user_b);

create policy "tournaments readable by everyone"
on public.tournaments for select using (true);

create policy "tournament entries readable by everyone"
on public.tournament_entries for select using (true);

create policy "race rooms readable by everyone"
on public.race_rooms for select using (true);

create policy "race players readable by everyone"
on public.race_players for select using (true);

create policy "prediction suggestions readable when approved or authored"
on public.prediction_suggestions for select
using (status = 'approved' or auth.uid() = author_id);

create policy "prediction suggestions creatable by signed in author"
on public.prediction_suggestions for insert
with check (auth.uid() = author_id);

create policy "prediction votes readable by everyone"
on public.prediction_votes for select using (true);

create policy "prediction votes creatable by voter"
on public.prediction_votes for insert
with check (auth.uid() = user_id);

create policy "prediction votes removable by voter"
on public.prediction_votes for delete
using (auth.uid() = user_id);

create policy "active announcements readable by everyone"
on public.site_announcements for select
using (active = true);

-- Intentionally no direct browser write policies for:
-- wallets, player_stats, inventory rewards, achievements, tournaments,
-- tournament entries, race state, announcements, roles, or audit logs.
-- Those mutations will go through trusted Edge Functions / service-role code.
