alter table public.race_players
  add column if not exists duration_ms integer,
  add column if not exists errors integer not null default 0,
  add column if not exists erased integer not null default 0;
