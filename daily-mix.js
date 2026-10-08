/* AutoType Daily Mix: rotating free skill goals, using verified rounds online. */
(function(){
  "use strict";
  const KEY="autotype_daily_mix_guest_v1";
  const MODES=[
    {id:"classic",label:"Word"},
    {id:"context",label:"Context"},
    {id:"sentence",label:"Sentence"},
    {id:"evil",label:"Evil"}
  ];

  function dayKey(date=new Date()){
    return new Date(date).toISOString().slice(0,10);
  }
  function dayIndex(day){
    const time=Date.parse(day+"T00:00:00.000Z");
    if(!Number.isFinite(time))throw new Error("Invalid Daily Mix date.");
    return Math.floor(time/86400000);
  }
  function plan(day=dayKey()){
    const n=dayIndex(day);
    const start=((n%MODES.length)+MODES.length)%MODES.length;
    const first=MODES[start],second=MODES[(start+1)%4],third=MODES[(start+2)%4];
    const accuracy=(n%2===0);
    const finish=(n%3===0);
    return [
      {id:"starter",mode:first.id,modeLabel:first.label,title:"First Run",
        description:"Finish one "+first.label+" round.",kind:"complete"},
      {id:"precision",mode:second.id,modeLabel:second.label,
        title:accuracy?"Clean Cut":"Point Chaser",
        description:accuracy?"Finish with no more than 1 missed lock.":"Finish with at least 500 points.",
        kind:accuracy?"clean":"score"},
      {id:"closer",mode:third.id,modeLabel:third.label,
        title:finish?"Combo Builder":"Keep Moving",
        description:finish?"Lock 4 words in a row.":"Complete one round with at least 6 words.",
        kind:finish?"combo":"words"}
    ];
  }
  function isComplete(goal,round){
    if(!goal||!round||goal.mode!==round.mode)return false;
    const score=Number(round.score),words=Number(round.words);
    const errors=Number(round.errors),streak=Number(round.max_streak);
    switch(goal.kind){
      case "complete":return Number.isFinite(words)&&words>0;
      case "clean":return Number.isFinite(words)&&words>0&&Number.isFinite(errors)&&errors<=1&&errors>=0;
      case "score":return Number.isFinite(score)&&score>=500;
      case "combo":return Number.isFinite(streak)&&streak>=4;
      case "words":return Number.isFinite(words)&&words>=6;
      default:return false;
    }
  }
  function progress(rows,day=dayKey()){
    const results=Array.isArray(rows)?rows:[];
    return plan(day).map(goal=>Object.assign({},goal,{
      complete:results.some(round=>isComplete(goal,round))
    }));
  }
  function readGuest(){
    try{
      const stored=JSON.parse(window.localStorage.getItem(KEY)||"[]");
      return Array.isArray(stored)?stored:[];
    }catch{return []}
  }
  function guestRounds(day=dayKey()){
    return readGuest().filter(round=>round.day===day);
  }
  function recordGuestRound(round,day=dayKey()){
    if(!MODES.some(mode=>mode.id===round?.mode))return false;
    const data={
      day,mode:round.mode,words:Number(round.words)||0,
      score:Number(round.score)||0,errors:Number(round.errors)||0,
      max_streak:Number(round.max_streak)||0
    };
    if(data.words<=0)return false;
    try{
      const minimum=dayIndex(day)-6;
      const saved=readGuest().filter(item=>{
        try{return dayIndex(item.day)>=minimum}catch{return false}
      }).slice(-79);
      saved.push(data);
      window.localStorage.setItem(KEY,JSON.stringify(saved));
      return true;
    }catch{return false}
  }
  async function loadRounds(day=dayKey()){
    const account=window.AutoType?.currentAccount?.();
    if(!account?.online)return guestRounds(day);
    const backend=window.AutoTypeBackend;
    const db=backend?.getClient?.();
    const current=await backend?.user?.();
    if(!db||!current)throw new Error("Sign in to sync today's progress.");
    const from=day+"T00:00:00.000Z";
    const to=new Date(Date.parse(from)+86400000).toISOString();
    const {data,error}=await db.from("round_results")
      .select("mode,score,words,errors,max_streak")
      .eq("user_id",current.id).eq("verified",true)
      .gte("created_at",from).lt("created_at",to)
      .order("created_at",{ascending:false}).limit(500);
    if(error)throw error;
    return data||[];
  }
  function escapeText(value){
    return String(value).replace(/[&<>"']/g,ch=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[ch]));
  }
  function draw(container,goals,summary){
    const completed=goals.filter(goal=>goal.complete).length;
    container.innerHTML=goals.map((goal,index)=>
      '<article class="daily-mix-card'+(goal.complete?' is-complete':'')+'">'+
        '<div class="daily-mix-card-top"><span class="daily-mix-slot">0'+(index+1)+' / '+escapeText(goal.modeLabel)+'</span>'+
          '<span class="daily-mix-state">'+(goal.complete?'Completed':'Ready')+'</span></div>'+
        '<h3>'+escapeText(goal.title)+'</h3>'+
        '<p>'+escapeText(goal.description)+'</p>'+
        '<a class="daily-mix-action" href="play.html?mode='+encodeURIComponent(goal.mode)+'">'+
          (goal.complete?'Play again':'Play '+escapeText(goal.modeLabel))+' &rarr;</a>'+
      '</article>'
    ).join("");
    if(summary)summary.textContent=completed+" of "+goals.length+" goals complete";
  }
  async function render(container,summary){
    if(!container)return;
    const day=dayKey();
    const dayLabel=container.closest(".daily-mix-section, .daily-mix-play-promo")?.querySelector("[data-daily-mix-date]");
    if(dayLabel)dayLabel.textContent=new Date(day+"T00:00:00Z").toLocaleDateString(undefined,{month:"short",day:"numeric",timeZone:"UTC"});
    try{
      const rows=await loadRounds(day);
      if(day!==dayKey())return render(container,summary);
      draw(container,progress(rows,day),summary);
    }catch(error){
      console.warn("Daily Mix progress could not load",error);
      draw(container,plan(day).map(goal=>Object.assign({},goal,{complete:false})),null);
      if(summary)summary.textContent="Progress unavailable — you can still play.";
      container.querySelectorAll(".daily-mix-state").forEach(el=>el.textContent="Play");
    }
  }
  function surpriseUrl(exclude){
    const modes=MODES.filter(mode=>mode.id!==exclude);
    const candidate=modes[Math.floor(Math.random()*modes.length)]||MODES[0];
    return "play.html?mode="+encodeURIComponent(candidate.id);
  }
  function wireSurpriseLinks(){
    const current=new URLSearchParams(window.location.search).get("mode");
    document.querySelectorAll("[data-surprise-mode]").forEach(anchor=>{
      anchor.href=surpriseUrl(current);
      anchor.addEventListener("click",()=>{anchor.href=surpriseUrl(current)});
    });
  }
  window.AutoTypeDailyMix={
    dayKey,plan,isComplete,progress,guestRounds,recordGuestRound,
    loadRounds,render,surpriseUrl,wireSurpriseLinks
  };
})();
