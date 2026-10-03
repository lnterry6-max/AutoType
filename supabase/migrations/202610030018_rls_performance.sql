-- Optimize owner/participant RLS checks and remaining foreign-key lookups.

create index if not exists daily_reward_claims_user_id_idx on public.daily_reward_claims(user_id);
create index if not exists daily_scores_user_id_idx on public.daily_scores(user_id);

drop policy if exists "profiles editable by owner" on public.profiles;
create policy "profiles editable by owner"
on public.profiles for update
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "roles readable by owner" on public.user_roles;
create policy "roles readable by owner"
on public.user_roles for select
using ((select auth.uid()) = user_id);

drop policy if exists "wallet readable by owner" on public.wallets;
create policy "wallet readable by owner"
on public.wallets for select
using ((select auth.uid()) = user_id);

drop policy if exists "inventory readable by owner" on public.inventory;
create policy "inventory readable by owner"
on public.inventory for select
using ((select auth.uid()) = user_id);

drop policy if exists "security question readable by owner" on public.security_questions;
create policy "security question readable by owner"
on public.security_questions for select
using ((select auth.uid()) = user_id);

drop policy if exists "preferences readable by owner" on public.user_preferences;
create policy "preferences readable by owner"
on public.user_preferences for select
using ((select auth.uid()) = user_id);

drop policy if exists "preferences editable by owner" on public.user_preferences;
create policy "preferences editable by owner"
on public.user_preferences for update
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "economy transactions readable by owner" on public.economy_transactions;
create policy "economy transactions readable by owner"
on public.economy_transactions for select
using ((select auth.uid()) = user_id);

drop policy if exists "daily claims readable by owner" on public.daily_reward_claims;
create policy "daily claims readable by owner"
on public.daily_reward_claims for select
using ((select auth.uid()) = user_id);

drop policy if exists "friend requests readable by participants" on public.friend_requests;
create policy "friend requests readable by participants"
on public.friend_requests for select
using (((select auth.uid()) = sender_id) or ((select auth.uid()) = receiver_id));

drop policy if exists "friend requests creatable by sender" on public.friend_requests;
create policy "friend requests creatable by sender"
on public.friend_requests for insert
with check (((select auth.uid()) = sender_id) and status='pending');

drop policy if exists "friend requests cancellable by sender or answerable by receiver" on public.friend_requests;
create policy "friend requests cancellable by sender or answerable by receiver"
on public.friend_requests for update
using (((select auth.uid()) = sender_id) or ((select auth.uid()) = receiver_id))
with check (((select auth.uid()) = sender_id) or ((select auth.uid()) = receiver_id));

drop policy if exists "friendships readable by participants" on public.friendships;
create policy "friendships readable by participants"
on public.friendships for select
using (((select auth.uid()) = user_a) or ((select auth.uid()) = user_b));

drop policy if exists "prediction suggestions readable when approved or authored" on public.prediction_suggestions;
create policy "prediction suggestions readable when approved or authored"
on public.prediction_suggestions for select
using (status='approved' or (select auth.uid()) = author_id);

drop policy if exists "prediction suggestions creatable by signed in author" on public.prediction_suggestions;
create policy "prediction suggestions creatable by signed in author"
on public.prediction_suggestions for insert
with check ((select auth.uid()) = author_id);

drop policy if exists "prediction votes creatable by voter" on public.prediction_votes;
create policy "prediction votes creatable by voter"
on public.prediction_votes for insert
with check ((select auth.uid()) = user_id);

drop policy if exists "prediction votes removable by voter" on public.prediction_votes;
create policy "prediction votes removable by voter"
on public.prediction_votes for delete
using ((select auth.uid()) = user_id);
