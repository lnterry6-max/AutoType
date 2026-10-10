import { type MaintenanceAdmin, maintenanceClosed, maintenanceResponse, isMaintenanceError, beginOperation, endOperation } from "../_shared/maintenance.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json"
};

Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers:corsHeaders});

  let lease:string|undefined;let operationAdmin:MaintenanceAdmin|undefined;
  try{
    const authHeader=req.headers.get("Authorization");
    if(!authHeader)throw new Error("Missing authorization.");

    const url=Deno.env.get("SUPABASE_URL")!;
    const publishable=Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient=createClient(url,publishable,{global:{headers:{Authorization:authHeader}}});
    const token=authHeader.replace("Bearer ","");
    const {data:{user},error:userError}=await userClient.auth.getUser(token);
    if(userError||!user)return new Response(JSON.stringify({error:"Unauthorized"}),{status:401,headers:corsHeaders});

    const admin=createClient(url,serviceRole,{auth:{autoRefreshToken:false,persistSession:false}});
    operationAdmin=admin;lease=await beginOperation(admin,"delete-account");
    const {error:deleteError}=await admin.auth.admin.deleteUser(user.id);
    if(deleteError)throw deleteError;

    return new Response(JSON.stringify({ok:true}),{status:200,headers:corsHeaders});
  }catch(error){
    if(isMaintenanceError(error))return maintenanceResponse(corsHeaders);
    return new Response(JSON.stringify({error:error instanceof Error?error.message:"Account deletion failed."}),{status:400,headers:corsHeaders});
  }finally{if(lease&&operationAdmin)await endOperation(operationAdmin,lease)}
});
