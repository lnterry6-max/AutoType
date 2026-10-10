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

  let lease:string|undefined;let operationAdmin:MaintenanceAdmin|undefined;
  try{
    const auth=req.headers.get("Authorization");
    if(!auth)return json({error:"Unauthorized"},401);

    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey=Deno.env.get("STRIPE_SECRET_KEY")||"";
    if(!/^sk_test_|^rk_test_/.test(stripeKey))return json({error:"Only Stripe test refunds are enabled during beta"},503);

    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const token=auth.replace("Bearer ","");
    const {data:{user},error:userError}=await userClient.auth.getUser(token);
    if(userError||!user)return json({error:"Unauthorized"},401);

    const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:role,error:roleError}=await admin.from("user_roles")
      .select("role").eq("user_id",user.id).single();
    if(roleError)throw roleError;
    if(role.role!=="developer")return json({error:"Developer access required"},403);

    operationAdmin=admin;lease=await beginOperation(admin,"refund");
    const body=await req.json().catch(()=>({}));
    const orderId=String(body.orderId||"");
    if(!orderId)return json({error:"Payment order is required"},400);

    const {data:order,error:orderError}=await admin.from("payment_orders")
      .select("*").eq("id",orderId).single();
    if(orderError)throw orderError;
    if(!order.provider_payment_intent_id)throw new Error("This payment has no Stripe PaymentIntent.");
    if(!["paid","partially_refunded","disputed","dispute_won"].includes(order.status)){
      throw new Error("This payment is not refundable.");
    }

    const remaining=Math.max(0,Number(order.amount_cents||0)-Number(order.refunded_amount_cents||0));
    if(!remaining)throw new Error("This payment has already been fully refunded.");

    const stripe=new Stripe(stripeKey);
    const refund=await stripe.refunds.create({
      payment_intent:order.provider_payment_intent_id,
      amount:remaining,
      reason:"requested_by_customer",
      metadata:{
        autotype_order_id:order.id,
        autotype_user_id:order.user_id,
        refunded_by:user.id
      }
    },{
      idempotencyKey:`autotype-full-refund-${order.id}-${remaining}`
    });

    const {data:applied,error:applyError}=await admin.rpc("autotype_apply_stripe_refund",{
      p_event_id:`autotype_admin_refund:${refund.id}`,
      p_event_type:"autotype.admin_refund",
      p_refund_id:refund.id,
      p_payment_intent:order.provider_payment_intent_id,
      p_amount:Number(refund.amount||remaining),
      p_status:String(refund.status||"")
    });
    if(applyError)throw applyError;

    const {error:auditError}=await admin.from("admin_audit_log").insert({
      actor_id:user.id,
      action:"refund_payment",
      target_type:"payment_order",
      target_id:order.id,
      details:{refund_id:refund.id,amount_cents:refund.amount,status:refund.status}
    });

    if(auditError)throw auditError;
    if(applied?.error)throw new Error("Refund saved for reconciliation; retry required");
    return json({refundId:refund.id,status:refund.status,amount:refund.amount,result:applied});
  }catch(error){
    if(isMaintenanceError(error))return maintenanceResponse(cors);
    console.error(error);
    return json({error:error instanceof Error?error.message:"Refund failed"},400);
  }finally{if(lease&&operationAdmin)await endOperation(operationAdmin,lease)}
});