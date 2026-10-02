
(() => {
  const sentences=[
    "the moon looked bright over the quiet city","we found a tiny note under the old table",
    "my friend brought fresh coffee before class today","the rain made every street shine at night",
    "people often remember how a moment made them feel","she left her blue jacket beside the front door",
    "a good idea can start with one strange question","the last train arrived just after midnight",
    "small choices can change the shape of a day","he opened the window and heard birds outside",
    "our team finished the project before lunch","the little dog waited patiently by the gate",
    "music from the next room filled the hallway","today feels like the start of something new",
    "the teacher wrote three examples on the board","we took the long road home after dinner",
    "every player gets one chance to solve the puzzle","the computer guessed the wrong word again",
    "a warm light glowed through the kitchen window","sometimes the simplest answer is the best one",
    "the elevator stopped one floor before anyone expected","someone left a skateboard beside the library entrance",
    "the morning bus arrived while everyone was still talking","a red balloon drifted slowly above the crowded park",
    "the battery died right before the final level loaded","we ordered noodles and watched the storm from inside",
    "the hallway lights flickered once and then stayed dark","she changed the playlist when the next song started",
    "his backpack somehow ended up under the wrong desk","the vending machine returned every coin except one",
    "our group found a shortcut through the science building","the cat ignored everyone until somebody opened a snack",
    "three notifications appeared before the phone finished charging","the keyboard sounded louder in the empty computer lab",
    "we missed the exit and discovered a better route","the scoreboard changed during the final few seconds",
    "a paper airplane landed perfectly inside the open box","the train doors closed before my friend reached them",
    "someone drew a tiny face on the whiteboard marker","the new update moved every button to a strange place",
    "we stayed outside until the streetlights finally turned on","the cafeteria line wrapped around the corner at noon",
    "her headphones disconnected in the middle of the chorus","the old camera made every photo look strangely cinematic",
    "a random idea became the best part of the project","the printer decided to jam five minutes before class",
    "our code worked perfectly until somebody touched one line","the window reflected the city like a second skyline",
    "he forgot the password immediately after changing it","the controller vibrated before anything appeared on screen",
    "we found an empty table right beside the window","the game loaded faster after the second restart",
    "a single typo changed the meaning of the entire message","the coffee shop was quieter than usual that afternoon",
    "their presentation ended exactly when the timer reached zero","the dog carried one shoe into the living room",
    "a delivery truck blocked the street for several minutes","she solved the puzzle without writing anything down",
    "the wind pushed every fallen leaf toward the fence","we could hear music from somewhere across the courtyard",
    "the notification disappeared before anyone could read it","a tiny scratch made the screen look much worse",
    "the shortcut saved time until the road suddenly closed","he packed everything except the charger he actually needed",
    "the bright sign was visible from two blocks away","our table somehow became the loudest one in the room",
    "the timer beeped while everyone was still getting ready","we compared answers and somehow got four different results",
    "the chair rolled backward when he reached for the notebook","a message popped up saying the file was finally ready",
    "the sunset turned every window orange for a few minutes","someone changed the group chat name again last night",
    "the first attempt looked terrible but the second one worked","she found the missing key inside a jacket pocket",
    "the website loaded differently on every browser we tried","a small update completely changed how the menu felt",
    "the last slice disappeared before anyone claimed it","we watched the clouds move across the stadium lights",
    "the microphone picked up a conversation from across the room","the screen dimmed right when the important part started",
    "our teacher laughed when the example actually failed","the package arrived earlier than the tracking page predicted",
    "he took the stairs because the elevator looked crowded","a notification sound made everyone check their phone",
    "the hallway smelled like pizza for the entire afternoon","we built the prototype first and fixed the details later",
    "the second question was much harder than the first","someone accidentally opened the wrong presentation in class",
    "the cursor vanished whenever it moved over the image","the room became silent as soon as the video started",
    "a bright sticker covered the scratch on the laptop","the map suggested a route that nobody wanted to take",
    "we finished the assignment with exactly one minute left","the lights outside reflected across the wet pavement",
    "the final answer looked obvious only after we solved it","she carried three bags and still opened the door",
    "the new keyboard had a completely different sound","the app remembered a setting that everyone forgot changing",
    "our table shook whenever somebody bumped the floor","the first snow melted before the afternoon was over"
  ];
  const evilSentences=[
    "bro really thought the first guess was gonna work","lowkey that answer was way too obvious",
    "nah the autocomplete is actually trolling right now","that guess was so random it almost felt personal",
    "the game really said bet and guessed something else","this predictor has absolutely zero chill today",
    "my last guess was cooked before i finished typing","the autocomplete keeps yapping instead of helping",
    "we were locked in until the ai chose the weirdest word","bro picked the most cursed word possible"
  ];
  const common=("the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because these give day most us is are was were moon bright quiet city found tiny note under old table friend brought fresh coffee before class today rain made every street shine night often remember moment feel left blue jacket beside front door idea start strange question last train arrived midnight small choices change shape opened window heard birds outside team finished project lunch little dog waited patiently gate music next room filled hallway feels something teacher wrote three examples board took long road home dinner player gets chance solve puzzle computer guessed wrong word again warm light glowed through kitchen sometimes simplest answer best expected sound came behind wall game became harder correct watched lights disappear across river able above accept account across action actually add afternoon already always amazing answer any anyone anything appear apple area around arrive art ask away awesome bag ball basically battery beautiful become begin behind believe better big black block book box bring browser build building bus button buy call camera car care carry case change charger chat check choice click close cloud code color continue cool corner course create crowd current dark data decide desk different door down drive early easy eat else empty end enough every example fast few file final find finish floor food full fun give glass great green group guess happen hard head hear help here high image important inside instead internet keep key keyboard kind know large late learn leave level light line load loud map maybe menu message minute move name need never next nothing number open orange outside page paper park part phone photo picture place play point pretty problem question quick random read ready real really remember restart result right road route same school screen second sentence setting short show simple small someone something song still stop street student study talk tell text thing think three together tomorrow turn type update version video wait walk website week weird white window world write zero notification playlist presentation tracking prototype microphone headphones controller scoreboard shortcut assignment courtyard pavement printer package railing speaker marker sticker laptop vending elevator library entrance balloon storm cinematic delivery reflection challenge predictor").split(" ");
  const extended=[...new Set(common)];
  const evilWords=["aura","bet","bro","bruh","bussin","cap","cooked","crashout","cursed","delulu","fam","fire","fr","goated","glaze","locked","lowkey","mid","nah","npc","rizz","slay","sus","valid","vibe","wild","yap","yeet","trolling","chill","chaos","unhinged","cooking"];

  const contractions=[
    "aren't","can't","couldn't","didn't","doesn't","don't","hadn't","hasn't","haven't",
    "he's","i'd","i'll","i'm","i've","isn't","it's","let's","she's","shouldn't","that's",
    "there's","they're","they've","wasn't","we're","we've","weren't","what's","who's",
    "won't","wouldn't","you're","you've","you'll","yourself"
  ];

  const sentenceVocabulary=[...new Set(
    [...sentences,...evilSentences]
      .flatMap(s=>s.toLowerCase().replace(/[^a-z0-9' ]+/g," ").split(/\s+/))
      .filter(Boolean)
  )];

  const nextWord={
    the:["time","way","people","world","moon","rain","last","little","computer","teacher","game","first"],
    a:["good","new","little","long","warm","tiny","moment","day","question","strange"],
    we:["are","have","can","found","took","finished","watched","say"],
    my:["friend","time","way","home"],good:["idea","way","time"],one:["of","chance","day","way"],
    before:["the","class","lunch"],after:["the","dinner","midnight"],front:["door"],blue:["jacket"],
    fresh:["coffee"],computer:["guessed","lab","screen"],teacher:["wrote"],game:["became","loaded","really"],
    group:["chat","project"],phone:["screen","charger","notification"],website:["loaded","looked","changed"],
    final:["answer","version","level"],friend:["group","message","race"],race:["mode","challenge","result"],
    lowkey:["that","the","this"],bro:["really","picked","thought"],nah:["the","that","this"]
  };

  const $=id=>document.getElementById(id);
  const params=new URLSearchParams(location.search);
  const settings=AutoType.currentSettings();
  let mode=params.get("mode");
  let predictorMode=mode;
  let race=null;
  let fixed=false;

  if(params.get("race")){
    race=AutoType.store().races.find(r=>r.id===params.get("race"));
    if(race){mode="race";predictorMode=race.mode||"context";fixed=true}
  }
  if(mode==="custom"){predictorMode=params.get("predictor")||"classic";fixed=true}
  if(mode==="daily"){predictorMode="context";fixed=true}

  if(!mode){
    $("modePicker").hidden=false;$("gameArea").hidden=true;return;
  }
  $("modePicker").hidden=true;$("gameArea").hidden=false;

  function sanitize(s){return String(s||"").toLowerCase().replace(/[^a-z0-9' ]+/g," ").replace(/\s+/g," ").trim()}
  function dateKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
  function dailySentence(){let hash=0;for(const c of dateKey())hash=((hash<<5)-hash)+c.charCodeAt(0);return sentences[Math.abs(hash)%sentences.length]}
  function pick(){
    const pool=predictorMode==="evil"?[...sentences,...evilSentences,...evilSentences]:sentences;
    return pool[Math.floor(Math.random()*pool.length)]
  }

  let sentence = race?.sentence || (mode==="daily"?dailySentence() : mode==="custom"?sanitize(params.get("sentence")) : pick());
  if(!sentence)sentence=pick();

  let words=[],index=0,prefix="",visible="",score=0,streak=0,maxStreak=0,keyCount=0,erased=0,errors=0,clueCounts=[];
  let cluesThisWord=0,recentGuesses=[],justKeptAI=0;
  let started=false,startTime=0,timer=null;

  const names={classic:"Word",context:"Context",sentence:"Sentence",evil:"Evil",daily:"Daily Challenge",custom:"Custom",race:"Friend Race"};
  $("modeName").textContent=names[mode]||"Word";
  $("newBtn").disabled=fixed;

  function elapsed(){return started?Date.now()-startTime:0}
  function fmt(ms){return AutoType.formatTime(ms)}
  function suggestionsFor(pref){
    return AutoType.store().suggestions.filter(s=>s.prefix===pref)
      .sort((a,b)=>(b.voters?.length||0)-(a.voters?.length||0)).map(s=>s.word)
  }
  function candidates(pref){
    if(!pref)return[];
    const prev=index?words[index-1]:null;
    let base=[...suggestionsFor(pref),...extended,...sentenceVocabulary,...contractions,...AutoType.store().suggestions.map(s=>s.word)];
    if(["context","sentence","evil"].includes(predictorMode)&&prev&&nextWord[prev]){
      base=[...suggestionsFor(pref),...nextWord[prev],...base];
    }
    if(predictorMode==="evil")base=[...evilWords.filter(w=>w.startsWith(pref)),...base];
    if(!base.includes(words[index]))base.push(words[index]);
    let matches=[...new Set(base.filter(w=>w.startsWith(pref)))];
    if(predictorMode==="evil"){
      matches=[...matches.filter(w=>w!==words[index]),...matches.filter(w=>w===words[index])];
    }
    return matches;
  }

  function rankedCandidates(pref){
    const list=candidates(pref);
    if(!list.length)return[];
    const fresh=list.filter(word=>!recentGuesses.includes(word));
    const seen=list.filter(word=>recentGuesses.includes(word));
    return fresh.length?[...fresh,...seen]:list;
  }

  function rememberGuess(word){
    if(!word||word===prefix)return;
    recentGuesses.push(word);
    if(recentGuesses.length>12)recentGuesses.shift();
  }

  function guess(){
    if(!prefix)return"";
    const chosen=rankedCandidates(prefix)[0]||prefix;
    rememberGuess(chosen);
    return chosen;
  }

  function commonPrefixLength(a,b){
    let i=0;
    const max=Math.min(a.length,b.length);
    while(i<max&&a[i]===b[i])i++;
    return i;
  }

  function aiCorrectEnd(){
    const target=words[index]||"";
    if(!target.startsWith(prefix))return Math.min(prefix.length,visible.length);
    return Math.max(Math.min(prefix.length,visible.length),commonPrefixLength(visible,target));
  }

  function wrongAITailLength(){
    return Math.max(0,visible.length-aiCorrectEnd());
  }

  function promoteCorrectAI(){
    const target=words[index]||"";
    if(!prefix||!target.startsWith(prefix))return 0;
    const correctEnd=commonPrefixLength(visible,target);
    if(visible.length!==correctEnd||visible.length<=prefix.length)return 0;
    const kept=visible.length-prefix.length;
    prefix=visible;
    justKeptAI=kept;
    return kept;
  }
  function sentencePrediction(){
    if(settings.showPrediction===false||!["sentence","evil"].includes(predictorMode)||!index)return"";
    let prev=words[index-1],out=[];
    for(let i=index;i<words.length;i++){
      const opts=nextWord[prev]||extended;const n=opts[0]||"the";out.push(n);prev=n;
    }
    return `Prediction: ${words.slice(0,index).join(" ")} ${out.join(" ")}`;
  }
  function render(){
    $("target").innerHTML=words.map((w,i)=>`<span class="${i<index?"done":i===index?"current":"future"}">${AutoType.escapeHTML(w)}</span>`).join(" ");
    $("score").textContent=score;$("streak").textContent=streak;$("keys").textContent=keyCount;
    $("erasedCount").textContent=erased;
    $("comboBadge").hidden=streak<2;
    $("comboBadge").textContent=`Combo ×${Math.max(streak,2)}`;
    $("wordCount").textContent=`${Math.min(index+1,words.length)} / ${words.length}`;
    $("progress").style.width=`${index/words.length*100}%`;
    $("typedPrefix").textContent=prefix||"_";
    $("sentencePrediction").textContent=sentencePrediction();

    const g=visible||"";
    const targetWord=words[index]||"";
    const committedEnd=Math.min(prefix.length,g.length);
    const correctEnd=targetWord.startsWith(prefix)?Math.max(committedEnd,commonPrefixLength(g,targetWord)):committedEnd;
    const correctAI=Math.max(0,correctEnd-committedEnd);
    const wrongAI=Math.max(0,g.length-correctEnd);

    $("guess").classList.remove("guess-correct");
    if(!prefix){
      $("guess").textContent="type a letter…";
      $("message").textContent="Type one letter. AutoType will fill the rest.";
      $("message").className="message";
    }else{
      $("guess").innerHTML=`<span class="guess-prefix">${AutoType.escapeHTML(g.slice(0,committedEnd))}</span><span class="guess-ai-correct">${AutoType.escapeHTML(g.slice(committedEnd,correctEnd))}</span><span class="guess-ai">${AutoType.escapeHTML(g.slice(correctEnd))}</span>`;

      if(g===targetWord){
        $("guess").classList.add("guess-correct");
        $("message").textContent=`Matched “${g}”. Press Space or Enter to lock it.`;
        $("message").className="message good";
      }else if(wrongAI>0){
        const saved=correctAI>0?` AutoType got ${correctAI} next letter${correctAI===1?"":"s"} right—keep ${correctAI===1?"it":"them"}.`:"";
        $("message").textContent=`${saved} Backspace only ${wrongAI} wrong AI letter${wrongAI===1?"":"s"}.`.trim();
        $("message").className="message bad";
      }else if(justKeptAI>0){
        $("message").textContent=`Kept ${justKeptAI} correct AI letter${justKeptAI===1?"":"s"}. Type the next clue.`;
        $("message").className="message good";
      }else{
        $("message").textContent="Type the next clue letter.";
        $("message").className="message";
      }
    }

    const q=prefix?[visible,...rankedCandidates(prefix)].filter((word,pos,arr)=>word&&arr.indexOf(word)===pos).slice(0,5):[];
    $("predictionQueue").innerHTML=q.length?q.map((x,i)=>`<div class="prediction-item"><span>${AutoType.escapeHTML(x)}</span><span>${i===0&&x===visible?"current":`#${i+1}`}</span></div>`).join(""):`<div class="empty">Start typing to see candidates.</div>`;
  }
  function startTimer(){
    if(started)return;started=true;startTime=Date.now();timer=setInterval(()=>$("time").textContent=fmt(elapsed()),250)
  }
  function reset(newSentence=sentence){
    if(timer)clearInterval(timer);started=false;startTime=0;
    sentence=newSentence;words=sentence.split(" ");index=0;prefix="";visible="";score=0;streak=0;maxStreak=0;keyCount=0;erased=0;errors=0;clueCounts=[];
    cluesThisWord=0;recentGuesses=[];justKeptAI=0;
    $("time").textContent="0:00";$("results").hidden=true;render()
  }

  function spawnTypingTrail(){
    const host=$("typingTrail");
    const effect=document.body.dataset.trailEffect||"none";
    if(!host||effect==="none"||document.body.classList.contains("reduced-motion"))return;

    const count=effect==="echo"?2:effect==="velocity"?3:effect==="comet"?5:6;
    for(let i=0;i<count;i++){
      const particle=document.createElement("i");
      particle.className=`trail-particle trail-${effect}`;
      particle.style.setProperty("--trail-x",`${-(14+Math.random()*46)}px`);
      particle.style.setProperty("--trail-y",`${(Math.random()-.5)*26}px`);
      particle.style.setProperty("--trail-delay",`${i*18}ms`);
      host.appendChild(particle);
      setTimeout(()=>particle.remove(),800);
    }
  }

  function typeLetter(ch){
    if(index>=words.length)return;
    startTimer();
    justKeptAI=0;

    // If an AI guess contains a wrong tail, that tail must be removed first.
    // Correct AI letters are protected and can become part of the usable prefix.
    promoteCorrectAI();
    const wrongTail=wrongAITailLength();
    if(wrongTail>0){
      $("message").textContent=`Backspace the ${wrongTail} wrong AI letter${wrongTail===1?"":"s"} first.`;
      $("message").className="message bad";
      return;
    }

    prefix+=ch.toLowerCase();
    cluesThisWord++;
    keyCount++;
    visible=guess();

    // If the prediction is entirely a correct prefix of the target, keep it
    // automatically instead of making the player delete correct characters.
    promoteCorrectAI();
    spawnTypingTrail();
    render();
  }

  function backspace(){
    if(!visible&&!prefix)return;
    startTimer();
    keyCount++;
    justKeptAI=0;

    const wrongTail=wrongAITailLength();
    if(wrongTail>0){
      visible=visible.slice(0,-1);
      erased++;
      promoteCorrectAI();
    }else if(prefix){
      prefix=prefix.slice(0,-1);
      visible=prefix;
    }
    render();
  }

  function lock(){
    if(!prefix)return;
    keyCount++;
    if(visible===words[index]){
      const clues=Math.max(1,cluesThisWord);
      score+=Math.max(20,120-(clues-1)*20)+Math.min(streak*5,30);
      streak++;
      maxStreak=Math.max(maxStreak,streak);
      clueCounts.push(clues);
      index++;
      prefix="";
      visible="";
      cluesThisWord=0;
      recentGuesses=[];
      justKeptAI=0;
      if(index>=words.length)finish();else render();
    }else{
      errors++;
      streak=0;
      $("message").textContent="That prediction is not the target word yet.";
      $("message").className="message bad";
    }
  }
  function unlocks(p){
    const newly=[];
    const unlock=(id,condition)=>{
      if(condition&&!p.achievements[id]){
        p.achievements[id]=true;
        newly.push(id);
      }
    };
    unlock("mindReader",clueCounts.some(n=>n===1));
    unlock("backspaceWarrior",erased>=50);
    unlock("perfectRead",errors===0);
    unlock("marathon",p.rounds>=25);
    unlock("century",p.words>=100);
    unlock("comboKing",p.bestStreak>=10);
    return newly;
  }
  function finish(){
    if(timer)clearInterval(timer);
    const ms=elapsed();$("time").textContent=fmt(ms);
    const p=AutoType.currentProfile();
    p.rounds++;p.words+=words.length;p.erased+=erased;p.bestErasedRound=Math.max(p.bestErasedRound||0,erased);
    p.totalKeys=(p.totalKeys||0)+keyCount;
    p.totalErrors=(p.totalErrors||0)+errors;
    p.totalScore=(p.totalScore||0)+score;
    p.bestScore=Math.max(p.bestScore||0,score);p.bestStreak=Math.max(p.bestStreak||0,maxStreak);
    p.fastest=!p.fastest||ms<p.fastest?ms:p.fastest;if(errors===0)p.perfectRounds=(p.perfectRounds||0)+1;
    if(clueCounts.some(n=>n===1))p.mindReaderCount=(p.mindReaderCount||0)+1;
    if(mode==="daily")p.daily[dateKey()]=Math.max(p.daily[dateKey()]||0,score);
    const newlyUnlocked=unlocks(p);AutoType.patchCurrentProfile(p);

    let coinsEarned=0;
    const activeAccount=AutoType.currentAccount();
    if(activeAccount){
      // Prestige titles are earned, not sold. Mind Reader is awarded with
      // the matching achievement and then appears in Profile inventory.
      if(newlyUnlocked.includes("mindReader")&&!activeAccount.wallet.owned.includes("title_mindreader")){
        activeAccount.wallet.owned.push("title_mindreader");
        AutoType.save();
      }

      coinsEarned+=20;
      if(errors===0)coinsEarned+=10;
      if(maxStreak>=5)coinsEarned+=5;
      if(mode==="daily")coinsEarned+=15;
      coinsEarned+=newlyUnlocked.length*75;
      AutoType.addCoins(coinsEarned,"Round reward");

      // Tournament Tickets are earned through play. Crate Tokens are reserved
      // for tournament/event rewards so random crates stay separate from paid currency.
      if(p.rounds>0&&p.rounds%10===0){
        AutoType.addTickets(1,"10-round milestone");
      }
    }

    if(race&&AutoType.currentAccount()){
      race.results=race.results||{};
      race.results[AutoType.currentAccount().id]={time:ms,errors,erased,score};AutoType.save();
    }
    $("resultScore").textContent=score;
    $("resultTime").textContent=fmt(ms);
    $("resultKeys").textContent=keyCount;
    $("resultErrors").textContent=errors;
    $("resultErased").textContent=erased;
    $("resultCoins").textContent=AutoType.currentAccount()?`+${coinsEarned}`:"Sign in";

    const unlockBox=$("achievementUnlocks");
    if(newlyUnlocked.length){
      unlockBox.hidden=false;
      unlockBox.innerHTML=`<strong>Achievement unlocked</strong>${newlyUnlocked.map(id=>{
        const achievement=AutoType.achievementDefs.find(a=>a.id===id);
        return `<a href="achievements.html"><span>${achievement?.icon||"★"}</span>${AutoType.escapeHTML(achievement?.name||id)}</a>`;
      }).join("")}`;
    }else{
      unlockBox.hidden=true;
      unlockBox.innerHTML="";
    }

    $("results").hidden=false;
    $("progress").style.width="100%";
  }

  document.addEventListener("keydown",e=>{
    if(e.ctrlKey||e.metaKey||e.altKey||!$("results").hidden)return;
    if(/^[a-zA-Z']$/.test(e.key) || e.key==="’"){
      e.preventDefault();
      typeLetter(e.key==="’" ? "'" : e.key);
    }
    else if(e.key==="Backspace"){e.preventDefault();backspace()}
    else if(e.key===" "||e.key==="Enter"){e.preventDefault();lock()}
  });
  $("restartBtn").addEventListener("click",()=>reset());
  $("newBtn").addEventListener("click",()=>{if(!fixed)reset(pick())});
  $("againBtn").addEventListener("click",()=>reset());
  reset();
})();