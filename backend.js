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

  async function functionErrorMessage(error,fallback="Backend request failed."){
    let message=error?.message||fallback;
    const response=error?.context;
    if(response&&typeof response.clone==="function"){
      try{
        const payload=await response.clone().json();
        if(payload?.error)message=payload.error;
      }catch{
        try{
          const raw=await response.clone().text();
          if(raw)message=raw;
        }catch{}
      }
    }else if(error?.context?.body?.error){
      message=error.context.body.error;
    }
    return message;
  }

  async function api(action,payload={}){
    const db=getClient();
    if(!db)throw new Error("Supabase is not configured yet.");
    const {data,error}=await db.functions.invoke("game-api",{body:{action,payload}});
    if(error)throw new Error(await functionErrorMessage(error));
    if(data?.error)throw new Error(data.error);
    return data;
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
        emailRedirectTo:new URL("account.html",location.href).href,
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
    for(const key of ["display_name","bio","avatar_url","favorite_modes","profile_accent"]){
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
      backgroundLuminance:"background_luminance",
      highContrast:"high_contrast",
      textScale:"text_scale"
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

  async function avatarJpeg(file){
    if(!file)throw new Error("Choose an image first.");
    if(file.size>12*1024*1024)throw new Error("Avatar must be 12 MB or smaller.");
    const url=URL.createObjectURL(file);
    try{
      const img=await new Promise((resolve,reject)=>{
        const el=new Image();
        el.onload=()=>resolve(el);
        el.onerror=()=>reject(new Error("Safari could not read that image. Try JPG or PNG."));
        el.src=url;
      });
      const max=640;
      const scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext("2d");
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      return await new Promise((resolve,reject)=>canvas.toBlob(
        blob=>blob?resolve(blob):reject(new Error("Could not process avatar.")),
        "image/jpeg",0.88
      ));
    }finally{
      URL.revokeObjectURL(url);
    }
  }

  async function uploadAvatar(file){
    const db=getClient();
    const current=await user();
    if(!db||!current)throw new Error("Sign in first.");
    const blob=await avatarJpeg(file);
    const path=`${current.id}/avatar.jpg`;
    const {error:uploadError}=await db.storage
      .from("avatars")
      .upload(path,blob,{upsert:true,contentType:"image/jpeg",cacheControl:"3600"});
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
    await db.storage.from("avatars").remove([`${current.id}/avatar.jpg`,`${current.id}/avatar`]);
    await updateMyProfile({avatar_url:null});
    return true;
  }

  async function uploadBackground(dataUrl){
    const db=getClient();
    const current=await user();
    if(!db||!current)throw new Error("Sign in first.");
    if(!String(dataUrl||"").startsWith("data:image/"))throw new Error("Invalid background image.");
    const blob=await (await fetch(dataUrl)).blob();
    if(blob.size>8*1024*1024)throw new Error("Background image must be 8 MB or smaller.");
    const path=`${current.id}/background`;
    const {error:uploadError}=await db.storage
      .from("backgrounds")
      .upload(path,blob,{upsert:true,contentType:blob.type||"image/jpeg",cacheControl:"3600"});
    if(uploadError)throw uploadError;
    const {data:publicData}=db.storage.from("backgrounds").getPublicUrl(path);
    return `${publicData.publicUrl}?v=${Date.now()}`;
  }

  async function removeBackground(){
    const db=getClient();
    const current=await user();
    if(!db||!current)throw new Error("Sign in first.");
    await db.storage.from("backgrounds").remove([`${current.id}/background`]);
    return true;
  }

  async function requestPasswordReset(email){
    const db=getClient();
    if(!db)throw new Error("Supabase is not configured yet.");
    const redirectTo=new URL("account.html?reset=1",location.href).href;
    const {data,error}=await db.auth.resetPasswordForEmail(String(email||"").trim().toLowerCase(),{redirectTo});
    if(error)throw error;
    return data;
  }

  async function securityQuestion(){
    const db=getClient();
    const current=await user();
    if(!db||!current)return null;
    const {data,error}=await db.from("security_questions").select("question,updated_at").eq("user_id",current.id).maybeSingle();
    if(error)throw error;
    return data||null;
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
      .select("coins,tournament_tickets,crate_tokens,coin_debt,updated_at")
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

    const serverProfile={
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
      daily:{}
    };

    const serverOwned=(inventory||[]).map(x=>x.item_id);
    const serverEquipped={
      title:equipped?.title_id||"title_none",
      banner:equipped?.banner_id||"banner_default",
      frame:equipped?.frame_id||"frame_default",
      arena:equipped?.arena_id||"arena_default",
      trail:equipped?.trail_id||"trail_default",
      cursor:equipped?.cursor_id||"cursor_default",
      predictor:equipped?.predictor_id||"predictor_default",
      result:equipped?.victory_fx_id||"result_default"
    };

    const localProfile=serverProfile;
    const localWallet={
      coins:Number(wallet?.coins||0),
      tickets:Number(wallet?.tournament_tickets||0),
      crateKeys:Number(wallet?.crate_tokens||0),
      coinDebt:Number(wallet?.coin_debt||0),
      owned:serverOwned,
      equipped:serverEquipped,
      claims:{}
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
      profileAccent:profile.profile_accent||"#4BA6D8",
      usernameChangedAt:profile.username_changed_at||null,
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
        backgroundLuminance:preferences.background_luminance==null?null:Number(preferences.background_luminance),
        highContrast:!!preferences.high_contrast,
        textScale:Number(preferences.text_scale||100)
      }:(mirror?.settings||{
        animations:true,reducedFx:false,showPrediction:true,
        backgroundType:"solid",backgroundColor:"#1f2328",
        backgroundImage:"",backgroundDim:64,backgroundLuminance:null,
        highContrast:false,textScale:100
      }),
      wallet:localWallet,
      role:["developer","admin"].includes(role)?role:"user"
    };

    if(mirror)Object.assign(mirror,patch);
    else{
      mirror=patch;
      localStore.accounts.push(mirror);
    }

    // Compatibility bridge for the existing frontend shell.
    // The old UI requires both role==="developer" and developerAccountId===account.id.
    // The role itself is still sourced from Supabase user_roles.
    if(role==="developer"){
      localStore.developerAccountId=localId;
    }else if(localStore.developerAccountId===localId){
      localStore.developerAccountId=null;
    }

    localStore.currentId=localId;
    AutoType.save();
    return mirror;
  }

  async function friendsSnapshot(){
    const db=getClient();
    const current=await user();
    if(!db||!current)return {friends:[],incoming:[],outgoing:[]};
    const [{data:requests,error:reqError},{data:links,error:linkError}]=await Promise.all([
      db.from("friend_requests").select("*").or(`sender_id.eq.${current.id},receiver_id.eq.${current.id}`).eq("status","pending"),
      db.from("friendships").select("*").or(`user_a.eq.${current.id},user_b.eq.${current.id}`)
    ]);
    if(reqError)throw reqError;if(linkError)throw linkError;
    const ids=new Set();
    for(const r of requests||[]){ids.add(r.sender_id);ids.add(r.receiver_id)}
    for(const x of links||[]){ids.add(x.user_a);ids.add(x.user_b)}
    ids.delete(current.id);
    let profiles=[];
    if(ids.size){
      const {data,error}=await db.from("profiles").select("id,username,display_name,avatar_url").in("id",[...ids]);
      if(error)throw error;profiles=data||[];
    }
    const byId=Object.fromEntries(profiles.map(p=>[p.id,p]));
    return {
      friends:(links||[]).map(x=>byId[x.user_a===current.id?x.user_b:x.user_a]).filter(Boolean),
      incoming:(requests||[]).filter(r=>r.receiver_id===current.id).map(r=>({...r,profile:byId[r.sender_id]})),
      outgoing:(requests||[]).filter(r=>r.sender_id===current.id).map(r=>({...r,profile:byId[r.receiver_id]}))
    };
  }

  async function tournamentsSnapshot(){
    const db=getClient();
    if(!db)return {tournaments:[],entries:[],profiles:[]};
    const [{data:tournaments,error:tError},{data:entries,error:eError}]=await Promise.all([
      db.from("tournaments").select("*").order("created_at",{ascending:true}),
      db.from("tournament_entries").select("*")
    ]);
    if(tError)throw tError;if(eError)throw eError;

    const userIds=[...new Set((entries||[]).map(e=>e.user_id).filter(Boolean))];
    let profiles=[];
    if(userIds.length){
      const {data,error}=await db.from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id",userIds);
      if(error)throw error;
      profiles=data||[];
    }

    return {tournaments:tournaments||[],entries:entries||[],profiles};
  }

  async function predictionsSnapshot(){
    const db=getClient();
    if(!db)return {suggestions:[],votes:[]};
    const [{data:suggestions,error:sError},{data:votes,error:vError}]=await Promise.all([
      db.from("prediction_suggestions")
        .select("id,author_id,prefix,word,status,created_at,profiles!prediction_suggestions_author_id_fkey(username,display_name)")
        .eq("status","approved").order("created_at",{ascending:false}),
      db.from("prediction_votes").select("suggestion_id,user_id")
    ]);
    if(sError)throw sError;if(vError)throw vError;
    return {suggestions:suggestions||[],votes:votes||[]};
  }

  async function activeAnnouncement(){
    const db=getClient();
    if(!db)return null;
    const {data,error}=await db.from("site_announcements").select("id,message,active,created_at").eq("active",true).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(error)throw error;
    return data||null;
  }

  async function searchProfiles(query,limit=12){
    const db=getClient();
    if(!db)return [];
    const q=String(query||"").trim();
    let request=db.from("profiles").select("id,username,display_name,bio,avatar_url,profile_accent,created_at").limit(Math.max(1,Math.min(30,Number(limit)||12)));
    if(q)request=request.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);
    const {data,error}=await request.order("username",{ascending:true});
    if(error)throw error;
    return data||[];
  }

  async function racesSnapshot(){
    const db=getClient();
    const current=await user();
    if(!db||!current)return [];
    const {data:mine,error:mineError}=await db.from("race_players").select("race_id").eq("user_id",current.id);
    if(mineError)throw mineError;
    const ids=[...new Set((mine||[]).map(x=>x.race_id))];
    if(!ids.length)return [];
    const [{data:rooms,error:roomError},{data:players,error:playerError}]=await Promise.all([
      db.from("race_rooms").select("*").in("id",ids).order("created_at",{ascending:false}),
      db.from("race_players").select("*").in("race_id",ids)
    ]);
    if(roomError)throw roomError;if(playerError)throw playerError;
    const userIds=[...new Set((players||[]).map(x=>x.user_id))];
    let profiles=[];
    if(userIds.length){
      const {data,error}=await db.from("profiles").select("id,username,display_name,avatar_url").in("id",userIds);
      if(error)throw error;profiles=data||[];
    }
    const byUser=Object.fromEntries(profiles.map(p=>[p.id,p]));
    return (rooms||[]).map(room=>({
      ...room,
      players:(players||[]).filter(p=>p.race_id===room.id).map(p=>({...p,profile:byUser[p.user_id]||null}))
    }));
  }

  async function raceById(id){
    const db=getClient();
    if(!db)return null;
    const {data:room,error}=await db.from("race_rooms").select("*").eq("id",id).maybeSingle();
    if(error)throw error;
    if(!room)return null;
    const {data:players,error:pError}=await db.from("race_players").select("*").eq("race_id",id);
    if(pError)throw pError;
    const userIds=[...new Set((players||[]).map(p=>p.user_id).filter(Boolean))];
    let profiles=[];
    if(userIds.length){
      const {data,error}=await db.from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id",userIds);
      if(error)throw error;
      profiles=data||[];
    }
    const byId=Object.fromEntries(profiles.map(p=>[p.id,p]));
    return {
      ...room,
      players:(players||[]).map(p=>({...p,profile:byId[p.user_id]||null}))
    };
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

  async function startRound(mode,tournamentId=null){
    return api("start_round",{mode,tournamentId});
  }
  async function recordRound(payload){return api("round_complete",payload)}
  async function purchaseItem(itemId){return api("purchase_item",{itemId})}
  async function purchaseCollection(collectionId){return api("purchase_collection",{collectionId})}
  async function openCrate(crateId){return api("open_crate",{crateId})}
  async function equipItem(itemId){return api("equip_item",{itemId})}
  async function equipCollection(collectionId){return api("equip_collection",{collectionId})}
  async function setSecurityQuestion(question,answer){return api("set_security_question",{question,answer})}
  async function verifySecurityAnswer(answer){return api("verify_security_answer",{answer})}
  async function sendFriendRequest(username){return api("send_friend_request",{username})}
  async function matchmakingTick(){return api("matchmaking_tick",{})}
  async function leaveMatchmaking(){return api("leave_matchmaking",{})}
  async function createRace(friendId){return api("create_race",{friendId})}
  async function submitRaceResult(raceId,{score=0,durationMs=0,errors=0,erased=0}={}){
    return api("submit_race_result",{raceId,score,durationMs,errors,erased});
  }
  async function respondFriendRequest(requestId,accept){return api("respond_friend_request",{requestId,accept})}
  async function cancelFriendRequest(requestId){return api("cancel_friend_request",{requestId})}
  async function removeFriend(userId){return api("remove_friend",{userId})}
  async function joinTournament(tournamentId){return api("join_tournament",{tournamentId})}
  async function leaveTournament(tournamentId){return api("leave_tournament",{tournamentId})}
  async function awardTournament(tournamentId,winnerId){return api("award_tournament",{tournamentId,winnerId})}
  async function submitPrediction(prefix,word){return api("submit_prediction",{prefix,word})}
  async function togglePredictionVote(suggestionId){return api("toggle_prediction_vote",{suggestionId})}
  async function adminSetBalances(userId,coins,tickets,crateTokens){return api("admin_set_balances",{userId,coins,tickets,crateTokens})}
  async function adminGrantAll(userId){return api("admin_grant_all",{userId})}
  async function adminSetAnnouncement(message,active=true){return api("admin_set_announcement",{message,active})}
  async function adminRemovePrediction(suggestionId){return api("admin_remove_prediction",{suggestionId})}
  async function adminUpsertTournament(payload){return api("admin_upsert_tournament",payload)}
  async function adminDeleteTournament(tournamentId){return api("admin_delete_tournament",{tournamentId})}
  async function adminRestoreTournaments(){return api("admin_restore_tournaments",{})}
  async function adminResetPlayer(userId){return api("admin_reset_player",{userId})}
  async function adminSnapshot(){return api("admin_snapshot",{})}

  async function coinPacks(){
    const db=getClient();
    if(!db)return [];
    const {data,error}=await db.from("coin_packs")
      .select("id,name,coins,amount_cents,currency,sort_order")
      .eq("active",true)
      .order("sort_order",{ascending:true});
    if(error)throw error;
    return data||[];
  }

  async function paymentConfig(){
    const db=getClient();
    if(!db)return {configured:false,mode:"off"};
    const {data,error}=await db.functions.invoke("create-checkout-session",{body:{action:"status"}});
    if(error)return {configured:false,mode:"off"};
    return data||{configured:false,mode:"off"};
  }

  async function startCoinCheckout(packId){
    const db=getClient();
    if(!db)throw new Error("Supabase is not configured yet.");
    const returnBase=new URL("./",location.href).href;
    const {data,error}=await db.functions.invoke("create-checkout-session",{
      body:{packId,returnBase}
    });
    if(error)throw new Error(await functionErrorMessage(error,"Could not start checkout."));
    if(data?.error)throw new Error(data.error);
    if(!data?.url)throw new Error("Checkout URL was not returned.");
    return data;
  }

  async function paymentOrder(sessionId){
    const db=getClient();
    const current=await user();
    if(!db||!current||!sessionId)return null;
    const {data,error}=await db.from("payment_orders")
      .select("id,pack_id,coins,amount_cents,currency,status,provider_session_id,created_at,completed_at,refunded_amount_cents,coins_reversed,dispute_amount_cents")
      .eq("user_id",current.id)
      .eq("provider_session_id",sessionId)
      .maybeSingle();
    if(error)throw error;
    return data||null;
  }

  async function purchaseHistory(limit=30){
    const db=getClient();
    const current=await user();
    if(!db||!current)return [];
    const {data,error}=await db.from("payment_orders")
      .select("id,pack_id,coins,amount_cents,currency,status,created_at,completed_at,refunded_amount_cents,coins_reversed,dispute_amount_cents")
      .eq("user_id",current.id)
      .in("status",["paid","partially_refunded","refunded","disputed","dispute_won","dispute_lost"])
      .order("created_at",{ascending:false})
      .limit(Math.max(1,Math.min(100,Number(limit)||30)));
    if(error)throw error;
    return data||[];
  }

  async function adminRefundPayment(orderId){
    const db=getClient();
    if(!db)throw new Error("Supabase is not configured yet.");
    const {data,error}=await db.functions.invoke("refund-payment",{body:{orderId}});
    if(error)throw new Error(await functionErrorMessage(error,"Refund failed."));
    if(data?.error)throw new Error(data.error);
    return data;
  }

  async function dailyLeaderboard(dayKey=new Date().toISOString().slice(0,10)){
    const db=getClient();
    if(!db)return [];
    const start=new Date(`${dayKey}T00:00:00.000Z`);
    const end=new Date(start);end.setUTCDate(end.getUTCDate()+1);
    const {data,error}=await db.from("round_results")
      .select("user_id,score,created_at,profiles!inner(username,display_name,avatar_url)")
      .eq("mode","daily")
      .eq("verified",true)
      .gte("created_at",start.toISOString())
      .lt("created_at",end.toISOString())
      .order("score",{ascending:false});
    if(error)throw error;
    const best=new Map();
    for(const row of data||[]){
      if(!best.has(row.user_id)||row.score>best.get(row.user_id).score)best.set(row.user_id,row);
    }
    return [...best.values()].sort((a,b)=>Number(b.score)-Number(a.score));
  }

  async function dailyRewardClaimStatus(day){
    const db=getClient();
    const current=await user();
    if(!db||!current||!day)return null;
    const {data,error}=await db.from("daily_reward_claims")
      .select("score_date,reward_coins,claimed_at")
      .eq("user_id",current.id)
      .eq("score_date",String(day))
      .maybeSingle();
    if(error)throw error;
    return data||null;
  }

  async function claimDailyReward(day){
    return api("claim_daily_reward",{day});
  }

  async function leaderboard(limit=50){
    const db=getClient();
    if(!db)return [];
    const {data,error}=await db
      .from("player_stats")
      .select("user_id,verified_best_score,best_streak,total_score,rounds,words,profiles!inner(username,display_name,avatar_url)")
      .order("verified_best_score",{ascending:false})
      .limit(Math.max(1,Math.min(100,Number(limit)||50)));
    if(error)throw error;
    return (data||[]).map(row=>({...row,best_score:Number(row.verified_best_score||0)}));
  }

  async function submitBetaFeedback({category,message,pagePath}){
    const db=getClient();
    const current=await user();
    if(!db||!current)throw new Error("Sign in to send beta feedback.");
    if(!["bug","idea","other"].includes(category))throw new Error("Choose a feedback category.");
    const body=String(message||"").trim();
    if(body.length<10||body.length>2000)throw new Error("Feedback must be 10–2000 characters.");
    const source=String(pagePath||"/").slice(0,200)||"/";
    const {error}=await db.from("beta_feedback").insert({
      user_id:current.id,category,message:body,page_path:source
    });
    if(error)throw error;
    return true;
  }

  async function betaFeedbackInbox(){
    const db=getClient();
    if(!db)throw new Error("Supabase is not configured.");
    const {data,error}=await db.from("beta_feedback")
      .select("id,user_id,category,message,page_path,status,created_at")
      .order("created_at",{ascending:false}).limit(100);
    if(error)throw error;
    return data||[];
  }

  async function updateBetaFeedbackStatus(id,status){
    if(!["new","reviewed","resolved"].includes(status))throw new Error("Invalid feedback status.");
    const db=getClient();
    if(!db)throw new Error("Supabase is not configured.");
    const {error}=await db.from("beta_feedback").update({status}).eq("id",id);
    if(error)throw error;
    return true;
  }

  async function publicAchievementsFor(userId){
    const db=getClient();
    if(!db)return [];
    const {data,error}=await db.from("user_achievements").select("achievement_id,unlocked_at").eq("user_id",userId);
    if(error)throw error;
    return data||[];
  }

  async function publicPlayerStats(userId){
    const db=getClient();
    if(!db)return null;
    const {data,error}=await db.from("player_stats")
      .select("rounds,words,verified_best_score,best_streak,total_score,tournament_wins")
      .eq("user_id",userId).maybeSingle();
    if(error)throw error;
    return data;
  }

  async function reportPlayer(reportedUserId,reason,details){
    const db=getClient(),current=await user();
    if(!db||!current)throw new Error("Sign in to report a player.");
    if(!["harassment","spam","inappropriate","other"].includes(reason))throw new Error("Choose a reason.");
    if(!reportedUserId||current.id===reportedUserId)throw new Error("Choose a different player.");
    const message=String(details||"").trim();
    if(message.length<10||message.length>1500)throw new Error("Report must be 10–1500 characters.");
    const {error}=await db.from("player_reports").insert({
      reporter_id:current.id,reported_user_id:reportedUserId,reason,details:message
    });
    if(error)throw error;
    return true;
  }

  async function playerReportsInbox(){
    const db=getClient();
    if(!db)throw new Error("Supabase is unavailable.");
    const {data,error}=await db.from("player_reports")
      .select("id,reporter_id,reported_user_id,reason,details,status,created_at")
      .order("created_at",{ascending:false}).limit(100);
    if(error)throw error;
    return data||[];
  }

  async function updatePlayerReportStatus(id,status){
    const db=getClient();
    if(!db)throw new Error("Supabase is unavailable.");
    if(!["new","reviewed","resolved"].includes(status))throw new Error("Invalid status.");
    const {error}=await db.from("player_reports").update({status}).eq("id",id);
    if(error)throw error;
  }

  // Authenticated friends-only messaging via server-checked Edge Function actions.
  async function sendFriendMessage(friendId,message){
    return api("chat_send",{friendId,message});
  }
  async function friendChatHistory(friendId){
    return api("chat_history",{friendId});
  }
  async function blockFriendChat(friendId,block=true){
    return api("chat_block",{friendId,block});
  }
  async function blockedChatPlayers(){
    return api("chat_blocked",{});
  }
  async function reportFriendMessage(messageId,reason,details){
    return api("chat_report",{messageId,reason,details});
  }
  async function adminChatReports(){return api("admin_chat_reports",{})}
  async function adminSetChatReportStatus(reportId,status){
    return api("admin_chat_report_status",{reportId,status});
  }

  async function publicBadgesFor(userId){
    const db=getClient();
    if(!db)return [];
    const {data:assigned,error}=await db.from("player_role_badges")
      .select("role_id,assigned_at").eq("user_id",userId);
    if(error)throw error;
    if(!assigned?.length)return [];
    const {data:badges,error:badgeError}=await db.from("role_badges")
      .select("id,name,color").in("id",assigned.map(a=>a.role_id));
    if(badgeError)throw badgeError;
    return badges||[];
  }
  async function developerRoleSnapshot(){return api("developer_role_snapshot",{})}
  async function developerCreateBadge(name,color){return api("developer_create_badge",{name,color})}
  async function developerDeleteBadge(badgeId){return api("developer_delete_badge",{badgeId})}
  async function developerAssignBadge(playerId,badgeId){return api("developer_assign_badge",{playerId,badgeId})}
  async function developerRemoveBadge(playerId,badgeId){return api("developer_remove_badge",{playerId,badgeId})}
  async function developerSetStaffRole(playerId,role){return api("developer_set_staff_role",{playerId,role})}

  async function checkUsernameAvailable(name){
    const proposed=String(name||"").trim();
    if(!/^[A-Za-z0-9_]{3,24}$/.test(proposed))return {available:false,reason:"Use 3–24 letters, numbers, or underscores."};
    const reserved=["admin","administrator","developer","autotype","support","moderator","mod","staff","system","official","security","owner","root","help","helper"];
    if(reserved.includes(proposed.toLowerCase()))return {available:false,reason:"That username is reserved."};
    const existing=await publicProfileByUsername(proposed);
    const mine=await user();
    if(existing?.id===mine?.id)return {available:false,reason:"That's already your username."};
    return {available:!existing,reason:existing?"That username is taken.":"That username is available."};
  }

  async function changeUsername(username){
    const result=await api("change_username",{username});
    await hydrateLocalMirror();
    return result;
  }

  window.AutoTypeBackend={
    version:"20261003-10",
    configured,
    getClient,
    api,
    session,
    user,
    signUp,
    signIn,
    signOut,
    myProfile,
    updateMyProfile,
    checkUsernameAvailable,
    changeUsername,
    myRole,
    publicBadgesFor,
    developerRoleSnapshot,
    developerCreateBadge,
    developerDeleteBadge,
    developerAssignBadge,
    developerRemoveBadge,
    developerSetStaffRole,
    submitBetaFeedback,
    betaFeedbackInbox,
    updateBetaFeedbackStatus,
    myEquipped,
    myAchievements,
    myPreferences,
    updateMyPreferences,
    uploadAvatar,
    removeAvatar,
    uploadBackground,
    removeBackground,
    requestPasswordReset,
    securityQuestion,
    updatePassword,
    reauthenticate,
    deleteMyAccount,
    myWallet,
    myStats,
    myInventory,
    hydrateLocalMirror,
    friendsSnapshot,
    sendFriendMessage,
    friendChatHistory,
    blockFriendChat,
    blockedChatPlayers,
    reportFriendMessage,
    adminChatReports,
    adminSetChatReportStatus,
    searchProfiles,
    racesSnapshot,
    raceById,
    tournamentsSnapshot,
    predictionsSnapshot,
    activeAnnouncement,
    publicProfileByUsername,
    publicAchievementsFor,
    publicPlayerStats,
    reportPlayer,
    playerReportsInbox,
    updatePlayerReportStatus,
    startRound,
    recordRound,
    purchaseItem,
    purchaseCollection,
    openCrate,
    equipItem,
    equipCollection,
    setSecurityQuestion,
    verifySecurityAnswer,
    sendFriendRequest,
    matchmakingTick,
    leaveMatchmaking,
    createRace,
    submitRaceResult,
    respondFriendRequest,
    cancelFriendRequest,
    removeFriend,
    joinTournament,
    leaveTournament,
    awardTournament,
    submitPrediction,
    togglePredictionVote,
    adminSetBalances,
    adminGrantAll,
    adminSetAnnouncement,
    adminRemovePrediction,
    adminUpsertTournament,
    adminDeleteTournament,
    adminRestoreTournaments,
    adminResetPlayer,
    adminSnapshot,
    coinPacks,
    paymentConfig,
    startCoinCheckout,
    paymentOrder,
    purchaseHistory,
    adminRefundPayment,
    dailyLeaderboard,
    dailyRewardClaimStatus,
    claimDailyReward,
    leaderboard
  };
})();
