-- Fixed-content cosmetic collections and direct-purchase cosmetic stock.
insert into public.shop_items(id,slot,category,name,price,rarity,collection_only,earned_only,active)
values
 ('title_pixelpilot','title','Titles','Pixel Pilot',0,'Epic',true,false,true),
 ('title_starcaptain','title','Titles','Star Captain',0,'Legendary',true,false,true),
 ('banner_pixelpop','banner','Banners','Pixel Pop',800,'Rare',false,false,true),
 ('banner_starlight','banner','Banners','Starlight',950,'Epic',false,false,true),
 ('frame_mintline','frame','Frames','Mint Line',550,'Rare',false,false,true),
 ('frame_cosmicglow','frame','Frames','Cosmic Glow',750,'Epic',false,false,true),
 ('trail_mintflash','trail','Typing Trails','Mint Flash',750,'Rare',false,false,true),
 ('trail_startrail','trail','Typing Trails','Star Trail',1150,'Epic',false,false,true),
 ('arena_pixelscape','arena','Arena Skins','Pixelscape',1250,'Epic',false,false,true),
 ('arena_nightshift','arena','Arena Skins','Night Shift',1650,'Legendary',false,false,true),
 ('predictor_pixelmint','predictor','Game FX','Pixel Mint',520,'Uncommon',false,false,true),
 ('result_pixelburst','result','Game FX','Pixel Burst',1050,'Epic',false,false,true),
 ('result_starflare','result','Game FX','Starflare',1550,'Legendary',false,false,true)
on conflict(id) do nothing;

insert into public.shop_collections(id,name,price,rarity,active)
values
 ('pixel_pop_set','Pixel Pop',2850,'Epic',true),
 ('starbound_set','Starbound',3500,'Legendary',true)
on conflict(id) do nothing;

insert into public.shop_collection_items(collection_id,item_id,position)
values
 ('pixel_pop_set','title_pixelpilot',0),
 ('pixel_pop_set','banner_pixelpop',1),
 ('pixel_pop_set','frame_mintline',2),
 ('pixel_pop_set','trail_mintflash',3),
 ('pixel_pop_set','arena_pixelscape',4),
 ('pixel_pop_set','result_pixelburst',5),
 ('starbound_set','title_starcaptain',0),
 ('starbound_set','banner_starlight',1),
 ('starbound_set','frame_cosmicglow',2),
 ('starbound_set','trail_startrail',3),
 ('starbound_set','arena_nightshift',4),
 ('starbound_set','result_starflare',5)
on conflict(collection_id,item_id) do nothing;
