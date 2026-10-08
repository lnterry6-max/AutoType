create table if not exists public.security_questions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  question text not null,
  answer_hash text not null,
  updated_at timestamptz not null default now(),
  constraint security_question_length check (char_length(question) between 5 and 160)
);
alter table public.security_questions enable row level security;
drop trigger if exists security_questions_updated_at on public.security_questions;
create trigger security_questions_updated_at before update on public.security_questions
for each row execute procedure public.set_updated_at();
drop policy if exists "security question readable by owner" on public.security_questions;
create policy "security question readable by owner" on public.security_questions for select using (auth.uid()=user_id);
grant select on public.security_questions to authenticated;
grant select,insert,update,delete on public.security_questions to service_role;

create table if not exists public.shop_items (
  id text primary key,slot text not null,category text not null,name text not null,
  price integer not null default 0 check(price>=0),rarity text not null,
  collection_only boolean not null default false,earned_only boolean not null default false,
  active boolean not null default true
);
alter table public.shop_items enable row level security;
drop policy if exists "shop items readable" on public.shop_items;
create policy "shop items readable" on public.shop_items for select using(active=true);
grant select on public.shop_items to anon,authenticated;
grant select,insert,update,delete on public.shop_items to service_role;
insert into public.shop_items(id,slot,category,name,price,rarity,collection_only,earned_only,active)
values
('title_none','title','Titles','No Title',0,'Default',false,false,true),
('title_quickfingers','title','Titles','Quick Fingers',250,'Common',false,false,true),
('title_backspace','title','Titles','Backspace Bandit',350,'Uncommon',false,false,true),
('title_mindreader','title','Titles','Mind Reader',0,'Rare',false,true,true),
('title_breaker','title','Titles','Prediction Breaker',900,'Epic',false,false,true),
('title_lockedin','title','Titles','Locked In',1200,'Legendary',false,false,true),
('title_neonrunner','title','Titles','Neon Runner',0,'Epic',true,false,true),
('title_afterglow','title','Titles','Afterglow',0,'Epic',true,false,true),
('title_voidwalker','title','Titles','Void Walker',0,'Legendary',true,false,true),
('banner_default','banner','Banners','Default Banner',0,'Default',false,false,true),
('banner_slate','banner','Banners','Slate Runner',300,'Common',false,false,true),
('banner_circuit','banner','Banners','Electric Circuit',700,'Rare',false,false,true),
('banner_sunset','banner','Banners','Afterglow',900,'Epic',false,false,true),
('banner_void','banner','Banners','Deep Void',800,'Rare',false,false,true),
('trail_default','trail','Typing Trails','No Trail',0,'Default',false,false,true),
('trail_echo','trail','Typing Trails','Echo Trail',400,'Uncommon',false,false,true),
('trail_velocity','trail','Typing Trails','Velocity Trail',650,'Rare',false,false,true),
('trail_comet','trail','Typing Trails','Pixel Comet',950,'Epic',false,false,true),
('trail_gold','trail','Typing Trails','Golden Sparks',1500,'Legendary',false,false,true),
('frame_default','frame','Frames','No Frame',0,'Default',false,false,true),
('frame_silver','frame','Frames','Steel Ring',300,'Common',false,false,true),
('frame_blue','frame','Frames','Electric Ring',450,'Uncommon',false,false,true),
('frame_gold','frame','Frames','Champion Ring',950,'Epic',false,false,true),
('frame_glitch','frame','Frames','Glitch Ring',800,'Rare',false,false,true),
('arena_default','arena','Arena Skins','Default Arena',0,'Default',false,false,true),
('arena_notebook','arena','Arena Skins','Study Grid',550,'Uncommon',false,false,true),
('arena_terminal','arena','Arena Skins','Terminal Core',900,'Rare',false,false,true),
('arena_arcade','arena','Arena Skins','Arcade Cabinet',1350,'Epic',false,false,true),
('arena_void','arena','Arena Skins','Void Chamber',1950,'Legendary',false,false,true),
('cursor_default','cursor','Game FX','Default Cursor',0,'Default',false,false,true),
('cursor_pulse','cursor','Game FX','Pulse Cursor',500,'Rare',false,false,true),
('cursor_gold','cursor','Game FX','Gold Cursor',700,'Rare',false,false,true),
('predictor_default','predictor','Game FX','Default Predictor',0,'Default',false,false,true),
('predictor_mint','predictor','Game FX','Mint Prediction',550,'Uncommon',false,false,true),
('predictor_amber','predictor','Game FX','Amber Prediction',550,'Rare',false,false,true),
('predictor_violet','predictor','Game FX','Violet Prediction',650,'Epic',false,false,true),
('cursor_white','cursor','Game FX','White Cursor',250,'Common',false,false,true),
('predictor_slate','predictor','Game FX','Slate Prediction',300,'Common',false,false,true),
('result_snap','result','Game FX','Snap Finish',350,'Common',false,false,true),
('result_default','result','Game FX','Default Finish',0,'Default',false,false,true),
('result_burst','result','Game FX','Clean Burst',1000,'Epic',false,false,true),
('result_neonstorm','result','Game FX','Neon Storm',1700,'Legendary',false,false,true)
on conflict(id) do update set slot=excluded.slot,category=excluded.category,name=excluded.name,price=excluded.price,rarity=excluded.rarity,collection_only=excluded.collection_only,earned_only=excluded.earned_only,active=excluded.active;

