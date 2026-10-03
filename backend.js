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
    for(const key of ["username","display_name","bio","avatar_url","favorite_modes"]){
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

  async function myRole(){
    const db=getClient();
    const current=await user();
    if(!db||!current)return null;
    const {data,error}=await db
      .from("user_roles")
      .select("role")
      .eq("user_id",current.id)
      .single();
    if(error)throw error;
    return data?.role||"player";
  }

  async function myEquipped(){
    const db=getClient();
    const current=await user();
    if(!db||!current)return null;
    const {data,error}=await db
      .from("equipped_cosmetics")
      .select("*")
      .eq("user_id",current.id)
      .single();
    if(error)throw error;
    return data;
  }

  async function setEquipped(slot,itemId){
    const db=getClient();
    const current=await user();
    if(!db||!current)throw new Error("Sign in first.");
    const columns={
      title:"title_id",banner:"banner_id",frame:"frame_id",arena:"arena_id",
      trail:"trail_id",cursor:"cursor_id",predictor:"predictor_id",result:"victory_fx_id"
    };
    const column=columns[slot];
    if(!column)throw new Error("Unknown cosmetic slot.");
    const {data,error}=await db
      .from("equipped_cosmetics")
      .update({[column]:itemId})
      .eq("user_id",current.id)
      .select()
      .single();
    if(error)throw error;
    return data;
  }

  async function myAchievements(){
    const db=getClient();
    const current=await user();
    if(!db||!current)return [];
    const {data,error}=await db
      .from("user_achievements")
      .select("achievement_id,unlocked_at")
      .eq("user_id",current.id);
    if(error)throw error;
    return data||[];
  }

  async function myPreferences(){
    const db=getClient();
    const current=await user();
    if(!db||!current)return null;
    const {data,error}=await db
      .from("user_preferences")
      .select("*")
      .eq("user_id",current.id)
      .single();
    if(error)throw error;
    return data;
  }

  async function updateMyPreferences(patch){
    const db=getClient();
    const current=await user();
    if(!db||!current)throw new Error("Sign in first.");
    const allowed={};
    const map={
      animations:"animations",
      reducedFx:"reduced_fx",
      showPrediction:"show_prediction",
      backgroundType:"background_type",
      backgroundColor:"background_color",
      backgroundImage:"background_image_url",
      backgroundDim:"background_dim",
      backgroundLuminance:"background_luminance"
    };
    for(const [front,back] of Object.entries(map)){
      if(front in patch)allowed[back]=patch[front];
    }
    const {data,error}=await db
      .from("user_preferences")
      .update(allowed)
      .eq("user_id",current.id)
      .select()
      .single();
    if(error)throw error;
    return data;
  }

  async function uploadAvatar(file){
    const db=getClient();
    const current=await user();
    if(!db||!current)throw new Error("Sign in first.");
    if(!file)throw new Error("Choose an image first.");
    if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Use a JPG, PNG, or WebP image.");
    if(file.size>5*1024*1024)throw new Error("Avatar must be 5 MB or smaller.");

    const path=`${current.id}/avatar`;
    const {error:uploadError}=await db.storage
      .from("avatars")
      .upload(path,file,{upsert:true,contentType:file.type,cacheControl:"3600"});
    if(uploadError)throw uploadError;

    const {data:publicData}=db.storage.from("avatars").getPublicUrl(path);
    const url=`${publicData.publicUrl}?v=${Date.now()}`;
    await updateMyProfile({avatar_url:url});
    return url;
  }

  async function removeAvatar(){
    const db=getClient();
    const current=await user();
    if(!db||!current)throw new Error("Sign in first.");
    await db.storage.from("avatars").remove([`${current.id}/avatar`]);
    await updateMyProfile({avatar_url:null});
    return true;
  }

  async function updatePassword(newPassword){
    const db=getClient();
    if(!db)throw new Error("Supabase is not configured yet.");
    const {data,error}=await db.auth.updateUser({password:newPassword});
    if(error)throw error;
    return data;
  }

  async function reauthenticate(password){
    const db=getClient();
    const current=await user();
    if(!db||!current?.email)throw new Error("Sign in first.");
    const {data,error}=await db.auth.signInWithPassword({email:current.email,password});
    if(error)throw new Error("Current password is incorrect.");
    return data;
  }

  async function deleteMyAccount(password){
    const db=getClient();
    if(!db)throw new Error("Supabase is not configured yet.");
    await reauthenticate(password);
    const {data,error}=await db.functions.invoke("delete-account",{body:{}});
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

  async function hydrateLocalMirror(){
    if(!window.AutoType)throw new Error("AutoType core is not loaded.");
    const current=await user();
    if(!current){
      const localStore=AutoType.store();
      if(String(localStore.currentId||"").startsWith("sb_")){
        localStore.currentId=null;
        AutoType.save();
      }
      return null;
    }

    const [profile,wallet,stats,inventory,equipped,achievements,role,preferences]=await Promise.all([
      myProfile(),myWallet(),myStats(),myInventory(),myEquipped(),myAchievements(),myRole(),myPreferences()
    ]);

    const localStore=AutoType.store();
    const localId="sb_"+current.id;
    let mirror=localStore.accounts.find(a=>a.id===localId);

    const achievementMap={};
    for(const item of achievements||[])achievementMap[item.achievement_id]=true;

    const localProfile={
      bestScore:Number(stats?.best_score||0),
      rounds:Number(stats?.rounds||0),
      words:Number(stats?.words||0),
      erased:Number(stats?.erased||0),
      bestStreak:Number(stats?.best_streak||0),
      fastest:stats?.fastest_seconds==null?null:Number(stats.fastest_seconds),
      bestErasedRound:Number(stats?.best_erased_round||0),
      mindReaderCount:Number(stats?.mind_reader_count||0),
      perfectRounds:Number(stats?.perfect_rounds||0),
      totalKeys:Number(stats?.total_keys||0),
      totalErrors:Number(stats?.total_errors||0),
      totalScore:Number(stats?.total_score||0),
      tournamentWins:Number(stats?.tournament_wins||0),
      achievements:achievementMap,
      daily:mirror?.profile?.daily||{}
    };

    const owned=(inventory||[]).map(x=>x.item_id);
    const localWallet={
      coins:Number(wallet?.coins||0),
      tickets:Number(wallet?.tournament_tickets||0),
      crateKeys:Number(wallet?.crate_tokens||0),
      owned,
      equipped:{
        title:equipped?.title_id||"title_none",
        banner:equipped?.banner_id||"banner_default",
        frame:equipped?.frame_id||"frame_default",
        arena:equipped?.arena_id||"arena_default",
        trail:equipped?.trail_id||"trail_default",
        cursor:equipped?.cursor_id||"cursor_default",
        predictor:equipped?.predictor_id||"predictor_default",
        result:equipped?.victory_fx_id||"result_default"
      },
      claims:mirror?.wallet?.claims||{}
    };

    const patch={
      id:localId,
      supabaseUserId:current.id,
      online:true,
      username:profile.username,
      email:current.email||"",
      displayName:profile.display_name||profile.username,
      bio:profile.bio||"",
      avatarImage:profile.avatar_url||"",
      favoriteModes:Array.isArray(profile.favorite_modes)?profile.favorite_modes:(mirror?.favoriteModes||[]),
      friends:mirror?.friends||[],
      profile:localProfile,
      settings:preferences?{
        animations:preferences.animations!==false,
        reducedFx:!!preferences.reduced_fx,
        showPrediction:preferences.show_prediction!==false,
        backgroundType:preferences.background_type||"solid",
        backgroundColor:preferences.background_color||"#1f2328",
        backgroundImage:preferences.background_image_url||"",
        backgroundDim:Number(preferences.background_dim??64),
        backgroundLuminance:preferences.background_luminance==null?null:Number(preferences.background_luminance)
      }:(mirror?.settings||{
        animations:true,reducedFx:false,showPrediction:true,
        backgroundType:"solid",backgroundColor:"#1f2328",
        backgroundImage:"",backgroundDim:64,backgroundLuminance:null
      }),
      wallet:localWallet,
      role:role==="developer"||role==="admin"?"developer":"user"
    };

    if(mirror)Object.assign(mirror,patch);
    else{
      mirror=patch;
      localStore.accounts.push(mirror);
    }

    // Compatibility bridge for the existing frontend shell.
    // The old UI requires both role==="developer" and developerAccountId===account.id.
    // The role itself is still sourced from Supabase user_roles.
    if(role==="developer"||role==="admin"){
      localStore.developerAccountId=localId;
    }else if(localStore.developerAccountId===localId){
      localStore.developerAccountId=null;
    }

    localStore.currentId=localId;
    AutoType.save();
    return mirror;
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
    myRole,
    myEquipped,
    setEquipped,
    myAchievements,
    myPreferences,
    updateMyPreferences,
    uploadAvatar,
    removeAvatar,
    updatePassword,
    reauthenticate,
    deleteMyAccount,
    myWallet,
    myStats,
    myInventory,
    hydrateLocalMirror,
    publicProfileByUsername,
    leaderboard
  };
})();
