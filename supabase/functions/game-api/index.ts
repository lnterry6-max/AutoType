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
    async function staffRole(){
      const {data,error}=await admin.from("user_roles").select("role").eq("user_id",user.id).single();
      if(error)throw error;
      return String(data?.role||"player");
    }
    async function requireStaff(){
      const role=await staffRole();
      if(!["developer","admin"].includes(role))throw new Error("Admin access required.");
      return role;
    }
    async function requireDeveloper(){
      const role=await staffRole();
      if(role!=="developer")throw new Error("Developer access required.");
      return role;
    }

    switch(action){
      case "change_username": {
        const proposed=String(payload.username||"").trim();
        if(!/^[A-Za-z0-9_]{3,24}$/.test(proposed)){
          throw new Error("Username must be 3–24 letters, numbers, or underscores.");
        }
        const reserved=new Set(["admin","administrator","developer","autotype","support","moderator","mod","staff","system","official","security","owner","root","help","helper"]);
        if(reserved.has(proposed.toLowerCase()))throw new Error("This username is reserved.");
        return json(await rpc("autotype_change_username",{p_user:user.id,p_new:proposed}));
      }
      case "start_round":
        return json(await rpc("autotype_start_round",{
          p_user:user.id,
          p_mode:String(payload.mode||""),
          p_tournament:payload.tournamentId?String(payload.tournamentId):null
        }));

      case "round_complete": {
        const mode=String(payload.mode||"");
        const competitive=["classic","context","sentence","evil","daily","tournament"].includes(mode);

        if(competitive){
          if(!payload.challengeId)throw new Error("This competitive round is missing its server challenge.");
          return json(await rpc("autotype_record_verified_round",{
            p_user:user.id,
            p_challenge:payload.challengeId,
            p_round:payload.roundId,
            p_mode:mode,
            p_score:Number(payload.score||0),
            p_words:Number(payload.words||0),
            p_erased:Number(payload.erased||0),
            p_max_streak:Number(payload.maxStreak||0),
            p_total_keys:Number(payload.totalKeys||0),
            p_errors:Number(payload.errors||0),
            p_duration_ms:Number(payload.durationMs||0),
            p_one_clue:!!payload.oneClue
          }));
        }

        return json(await rpc("autotype_record_round",{
          p_user:user.id,
          p_round:payload.roundId,
          p_mode:mode,
          p_score:Number(payload.score||0),
          p_words:Number(payload.words||0),
          p_erased:Number(payload.erased||0),
          p_max_streak:Number(payload.maxStreak||0),
          p_total_keys:Number(payload.totalKeys||0),
          p_errors:Number(payload.errors||0),
          p_duration_ms:Number(payload.durationMs||0),
          p_one_clue:!!payload.oneClue
        }));
      }

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

      // Friends-only chat uses service-role RPCs; clients cannot bypass friendship/block checks.
      case "chat_send":
        return json(await rpc("autotype_chat_send",{
          p_user:user.id,p_friend:String(payload.friendId||""),p_body:String(payload.message||"")
        }));
      case "chat_history":
        return json(await rpc("autotype_chat_history",{
          p_user:user.id,p_friend:String(payload.friendId||"")
        }));
      case "chat_block":
        return json(await rpc("autotype_chat_block",{
          p_user:user.id,p_other:String(payload.friendId||""),p_block:!!payload.block
        }));
      case "chat_blocked":
        return json(await rpc("autotype_chat_blocked_list",{p_user:user.id}));
      case "chat_report":
        return json(await rpc("autotype_chat_report",{
          p_user:user.id,p_message:String(payload.messageId||""),
          p_reason:String(payload.reason||"other"),p_details:String(payload.details||"")
        }));
      case "admin_chat_reports": {
        await requireStaff();
        const {data,error}=await admin.from("friend_chat_reports")
          .select("id,reporter_id,sender_id,message_id,body_snapshot,reason,details,status,created_at")
          .order("created_at",{ascending:false}).limit(100);
        if(error)throw error;
        return json(data||[]);
      }
      case "admin_chat_report_status": {
        await requireStaff();
        const status=String(payload.status||"");
        if(!["new","reviewed","resolved"].includes(status))throw new Error("Invalid report status");
        const {data,error}=await admin.from("friend_chat_reports")
          .update({status}).eq("id",String(payload.reportId||"")).select("id,status").single();
        if(error)throw error;
        return json(data);
      }

      case "matchmaking_tick":
        return json(await rpc("autotype_matchmaking_tick",{p_user:user.id}));

      case "leave_matchmaking":
        return json({ok:await rpc("autotype_leave_matchmaking",{p_user:user.id})});

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
        const [{data:participant,error:partError},{data:room,error:roomError}]=await Promise.all([
          admin.from("race_players")
            .select("race_id,finished_at").eq("race_id",raceId).eq("user_id",user.id).maybeSingle(),
          admin.from("race_rooms")
            .select("id,status,match_type,winner_id").eq("id",raceId).maybeSingle()
        ]);
        if(partError)throw partError;
        if(roomError)throw roomError;
        if(!participant||!room)throw new Error("You are not in this race.");
        if(room.match_type==="matchmaking"&&participant.finished_at){
          throw new Error("Your Quick Match result is already submitted.");
        }

        const submittedScore=Math.max(0,Number(payload.score)||0);
        const submittedDuration=Math.max(0,Number(payload.durationMs)||0);
        const submittedErrors=Math.max(0,Number(payload.errors)||0);
        const submittedErased=Math.max(0,Number(payload.erased)||0);

        if(room.match_type==="matchmaking"){
          const {data:fullRoom,error:fullRoomError}=await admin.from("race_rooms")
            .select("target_text").eq("id",raceId).single();
          if(fullRoomError)throw fullRoomError;
          const wordCount=String(fullRoom.target_text||"").trim().split(/\s+/).filter(Boolean).length;
          let maxScore=0;
          for(let i=0;i<wordCount;i++)maxScore+=120+Math.min(i*5,30);
          if(submittedScore>maxScore)throw new Error("Quick Match score is outside the valid range.");
          if(submittedDuration<Math.max(250,wordCount*120)||submittedDuration>1800000){
            throw new Error("Quick Match time is outside the valid range.");
          }
        }

        const {error:updateError}=await admin.from("race_players").update({
          progress:1,
          score:submittedScore,
          duration_ms:submittedDuration,
          errors:submittedErrors,
          erased:submittedErased,
          finished_at:new Date().toISOString()
        }).eq("race_id",raceId).eq("user_id",user.id);
        if(updateError)throw updateError;

        const {data:players,error:playersError}=await admin.from("race_players")
          .select("user_id,progress,score,duration_ms,errors,erased,finished_at,level_at_match")
          .eq("race_id",raceId);
        if(playersError)throw playersError;

        let winnerId=room.winner_id||null;
        const done=(players||[]).length>1&&(players||[]).every((p:any)=>p.finished_at);
        if(done){
          const ranked=[...(players||[])].sort((a:any,b:any)=>
            Number(b.score||0)-Number(a.score||0)
            || Number(a.duration_ms||0)-Number(b.duration_ms||0)
            || Number(a.errors||0)-Number(b.errors||0)
          );
          if(ranked.length>1){
            const a=ranked[0],b=ranked[1];
            const exactTie=Number(a.score||0)===Number(b.score||0)
              && Number(a.duration_ms||0)===Number(b.duration_ms||0)
              && Number(a.errors||0)===Number(b.errors||0);
            winnerId=exactTie?null:a.user_id;
          }
          await admin.from("race_rooms").update({
            status:"finished",
            finished_at:new Date().toISOString(),
            winner_id:winnerId
          }).eq("id",raceId);
        }else{
          await admin.from("race_rooms").update({
            status:"running",
            started_at:new Date().toISOString()
          }).eq("id",raceId).eq("status","waiting");
        }
        return json({players,winnerId,finished:done,matchType:room.match_type});
      }

      case "join_tournament":
        return json(await rpc("autotype_join_tournament",{p_user:user.id,p_tournament:String(payload.tournamentId||"")}));
      case "leave_tournament":
        return json(await rpc("autotype_leave_tournament",{p_user:user.id,p_tournament:String(payload.tournamentId||"")}));
      case "award_tournament":
        await requireStaff();
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
        await requireStaff();
        return json(await rpc("autotype_admin_set_balances",{
          p_actor:user.id,p_target:payload.userId||user.id,
          p_coins:Number(payload.coins||0),p_tickets:Number(payload.tickets||0),p_tokens:Number(payload.crateTokens||0)
        }));

      case "admin_grant_all":
        await requireDeveloper();
        return json({granted:await rpc("autotype_admin_grant_all",{p_actor:user.id,p_target:payload.userId||user.id})});

      case "admin_set_announcement": {
        await requireStaff();
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
        await requireStaff();
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
        await requireStaff();
        {
          const id=String(payload.tournamentId||"");
          let request=admin.from("tournaments").delete();
          request=/^[0-9a-f-]{36}$/i.test(id)?request.eq("id",id):request.eq("slug",id);
          const {error}=await request;
          if(error)throw error;
          return json({ok:true});
        }

      case "admin_restore_tournaments":
        await requireStaff();
        return json(await rpc("autotype_reset_builtin_tournaments",{p_actor:user.id}));

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

      case "admin_snapshot": {
        const role=await requireStaff();
        if(role==="admin"){
          const [profiles,wallets,tournaments,entries,announcements]=await Promise.all([
            admin.from("profiles").select("id,username,display_name,avatar_url"),
            admin.from("wallets").select("user_id,coins,tournament_tickets,crate_tokens").eq("user_id",user.id),
            admin.from("tournaments").select("*").order("created_at",{ascending:false}),
            admin.from("tournament_entries").select("*"),
            admin.from("site_announcements").select("*").order("created_at",{ascending:false})
          ]);
          for(const res of [profiles,wallets,tournaments,entries,announcements])if(res.error)throw res.error;
          return json({
            role:"admin",profiles:profiles.data,wallets:wallets.data,tournaments:tournaments.data,
            entries:entries.data,announcements:announcements.data,
            roles:[],stats:[],suggestions:[],votes:[],payments:[],paymentAdjustments:[]
          });
        }
        {
          const [profiles,roles,wallets,stats,tournaments,entries,suggestions,votes,announcements,payments,paymentAdjustments]=await Promise.all([
            admin.from("profiles").select("id,username,display_name,avatar_url,created_at"),
            admin.from("user_roles").select("*"),
            admin.from("wallets").select("*"),
            admin.from("player_stats").select("*"),
            admin.from("tournaments").select("*").order("created_at",{ascending:false}),
            admin.from("tournament_entries").select("*"),
            admin.from("prediction_suggestions").select("*").order("created_at",{ascending:false}),
            admin.from("prediction_votes").select("*"),
            admin.from("site_announcements").select("*").order("created_at",{ascending:false}),
            admin.from("payment_orders").select("*").order("created_at",{ascending:false}).limit(200),
            admin.from("payment_adjustments").select("*").order("created_at",{ascending:false}).limit(200)
          ]);
          for(const result of [profiles,roles,wallets,stats,tournaments,entries,suggestions,votes,announcements,payments,paymentAdjustments])if(result.error)throw result.error;
          return json({
            profiles:profiles.data,roles:roles.data,wallets:wallets.data,stats:stats.data,
            tournaments:tournaments.data,entries:entries.data,suggestions:suggestions.data,
            votes:votes.data,announcements:announcements.data,
            payments:payments.data,paymentAdjustments:paymentAdjustments.data,
            role:"developer"
          });
        }
      }

      // Only the developer can create display badges or grant Admin permissions.
      case "developer_role_snapshot": {
        await requireDeveloper();
        const [badges,assignments]=await Promise.all([
          admin.from("role_badges").select("*").order("created_at",{ascending:true}),
          admin.from("player_role_badges").select("*")
        ]);
        if(badges.error)throw badges.error;
        if(assignments.error)throw assignments.error;
        return json({badges:badges.data||[],assignments:assignments.data||[]});
      }
      case "developer_create_badge": {
        await requireDeveloper();
        const name=String(payload.name||"").trim();
        const color=String(payload.color||"#4BA6D8").trim();
        if(!/^[a-zA-Z0-9][a-zA-Z0-9 _-]{1,27}$/.test(name))throw new Error("Use 2–28 letters, numbers, spaces or hyphens.");
        if(!/^#[0-9a-fA-F]{6}$/.test(color))throw new Error("Use a valid badge color.");
        const {data,error}=await admin.from("role_badges").insert({name,color,created_by:user.id}).select().single();
        if(error)throw error;
        await admin.from("admin_audit_log").insert({actor_id:user.id,action:"create_badge",target_type:"role_badge",target_id:data.id,details:{name}});
        return json(data);
      }
      case "developer_delete_badge": {
        await requireDeveloper();
        const badgeId=String(payload.badgeId||"");
        const {error}=await admin.from("role_badges").delete().eq("id",badgeId);
        if(error)throw error;
        await admin.from("admin_audit_log").insert({actor_id:user.id,action:"delete_badge",target_type:"role_badge",target_id:badgeId,details:{}});
        return json({ok:true});
      }
      case "developer_assign_badge": {
        await requireDeveloper();
        const playerId=String(payload.playerId||""),badgeId=String(payload.badgeId||"");
        const {error}=await admin.from("player_role_badges")
          .upsert({user_id:playerId,role_id:badgeId,assigned_by:user.id},{onConflict:"user_id,role_id"});
        if(error)throw error;
        await admin.from("admin_audit_log").insert({actor_id:user.id,action:"assign_badge",target_type:"profile",target_id:playerId,details:{badgeId}});
        return json({ok:true});
      }
      case "developer_remove_badge": {
        await requireDeveloper();
        const playerId=String(payload.playerId||""),badgeId=String(payload.badgeId||"");
        const {error}=await admin.from("player_role_badges").delete().eq("user_id",playerId).eq("role_id",badgeId);
        if(error)throw error;
        await admin.from("admin_audit_log").insert({actor_id:user.id,action:"remove_badge",target_type:"profile",target_id:playerId,details:{badgeId}});
        return json({ok:true});
      }
      case "developer_set_staff_role": {
        await requireDeveloper();
        const playerId=String(payload.playerId||"");
        const role=String(payload.role||"");
        if(!["player","admin"].includes(role))throw new Error("Only Admin and Player may be assigned here.");
        if(playerId===user.id)throw new Error("You cannot change your own permission level.");
        const {data:existing,error:lookupError}=await admin.from("user_roles").select("role").eq("user_id",playerId).single();
        if(lookupError)throw lookupError;
        if(existing.role==="developer")throw new Error("Developer accounts cannot be modified.");
        const {error}=await admin.from("user_roles").update({role,updated_at:new Date().toISOString()}).eq("user_id",playerId);
        if(error)throw error;
        await admin.from("admin_audit_log").insert({
          actor_id:user.id,action:"set_staff_role",target_type:"profile",target_id:playerId,
          details:{from:existing.role,to:role}
        });
        return json({ok:true,role});
      }

      default:
        return json({error:"Unknown action"},400);
    }
  }catch(error){
    return json({error:error instanceof Error?error.message:"Request failed"},400);
  }
});