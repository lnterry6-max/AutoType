import { type MaintenanceAdmin, maintenanceClosed, maintenanceResponse, isMaintenanceError, beginOperation, endOperation } from "../_shared/maintenance.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@^22";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});

  const stripeKey=Deno.env.get("STRIPE_SECRET_KEY")||"";
  const webhookSecret=Deno.env.get("STRIPE_WEBHOOK_SECRET")||"";
  if(!/^sk_test_|^rk_test_/.test(stripeKey)||!webhookSecret)return new Response("Stripe webhook not configured",{status:503});

  const signature=req.headers.get("stripe-signature")||"";
  const body=await req.text();
  const stripe=new Stripe(stripeKey);
  const cryptoProvider=Stripe.createSubtleCryptoProvider();

  let event:Stripe.Event;
  try{
    event=await stripe.webhooks.constructEventAsync(body,signature,webhookSecret,undefined,cryptoProvider);
  }catch(error){
    console.error("Stripe signature verification failed",error);
    return new Response("Bad signature",{status:400});
  }


  let lease:string|undefined;let operationAdmin:MaintenanceAdmin|undefined;
  try{
    const url=Deno.env.get("SUPABASE_URL")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});

    operationAdmin=admin;lease=await beginOperation(admin,"webhook");
    if(event.livemode!==false)return new Response("Live payments are disabled during beta",{status:400});
    let kind:string|null=null;
    let payload:Record<string,unknown>={};
    const intentId=(value:unknown)=>typeof value==="string"?value:(value as {id?:string}|null)?.id||"";
    if(event.type==="checkout.session.completed"||event.type==="checkout.session.async_payment_succeeded"){
      const session=event.data.object as Stripe.Checkout.Session;
      if(session.payment_status==="paid"){
        kind="credit";
        payload={session:session.id,order_id:session.metadata?.order_id||"",
          user_id:session.metadata?.user_id||session.client_reference_id||"",
          pack_id:session.metadata?.pack_id||"",payment_intent:intentId(session.payment_intent),
          amount:session.amount_total,currency:session.currency};
      }
    }else if(event.type==="checkout.session.expired"){
      const session=event.data.object as Stripe.Checkout.Session;
      kind="expired";payload={session:session.id,order_id:session.metadata?.order_id||"",payment_intent:intentId(session.payment_intent)};
    }else if(["refund.created","refund.updated","refund.failed"].includes(event.type)){
      // A delayed snapshot may predate a later transition. Fetch current test
      // object state; signature verification above always precedes any request.
      const refund=await stripe.refunds.retrieve((event.data.object as Stripe.Refund).id);
      kind="refund";payload={object_id:refund.id,payment_intent:intentId(refund.payment_intent),amount:refund.amount,status:refund.status};
    }else if(["charge.dispute.created","charge.dispute.updated","charge.dispute.closed"].includes(event.type)){
      const dispute=await stripe.disputes.retrieve((event.data.object as Stripe.Dispute).id);
      if(dispute.livemode!==false)throw new Error("Live dispute rejected");
      let paymentIntent=intentId(dispute.payment_intent);
      if(!paymentIntent){
        const charge=await stripe.charges.retrieve(intentId(dispute.charge));
        if(charge.livemode!==false)throw new Error("Live charge rejected");
        paymentIntent=intentId(charge.payment_intent);
      }
      kind="dispute";payload={object_id:dispute.id,payment_intent:paymentIntent,amount:dispute.amount,status:dispute.status};
    }
    if(kind){
      const {data,error}=await admin.rpc("autotype_receive_stripe_event",{
        p_event_id:event.id,p_event_type:event.type,p_kind:kind,p_payload:payload,p_livemode:event.livemode
      });
      if(error)throw error;
      // Pending unmatched orders are retained and reconciled on credit. SQL
      // application failures are also retained, but request delivery retry.
      if(data?.error||data?.reconciled?.some((item:{error?:string})=>item.error))throw new Error("Stripe event reconciliation requires retry");
      return Response.json(data);
    }
    return Response.json({received:true});
  }catch(error){
    if(isMaintenanceError(error))return maintenanceResponse();
    console.error("Stripe webhook processing failed",error);
    return new Response("Webhook processing failed",{status:500});
  }finally{if(lease&&operationAdmin)await endOperation(operationAdmin,lease)}
});