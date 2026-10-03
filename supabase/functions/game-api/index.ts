import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json"
};

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:cors});
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);

  try{
    const authHeader=req.headers.get("Authorization");
    if(!authHeader)return json({error:"Unauthorized"},401);

    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient=createClient(url,anon,{global:{headers:{Authorization:authHeader}}});
    const token=authHeader.replace("Bearer ","");
    const {data:{user},error:userError}=await userClient.auth.getUser(token);
    if(userError||!user)return json({error:"Unauthorized"},401);

    const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"");
    const payload=body.payload||{};

    async function rpc(name:string,args:Record<string,unknown>){
      const {data,error}=await admin.rpc(name,args);
      if(error)throw error;
      return data;
    }
    async function requireDeveloper(){
      const {data,error}=await admin.from("user_roles").select("role").eq("user_id",user.id).single();
      if(error)throw error;
      if(!["developer","admin"].includes(data.role))throw new Error("Developer access required.");
      return data.role;
    }

    switch(action){
      case "round_complete":
        return json(await rpc("autotype_record_round",{
          p_user:user.id,
          p_round:payload.roundId,
          p_mode:payload.mode,
          p_score:Number(payload.score||0),
          p_words:Number(payload.words||0),
          p_erased:Number(payload.erased||0),
          p_max_streak:Number(payload.maxStreak||0),
          p_total_keys:Number(payload.totalKeys||0),
          p_errors:Number(payload.errors||0),
          p_duration_ms:Number(payload.durationMs||0),
          p_one_clue:!!payload.oneClue
        }));

      case "claim_daily_reward":
        return json(await rpc("autotype_claim_daily_first",{p_user:user.id,p_day:String(payload.day||"")}));

      case "purchase_item":
        return json(await rpc("autotype_purchase_item",{p_user:user.id,p_item:String(payload.itemId||"")}));
      case "purchase_collection":
        return json(await rpc("autotype_purchase_collection",{p_user:user.id,p_collection:String(payload.collectionId||"")}));
      case "open_crate":
        return json(await rpc("autotype_open_crate",{p_user:user.id,p_crate:String(payload.crateId||"")}));
      case "equip_item":
        return json(await rpc("autotype_equip_item",{p_user:user.id,p_item:String(payload.itemId||"")}));
      case "equip_collection":
        return json(await rpc("autotype_equip_collection",{p_user:user.id,p_collection:String(payload.collectionId||"")}));

      case "set_security_question":
        return json({ok:await rpc("autotype_set_security_question",{
          p_user:user.id,p_question:String(payload.question||""),p_answer:String(payload.answer||"")
        })});
      case "verify_security_answer":
        return json({ok:await rpc("autotype_verify_security_answer",{p_user:user.id,p_answer:String(payload.answer||"")})});

      case "send_friend_request":
        return json(await rpc("autotype_send_friend_request",{p_user:user.id,p_username:String(payload.username||"")}));
      case "respond_friend_request":
        return json(await rpc("autotype_respond_friend_request",{p_user:user.id,p_request:payload.requestId,p_accept:!!payload.accept}));
      case "cancel_friend_request":
        return json({ok:await rpc("autotype_cancel_friend_request",{p_user:user.id,p_request:payload.requestId})});
      case "remove_friend":
        return json({ok:await rpc("autotype_remove_friend",{p_user:user.id,p_other:payload.userId})});

      case "create_race": {
        const friendId=String(payload.friendId||"");
        const {data:friendship,error:friendError}=await admin.from("friendships")
          .select("user_a,user_b")
          .or(`and(user_a.eq.${user.id},user_b.eq.${friendId}),and(user_a.eq.${friendId},user_b.eq.${user.id})`)
          .maybeSingle();
        if(friendError)throw friendError;
        if(!friendship)throw new Error("You can only race a friend.");
        const sentences=[
          "the moon looked bright over the quiet city",
          "our code worked perfectly until somebody touched one line",
          "the final answer looked obvious only after we solved it",
          "the keyboard sounded louder in the empty computer lab"
        ];
        const sentence=sentences[Math.floor(Math.random()*sentences.length)];
        const {data:room,error:roomError}=await admin.from("race_rooms")
          .insert({host_id:user.id,mode:"context",target_text:sentence,status:"waiting"})
          .select().single();
        if(roomError)throw roomError;
        const {error:playersError}=await admin.from("race_players").insert([
          {race_id:room.id,user_id:user.id,progress:0,score:0},
          {race_id:room.id,user_id:friendId,progress:0,score:0}
        ]);
        if(playersError)throw playersError;
        return json(room);
      }

      case "submit_race_result": {
        const raceId=String(payload.raceId||"");
        const {data:participant,error:partError}=await admin.from("race_players")
          .select("race_id").eq("race_id",raceId).eq("user_id",user.id).maybeSingle();
        if(partError)throw partError;
        if(!participant)throw new Error("You are not in this race.");
        const {error:updateError}=await admin.from("race_players").update({
          progress:1,
          score:Math.max(0,Number(payload.score)||0),
          duration_ms:Math.max(0,Number(payload.durationMs)||0),
          errors:Math.max(0,Number(payload.errors)||0),
          erased:Math.max(0,Number(payload.erased)||0),
          finished_at:new Date().toISOString()
        }).eq("race_id",raceId).eq("user_id",user.id);
        if(updateError)throw updateError;
        const {data:players,error:playersError}=await admin.from("race_players")
          .select("user_id,progress,score,finished_at").eq("race_id",raceId);
        if(playersError)throw playersError;
        if((players||[]).length>1&&(players||[]).every((p:any)=>p.finished_at)){
          await admin.from("race_rooms").update({status:"finished",finished_at:new Date().toISOString()}).eq("id",raceId);
        }else{
          await admin.from("race_rooms").update({status:"running",started_at:new Date().toISOString()}).eq("id",raceId).eq("status","waiting");
        }
        return json({players});
      }

      case "join_tournament":
        return json(await rpc("autotype_join_tournament",{p_user:user.id,p_tournament:String(payload.tournamentId||"")}));
      case "leave_tournament":
        return json(await rpc("autotype_leave_tournament",{p_user:user.id,p_tournament:String(payload.tournamentId||"")}));
      case "award_tournament":
        await requireDeveloper();
        return json(await rpc("autotype_award_tournament",{
          p_actor:user.id,p_tournament:String(payload.tournamentId||""),p_winner:payload.winnerId
        }));

      case "submit_prediction": {
        const prefix=String(payload.prefix||"").trim().toLowerCase();
        const word=String(payload.word||"").trim().toLowerCase().replaceAll("’","'");
        if(!/^[a-z]{1,8}$/.test(prefix))throw new Error("Prefix must be 1–8 letters.");
        if(!/^[a-z']{2,31}$/.test(word)||!word.startsWith(prefix)||word===prefix)throw new Error("Invalid completion.");
        const {data,error}=await admin.from("prediction_suggestions")
          .insert({author_id:user.id,prefix,word,status:"approved"})
          .select().single();
        if(error)throw error;
        return json(data);
      }

      case "toggle_prediction_vote": {
        const id=String(payload.suggestionId||"");
        const {data:existing,error:findError}=await admin.from("prediction_votes")
          .select("suggestion_id").eq("suggestion_id",id).eq("user_id",user.id).maybeSingle();
        if(findError)throw findError;
        if(existing){
          const {error}=await admin.from("prediction_votes").delete().eq("suggestion_id",id).eq("user_id",user.id);
          if(error)throw error;
          return json({voted:false});
        }
        const {error}=await admin.from("prediction_votes").insert({suggestion_id:id,user_id:user.id});
        if(error)throw error;
        return json({voted:true});
      }

      case "admin_set_balances":
        await requireDeveloper();
        return json(await rpc("autotype_admin_set_balances",{
          p_actor:user.id,p_target:payload.userId||user.id,
          p_coins:Number(payload.coins||0),p_tickets:Number(payload.tickets||0),p_tokens:Number(payload.crateTokens||0)
        }));

      case "admin_grant_all":
        await requireDeveloper();
        return json({granted:await rpc("autotype_admin_grant_all",{p_actor:user.id,p_target:payload.userId||user.id})});

      case "admin_set_announcement": {
        await requireDeveloper();
        const message=String(payload.message||"").trim().slice(0,180);
        await admin.from("site_announcements").update({active:false}).neq("id","00000000-0000-0000-0000-000000000000");
        if(message){
          const {data,error}=await admin.from("site_announcements")
            .insert({message,active:payload.active!==false,created_by:user.id}).select().single();
          if(error)throw error;
          return json(data);
        }
        return json({active:false,message:""});
      }

      case "admin_remove_prediction":
        await requireDeveloper();
        {
          const {error}=await admin.from("prediction_suggestions").delete().eq("id",payload.suggestionId);
          if(error)throw error;
          return json({ok:true});
        }

      case "admin_upsert_tournament": {
        await requireDeveloper();
        const input={
          name:String(payload.name||"Untitled Tournament").trim().slice(0,60),
          description:String(payload.description||"").trim().slice(0,240),
          status:["scheduled","open","running","closed","cancelled"].includes(payload.status)?payload.status:"open",
          entry_type:payload.entryType==="ticket"?"ticket":"free",
          entry_cost:payload.entryType==="ticket"?Math.max(1,Math.min(99,Number(payload.entryCost)||1)):0,
          reward_coins:Math.max(0,Math.min(999999999,Number(payload.rewardCoins)||0)),
          reward_crate_tokens:Math.max(0,Math.min(999999999,Number(payload.rewardCrateTokens)||0)),
          reward_title:String(payload.rewardTitle||"").trim().slice(0,50),
          max_players:Math.max(2,Math.min(512,Number(payload.maxPlayers)||16)),
          schedule_label:String(payload.schedule||"TBA").trim().slice(0,50),
          created_by:user.id
        };
        let data,error;
        if(payload.tournamentId){
          const key=String(payload.tournamentId);
          let request=admin.from("tournaments").update(input);
          request=/^[0-9a-f-]{36}$/i.test(key)?request.eq("id",key):request.eq("slug",key);
          ({data,error}=await request.select().single());
        }else{
          const slug="tour_"+crypto.randomUUID().replaceAll("-","").slice(0,12);
          ({data,error}=await admin.from("tournaments").insert({...input,slug}).select().single());
        }
        if(error)throw error;
        return json(data);
      }

      case "admin_delete_tournament":
        await requireDeveloper();
        {
          const id=String(payload.tournamentId||"");
          let request=admin.from("tournaments").delete();
          request=/^[0-9a-f-]{36}$/i.test(id)?request.eq("id",id):request.eq("slug",id);
          const {error}=await request;
          if(error)throw error;
          return json({ok:true});
        }

      case "admin_restore_tournaments":
        await requireDeveloper();
        {
          const rows=[
            {
              id:"11111111-1111-4111-8111-111111111111",slug:"daily_open",name:"Daily Open",
              description:"A free-entry daily bracket for anyone who wants a competitive run.",status:"open",
              entry_type:"free",entry_cost:0,reward_coins:300,reward_crate_tokens:1,reward_title:"Daily Champion",
              max_players:32,schedule_label:"Daily",created_by:user.id
            },
            {
              id:"22222222-2222-4222-8222-222222222222",slug:"ranked_circuit",name:"Ranked Circuit",
              description:"Earn Tournament Tickets through regular play, then use one to register.",status:"open",
              entry_type:"ticket",entry_cost:1,reward_coins:800,reward_crate_tokens:2,reward_title:"Circuit Winner",
              max_players:16,schedule_label:"Friday",created_by:user.id
            },
            {
              id:"33333333-3333-4333-8333-333333333333",slug:"weekend_championship",name:"Weekend Championship",
              description:"The larger weekend event with higher cosmetic and coin rewards.",status:"open",
              entry_type:"ticket",entry_cost:2,reward_coins:1500,reward_crate_tokens:3,reward_title:"Weekend Champion",
              max_players:16,schedule_label:"Saturday",created_by:user.id
            }
          ];
          const {data,error}=await admin.from("tournaments").upsert(rows,{onConflict:"id"}).select();
          if(error)throw error;
          return json(data);
        }

      case "admin_reset_player":
        await requireDeveloper();
        {
          const target=String(payload.userId||"");
          const {error:statsError}=await admin.from("player_stats").update({
            rounds:0,words:0,erased:0,best_score:0,best_streak:0,fastest_seconds:null,
            best_erased_round:0,mind_reader_count:0,perfect_rounds:0,total_keys:0,total_errors:0,total_score:0,tournament_wins:0
          }).eq("user_id",target);
          if(statsError)throw statsError;
          await admin.from("user_achievements").delete().eq("user_id",target);
          await admin.from("round_results").delete().eq("user_id",target);
          return json({ok:true});
        }

      case "admin_snapshot":
        await requireDeveloper();
        {
          const [profiles,roles,wallets,stats,tournaments,entries,suggestions,votes,announcements]=await Promise.all([
            admin.from("profiles").select("id,username,display_name,avatar_url,created_at"),
            admin.from("user_roles").select("*"),
            admin.from("wallets").select("*"),
            admin.from("player_stats").select("*"),
            admin.from("tournaments").select("*").order("created_at",{ascending:false}),
            admin.from("tournament_entries").select("*"),
            admin.from("prediction_suggestions").select("*").order("created_at",{ascending:false}),
            admin.from("prediction_votes").select("*"),
            admin.from("site_announcements").select("*").order("created_at",{ascending:false})
          ]);
          for(const result of [profiles,roles,wallets,stats,tournaments,entries,suggestions,votes,announcements])if(result.error)throw result.error;
          return json({
            profiles:profiles.data,roles:roles.data,wallets:wallets.data,stats:stats.data,
            tournaments:tournaments.data,entries:entries.data,suggestions:suggestions.data,
            votes:votes.data,announcements:announcements.data
          });
        }

      default:
        return json({error:"Unknown action"},400);
    }
  }catch(error){
    return json({error:error instanceof Error?error.message:"Request failed"},400);
  }
});