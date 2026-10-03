-- AutoType full backend migration: game results and global daily state.

create table if not exists public.round_results (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null,
  score bigint not null check (score >= 0),
  words integer not null check (words >= 0),
  erased integer not null check (erased >= 0),
  errors integer not null check (errors >= 0),
  keys integer not null check (keys >= 0),
  max_streak integer not null check (max_streak >= 0),
  elapsed_ms bigint not null check (elapsed_ms >= 0),
  mind_reader boolean not null default false,
  coins_earned integer not null default 0 check (coins_earned >= 0),
  created_at timestamptz not null default now()
);

create index if not exists round_results_user_created_idx
on public.round_results(user_id, created_at desc);

create table if not exists public.daily_scores (
  score_date date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score bigint not null default 0 check (score >= 0),
  updated_at timestamptz not null default now(),
  primary key(score_date,user_id)
);

create index if not exists daily_scores_date_score_idx
on public.daily_scores(score_date, score desc);

create table if not exists public.daily_reward_claims (
  score_date date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_coins integer not null default 150,
  claimed_at timestamptz not null default now(),
  primary key(score_date,user_id)
);

alter table public.round_results enable row level security;
alter table public.daily_scores enable row level security;
alter table public.daily_reward_claims enable row level security;

create policy "round results readable by owner"
on public.round_results for select
using (auth.uid()=user_id);

create policy "daily scores readable by everyone"
on public.daily_scores for select using (true);

create policy "daily claims readable by owner"
on public.daily_reward_claims for select
using (auth.uid()=user_id);

grant select on public.round_results to authenticated;
grant select on public.daily_scores to anon, authenticated;
grant select on public.daily_reward_claims to authenticated;

grant select,insert,update,delete on public.round_results to service_role;
grant select,insert,update,delete on public.daily_scores to service_role;
grant select,insert,update,delete on public.daily_reward_claims to service_role;

alter table public.tournaments
  add column if not exists schedule_label text not null default 'TBA',
  add column if not exists built_in boolean not null default false;

insert into public.tournaments(
  id,name,description,status,entry_type,entry_cost,reward_coins,reward_crate_tokens,
  reward_title,max_players,schedule_label,built_in
)
values
  ('11111111-1111-4111-8111-111111111111','Daily Open',
   'A free-entry daily bracket for anyone who wants a competitive run.',
   'open','free',0,300,1,'Daily Champion',32,'Daily',true),
  ('22222222-2222-4222-8222-222222222222','Ranked Circuit',
   'Earn Tournament Tickets through regular play, then use one to register.',
   'open','ticket',1,800,2,'Circuit Winner',16,'Friday',true),
  ('33333333-3333-4333-8333-333333333333','Weekend Championship',
   'The larger weekend event with higher cosmetic and coin rewards.',
   'open','ticket',2,1500,3,'Weekend Champion',16,'Saturday',true)
on conflict(id) do update set
  name=excluded.name,
  description=excluded.description,
  entry_type=excluded.entry_type,
  entry_cost=excluded.entry_cost,
  reward_coins=excluded.reward_coins,
  reward_crate_tokens=excluded.reward_crate_tokens,
  reward_title=excluded.reward_title,
  max_players=excluded.max_players,
  schedule_label=excluded.schedule_label,
  built_in=true;

-- Race rooms are readable only to participants once a race starts being used.
-- For now keep the existing public read policy for prototype spectating,
-- while writes remain server-only.
grant select on public.race_rooms, public.race_players to anon, authenticated;
grant select,insert,update,delete on public.race_rooms, public.race_players to service_role;