create table if not exists public.shop_collections (
  id text primary key,name text not null,price integer not null check(price>=0),rarity text not null,active boolean not null default true
);
alter table public.shop_collections enable row level security;
drop policy if exists "shop collections readable" on public.shop_collections;
create policy "shop collections readable" on public.shop_collections for select using(active=true);
grant select on public.shop_collections to anon,authenticated;
grant select,insert,update,delete on public.shop_collections to service_role;
insert into public.shop_collections(id,name,price,rarity,active)
values
('neon_circuit','Neon Circuit',2200,'Epic',true),
('afterglow_set','Afterglow',2700,'Epic',true),
('deep_void_set','Deep Void',3600,'Legendary',true)
on conflict(id) do update set name=excluded.name,price=excluded.price,rarity=excluded.rarity,active=excluded.active;

create table if not exists public.shop_collection_items (
  collection_id text not null references public.shop_collections(id) on delete cascade,
  item_id text not null references public.shop_items(id) on delete cascade,
  position integer not null default 0,
  primary key(collection_id,item_id)
);
alter table public.shop_collection_items enable row level security;
drop policy if exists "collection items readable" on public.shop_collection_items;
create policy "collection items readable" on public.shop_collection_items for select using(true);
grant select on public.shop_collection_items to anon,authenticated;
grant select,insert,update,delete on public.shop_collection_items to service_role;
insert into public.shop_collection_items(collection_id,item_id,position)
values
('neon_circuit','title_neonrunner',0),
('neon_circuit','banner_circuit',1),
('neon_circuit','frame_blue',2),
('neon_circuit','arena_terminal',3),
('neon_circuit','trail_velocity',4),
('neon_circuit','predictor_violet',5),
('afterglow_set','title_afterglow',0),
('afterglow_set','banner_sunset',1),
('afterglow_set','frame_gold',2),
('afterglow_set','arena_arcade',3),
('afterglow_set','cursor_gold',4),
('afterglow_set','result_burst',5),
('deep_void_set','title_voidwalker',0),
('deep_void_set','banner_void',1),
('deep_void_set','frame_glitch',2),
('deep_void_set','arena_void',3),
('deep_void_set','trail_gold',4),
('deep_void_set','result_neonstorm',5)
on conflict(collection_id,item_id) do update set position=excluded.position;

