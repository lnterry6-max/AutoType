-- Label the four free cosmetic crates by gameplay mode; progress stays shared.
alter table public.crate_definitions add column if not exists game_mode text;

update public.crate_definitions
set name='Word Mode Crate',
    description='Neon-themed surprises inspired by Classic Word Mode.',
    categories=array['Titles','Banners','Frames']::text[],
    game_mode='classic'
where id='neon_nights_crate' and active=true and rounds_per_drop=5;

update public.crate_definitions
set name='Context Mode Crate',
    description='Cosmic arenas and game effects inspired by contextual predictions.',
    game_mode='context'
where id='cosmic_crate' and active=true and rounds_per_drop=5;

update public.crate_definitions
set name='Sentence Mode Crate',
    description='Colorful banners, frames, and trails inspired by sentence play.',
    game_mode='sentence'
where id='color_shuffle_crate' and active=true and rounds_per_drop=5;

insert into public.crate_definitions
  (id,name,description,key_cost,rounds_per_drop,game_mode,categories,odds,active)
values(
  'evil_glitch_crate','Evil Mode Crate',
  'Glitched effects and flashy colors inspired by Evil Mode.',
  0,5,'evil',
  array['Banners','Typing Trails','Game FX']::text[],
  '{"Common":33,"Uncommon":29,"Rare":22,"Epic":13,"Legendary":3}'::jsonb,true
)
on conflict (id) do nothing;

alter table public.crate_definitions
  add constraint crate_free_mode_valid
  check (rounds_per_drop=0 or game_mode in ('classic','context','sentence','evil'));
