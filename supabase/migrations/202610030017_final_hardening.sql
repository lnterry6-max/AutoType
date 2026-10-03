-- AutoType final security/performance hardening.

drop policy if exists "admin audit client deny" on public.admin_audit_log;
create policy "admin audit client deny"
on public.admin_audit_log
for all
to anon,authenticated
using (false)
with check (false);

create index if not exists admin_audit_log_actor_id_idx on public.admin_audit_log(actor_id);
create index if not exists economy_transactions_user_id_idx on public.economy_transactions(user_id);
create index if not exists friend_requests_sender_id_idx on public.friend_requests(sender_id);
create index if not exists friend_requests_receiver_id_idx on public.friend_requests(receiver_id);
create index if not exists friendships_user_b_idx on public.friendships(user_b);
create index if not exists prediction_suggestions_author_id_idx on public.prediction_suggestions(author_id);
create index if not exists prediction_votes_user_id_idx on public.prediction_votes(user_id);
create index if not exists race_players_user_id_idx on public.race_players(user_id);
create index if not exists race_rooms_host_id_idx on public.race_rooms(host_id);
create index if not exists shop_collection_items_item_id_idx on public.shop_collection_items(item_id);
create index if not exists site_announcements_created_by_idx on public.site_announcements(created_by);
create index if not exists tournament_entries_user_id_idx on public.tournament_entries(user_id);
create index if not exists tournaments_created_by_idx on public.tournaments(created_by);
create index if not exists tournaments_winner_id_idx on public.tournaments(winner_id);
