create index if not exists payment_orders_pack_id_idx
on public.payment_orders(pack_id);

create index if not exists round_results_challenge_id_idx
on public.round_results(challenge_id);