create table if not exists public.crate_definitions (
  id text primary key,name text not null,description text not null default '',
  key_cost integer not null default 1 check(key_cost>=1),categories text[] not null,odds jsonb not null,active boolean not null default true
);
alter table public.crate_definitions enable row level security;
drop policy if exists "crate definitions readable" on public.crate_definitions;
create policy "crate definitions readable" on public.crate_definitions for select using(active=true);
grant select on public.crate_definitions to anon,authenticated;
grant select,insert,update,delete on public.crate_definitions to service_role;
insert into public.crate_definitions(id,name,description,key_cost,categories,odds,active)
values
('starter_crate','Starter Crate','A mixed cosmetic crate earned through normal play.',1,array['Titles','Banners','Arena Skins','Typing Trails','Frames','Game FX'],'{"Common":36,"Uncommon":30,"Rare":20,"Epic":11,"Legendary":3}'::jsonb,true),
('profile_crate','Profile Crate','Focused on profile titles, banners, and avatar frames.',1,array['Titles','Banners','Frames'],'{"Common":35,"Uncommon":30,"Rare":20,"Epic":12,"Legendary":3}'::jsonb,true),
('gamefx_crate','Game FX Crate','Focused on cursor, predictor, and finish effects.',1,array['Arena Skins','Game FX'],'{"Common":30,"Uncommon":32,"Rare":22,"Epic":13,"Legendary":3}'::jsonb,true)
on conflict(id) do update set name=excluded.name,description=excluded.description,key_cost=excluded.key_cost,categories=excluded.categories,odds=excluded.odds,active=excluded.active;

create table if not exists public.round_results (
  id uuid primary key,user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null,score bigint not null check(score>=0),words integer not null check(words>=0),
  erased integer not null check(erased>=0),max_streak integer not null check(max_streak>=0),
  total_keys integer not null check(total_keys>=0),errors integer not null check(errors>=0),
  duration_ms integer not null check(duration_ms>0),one_clue_finish boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists round_results_user_id_round_id on public.round_results(user_id,id);
alter table public.round_results enable row level security;
drop policy if exists "round results readable by owner" on public.round_results;
create policy "round results readable by owner" on public.round_results for select using(auth.uid()=user_id);
grant select on public.round_results to authenticated;
grant select,insert,update,delete on public.round_results to service_role;

create table if not exists public.economy_transactions (
  id bigint generated by default as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,coins_delta bigint not null default 0,tickets_delta bigint not null default 0,
  crate_tokens_delta bigint not null default 0,item_id text,metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.economy_transactions enable row level security;
drop policy if exists "economy transactions readable by owner" on public.economy_transactions;
create policy "economy transactions readable by owner" on public.economy_transactions for select using(auth.uid()=user_id);
grant select on public.economy_transactions to authenticated;
grant select,insert,update,delete on public.economy_transactions to service_role;

alter table public.tournaments add column if not exists slug text unique;
alter table public.tournaments add column if not exists schedule_label text not null default 'TBA';

insert into public.tournaments(id,slug,name,description,status,entry_type,entry_cost,reward_coins,reward_crate_tokens,reward_title,max_players,schedule_label)
values
('11111111-1111-4111-8111-111111111111','daily_open','Daily Open','A free-entry daily bracket for anyone who wants a competitive run.','open','free',0,300,1,'Daily Champion',32,'Daily'),
('22222222-2222-4222-8222-222222222222','ranked_circuit','Ranked Circuit','Earn Tournament Tickets through regular play, then use one to register.','open','ticket',1,800,2,'Circuit Winner',16,'Friday'),
('33333333-3333-4333-8333-333333333333','weekend_championship','The larger weekend event with higher cosmetic and coin rewards.','The larger weekend event with higher cosmetic and coin rewards.','open','ticket',2,1500,3,'Weekend Champion',16,'Saturday')
on conflict(id) do update set slug=excluded.slug,name=excluded.name,description=excluded.description,status=excluded.status,entry_type=excluded.entry_type,entry_cost=excluded.entry_cost,reward_coins=excluded.reward_coins,reward_crate_tokens=excluded.reward_crate_tokens,reward_title=excluded.reward_title,max_players=excluded.max_players,schedule_label=excluded.schedule_label;
