import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@^22";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});

  const stripeKey=Deno.env.get("STRIPE_SECRET_KEY")||"";
  const webhookSecret=Deno.env.get("STRIPE_WEBHOOK_SECRET")||"";
  if(!stripeKey||!webhookSecret)return new Response("Stripe webhook not configured",{status:503});

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

    return Response.json({received:true});
  }catch(error){
    console.error("Stripe webhook processing failed",error);
    return new Response("Webhook processing failed",{status:500});
  }
});