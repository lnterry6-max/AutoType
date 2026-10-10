/* AutoType progression presentation.
   Calculations use existing profile XP/level snapshots; never grants rewards. */
(() => {
  "use strict";
  // Explicit completion states prevent practice or an unknown response from
  // being presented as a confirmed reward.
  function outcome(result,{practice=false,failed=false}={}) {
    if(failed)return {state:"failed_save",label:"Save failed",rewarded:false};
    if(practice||result?.outcome==="practice")return {state:"practice",label:"Practice · no account rewards",rewarded:false};
    if(result?.verified===true)return {state:"verified",label:"Verified round",rewarded:true};
    return {state:"unverified",label:"Unverified · no confirmed rewards",rewarded:false};
  }
  function snapshot(info, previousBest=0) {
    return {
      xp: Math.max(0,Number(info?.xp)||0),
      level: Math.max(1,Number(info?.level)||1),
      into: Math.max(0,Number(info?.into)||0),
      perLevel: Math.max(1,Number(info?.perLevel)||500),
      remaining: Math.max(0,Number(info?.remaining)||0),
      pct: Math.max(0,Math.min(100,Number(info?.pct)||0)),
      bestScore: Math.max(0,Number(previousBest)||0)
    };
  }
  function compare(before,after,{practice=false,confirmed=true,local=false,score=0}={}) {
    if(practice) return {visible:false,kind:"practice"};
    if(!confirmed||!after) return {
      visible:true,kind:"pending",title:"Progress not confirmed",
      note:"Your round ended, but we couldn't confirm the saved XP. Check your profile before retrying."
    };
    const from=snapshot(before,before?.bestScore),to=snapshot(after,after?.bestScore);
    const gain=Math.max(0,to.xp-from.xp);
    const levels=Math.max(0,to.level-from.level);
    const best=Number(score)>0 && Number(score)>from.bestScore && to.bestScore>=Number(score);
    return {
      visible:true,kind:levels?"levelup":"progress",gain,
      title:levels?`Level ${to.level} unlocked`:`Level ${to.level} progress`,
      kicker:levels?"LEVEL UP":local?"LOCAL PROGRESS":"ROUND PROGRESS",
      note:local?"Saved in this browser only":levels>1?`You advanced ${levels} levels this round.`:
        "Nice work — keep the momentum going.",
      progress:`${to.into.toLocaleString()} / ${to.perLevel.toLocaleString()} XP`,
      next:`${to.remaining.toLocaleString()} XP to level ${to.level+1}`,
      percentage:to.pct,
      best,
      local
    };
  }
  function render(host,data) {
    if(!host)return;
    host.hidden=!data?.visible;
    host.classList.toggle("level-up",data?.kind==="levelup");
    host.classList.toggle("progress-pending",data?.kind==="pending");
    const $=id=>host.querySelector("#"+id);
    if(!data?.visible)return;
    $("roundProgressKicker").textContent=data.kicker||"ROUND PROGRESS";
    $("roundProgressTitle").textContent=data.title;
    $("roundProgressNote").textContent=data.note||"";
    const gain=$("roundXpGain"),track=$("roundXpTrack"),fill=$("roundXpFill");
    const progress=$("roundProgressCount"),next=$("roundProgressNext");
    const milestone=$("roundBestBadge");
    const pending=data.kind==="pending";
    gain.hidden=pending||data.gain===0;
    gain.textContent=pending?"":`+${data.gain.toLocaleString()} XP`;
    track.hidden=pending;
    progress.hidden=pending;
    next.hidden=pending;
    milestone.hidden=pending||!data.best;
    if(pending) {
      fill.style.width="0%";
      track.setAttribute("aria-valuenow","0");
      track.setAttribute("aria-valuetext","Progress not confirmed");
      return;
    }
    const percentage=Math.round(data.percentage);
    fill.style.width=percentage+"%";
    track.setAttribute("aria-valuenow",String(percentage));
    track.setAttribute("aria-valuetext",data.progress);
    progress.textContent=data.progress;
    next.textContent=data.next;
  }
  window.AutoTypeProgression={snapshot,compare,render,outcome};
})();
