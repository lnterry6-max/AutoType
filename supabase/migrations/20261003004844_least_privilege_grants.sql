-- Reset AutoType browser roles to least-privilege Data API access.

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;

grant select on table public.profiles to anon, authenticated;
grant select on table public.player_stats to anon, authenticated;
grant select on table public.equipped_cosmetics to anon, authenticated;
grant select on table public.user_achievements to anon, authenticated;
grant select on table public.tournaments to anon, authenticated;
grant select on table public.tournament_entries to anon, authenticated;
grant select on table public.race_rooms to anon, authenticated;
grant select on table public.race_players to anon, authenticated;
grant select on table public.prediction_suggestions to anon, authenticated;
grant select on table public.prediction_votes to anon, authenticated;
grant select on table public.site_announcements to anon, authenticated;

grant select on table public.user_roles to authenticated;
grant select on table public.wallets to authenticated;
grant select on table public.inventory to authenticated;
grant select on table public.friend_requests to authenticated;
grant select on table public.friendships to authenticated;

grant update on table public.profiles to authenticated;
grant insert, update on table public.equipped_cosmetics to authenticated;
grant insert, update on table public.friend_requests to authenticated;
grant insert on table public.prediction_suggestions to authenticated;
grant insert, delete on table public.prediction_votes to authenticated;

-- admin_audit_log intentionally receives no anon/authenticated privileges.
