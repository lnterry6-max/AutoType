import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@^22";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});

  const stripeKey=Deno.env.get("STRIPE_SECRET_KEY")||"";
  const webhookSecret=Deno.env.get("STRIPE_WEBHOOK_SECRET")||"";
  if(!stripeKey||!webhookSecret)return new Response("Stripe webhook not configured",{status:503});
  const liveEnabled=(Deno.env.get("STRIPE_LIVE_ENABLED")||"").toLowerCase()==="true";
  const keyIsLive=stripeKey.startsWith("sk_live_");
  const keyIsTest=stripeKey.startsWith("sk_test_");
  if(!keyIsLive&&!keyIsTest)return new Response("Invalid Stripe API key mode",{status:503});
  if(keyIsLive&&!liveEnabled)return new Response("Live webhook processing is not enabled",{status:503});

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
  if(event.livemode!==keyIsLive){
    return new Response("Stripe event environment mismatch",{status:400});
  }

  try{
    const url=Deno.env.get("SUPABASE_URL")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});

    if(event.type==="checkout.session.completed"||event.type==="checkout.session.async_payment_succeeded"){
      const session=event.data.object as Stripe.Checkout.Session;
      if(session.payment_status==="paid"){
        const userId=String(session.metadata?.user_id||session.client_reference_id||"");
        const packId=String(session.metadata?.pack_id||"");
        if(!userId||!packId)throw new Error("Checkout metadata missing.");
        const paymentIntent=typeof session.payment_intent==="string"
          ? session.payment_intent
          : session.payment_intent?.id||"";

        const {error}=await admin.rpc("autotype_credit_coin_purchase",{
          p_event_id:event.id,
          p_event_type:event.type,
          p_user:userId,
          p_session:session.id,
          p_payment_intent:paymentIntent,
          p_pack:packId,
          p_amount_total:Number(session.amount_total||0),
          p_currency:String(session.currency||"usd")
        });
        if(error)throw error;
      }
    }

    if(event.type==="checkout.session.expired"){
      const session=event.data.object as Stripe.Checkout.Session;
      await admin.from("payment_orders")
        .update({status:"cancelled"})
        .eq("provider_session_id",session.id)
        .eq("status","pending");
    }


    if(event.type==="refund.created"||event.type==="refund.updated"||event.type==="refund.failed"){
      const refund=event.data.object as Stripe.Refund;
      const paymentIntent=typeof refund.payment_intent==="string"
        ? refund.payment_intent
        : refund.payment_intent?.id||"";
      if(paymentIntent){
        const {error}=await admin.rpc("autotype_apply_stripe_refund",{
          p_event_id:event.id,
          p_event_type:event.type,
          p_refund_id:refund.id,
          p_payment_intent:paymentIntent,
          p_amount:Number(refund.amount||0),
          p_status:String(refund.status||"")
        });
        if(error)throw error;
      }
    }

    if(event.type==="charge.dispute.created"||event.type==="charge.dispute.updated"||event.type==="charge.dispute.closed"){
      const dispute=event.data.object as Stripe.Dispute;
      let paymentIntent=typeof dispute.payment_intent==="string"
        ? dispute.payment_intent
        : dispute.payment_intent?.id||"";

      if(!paymentIntent){
        const chargeId=typeof dispute.charge==="string"?dispute.charge:dispute.charge?.id||"";
        if(chargeId){
          const charge=await stripe.charges.retrieve(chargeId,{expand:["payment_intent"]});
          paymentIntent=typeof charge.payment_intent==="string"
            ? charge.payment_intent
            : charge.payment_intent?.id||"";
        }
      }

      if(paymentIntent){
        const {error}=await admin.rpc("autotype_apply_stripe_dispute",{
          p_event_id:event.id,
          p_event_type:event.type,
          p_dispute_id:dispute.id,
          p_payment_intent:paymentIntent,
          p_amount:Number(dispute.amount||0),
          p_status:String(dispute.status||"")
        });
        if(error)throw error;
      }
    }

    return Response.json({received:true});
  }catch(error){
    console.error("Stripe webhook processing failed",error);
    return new Response("Webhook processing failed",{status:500});
  }
});