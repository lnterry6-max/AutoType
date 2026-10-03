/* AutoType Supabase backend adapter.
 *
 * This file is intentionally additive during migration. The current local
 * prototype remains usable until AUTOTYPE_SUPABASE is configured and pages
 * are switched over one feature at a time.
 *
 * Never place a Supabase service_role key in this file or any browser code.
 */
(function(){
  "use strict";

  let client=null;

  function config(){
    return window.AUTOTYPE_SUPABASE||{};
  }

  function configured(){
    const c=config();
    return !!(c.url&&c.publishableKey&&window.supabase?.createClient);
  }

  function getClient(){
    if(client)return client;
    if(!configured())return null;
    const c=config();
    client=window.supabase.createClient(c.url,c.publishableKey,{
      auth:{
        persistSession:true,
        autoRefreshToken:true,
        detectSessionInUrl:true
      }
    });
    return client;
  }

  async function session(){
    const db=getClient();
    if(!db)return null;
    const {data,error}=await db.auth.getSession();
    if(error)throw error;
    return data.session||null;
  }

  async function user(){
    const db=getClient();
    if(!db)return null;
    const {data,error}=await db.auth.getUser();
    if(error)throw error;
    return data.user||null;
  }

  async function signUp({username,email,password,displayName=""}){
    const db=getClient();
    if(!db)throw new Error("Supabase is not configured yet.");
    const cleanUsername=String(username||"").trim();
    const cleanEmail=String(email||"").trim().toLowerCase();
    if(!cleanEmail)throw new Error("Email is required for online accounts.");
    const {data,error}=await db.auth.signUp({
      email:cleanEmail,
      password,
      options:{
        data:{
          username:cleanUsername,
          display_name:String(displayName||cleanUsername).trim()
        }
      }
    });
    if(error)throw error;
    return data;
  }

  async function signIn({email,password}){
    const db=getClient();
    if(!db)throw new Error("Supabase is not configured yet.");
    const {data,error}=await db.auth.signInWithPassword({
      email:String(email||"").trim().toLowerCase(),
      password
    });
    if(error)throw error;
    return data;
  }

  async function signOut(){
    const db=getClient();
    if(!db)return;
    const {error}=await db.auth.signOut();
    if(error)throw error;
  }

  async function myProfile(){
    const db=getClient();
    const current=await user();
    if(!db||!current)return null;
    const {data,error}=await db
      .from("profiles")
      .select("*")
      .eq("id",current.id)
      .single();
    if(error)throw error;
    return data;
  }

  async function updateMyProfile(patch){
    const db=getClient();
    const current=await user();
    if(!db||!current)throw new Error("Sign in first.");
    const allowed={};
    for(const key of ["username","display_name","bio","avatar_url"]){
      if(key in patch)allowed[key]=patch[key];
    }
    const {data,error}=await db
      .from("profiles")
      .update(allowed)
      .eq("id",current.id)
      .select()
      .single();
    if(error)throw error;
    return data;
  }

  async function myWallet(){
    const db=getClient();
    const current=await user();
    if(!db||!current)return null;
    const {data,error}=await db
      .from("wallets")
      .select("coins,tournament_tickets,crate_tokens,updated_at")
      .eq("user_id",current.id)
      .single();
    if(error)throw error;
    return data;
  }

  async function myStats(){
    const db=getClient();
    const current=await user();
    if(!db||!current)return null;
    const {data,error}=await db
      .from("player_stats")
      .select("*")
      .eq("user_id",current.id)
      .single();
    if(error)throw error;
    return data;
  }

  async function myInventory(){
    const db=getClient();
    const current=await user();
    if(!db||!current)return [];
    const {data,error}=await db
      .from("inventory")
      .select("item_id,source,obtained_at")
      .eq("user_id",current.id)
      .order("obtained_at",{ascending:true});
    if(error)throw error;
    return data||[];
  }

  async function publicProfileByUsername(username){
    const db=getClient();
    if(!db)return null;
    const {data,error}=await db
      .from("profiles")
      .select("id,username,display_name,bio,avatar_url,created_at")
      .eq("username",String(username||"").trim())
      .maybeSingle();
    if(error)throw error;
    return data||null;
  }

  async function leaderboard(limit=50){
    const db=getClient();
    if(!db)return [];
    const {data,error}=await db
      .from("player_stats")
      .select("user_id,best_score,best_streak,total_score,rounds,profiles!inner(username,display_name,avatar_url)")
      .order("best_score",{ascending:false})
      .limit(Math.max(1,Math.min(100,Number(limit)||50)));
    if(error)throw error;
    return data||[];
  }

  window.AutoTypeBackend={
    configured,
    getClient,
    session,
    user,
    signUp,
    signIn,
    signOut,
    myProfile,
    updateMyProfile,
    myWallet,
    myStats,
    myInventory,
    publicProfileByUsername,
    leaderboard
  };
})();
