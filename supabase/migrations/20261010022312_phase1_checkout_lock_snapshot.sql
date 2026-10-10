-- Keep one immutable intent-lock set before the order lock. A late inbox row
-- must never introduce a new intent lock while holding the order. Its delivery,
-- attachment retry or service-only reconciliation will safely drain it later.
create or replace function public.autotype_attach_checkout_session(p_order uuid,p_user uuid,p_session text)
returns boolean language plpgsql security definer set search_path='' as $$
declare ord public.payment_orders%rowtype; pending_intent text; pending_intents text[];
begin
 if nullif(p_session,'') is null then raise exception 'Missing session'; end if;
 select coalesce(array_agg(distinct payment_intent order by payment_intent),array[]::text[])
 into pending_intents from public.stripe_event_inbox
 where payload->>'session'=p_session and state<>'applied' and payment_intent is not null;
 foreach pending_intent in array pending_intents loop
  perform pg_advisory_xact_lock(hashtextextended(pending_intent,12503));
 end loop;
 select * into ord from public.payment_orders where id=p_order and user_id=p_user for update;
 if ord.id is null then raise exception 'Payment order not found'; end if;
 if ord.provider_session_id is distinct from p_session then
  if ord.provider_session_id is not null or ord.status<>'pending' then raise exception 'Order already bound or finalized'; end if;
  update public.payment_orders set provider_session_id=p_session where id=p_order;
  if not found then raise exception 'Session could not attach'; end if;
 end if;
 -- Also reconcile the captured set on an exact attachment retry. The initial
 -- lock set can be empty even if an event commits during session attachment.
 foreach pending_intent in array pending_intents loop
  perform public.autotype_reconcile_stripe_events(pending_intent);
 end loop;
 return true;
end; $$;
revoke all on function public.autotype_attach_checkout_session(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.autotype_attach_checkout_session(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
