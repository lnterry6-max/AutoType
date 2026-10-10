import { type MaintenanceAdmin, maintenanceClosed, maintenanceResponse, isMaintenanceError, beginOperation, endOperation } from "../_shared/maintenance.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@^22";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json"
};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);

  let lease:string|undefined;let operationAdmin:MaintenanceAdmin|undefined;let externalStarted=false,finished=false;
  try{
    const auth=req.headers.get("Authorization");
    if(!auth)return json({error:"Unauthorized"},401);

    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey=Deno.env.get("STRIPE_SECRET_KEY")||"";
    const liveEnabled=false; // Beta cannot be unlocked by a secret toggle.
    const stripeMode=/^sk_test_|^rk_test_/.test(stripeKey)?"test":stripeKey.startsWith("sk_live_")?"live":"off";

    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const token=auth.replace("Bearer ","");
    const {data:{user},error:userError}=await userClient.auth.getUser(token);
    if(userError||!user)return json({error:"Unauthorized"},401);

    const body=await req.json().catch(()=>({}));
    const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
    operationAdmin=admin;
    if(body.action==="status"){
      const maintenance=await maintenanceClosed(admin);
      if(maintenance)return json({configured:false,mode:stripeMode,liveEnabled,maintenance:true});
      const configured=!!stripeKey&&(stripeMode==="test"||(stripeMode==="live"&&liveEnabled));
      return json({configured,mode:stripeMode,liveEnabled});
    }
    if(!stripeKey)return json({error:"Stripe test payments are not configured yet."},503);
    if(stripeMode==="live"){
      return json({error:"Live Stripe payments are disabled during beta."},503);
    }
    if(stripeMode==="off")return json({error:"Stripe secret key format is not recognized."},503);

    const packId=String(body.packId||"");
    const returnBase=String(body.returnBase||"");
    const requestOrigin=req.headers.get("origin")||"";
    let base:URL;
    try{base=new URL(returnBase)}catch{return json({error:"Invalid return URL"},400)}
    if(!["http:","https:"].includes(base.protocol))return json({error:"Invalid return URL"},400);
    if(requestOrigin&&base.origin!==requestOrigin)return json({error:"Return URL origin mismatch"},400);

    lease=await beginOperation(admin,"checkout");
    const {data:order,error:orderError}=await admin.rpc("autotype_create_payment_order",{p_user:user.id,p_pack:packId});
    if(orderError)throw orderError;

    const stripe=new Stripe(stripeKey);
    const successPage=new URL("shop.html",base).href;
    const cancelPage=new URL("shop.html",base).href;
    externalStarted=true;
    const session=await stripe.checkout.sessions.create({
      mode:"payment",
      customer_email:user.email||undefined,
      client_reference_id:user.id,
      line_items:[{
        quantity:1,
        price_data:{
          currency:String(order.currency||"usd"),
          unit_amount:Number(order.amount_cents),
          product_data:{
            name:String(order.name||"AutoType Coins"),
            description:`${Number(order.coins).toLocaleString()} AutoType Coins`
          }
        }
      }],
      metadata:{
        user_id:user.id,
        pack_id:String(order.pack_id),
        order_id:String(order.order_id)
      },
      payment_intent_data:{
        metadata:{
          user_id:user.id,
          pack_id:String(order.pack_id),
          order_id:String(order.order_id)
        }
      },
      success_url:`${successPage}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${cancelPage}?payment=cancelled`
    },{idempotencyKey:`autotype-checkout-${order.order_id}`});

    if(!session.url)throw new Error("Stripe did not return a checkout URL.");
    const {error:attachError}=await admin.rpc("autotype_attach_checkout_session",{
      p_order:order.order_id,p_user:user.id,p_session:session.id
    });
    if(attachError)throw attachError;

    finished=true;
    return json({url:session.url,sessionId:session.id,orderId:order.order_id});
  }catch(error){
    if(isMaintenanceError(error))return maintenanceResponse(cors);
    console.error(error);
    return json({error:error instanceof Error?error.message:"Could not start checkout"},400);
  }finally{
    if(lease&&operationAdmin){
      if(!externalStarted||finished)await endOperation(operationAdmin,lease);
      else console.error("Uncertain financial outcome: maintenance lease retained for operator reconciliation");
    }
  }
});