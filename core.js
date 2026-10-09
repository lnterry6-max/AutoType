
(() => {
  const STORE_KEY = "autotypeAccountsStore";
  const PASSWORD_ITERATIONS = 350000;
  const MAX_LOGIN_FAILURES = 5;
  const LOGIN_LOCK_MS = 30000;
  const avatarPalette = ["#3b82c4","#a35d6a","#4a9b78","#8a6fc0","#c17a45","#697582","#3f8f9d","#9a7248"];

  const defaultProfile = {
    bestScore:0, rounds:0, modeRounds:{classic:0,context:0,sentence:0,evil:0},
    words:0, erased:0, bestStreak:0, fastest:null,
    bestErasedRound:0, mindReaderCount:0, perfectRounds:0,
    totalKeys:0, totalErrors:0, totalScore:0,
    achievements:{mindReader:false,backspaceWarrior:false,perfectRead:false,marathon:false,century:false,comboKing:false},
    daily:{}
  };
  const defaultSettings = {
    animations:true,
    reducedFx:false,
    showPrediction:true,
    backgroundType:"solid",
    backgroundColor:"#1f2328",
    backgroundImage:"",
    backgroundDim:64,
    backgroundLuminance:null,
    highContrast:false,
    textScale:100,
    confirmKey:"Space",
    eraseKey:"Backspace",
    predictionKey:"F2"
  };

  const defaultWallet = {
    coins:500,
    tickets:2,
    crateKeys:2,
    owned:["title_none","banner_default","frame_default","arena_default","trail_default","cursor_default","predictor_default","result_default"],
    equipped:{
      title:"title_none",
      banner:"banner_default",
      frame:"frame_default",
      arena:"arena_default",
      trail:"trail_default",
      cursor:"cursor_default",
      predictor:"predictor_default",
      result:"result_default"
    },
    claims:{},
    modeDropClaims:{classic:0,context:0,sentence:0,evil:0}
  };

  const shopCatalog = [
    {id:"title_none",slot:"title",category:"Titles",name:"No Title",price:0,rarity:"Default",value:""},
    {id:"title_quickfingers",slot:"title",category:"Titles",name:"Quick Fingers",price:250,rarity:"Common",value:"Quick Fingers"},
    {id:"title_backspace",slot:"title",category:"Titles",name:"Backspace Bandit",price:350,rarity:"Uncommon",value:"Backspace Bandit"},
    {id:"title_mindreader",slot:"title",category:"Titles",name:"Mind Reader",price:0,rarity:"Rare",value:"Mind Reader",earnedOnly:true},
    {id:"title_breaker",slot:"title",category:"Titles",name:"Prediction Breaker",price:900,rarity:"Epic",value:"Prediction Breaker"},
    {id:"title_lockedin",slot:"title",category:"Titles",name:"Locked In",price:1200,rarity:"Legendary",value:"Locked In"},

    {id:"title_neonrunner",slot:"title",category:"Titles",name:"Neon Runner",price:0,rarity:"Epic",value:"Neon Runner",collectionOnly:true},
    {id:"title_afterglow",slot:"title",category:"Titles",name:"Afterglow",price:0,rarity:"Epic",value:"Afterglow",collectionOnly:true},
    {id:"title_voidwalker",slot:"title",category:"Titles",name:"Void Walker",price:0,rarity:"Legendary",value:"Void Walker",collectionOnly:true},

    {id:"banner_default",slot:"banner",category:"Banners",name:"Default Banner",price:0,rarity:"Default",css:"linear-gradient(135deg,#2b3138,#23272d)"},
    {id:"banner_slate",slot:"banner",category:"Banners",name:"Slate Runner",price:300,rarity:"Common",css:"linear-gradient(135deg,#434a52,#252a30)"},
    {id:"banner_circuit",slot:"banner",category:"Banners",name:"Electric Circuit",price:700,rarity:"Rare",css:"linear-gradient(135deg,#0c2940,#0f6da0 55%,#20242a)"},
    {id:"banner_sunset",slot:"banner",category:"Banners",name:"Afterglow",price:900,rarity:"Epic",css:"linear-gradient(135deg,#3f2437,#aa5d52 55%,#e4a361)"},
    {id:"banner_void",slot:"banner",category:"Banners",name:"Deep Void",price:800,rarity:"Rare",css:"linear-gradient(135deg,#15131f,#42366f 55%,#171a20)"},

    {id:"trail_default",slot:"trail",category:"Typing Trails",name:"No Trail",price:0,rarity:"Default",color:"#00a2ff",effect:"none"},
    {id:"trail_echo",slot:"trail",category:"Typing Trails",name:"Echo Trail",price:400,rarity:"Uncommon",color:"#55b982",effect:"echo"},
    {id:"trail_velocity",slot:"trail",category:"Typing Trails",name:"Velocity Trail",price:650,rarity:"Rare",color:"#4aa9ff",effect:"velocity"},
    {id:"trail_comet",slot:"trail",category:"Typing Trails",name:"Pixel Comet",price:950,rarity:"Epic",color:"#b178ff",effect:"comet"},
    {id:"trail_gold",slot:"trail",category:"Typing Trails",name:"Golden Sparks",price:1500,rarity:"Legendary",color:"#e3b94e",effect:"gold"},

    {id:"frame_default",slot:"frame",category:"Frames",name:"No Frame",price:0,rarity:"Default",color:"transparent"},
    {id:"frame_silver",slot:"frame",category:"Frames",name:"Steel Ring",price:300,rarity:"Common",color:"#8b949e"},
    {id:"frame_blue",slot:"frame",category:"Frames",name:"Electric Ring",price:450,rarity:"Uncommon",color:"#00a2ff"},
    {id:"frame_gold",slot:"frame",category:"Frames",name:"Champion Ring",price:950,rarity:"Epic",color:"#e1b84e"},
    {id:"frame_glitch",slot:"frame",category:"Frames",name:"Glitch Ring",price:800,rarity:"Rare",color:"#b779ff"},


    {id:"arena_default",slot:"arena",category:"Arena Skins",name:"Default Arena",price:0,rarity:"Default",background:"var(--surface)",border:"#3c434b",accent:"#00a2ff",effect:"default"},
    {id:"arena_notebook",slot:"arena",category:"Arena Skins",name:"Study Grid",price:550,rarity:"Uncommon",background:"linear-gradient(rgba(87,185,130,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(87,185,130,.08) 1px,transparent 1px),#202a27",border:"#4b7665",accent:"#65d39a",effect:"grid"},
    {id:"arena_terminal",slot:"arena",category:"Arena Skins",name:"Terminal Core",price:900,rarity:"Rare",background:"radial-gradient(circle at 50% -20%,rgba(0,162,255,.18),transparent 52%),linear-gradient(180deg,#101a22,#11161b)",border:"#285d7b",accent:"#58c6ff",effect:"terminal"},
    {id:"arena_arcade",slot:"arena",category:"Arena Skins",name:"Arcade Cabinet",price:1350,rarity:"Epic",background:"linear-gradient(135deg,rgba(177,120,255,.16),transparent 42%),linear-gradient(180deg,#241932,#151922)",border:"#71529b",accent:"#c491ff",effect:"arcade"},
    {id:"arena_void",slot:"arena",category:"Arena Skins",name:"Void Chamber",price:1950,rarity:"Legendary",background:"radial-gradient(circle at 72% 22%,rgba(227,185,78,.12),transparent 32%),radial-gradient(circle at 20% 85%,rgba(177,120,255,.13),transparent 38%),#101116",border:"#8a7134",accent:"#e3b94e",effect:"void"},

    {id:"cursor_default",slot:"cursor",category:"Game FX",name:"Default Cursor",price:0,rarity:"Default",color:"#00a2ff"},
    {id:"cursor_pulse",slot:"cursor",category:"Game FX",name:"Pulse Cursor",price:500,rarity:"Rare",color:"#65d6ff",effect:"pulse"},
    {id:"cursor_gold",slot:"cursor",category:"Game FX",name:"Gold Cursor",price:700,rarity:"Rare",color:"#f0bd55",effect:"glow"},

    {id:"predictor_default",slot:"predictor",category:"Game FX",name:"Default Predictor",price:0,rarity:"Default",color:"#89929b"},
    {id:"predictor_mint",slot:"predictor",category:"Game FX",name:"Mint Prediction",price:550,rarity:"Uncommon",color:"#66d7a5"},
    {id:"predictor_amber",slot:"predictor",category:"Game FX",name:"Amber Prediction",price:550,rarity:"Rare",color:"#e7b45d"},
    {id:"predictor_violet",slot:"predictor",category:"Game FX",name:"Violet Prediction",price:650,rarity:"Epic",color:"#b99cff"},

    {id:"cursor_white",slot:"cursor",category:"Game FX",name:"White Cursor",price:250,rarity:"Common",color:"#f4f7fa"},
    {id:"predictor_slate",slot:"predictor",category:"Game FX",name:"Slate Prediction",price:300,rarity:"Common",color:"#b7c0c9"},
    {id:"result_snap",slot:"result",category:"Game FX",name:"Snap Finish",price:350,rarity:"Common",effect:"snap"},
    {id:"result_default",slot:"result",category:"Game FX",name:"Default Finish",price:0,rarity:"Default",effect:"none"},
    {id:"result_burst",slot:"result",category:"Game FX",name:"Clean Burst",price:1000,rarity:"Epic",effect:"burst"},
    {id:"result_neonstorm",slot:"result",category:"Game FX",name:"Neon Storm",price:1700,rarity:"Legendary",effect:"neon"},
    {"id":"title_pixelpilot","slot":"title","category":"Titles","name":"Pixel Pilot","price":0,"rarity":"Epic","value":"Pixel Pilot","collectionOnly":true},
    {"id":"title_starcaptain","slot":"title","category":"Titles","name":"Star Captain","price":0,"rarity":"Legendary","value":"Star Captain","collectionOnly":true},
    {"id":"banner_pixelpop","slot":"banner","category":"Banners","name":"Pixel Pop","price":800,"rarity":"Rare","css":"linear-gradient(135deg,#155d5b,#227fb2 52%,#7c55cc)"},
    {"id":"banner_starlight","slot":"banner","category":"Banners","name":"Starlight","price":950,"rarity":"Epic","css":"radial-gradient(circle at 78% 25%,rgba(255,232,166,.48),transparent 17%),linear-gradient(135deg,#10152c,#34346c 65%,#101c3a)"},
    {"id":"frame_mintline","slot":"frame","category":"Frames","name":"Mint Line","price":550,"rarity":"Rare","color":"#63ddbb"},
    {"id":"frame_cosmicglow","slot":"frame","category":"Frames","name":"Cosmic Glow","price":750,"rarity":"Epic","color":"#9b8aff"},
    {"id":"trail_mintflash","slot":"trail","category":"Typing Trails","name":"Mint Flash","price":750,"rarity":"Rare","color":"#67e2b8","effect":"velocity"},
    {"id":"trail_startrail","slot":"trail","category":"Typing Trails","name":"Star Trail","price":1150,"rarity":"Epic","color":"#c2aaff","effect":"comet"},
    {"id":"arena_pixelscape","slot":"arena","category":"Arena Skins","name":"Pixelscape","price":1250,"rarity":"Epic","background":"linear-gradient(145deg,rgba(89,226,184,.15),transparent 50%),linear-gradient(180deg,#0f2734,#182b2d)","border":"#3a8d80","accent":"#68dbad","effect":"arcade"},
    {"id":"arena_nightshift","slot":"arena","category":"Arena Skins","name":"Night Shift","price":1650,"rarity":"Legendary","background":"radial-gradient(circle at 80% 0%,rgba(161,130,255,.22),transparent 42%),linear-gradient(145deg,#16182c,#181b31 60%,#0e1421)","border":"#6c5c9a","accent":"#bd9aff","effect":"void"},
    {"id":"predictor_pixelmint","slot":"predictor","category":"Game FX","name":"Pixel Mint","price":520,"rarity":"Uncommon","color":"#6bdcbb"},
    {"id":"result_pixelburst","slot":"result","category":"Game FX","name":"Pixel Burst","price":1050,"rarity":"Epic","effect":"burst"},
    {"id":"result_starflare","slot":"result","category":"Game FX","name":"Starflare","price":1550,"rarity":"Legendary","effect":"neon"}
  ];



  const collectionDefs = [
    {
      id:"neon_circuit",
      name:"Neon Circuit",
      tagline:"A clean electric set built around AutoType blue.",
      price:2200,
      rarity:"Epic",
      accent:"#58c6ff",
      preview:"linear-gradient(135deg,#0d2535,#124f78 55%,#1b2230)",
      items:["title_neonrunner","banner_circuit","frame_blue","arena_terminal","trail_velocity","predictor_violet"]
    },
    {
      id:"afterglow_set",
      name:"Afterglow",
      tagline:"Warm profile identity with a dramatic arcade finish.",
      price:2700,
      rarity:"Epic",
      accent:"#e58c70",
      preview:"linear-gradient(135deg,#3a2135,#9d544f 58%,#df9b61)",
      items:["title_afterglow","banner_sunset","frame_gold","arena_arcade","cursor_gold","result_burst"]
    },
    {
      id:"deep_void_set",
      name:"Deep Void",
      tagline:"The high-tier dark set with legendary gameplay effects.",
      price:3600,
      rarity:"Legendary",
      accent:"#d6b760",
      preview:"radial-gradient(circle at 75% 20%,rgba(227,185,78,.24),transparent 30%),linear-gradient(135deg,#101019,#352b56 60%,#14161c)",
      items:["title_voidwalker","banner_void","frame_glitch","arena_void","trail_gold","result_neonstorm"]
    },
    {"id":"pixel_pop_set","name":"Pixel Pop","tagline":"Colorful arcade energy for every sentence.","price":2850,"rarity":"Epic","accent":"#67dfbd","preview":"linear-gradient(135deg,#114751,#1c568e 60%,#61418d)","items":["title_pixelpilot","banner_pixelpop","frame_mintline","trail_mintflash","arena_pixelscape","result_pixelburst"]},
    {"id":"starbound_set","name":"Starbound","tagline":"Cosmic colors and a dramatic finishing touch.","price":3500,"rarity":"Legendary","accent":"#b8a8ff","preview":"linear-gradient(135deg,#15152a,#32366b 65%,#211f44)","items":["title_starcaptain","banner_starlight","frame_cosmicglow","trail_startrail","arena_nightshift","result_starflare"]}
  ];

  const crateDefs = [
    {
      id:"starter_crate",
      name:"Starter Crate",
      description:"A mixed cosmetic crate earned through normal play.",
      keyCost:1,
      categories:["Titles","Banners","Arena Skins","Typing Trails","Frames","Game FX"],
      odds:{Common:36,Uncommon:30,Rare:20,Epic:11,Legendary:3}
    },
    {
      id:"profile_crate",
      name:"Profile Crate",
      description:"Focused on profile titles, banners, and avatar frames.",
      keyCost:1,
      categories:["Titles","Banners","Frames"],
      odds:{Common:35,Uncommon:30,Rare:20,Epic:12,Legendary:3}
    },
    {
      id:"gamefx_crate",
      name:"Game FX Crate",
      description:"Focused on cursor, predictor, and finish effects.",
      keyCost:1,
      categories:["Arena Skins","Game FX"],
      odds:{Common:30,Uncommon:32,Rare:22,Epic:13,Legendary:3}
    },
    {
      id:"neon_nights_crate",
      name:"Word Mode Crate",
      description:"Neon-themed surprises inspired by Classic Word Mode.",
      gameMode:"classic",
      modeLabel:"WORD MODE",
      keyCost:0,roundsPerDrop:5,
      categories:["Titles","Banners","Frames"],
      odds:{Common:33,Uncommon:29,Rare:22,Epic:13,Legendary:3}
    },
    {
      id:"cosmic_crate",
      name:"Context Mode Crate",
      description:"Cosmic arenas and game effects inspired by contextual predictions.",
      gameMode:"context",
      modeLabel:"CONTEXT MODE",
      keyCost:0,roundsPerDrop:5,
      categories:["Titles","Arena Skins","Game FX"],
      odds:{Common:32,Uncommon:30,Rare:22,Epic:13,Legendary:3}
    },
    {
      id:"color_shuffle_crate",
      name:"Sentence Mode Crate",
      description:"Colorful banners, frames, and trails inspired by sentence play.",
      gameMode:"sentence",
      modeLabel:"SENTENCE MODE",
      keyCost:0,roundsPerDrop:5,
      categories:["Banners","Frames","Typing Trails"],
      odds:{Common:33,Uncommon:31,Rare:21,Epic:12,Legendary:3}
    },
    {
      id:"evil_glitch_crate",
      name:"Evil Mode Crate",
      description:"Glitched effects and flashy colors inspired by Evil Mode.",
      gameMode:"evil",
      modeLabel:"EVIL MODE",
      keyCost:0,roundsPerDrop:5,
      categories:["Banners","Typing Trails","Game FX"],
      odds:{Common:33,Uncommon:29,Rare:22,Epic:13,Legendary:3}
    }
  ];

  const defaultTournamentDefs = [
    {
      id:"daily_open",
      name:"Daily Open",
      description:"A free-entry daily bracket for anyone who wants a competitive run.",
      entryType:"free",
      entryCost:0,
      rewardCoins:300,
      rewardCrateTokens:1,
      rewardTitle:"Daily Champion",
      schedule:"Daily",
      maxPlayers:32
    },
    {
      id:"ranked_circuit",
      name:"Ranked Circuit",
      description:"Earn Tournament Tickets through regular play, then use one to register.",
      entryType:"ticket",
      entryCost:1,
      rewardCoins:800,
      rewardCrateTokens:2,
      rewardTitle:"Circuit Winner",
      schedule:"Friday",
      maxPlayers:16
    },
    {
      id:"weekend_championship",
      name:"Weekend Championship",
      description:"The larger weekend event with higher cosmetic and coin rewards.",
      entryType:"ticket",
      entryCost:2,
      rewardCoins:1500,
      rewardCrateTokens:3,
      rewardTitle:"Weekend Champion",
      schedule:"Saturday",
      maxPlayers:16
    }
  ];

  const achievementDefs = [
    {id:"mindReader",icon:"✦",name:"Mind Reader",desc:"Finish a word from only one clue letter."},
    {id:"backspaceWarrior",icon:"⌫",name:"Backspace Warrior",desc:"Erase 50 AI letters in one round."},
    {id:"perfectRead",icon:"✓",name:"Perfect Read",desc:"Finish a round without a failed lock."},
    {id:"marathon",icon:"25",name:"Marathon",desc:"Complete 25 rounds."},
    {id:"century",icon:"100",name:"Century",desc:"Clear 100 total words."},
    {id:"comboKing",icon:"×",name:"Combo King",desc:"Reach a 10-word streak."}
  ];

  const clone = v => JSON.parse(JSON.stringify(v));
  function loadStore(){
    let s;
    try{s=JSON.parse(localStorage.getItem(STORE_KEY)||"null")}catch{}
    if(!s || typeof s!=="object") s={};
    s.accounts=Array.isArray(s.accounts)?s.accounts:[];
    s.currentId=s.currentId||null;
    s.guestProfile={...clone(defaultProfile),...(s.guestProfile||{})};
    s.guestProfile.achievements={...defaultProfile.achievements,...(s.guestProfile.achievements||{})};
    s.guestProfile.daily=s.guestProfile.daily||{};
    s.guestProfile.modeRounds={...defaultProfile.modeRounds,...(s.guestProfile.modeRounds||{})};
    s.guestSettings={...clone(defaultSettings),...(s.guestSettings||{})};
    s.races=Array.isArray(s.races)?s.races:[];
    s.suggestions=Array.isArray(s.suggestions)?s.suggestions:[];
    s.friendRequests=Array.isArray(s.friendRequests)?s.friendRequests:[];
    s.tournamentEntries=Array.isArray(s.tournamentEntries)?s.tournamentEntries:[];
    if(!Array.isArray(s.tournaments)){
      s.tournaments=clone(defaultTournamentDefs).map(t=>({...t,status:"open",builtIn:true,createdAt:Date.now()}));
    }
    s.tournaments=s.tournaments.map(t=>({
      status:"open",
      builtIn:false,
      createdAt:Date.now(),
      entryType:"free",
      entryCost:0,
      rewardCoins:0,
      rewardCrateTokens:0,
      rewardTitle:"",
      schedule:"TBA",
      maxPlayers:16,
      ...t
    }));
    if(!s.crateTokenTournamentMigration){
      const rewardsById=Object.fromEntries(defaultTournamentDefs.map(t=>[t.id,t.rewardCrateTokens||0]));
      s.tournaments=s.tournaments.map(t=>t.builtIn&&rewardsById[t.id]!==undefined?{...t,rewardCrateTokens:rewardsById[t.id]}:t);
      s.crateTokenTournamentMigration=true;
    }
    s.announcement={
      active:false,
      message:"",
      ...(s.announcement||{})
    };

    // One-time local prototype migration: if the existing developer account named
    // Landon is present when this version first loads, bind developer privileges
    // to that immutable account ID. Future accounts named Landon do not gain it.
    if(!s.developerMigrationComplete){
      const existingDeveloper=s.accounts.find(a=>String(a.username||"").trim().toLowerCase()==="landon");
      if(existingDeveloper)s.developerAccountId=existingDeveloper.id;
      s.developerMigrationComplete=true;
    }

    // Enforce case-insensitive username uniqueness for any older local data.
    // Existing conflicts are preserved by suffixing only the later duplicate.
    const usedUsernames=new Set();
    s.accounts.forEach(a=>{
      const original=String(a.username||"player").trim()||"player";
      let candidate=original;
      let key=candidate.toLowerCase();
      let suffix=2;
      while(usedUsernames.has(key)){
        candidate=`${original}${suffix++}`;
        key=candidate.toLowerCase();
      }
      a.username=candidate;
      usedUsernames.add(key);
    });

    s.accounts.forEach(a=>{
      a.profile={...clone(defaultProfile),...(a.profile||{})};
      a.profile.achievements={...defaultProfile.achievements,...(a.profile.achievements||{})};
      a.profile.daily=a.profile.daily||{};
      a.profile.modeRounds={...defaultProfile.modeRounds,...(a.profile.modeRounds||{})};
      a.settings={...clone(defaultSettings),...(a.settings||{})};
      a.avatarImage=a.avatarImage||"";
      a.displayName=a.displayName||a.username;
      a.bio=a.bio||"";
      a.favoriteModes=Array.isArray(a.favoriteModes)?a.favoriteModes:[];
      a.friends=Array.isArray(a.friends)?a.friends:[];
      a.securityQuestion=a.securityQuestion||"";
      a.securityAnswerHash=a.securityAnswerHash||"";
      a.securityAnswerSalt=a.securityAnswerSalt||"";
      a.securityAnswerIterations=Number(a.securityAnswerIterations)||PASSWORD_ITERATIONS;
      a.failedLoginCount=Number(a.failedLoginCount)||0;
      a.lockUntil=Number(a.lockUntil)||0;
      a.wallet={...clone(defaultWallet),...(a.wallet||{})};
      a.wallet.crateKeys=Math.max(0,Number(a.wallet.crateKeys)||0);
      a.wallet.owned=Array.isArray(a.wallet.owned)?[...new Set([...defaultWallet.owned,...a.wallet.owned])]:[...defaultWallet.owned];
      a.wallet.equipped={...defaultWallet.equipped,...(a.wallet.equipped||{})};

      // Background cosmetics were retired in favor of the separate color/photo
      // background system. Preserve old purchases by migrating them into trails.
      const legacyBackgroundTrails={
        bg_midnight:"trail_echo",
        bg_ice:"trail_velocity",
        bg_mint:"trail_comet",
        bg_burgundy:"trail_gold"
      };
      for(const [oldId,newId] of Object.entries(legacyBackgroundTrails)){
        if(a.wallet.owned.includes(oldId)&&!a.wallet.owned.includes(newId))a.wallet.owned.push(newId);
      }
      const oldEquippedBackground=a.wallet.equipped.background;
      if(oldEquippedBackground&&legacyBackgroundTrails[oldEquippedBackground]){
        a.wallet.equipped.trail=legacyBackgroundTrails[oldEquippedBackground];
      }
      a.wallet.owned=a.wallet.owned.filter(id=>!id.startsWith("bg_"));
      delete a.wallet.equipped.background;

      a.wallet.claims=a.wallet.claims||{};

      // Legacy local accounts still use the historical developerAccountId.
      // Supabase-backed mirrors keep the role last verified by backend.js.
      if(a.online&&a.supabaseUserId){
        a.role=(a.role==="developer"||a.role==="admin")?"developer":"user";
      }else{
        a.role=(a.id===s.developerAccountId)?"developer":"user";
      }
    });
    localStorage.setItem(STORE_KEY,JSON.stringify(s));
    return s;
  }
  let store=loadStore();
  let onlineReadyPromise=Promise.resolve();

  function save(){ localStorage.setItem(STORE_KEY,JSON.stringify(store)); }
  function currentAccount(){ return store.accounts.find(a=>a.id===store.currentId)||null; }
  function currentProfile(){ return currentAccount()?.profile || store.guestProfile; }
  function currentSettings(){ return currentAccount()?.settings || store.guestSettings; }
  function accountName(a){ return a?.displayName || a?.username || "Guest"; }
  function avatarColor(a){
    const seed=String(a?.id||a?.username||a?.displayName||"guest").toLowerCase();
    let hash=0;
    for(let i=0;i<seed.length;i++)hash=((hash<<5)-hash)+seed.charCodeAt(i);
    return avatarPalette[Math.abs(hash)%avatarPalette.length];
  }

  function avatarMarkup(a, cls="avatar"){
    const name=accountName(a);
    const frame=equippedItem("frame",a);
    const frameColor=frame?.color&&frame.color!=="transparent"?frame.color:"transparent";
    const frameStyle=frameColor!=="transparent"?`box-shadow:0 0 0 2px ${frameColor},0 0 0 4px rgba(0,0,0,.18);`:"";
    if(a?.avatarImage) return `<span class="${cls}" style="${frameStyle}"><img src="${a.avatarImage}" alt="${escapeHTML(name)}"></span>`;
    return `<span class="${cls}" style="background:${avatarColor(a)};${frameStyle}">${escapeHTML(name.slice(0,1).toUpperCase())}</span>`;
  }
  function escapeHTML(s){
    return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  }
  function formatTime(ms){
    if(ms==null)return "—";
    const total=Math.floor(ms/1000);
    return `${Math.floor(total/60)}:${String(total%60).padStart(2,"0")}`;
  }
  function totalXP(p=currentProfile()){
    const unlocked=achievementDefs.filter(a=>p.achievements?.[a.id]).length;
    return (p.words||0)*10+(p.rounds||0)*50+(p.bestStreak||0)*20+unlocked*200;
  }
  function levelInfo(p=currentProfile()){
    const xp=totalXP(p), perLevel=500;
    return {xp,level:Math.floor(xp/perLevel)+1,into:xp%perLevel,perLevel,remaining:perLevel-(xp%perLevel),pct:(xp%perLevel)/perLevel*100};
  }
  function unlockedAchievements(p=currentProfile()){ return achievementDefs.filter(a=>p.achievements?.[a.id]); }

  function currentWallet(){
    return currentAccount()?.wallet || null;
  }


  function isStaff(account=currentAccount()){
    if(!account)return false;
    if(account.online)return ["developer","admin"].includes(account.role);
    return isDeveloper(account);
  }

  function isDeveloper(account=currentAccount()){
    if(!account)return false;

    // Online accounts receive their role from Supabase during hydration.
    // The local Admin Console is still prototype-only; sensitive backend
    // operations must independently authorize the server-side role.
    if(account.online&&account.supabaseUserId){
      return account.role==="developer";
    }

    return account.id===store.developerAccountId && account.role==="developer";
  }

  function setDeveloperCoins(amount){
    const a=currentAccount();
    if(!isDeveloper(a))throw new Error("Developer access required.");
    const value=Math.max(0,Math.min(999999999,Math.floor(Number(amount)||0)));
    a.wallet.coins=value;
    save();
    return value;
  }

  function grantDeveloperCoins(amount){
    const a=currentAccount();
    if(!isDeveloper(a))throw new Error("Developer access required.");
    const add=Math.max(0,Math.min(999999999,Math.floor(Number(amount)||0)));
    a.wallet.coins=Math.min(999999999,(a.wallet.coins||0)+add);
    save();
    return a.wallet.coins;
  }

  function setDeveloperTickets(amount){
    const a=currentAccount();
    if(!isDeveloper(a))throw new Error("Developer access required.");
    const value=Math.max(0,Math.min(999999999,Math.floor(Number(amount)||0)));
    a.wallet.tickets=value;
    save();
    return value;
  }

  function setDeveloperCrateKeys(amount){
    const a=currentAccount();
    if(!isDeveloper(a))throw new Error("Developer access required.");
    const value=Math.max(0,Math.min(999999999,Math.floor(Number(amount)||0)));
    a.wallet.crateKeys=value;
    save();
    return value;
  }

  function grantAllCosmetics(){
    const a=currentAccount();
    if(!isDeveloper(a))throw new Error("Developer access required.");
    a.wallet.owned=[...new Set([...a.wallet.owned,...shopCatalog.map(i=>i.id)])];
    save();
    return a.wallet.owned.length;
  }

  function addCrateKeys(amount,reason="Reward"){
    const a=currentAccount();
    if(!a||!Number.isFinite(Number(amount))||Number(amount)<=0)return 0;
    const add=Math.floor(Number(amount));
    a.wallet.crateKeys=Math.max(0,Number(a.wallet.crateKeys||0)+add);
    save();
    return add;
  }

  function crateDefinition(id){
    return crateDefs.find(c=>c.id===id)||null;
  }

  function rarityWeight(crate,rarity){
    return Number(crate?.odds?.[rarity]||0);
  }

  function rollCrateRarity(crate,pool){
    const available=[...new Set(pool.map(item=>item.rarity))]
      .map(rarity=>({rarity,weight:rarityWeight(crate,rarity)}))
      .filter(x=>x.weight>0);
    const total=available.reduce((sum,x)=>sum+x.weight,0);
    if(!total)return available[0]?.rarity||pool[0]?.rarity||"Common";
    let roll=Math.random()*total;
    for(const entry of available){
      roll-=entry.weight;
      if(roll<=0)return entry.rarity;
    }
    return available.at(-1)?.rarity||"Common";
  }

  function openCrate(crateId){
    const a=currentAccount();
    if(!a)throw new Error("Sign in to open crates.");
    const crate=crateDefinition(crateId);
    if(!crate)throw new Error("Crate not found.");
    if(crate.roundsPerDrop){
      const crateMode=crate.gameMode;
      const verifiedEquivalent=Math.max(0,Number(a.profile?.modeRounds?.[crateMode]||0));
      const claimed=Math.max(0,Number(a.wallet?.modeDropClaims?.[crateMode]||0));
      if(verifiedEquivalent<(claimed+1)*crate.roundsPerDrop){
        const remaining=Math.max(0,(claimed+1)*crate.roundsPerDrop-verifiedEquivalent);
        throw new Error("Complete "+remaining+" more round"+(remaining===1?"":"s")+" to unlock a free crate.");
      }
    }else if((a.wallet.crateKeys||0)<crate.keyCost){
      throw new Error("You need an earned Crate Token.");
    }

    let item;
    if(crate.guaranteedItemId){
      item=shopCatalog.find(entry=>entry.id===crate.guaranteedItemId);
      if(!item)throw new Error("Fixed pack item is unavailable.");
      if(a.wallet.owned.includes(item.id))throw new Error("You already own this pack's cosmetic.");
    }else{
      const pool=shopCatalog.filter(entry=>entry.price>0&&!entry.collectionOnly&&!entry.earnedOnly&&crate.categories.includes(entry.category));
      if(!pool.length)throw new Error("This crate has no rewards.");
      const rarity=rollCrateRarity(crate,pool);
      const rarityPool=pool.filter(entry=>entry.rarity===rarity);
      const unownedInRarity=rarityPool.filter(entry=>!a.wallet.owned.includes(entry.id));
      const candidates=unownedInRarity.length?unownedInRarity:rarityPool;
      item=candidates[Math.floor(Math.random()*candidates.length)];
    }
    if(!item)throw new Error("Could not choose a reward.");

    a.wallet.crateKeys-=crate.keyCost;
    if(crate.roundsPerDrop){
      a.wallet.modeDropClaims={...defaultWallet.modeDropClaims,...(a.wallet.modeDropClaims||{})};
      a.wallet.modeDropClaims[crate.gameMode]=
        Math.max(0,Number(a.wallet.modeDropClaims[crate.gameMode]||0))+1;
    }
    let duplicate=false,compensation=0;
    if(a.wallet.owned.includes(item.id)){
      duplicate=true;
      compensation={Common:60,Uncommon:90,Rare:140,Epic:240,Legendary:425}[item.rarity]||60;
      a.wallet.coins+=compensation;
    }else{
      a.wallet.owned.push(item.id);
    }
    save();
    return {crate,item,duplicate,compensation};
  }

  function catalogItem(id){
    return shopCatalog.find(item=>item.id===id)||null;
  }


  function collectionDefinition(id){
    return collectionDefs.find(c=>c.id===id)||null;
  }

  function collectionMissingItems(collectionId,account=currentAccount()){
    const collection=collectionDefinition(collectionId);
    if(!collection||!account)return [];
    return collection.items.filter(id=>!account.wallet.owned.includes(id));
  }

  function collectionPrice(collectionId,account=currentAccount()){
    const collection=collectionDefinition(collectionId);
    if(!collection)return 0;
    if(!account)return collection.price;
    const missing=collectionMissingItems(collectionId,account);
    if(!missing.length)return 0;
    return Math.max(1,Math.round(collection.price*(missing.length/collection.items.length)));
  }

  function purchaseCollection(collectionId){
    const a=currentAccount();
    if(!a)throw new Error("Sign in to buy collections.");
    const collection=collectionDefinition(collectionId);
    if(!collection)throw new Error("Collection not found.");
    const missing=collectionMissingItems(collectionId,a);
    if(!missing.length)throw new Error("You already own this entire collection.");
    if(window.AutoTypeShopRotation&&!window.AutoTypeShopRotation.collectionAvailable(collectionId,collectionDefs)){
      throw new Error("That collection is not featured in today's shop.");
    }
    const price=collectionPrice(collectionId,a);
    if(!isDeveloper(a)){
      if((a.wallet.coins||0)<price)throw new Error("Not enough coins.");
      a.wallet.coins-=price;
    }
    a.wallet.owned=[...new Set([...a.wallet.owned,...missing])];
    save();
    return {collection,price,granted:missing};
  }

  function equipCollection(collectionId){
    const a=currentAccount();
    if(!a)throw new Error("Sign in first.");
    const collection=collectionDefinition(collectionId);
    if(!collection)throw new Error("Collection not found.");
    const missing=collectionMissingItems(collectionId,a);
    if(missing.length)throw new Error("You do not own the full collection.");
    for(const id of collection.items){
      const item=catalogItem(id);
      if(item)a.wallet.equipped[item.slot]=item.id;
    }
    save();
    applyAppearance();
    return collection;
  }

  function equippedItem(slot,account=currentAccount()){
    const id=account?.wallet?.equipped?.[slot];
    return id?catalogItem(id):null;
  }

  function walletOwns(itemId,account=currentAccount()){
    return !!account?.wallet?.owned?.includes(itemId);
  }

  function addCoins(amount,reason="Reward"){
    const a=currentAccount();
    if(!a||!Number.isFinite(Number(amount))||Number(amount)<=0)return 0;
    a.wallet.coins=Math.max(0,Number(a.wallet.coins||0)+Math.floor(Number(amount)));
    save();
    return Math.floor(Number(amount));
  }

  function addTickets(amount,reason="Reward"){
    const a=currentAccount();
    if(!a||!Number.isFinite(Number(amount))||Number(amount)<=0)return 0;
    a.wallet.tickets=Math.max(0,Number(a.wallet.tickets||0)+Math.floor(Number(amount)));
    save();
    return Math.floor(Number(amount));
  }

  function purchaseShopItem(itemId){
    const a=currentAccount();
    if(!a)throw new Error("Sign in to buy cosmetics.");
    const item=catalogItem(itemId);
    if(!item)throw new Error("That shop item does not exist.");
    if(item.price<=0){
      if(!a.wallet.owned.includes(item.id))a.wallet.owned.push(item.id);
      save();
      return item;
    }
    if(a.wallet.owned.includes(item.id))throw new Error("You already own that item.");
    if(window.AutoTypeShopRotation&&!window.AutoTypeShopRotation.itemAvailable(itemId,shopCatalog)){
      throw new Error("This cosmetic is not available in today's shop.");
    }
    if(!isDeveloper(a)){
      if((a.wallet.coins||0)<item.price)throw new Error("Not enough coins.");
      a.wallet.coins-=item.price;
    }
    a.wallet.owned.push(item.id);
    save();
    return item;
  }

  function equipShopItem(itemId){
    const a=currentAccount();
    if(!a)throw new Error("Sign in to equip cosmetics.");
    const item=catalogItem(itemId);
    if(!item)throw new Error("That shop item does not exist.");
    if(!a.wallet.owned.includes(item.id))throw new Error("You do not own that item.");
    a.wallet.equipped[item.slot]=item.id;
    save();
    applyAppearance();
    return item;
  }

  function tournaments(){
    return store.tournaments;
  }

  function tournamentById(id){
    return store.tournaments.find(t=>t.id===id)||null;
  }

  function tournamentEntry(tournamentId,accountId=currentAccount()?.id){
    return store.tournamentEntries.find(e=>e.tournamentId===tournamentId&&e.accountId===accountId)||null;
  }

  function normalizeTournamentInput(data,current={}){
    const entryType=data.entryType==="ticket"?"ticket":"free";
    const status=["open","scheduled","closed"].includes(data.status)?data.status:"open";
    const id=current.id||("tour_"+Date.now()+"_"+Math.random().toString(36).slice(2,7));
    return {
      ...current,
      id,
      name:String(data.name||current.name||"Untitled Tournament").trim().slice(0,60),
      description:String(data.description||current.description||"").trim().slice(0,240),
      entryType,
      entryCost:entryType==="ticket"?Math.max(1,Math.min(99,Math.floor(Number(data.entryCost)||1))):0,
      rewardCoins:Math.max(0,Math.min(999999999,Math.floor(Number(data.rewardCoins)||0))),
      rewardCrateTokens:Math.max(0,Math.min(999999999,Math.floor(Number(data.rewardCrateTokens)||0))),
      rewardTitle:String(data.rewardTitle||current.rewardTitle||"").trim().slice(0,50),
      schedule:String(data.schedule||current.schedule||"TBA").trim().slice(0,50),
      maxPlayers:Math.max(2,Math.min(512,Math.floor(Number(data.maxPlayers)||16))),
      status,
      builtIn:current.builtIn||false,
      createdAt:current.createdAt||Date.now(),
      updatedAt:Date.now()
    };
  }

  function createTournament(data){
    if(!isDeveloper())throw new Error("Developer access required.");
    const tournament=normalizeTournamentInput(data);
    if(!tournament.name)throw new Error("Tournament name is required.");
    store.tournaments.push(tournament);
    save();
    return tournament;
  }

  function updateTournament(id,patch){
    if(!isDeveloper())throw new Error("Developer access required.");
    const index=store.tournaments.findIndex(t=>t.id===id);
    if(index<0)throw new Error("Tournament not found.");
    store.tournaments[index]=normalizeTournamentInput({...store.tournaments[index],...patch},store.tournaments[index]);
    save();
    return store.tournaments[index];
  }

  function deleteTournament(id){
    if(!isDeveloper())throw new Error("Developer access required.");
    const tournament=tournamentById(id);
    if(!tournament)throw new Error("Tournament not found.");
    store.tournaments=store.tournaments.filter(t=>t.id!==id);
    store.tournamentEntries=store.tournamentEntries.filter(e=>e.tournamentId!==id);
    save();
  }

  function restoreDefaultTournaments(){
    if(!isDeveloper())throw new Error("Developer access required.");
    const existingCustom=store.tournaments.filter(t=>!t.builtIn);
    store.tournaments=[
      ...clone(defaultTournamentDefs).map(t=>({...t,status:"open",builtIn:true,createdAt:Date.now()})),
      ...existingCustom
    ];
    save();
    return store.tournaments;
  }

  function joinTournament(tournamentId){
    const a=currentAccount();
    if(!a)throw new Error("Sign in to join tournaments.");
    const tournament=tournamentById(tournamentId);
    if(!tournament)throw new Error("Tournament not found.");
    if(tournament.status!=="open")throw new Error(tournament.status==="scheduled"?"Registration is not open yet.":"This tournament is closed.");
    if(tournamentEntry(tournamentId,a.id))throw new Error("You are already registered.");

    const entrantCount=store.tournamentEntries.filter(e=>e.tournamentId===tournamentId).length;
    if(entrantCount>=tournament.maxPlayers)throw new Error("This tournament is full.");

    if(tournament.entryType==="ticket"){
      if((a.wallet.tickets||0)<tournament.entryCost)throw new Error("You do not have enough Tournament Tickets.");
      a.wallet.tickets-=tournament.entryCost;
    }

    store.tournamentEntries.push({
      id:"te_"+Date.now()+"_"+Math.random().toString(36).slice(2,6),
      tournamentId,
      accountId:a.id,
      joinedAt:Date.now(),
      status:"registered"
    });
    save();
    return tournament;
  }

  function leaveTournament(tournamentId){
    const a=currentAccount();
    if(!a)throw new Error("Sign in first.");
    const entry=tournamentEntry(tournamentId,a.id);
    if(!entry)throw new Error("You are not registered.");
    const tournament=tournamentById(tournamentId);
    store.tournamentEntries=store.tournamentEntries.filter(e=>e.id!==entry.id);
    if(tournament?.entryType==="ticket"){
      a.wallet.tickets=(a.wallet.tickets||0)+tournament.entryCost;
    }
    save();
  }

  function awardTournamentWinner(tournamentId,accountId){
    if(!isDeveloper())throw new Error("Developer access required.");
    const tournament=tournamentById(tournamentId);
    const account=store.accounts.find(a=>a.id===accountId);
    if(!tournament||!account)throw new Error("Tournament or player not found.");
    if(tournament.winnerAccountId)throw new Error("A winner has already been awarded for this tournament.");
    const entry=store.tournamentEntries.find(e=>e.tournamentId===tournamentId&&e.accountId===accountId);
    if(!entry)throw new Error("That player is not registered in this tournament.");

    account.wallet.coins=(account.wallet.coins||0)+Math.max(0,tournament.rewardCoins||0);
    account.wallet.crateKeys=(account.wallet.crateKeys||0)+Math.max(0,tournament.rewardCrateTokens||0);
    account.profile.tournamentWins=(account.profile.tournamentWins||0)+1;
    account.profile.lastTournamentTitle=tournament.rewardTitle||"Tournament Winner";
    entry.status="winner";
    tournament.winnerAccountId=account.id;
    tournament.winnerName=accountName(account);
    tournament.awardedAt=Date.now();
    tournament.status="closed";
    save();
    return account;
  }



  function developerAccounts(){
    if(!isDeveloper())throw new Error("Developer access required.");
    return store.accounts;
  }

  function setPlayerBalances(accountId,{coins,tickets,crateKeys}){
    if(!isDeveloper())throw new Error("Developer access required.");
    const account=store.accounts.find(a=>a.id===accountId);
    if(!account)throw new Error("Player not found.");
    if(coins!==undefined)account.wallet.coins=Math.max(0,Math.min(999999999,Math.floor(Number(coins)||0)));
    if(tickets!==undefined)account.wallet.tickets=Math.max(0,Math.min(999999999,Math.floor(Number(tickets)||0)));
    if(crateKeys!==undefined)account.wallet.crateKeys=Math.max(0,Math.min(999999999,Math.floor(Number(crateKeys)||0)));
    save();
    return account.wallet;
  }

  function grantPlayerAllCosmetics(accountId){
    if(!isDeveloper())throw new Error("Developer access required.");
    const account=store.accounts.find(a=>a.id===accountId);
    if(!account)throw new Error("Player not found.");
    account.wallet.owned=[...new Set([...account.wallet.owned,...shopCatalog.map(i=>i.id)])];
    save();
    return account.wallet.owned.length;
  }

  function resetPlayerProgress(accountId){
    if(!isDeveloper())throw new Error("Developer access required.");
    const account=store.accounts.find(a=>a.id===accountId);
    if(!account)throw new Error("Player not found.");
    account.profile=clone(defaultProfile);
    save();
  }

  function removeSuggestionAdmin(suggestionId){
    if(!isDeveloper())throw new Error("Developer access required.");
    store.suggestions=store.suggestions.filter(s=>s.id!==suggestionId);
    save();
  }

  function setAnnouncement(message,active=true){
    if(!isDeveloper())throw new Error("Developer access required.");
    store.announcement={
      active:!!active && !!String(message||"").trim(),
      message:String(message||"").trim().slice(0,180)
    };
    save();
    return store.announcement;
  }

  function exportLocalBackup(){
    if(!isDeveloper())throw new Error("Developer access required.");
    return JSON.stringify(store,null,2);
  }

  function toast(message){
    let el=document.querySelector(".toast");
    if(!el){
      el=document.createElement("div");el.className="toast";document.body.appendChild(el);
    }
    el.textContent=message;el.classList.add("show");
    clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove("show"),1800);
  }

  function renderAccountButton(){
    const btn=document.querySelector("#accountMenuButton");
    const dropdown=document.querySelector("#accountDropdown");
    if(!btn||!dropdown)return;
    const a=currentAccount(), name=accountName(a);
    btn.innerHTML=`${avatarMarkup(a,"nav-avatar")}<span class="account-name">${escapeHTML(name)}</span><span class="chevron">▾</span>`;

    if(a){
      dropdown.innerHTML=`
        <div class="account-dropdown-header">
          ${avatarMarkup(a,"avatar dropdown-avatar")}
          <div><strong>${escapeHTML(name)}</strong><span>@${escapeHTML(a.username)}${equippedItem("title",a)?.value?` · ${escapeHTML(equippedItem("title",a).value)}`:""}</span></div>
        </div>
        <div class="account-wallet-row"><span>◉ ${a.wallet?.coins||0} coins</span><span>◆ ${a.wallet?.tickets||0} tickets</span><span>▣ ${a.wallet?.crateKeys||0} tokens</span></div>${isDeveloper(a)?`<div class="developer-badge">Developer</div>`:isStaff(a)?`<div class="developer-badge">Admin</div>`:""}
        <a href="profile.html"><span>My Profile</span><small>View & edit</small></a>
        <a href="shop.html"><span>Shop</span><small>Cosmetics</small></a>
        <a href="tournaments.html"><span>Tournaments</span><small>Compete</small></a>
        ${isStaff(a)?`<a href="admin.html"><span>Admin Console</span><small>${isDeveloper(a)?"Developer controls":"Moderation tools"}</small></a>`:""}
        <button id="switchAccountAction"><span>Switch Account</span><small>${store.accounts.length} saved</small></button>
        <a href="settings.html"><span>Settings</span><small>Preferences</small></a>
        <hr>
        <button class="danger" id="signOutAction"><span>Sign Out</span></button>`;
      dropdown.querySelector("#switchAccountAction")?.addEventListener("click",async()=>{
        if(a.online&&window.AutoTypeBackend?.configured()){
          try{await AutoTypeBackend.signOut()}catch(e){console.warn("Online sign-out failed",e)}
          store.currentId=null;save();
          location.href="account.html?switch=1";
          return;
        }
        openSwitchModal();
      });
      dropdown.querySelector("#signOutAction")?.addEventListener("click",async()=>{
        if(a.online&&window.AutoTypeBackend?.configured()){
          try{await AutoTypeBackend.signOut()}catch(e){console.warn("Online sign-out failed",e)}
        }
        store.currentId=null;save();location.href="index.html";
      });
    } else {
      dropdown.innerHTML=`
        <div class="account-dropdown-header">
          ${avatarMarkup(null,"avatar dropdown-avatar")}
          <div><strong>Guest</strong><span>Not signed in</span></div>
        </div>
        <a href="account.html"><span>Sign In</span><small>Existing account</small></a>
        <a href="account.html#create"><span>Create Account</span><small>New profile</small></a>
        <a href="profile.html"><span>Guest Profile</span><small>Local progress</small></a>
        <a href="settings.html"><span>Settings</span></a>`;
    }
  }

  function openSwitchModal(){
    document.querySelector("#accountDropdown")?.setAttribute("hidden","");
    document.querySelector("#switchAccountModal")?.remove();

    const wrap=document.createElement("div");
    wrap.className="modal-backdrop";
    wrap.id="switchAccountModal";
    wrap.innerHTML=`
      <div class="modal">
        <div class="modal-head"><h2>Switch Account</h2><button class="modal-close" aria-label="Close">×</button></div>
        <div class="modal-body">
          <div id="switchAccountList"></div>
          <div id="switchAuthPanel" hidden>
            <div class="divider"></div>
            <button class="button button-quiet" id="switchBackButton" type="button">← Back</button>
            <div style="height:10px"></div>
            <div class="person" id="switchSelectedPerson"></div>
            <div class="form-group" style="margin-top:14px">
              <label class="label">Password</label>
              <input class="input" id="switchPassword" type="password" autocomplete="current-password">
            </div>
            <button class="button button-primary" id="confirmSwitchButton" type="button">Sign in to this account</button>
            <div class="help">Saved accounts are not treated as authenticated. Re-enter that account's password to switch.</div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const list=wrap.querySelector("#switchAccountList");
    const authPanel=wrap.querySelector("#switchAuthPanel");
    const current=store.currentId;

    function renderList(){
      authPanel.hidden=true;list.hidden=false;
      const rows=[
        {id:null,username:"Guest",displayName:"Guest",bio:"Local guest profile"},
        ...store.accounts.filter(a=>!a.online)
      ];
      list.innerHTML=rows.map(a=>{
        const selected=(a.id||null)===(current||null);
        return `<button class="switch-account-row ${selected?"current":""}" data-id="${a.id||""}" ${selected?"disabled":""}>
          <span class="switch-left">${avatarMarkup(a,"avatar")}<span class="switch-copy"><strong>${escapeHTML(accountName(a))}</strong><span>${a.id?`@${escapeHTML(a.username)}`:"No account"}</span></span></span>
          <span>${selected?"Current":a.id?"Sign in":"Use guest"}</span>
        </button>`;
      }).join("") + `<div class="divider"></div><a class="button button-secondary" href="account.html#create">Add another account</a>`;

      list.querySelectorAll("[data-id]").forEach(b=>b.addEventListener("click",()=>{
        const id=b.dataset.id||null;
        if(!id){
          store.currentId=null;save();location.href="index.html";return;
        }
        const target=store.accounts.find(a=>a.id===id);
        if(!target)return;
        list.hidden=true;authPanel.hidden=false;
        wrap.querySelector("#switchSelectedPerson").innerHTML=`${avatarMarkup(target,"avatar")}<div class="person-copy"><strong>${escapeHTML(accountName(target))}</strong><span>@${escapeHTML(target.username)}</span></div>`;
        wrap.querySelector("#switchPassword").value="";
        wrap.querySelector("#switchPassword").focus();
        wrap.querySelector("#confirmSwitchButton").dataset.id=id;
      }));
    }

    wrap.querySelector("#switchBackButton").addEventListener("click",renderList);
    wrap.querySelector("#confirmSwitchButton").addEventListener("click",async()=>{
      const btn=wrap.querySelector("#confirmSwitchButton");
      const target=store.accounts.find(a=>a.id===btn.dataset.id);
      if(!target)return;
      btn.disabled=true;
      try{
        await authenticateAccount(target,wrap.querySelector("#switchPassword").value);
        store.currentId=target.id;save();location.reload();
      }catch(e){toast(e.message)}
      finally{btn.disabled=false}
    });
    wrap.querySelector("#switchPassword").addEventListener("keydown",e=>{
      if(e.key==="Enter")wrap.querySelector("#confirmSwitchButton").click();
    });
    wrap.querySelector(".modal-close").addEventListener("click",()=>wrap.remove());
    wrap.addEventListener("click",e=>{if(e.target===wrap)wrap.remove()});
    renderList();
  }


  function relativeLuminanceFromHex(hex){
    const clean=String(hex||"").replace("#","");
    if(!/^[0-9a-f]{6}$/i.test(clean))return .08;
    const values=[0,2,4].map(i=>parseInt(clean.slice(i,i+2),16)/255).map(v=>
      v<=0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4)
    );
    return 0.2126*values[0]+0.7152*values[1]+0.0722*values[2];
  }

  function applyAppearance(){
    const s=currentSettings();
    const account=currentAccount();
    let color=/^#[0-9a-f]{6}$/i.test(s.backgroundColor||"") ? s.backgroundColor : "#1f2328";
    let dim=Math.max(0,Math.min(90,Number(s.backgroundDim ?? 64)));
    let backgroundImage="none";
    let sourceLum=relativeLuminanceFromHex(color);
    let useImage=false;

    if(s.backgroundType==="image"&&s.backgroundImage){
      const safe=String(s.backgroundImage).replace(/"/g,'\\"');
      backgroundImage=`url("${safe}")`;
      sourceLum=Number.isFinite(Number(s.backgroundLuminance)) ? Number(s.backgroundLuminance) : .45;
      useImage=true;
    }

    document.documentElement.style.setProperty("--user-bg",color);
    document.documentElement.style.setProperty("--bg-dim",String(dim/100));
    document.documentElement.style.setProperty("--user-bg-image",backgroundImage);
    document.body.classList.toggle("has-photo-bg",useImage);
    document.body.classList.toggle("has-solid-bg",!useImage);

    const effectiveLum=useImage ? sourceLum*(1-dim/100) : sourceLum;
    const useLightUI=effectiveLum > .52;

    document.body.classList.toggle("theme-light",useLightUI);
    document.body.classList.toggle("theme-dark",!useLightUI);
    document.body.classList.toggle("reduced-motion",!!s.reducedFx);
    document.body.classList.toggle("animations-off",s.animations===false);
    document.body.classList.toggle("high-contrast",!!s.highContrast);
    const scale=[100,115,130].includes(Number(s.textScale))?Number(s.textScale):100;
    document.documentElement.style.setProperty("--ui-zoom",String(scale)+"%");

    const cursor=equippedItem("cursor",account);
    const predictor=equippedItem("predictor",account);
    const result=equippedItem("result",account);
    const trail=equippedItem("trail",account);
    const arena=equippedItem("arena",account);

    document.documentElement.style.setProperty("--arena-background",arena?.background||"var(--surface)");
    document.documentElement.style.setProperty("--arena-border",arena?.border||"var(--border)");
    document.documentElement.style.setProperty("--arena-accent",arena?.accent||"#00a2ff");
    document.body.dataset.arenaEffect=arena?.effect||"default";

    document.documentElement.style.setProperty("--cursor-color",cursor?.color||"#00a2ff");
    document.documentElement.style.setProperty("--prediction-ai",predictor?.color||"#89929b");
    document.documentElement.style.setProperty("--trail-color",trail?.color||"#00a2ff");

    document.body.dataset.cursorEffect=cursor?.effect||"none";
    document.body.dataset.resultEffect=result?.effect||"none";
    document.body.dataset.trailEffect=trail?.effect||"none";
    document.documentElement.style.setProperty("--detected-luminance",String(effectiveLum));
  }

  async function imageFileToBackground(file){
    if(!file || !file.type.startsWith("image/"))throw new Error("Choose an image file.");
    if(file.size>8*1024*1024)throw new Error("Use an image under 8 MB.");

    const dataURL=await new Promise((resolve,reject)=>{
      const r=new FileReader();
      r.onload=()=>resolve(String(r.result||""));
      r.onerror=()=>reject(new Error("Could not read that image."));
      r.readAsDataURL(file);
    });

    const img=await new Promise((resolve,reject)=>{
      const i=new Image();
      i.onload=()=>resolve(i);
      i.onerror=()=>reject(new Error("Could not load that image."));
      i.src=dataURL;
    });

    const maxW=1920,maxH=1080;
    const scale=Math.min(1,maxW/img.width,maxH/img.height);
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(img.width*scale));
    canvas.height=Math.max(1,Math.round(img.height*scale));
    const ctx=canvas.getContext("2d");
    ctx.drawImage(img,0,0,canvas.width,canvas.height);

    // Estimate average image luminance using a small sample canvas.
    const sample=document.createElement("canvas");
    sample.width=32;sample.height=32;
    const sctx=sample.getContext("2d",{willReadFrequently:true});
    sctx.drawImage(canvas,0,0,32,32);
    const pixels=sctx.getImageData(0,0,32,32).data;
    let total=0,count=0;
    for(let i=0;i<pixels.length;i+=4){
      const alpha=pixels[i+3]/255;
      if(alpha<0.05)continue;
      const rgb=[pixels[i],pixels[i+1],pixels[i+2]].map(v=>{
        v/=255;
        return v<=0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4);
      });
      total+=(0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2])*alpha;
      count+=alpha;
    }
    const luminance=count?total/count:.45;

    return {
      dataURL:canvas.toDataURL("image/jpeg",0.82),
      luminance
    };
  }

  function initShell(){
    applyAppearance();
    const active=document.body.dataset.page;
    // Add a prominent Feedback shortcut to every beta page with the shared header.
    const feedbackSource=location.pathname.split("/").pop()||"index.html";
    const feedbackUrl="feedback.html?from="+encodeURIComponent(feedbackSource);
    const headerSpacer=document.querySelector(".topbar-inner .nav-spacer");
    if(headerSpacer && !document.querySelector(".header-feedback-link")){
      const link=document.createElement("a");
      link.href=feedbackUrl;
      link.className="header-feedback-link";
      link.textContent="✎ Feedback";
      link.setAttribute("aria-label","Send beta feedback");
      if(active==="feedback")link.classList.add("active");
      headerSpacer.after(link);
    }
    const mobileNav=document.querySelector("#mobileNav");
    if(mobileNav && !mobileNav.querySelector('[data-nav="feedback"]')){
      const link=document.createElement("a");
      link.href=feedbackUrl;
      link.dataset.nav="feedback";
      link.textContent="✎ Send feedback";
      if(active==="feedback")link.classList.add("active");
      mobileNav.appendChild(link);
    }
    document.querySelectorAll("[data-nav]").forEach(a=>a.classList.toggle("active",a.dataset.nav===active));
    document.querySelectorAll(".nav-more").forEach(menu=>{
      menu.querySelector("summary")?.classList.toggle("active",!!menu.querySelector("a.active"));
    });
    renderAccountButton();

    const a=currentAccount();
    if(isStaff(a)){
      document.querySelectorAll(".nav-more-menu").forEach(menu=>{
        if(!menu.querySelector('a[href="admin.html"]')){
          const link=document.createElement("a");
          link.href="admin.html";
          link.dataset.nav="admin";
          link.textContent="Admin Console";
          if(active==="admin")link.classList.add("active");
          menu.prepend(link);
        }
      });
      const mobileNav=document.querySelector("#mobileNav");
      if(mobileNav&&!mobileNav.querySelector('a[href="admin.html"]')){
        const link=document.createElement("a");
        link.href="admin.html";
        link.textContent="Admin Console";
        mobileNav.appendChild(link);
      }
    }
    const navCurrency=document.querySelector("#navCurrency");
    if(navCurrency){
      const wallet=currentWallet();
      if(wallet){
        navCurrency.hidden=false;
        navCurrency.innerHTML=`<a href="shop.html" title="Coins"><span>◉</span>${wallet.coins||0}</a><a href="tournaments.html" title="Tournament Tickets"><span>◆</span>${wallet.tickets||0}</a><a href="shop.html#crates" title="Crate Tokens"><span>▣</span>${wallet.crateKeys||0}</a>`;
      }else{
        navCurrency.hidden=true;
        navCurrency.innerHTML="";
      }
    }
    // Keep notifications out of the already compact More menu.
    const notificationLink=document.querySelector(".header-notifications-link");
    if(a?.online && notificationLink && window.AutoTypeBackend?.socialNotificationsSnapshot){
      const badge=notificationLink.querySelector(".nav-notifications-count");
      const updateNotifications=async()=>{
        if(document.hidden)return;
        try{
          const notifications=await AutoTypeBackend.socialNotificationsSnapshot();
          const count=(notifications.incoming||[]).length+
            (notifications.messages||[]).reduce((sum,row)=>sum+Number(row.unread||0),0);
          badge.hidden=count===0;
          badge.textContent=count>9?"9+":String(count);
          notificationLink.title=count?count+" new social notification"+(count===1?"":"s"):"No new notifications";
        }catch(error){
          badge.hidden=true;
          console.warn("Could not refresh notifications",error);
        }
      };
      updateNotifications();
      const interval=setInterval(updateNotifications,45000);
      window.addEventListener("pagehide",()=>clearInterval(interval),{once:true});
      document.addEventListener("visibilitychange",()=>{if(!document.hidden)updateNotifications()});
    }
    const friendsNav=document.querySelector('[data-nav="friends"]');
    if(a&&friendsNav){
      const incoming=store.friendRequests.filter(r=>r.status==="pending"&&r.toId===a.id).length;
      if(incoming){
        const badge=document.createElement("span");
        badge.className="nav-badge";
        badge.textContent=incoming>9?"9+":String(incoming);
        friendsNav.appendChild(badge);
      }
    }

    const accountBtn=document.querySelector("#accountMenuButton");
    const dropdown=document.querySelector("#accountDropdown");
    accountBtn?.addEventListener("click",e=>{
      e.stopPropagation();
      const isHidden=dropdown.hasAttribute("hidden");
      if(isHidden){dropdown.removeAttribute("hidden");accountBtn.classList.add("open")}
      else{dropdown.setAttribute("hidden","");accountBtn.classList.remove("open")}
    });
    document.addEventListener("click",e=>{
      if(dropdown && !dropdown.contains(e.target) && !accountBtn?.contains(e.target)){
        dropdown.setAttribute("hidden","");accountBtn?.classList.remove("open");
      }
      document.querySelectorAll(".nav-more[open]").forEach(menu=>{
        if(!menu.contains(e.target))menu.removeAttribute("open");
      });
    });

    // The mobile menu is built from a single route directory on every page.
    // Keep the static links in each HTML file as a no-JS fallback.
    const mobBtn=document.querySelector("#mobileToggle");
    const mobNav=document.querySelector("#mobileNav");
    if(mobBtn&&mobNav){
      const isActive=(href,key)=>active===key||(location.pathname.split("/").pop()||"index.html")===href;
      const menuSections=[
        {label:"Main",links:[
          ["Home","index.html","home"],["Play","play.html","play"],
          ["Shop","shop.html","shop"],["Friends","friends.html","friends"],
          ["Tournaments","tournaments.html","tournaments"]
        ]},
        {label:"Social",links:[
          ["Messages","chat.html","messages"],["Notifications","notifications.html","notifications"],
          ["Leaderboard","leaderboard.html","leaderboard"]
        ]},
        {label:"Your profile",links:[
          ["My profile","profile.html","profile"],["Stats","stats.html","stats"],
          ["Achievements","achievements.html","achievements"],["Settings","settings.html","settings"]
        ]},
        {label:"Explore",links:[
          ["How to play","how-to.html","help"],["All features","explore.html","explore"],
          ["Prediction Lab","predictions.html","predictions"],["Custom game","create.html","create"],
          ["Plinko","plinko.html","plinko"],["Send feedback",feedbackUrl,"feedback"]
        ]}
      ];
      if(isStaff(a))menuSections[2].links.push(["Admin Console","admin.html","admin"]);
      const linkMarkup=([label,href,key])=>{
        const current=isActive(href,key);
        return `<a href="${escapeHTML(href)}" data-nav="${key}"${current?' class="active" aria-current="page"':""}>${escapeHTML(label)}</a>`;
      };
      mobNav.innerHTML=`
        <div class="mobile-nav-header"><div><strong>AutoType</strong><span>Beta navigation</span></div>
          <button type="button" class="mobile-nav-close" aria-label="Close menu">×</button></div>
        ${menuSections.map((section,i)=>i===0
          ?`<div class="mobile-nav-primary">${section.links.map(linkMarkup).join("")}</div>`
          :`<details class="mobile-nav-group"${section.links.some(l=>isActive(l[1],l[2]))?" open":""}>
              <summary>${escapeHTML(section.label)} <span>${section.links.length}</span></summary>
              <div class="mobile-nav-links">${section.links.map(linkMarkup).join("")}</div>
            </details>`).join("")}
        <div class="mobile-nav-bottom">AutoType · Beta</div>`;
      mobBtn.setAttribute("aria-controls","mobileNav");
      mobBtn.setAttribute("aria-expanded","false");
      mobNav.setAttribute("aria-label","Site navigation");
      mobNav.setAttribute("aria-hidden","true");
      const scrim=document.createElement("div");
      scrim.className="mobile-nav-scrim";
      scrim.hidden=true;
      mobNav.before(scrim);
      const closeMenu=(restoreFocus=false)=>{
        mobNav.classList.remove("open");
        document.body.classList.remove("mobile-nav-open");
        scrim.hidden=true;
        mobBtn.setAttribute("aria-expanded","false");
        mobBtn.setAttribute("aria-label","Open navigation");
        mobNav.setAttribute("aria-hidden","true");
        if(restoreFocus)mobBtn.focus({preventScroll:true});
      };
      const openMenu=()=>{
        document.querySelector("#accountDropdown")?.setAttribute("hidden","");
        document.querySelector("#accountMenuButton")?.classList.remove("open");
        mobNav.classList.add("open");
        document.body.classList.add("mobile-nav-open");
        scrim.hidden=false;
        mobBtn.setAttribute("aria-expanded","true");
        mobBtn.setAttribute("aria-label","Close navigation");
        mobNav.setAttribute("aria-hidden","false");
        mobNav.querySelector(".mobile-nav-close")?.focus({preventScroll:true});
      };
      mobBtn.addEventListener("click",()=>mobNav.classList.contains("open")?closeMenu(true):openMenu());
      mobNav.querySelector(".mobile-nav-close")?.addEventListener("click",()=>closeMenu(true));
      mobNav.addEventListener("click",e=>{if(e.target.closest("a"))closeMenu()});
      scrim.addEventListener("click",()=>closeMenu(true));
      document.addEventListener("keydown",e=>{
        if(!mobNav.classList.contains("open"))return;
        if(e.key==="Escape"){e.preventDefault();closeMenu(true);return;}
        if(e.key==="Tab"){
          const focusables=[...mobNav.querySelectorAll('a,button,summary')].filter(el=>el.getClientRects().length);
          const first=focusables[0],last=focusables[focusables.length-1];
          if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
          else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
        }
      });
      window.addEventListener("resize",()=>{if(window.innerWidth>820)closeMenu()});
    }
  }

  function bytesToBase64(bytes){
    let binary="";bytes.forEach(b=>binary+=String.fromCharCode(b));return btoa(binary);
  }
  function base64ToBytes(text){
    const binary=atob(text);return Uint8Array.from(binary,c=>c.charCodeAt(0));
  }
  async function derivePasswordHash(password,saltBytes,iterations=PASSWORD_ITERATIONS){
    const enc=new TextEncoder();
    const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);
    const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:saltBytes,iterations},key,256);
    return bytesToBase64(new Uint8Array(bits));
  }
  async function makePasswordRecord(password){
    const salt=crypto.getRandomValues(new Uint8Array(16));
    return {passwordSalt:bytesToBase64(salt),passwordHash:await derivePasswordHash(password,salt),passwordIterations:PASSWORD_ITERATIONS};
  }
  async function verifyPassword(account,password){
    if(account.passwordHash&&account.passwordSalt){
      const derived=await derivePasswordHash(password,base64ToBytes(account.passwordSalt),account.passwordIterations||PASSWORD_ITERATIONS);
      return derived===account.passwordHash;
    }
    if(typeof account.password==="string"&&account.password===password){
      Object.assign(account,await makePasswordRecord(password));delete account.password;save();return true;
    }
    return false;
  }

  function passwordProblems(password,identity=""){
    const p=String(password||"");
    const problems=[];
    if(p.length<8)problems.push("at least 8 characters");
    if(p.length>128)problems.push("128 characters or fewer");
    if(!/[a-z]/.test(p))problems.push("a lowercase letter");
    if(!/[A-Z]/.test(p))problems.push("an uppercase letter");
    if(!/[0-9]/.test(p))problems.push("a number");
    if(!/[^A-Za-z0-9\s]/.test(p))problems.push("a symbol");
    if(/\s/.test(p))problems.push("no spaces");

    const common=[
      "password","password1","password123","qwerty123","12345678","123456789",
      "letmein","welcome1","admin123","iloveyou","autotype","autotype1"
    ];
    const lower=p.toLowerCase();
    if(common.includes(lower))problems.push("a less common password");

    const ident=String(identity||"").toLowerCase().trim();
    const local=ident.includes("@")?ident.split("@")[0]:ident;
    if(local.length>=3&&lower.includes(local))problems.push("a password that does not contain your username/email name");
    return problems;
  }

  function assertStrongPassword(password,identity=""){
    const problems=passwordProblems(password,identity);
    if(problems.length)throw new Error(`Password needs ${problems[0]}.`);
  }

  function normalizeSecurityAnswer(answer){
    return String(answer||"").trim().toLowerCase().replace(/\s+/g," ");
  }

  async function makeSecurityAnswerRecord(answer){
    const normalized=normalizeSecurityAnswer(answer);
    if(normalized.length<3)throw new Error("Security answer must be at least 3 characters.");
    const salt=crypto.getRandomValues(new Uint8Array(16));
    return {
      securityAnswerSalt:bytesToBase64(salt),
      securityAnswerHash:await derivePasswordHash(normalized,salt,PASSWORD_ITERATIONS),
      securityAnswerIterations:PASSWORD_ITERATIONS
    };
  }

  async function verifySecurityAnswer(account,answer){
    if(!account.securityQuestion||!account.securityAnswerHash||!account.securityAnswerSalt)return false;
    const derived=await derivePasswordHash(
      normalizeSecurityAnswer(answer),
      base64ToBytes(account.securityAnswerSalt),
      account.securityAnswerIterations||PASSWORD_ITERATIONS
    );
    return derived===account.securityAnswerHash;
  }

  async function authenticateAccount(account,password){
    if(!account)throw new Error("Account not found.");
    const now=Date.now();
    if((account.lockUntil||0)>now){
      const secs=Math.ceil((account.lockUntil-now)/1000);
      throw new Error(`Too many failed attempts. Try again in ${secs} seconds.`);
    }

    const ok=await verifyPassword(account,password);
    if(!ok){
      account.failedLoginCount=(account.failedLoginCount||0)+1;
      if(account.failedLoginCount>=MAX_LOGIN_FAILURES){
        account.failedLoginCount=0;
        account.lockUntil=Date.now()+LOGIN_LOCK_MS;
      }
      save();
      throw new Error("Username/email or password is incorrect.");
    }

    account.failedLoginCount=0;
    account.lockUntil=0;

    // Upgrade older PBKDF2 records after successful authentication.
    if((account.passwordIterations||0)<PASSWORD_ITERATIONS){
      Object.assign(account,await makePasswordRecord(password));
    }
    save();
    return true;
  }

  async function setSecurityQuestion(currentPassword,question,answer){
    const a=currentAccount();
    if(!a)throw new Error("Sign in first.");
    await authenticateAccount(a,currentPassword);
    if(!String(question||"").trim())throw new Error("Choose a security question.");
    const record=await makeSecurityAnswerRecord(answer);
    Object.assign(a,{securityQuestion:String(question).trim(),...record});
    save();
  }

  async function changePassword({currentPassword,securityAnswer,newPassword}){
    const a=currentAccount();
    if(!a)throw new Error("Sign in first.");
    if(!a.securityQuestion)throw new Error("Set a security question first.");
    await authenticateAccount(a,currentPassword);
    if(!(await verifySecurityAnswer(a,securityAnswer)))throw new Error("Security answer is incorrect.");
    assertStrongPassword(newPassword,a.username||a.email||"");
    if(await verifyPassword(a,newPassword))throw new Error("New password must be different from your current password.");
    Object.assign(a,await makePasswordRecord(newPassword));
    a.failedLoginCount=0;a.lockUntil=0;
    save();
  }

  async function deleteCurrentAccount({currentPassword,usernameConfirm}){
    const a=currentAccount();
    if(!a)throw new Error("Sign in first.");
    await authenticateAccount(a,currentPassword);
    if(String(usernameConfirm||"").trim().toLowerCase()!==a.username.toLowerCase()){
      throw new Error("Type your exact username to confirm deletion.");
    }

    const id=a.id;
    store.accounts=store.accounts.filter(x=>x.id!==id);
    store.accounts.forEach(x=>{x.friends=(x.friends||[]).filter(fid=>fid!==id)});
    store.friendRequests=store.friendRequests.filter(r=>r.fromId!==id&&r.toId!==id);
    store.races=store.races.filter(r=>!r.playerIds?.includes(id));
    store.tournamentEntries=store.tournamentEntries.filter(e=>e.accountId!==id);
    store.suggestions=store.suggestions.filter(s=>s.accountId!==id);
    store.currentId=null;
    save();
  }

  async function createAccount({username,email,password,securityQuestion,securityAnswer}){
    username=username.trim();email=email.trim();
    if(username.length<2)throw new Error("Username must be at least 2 characters.");
    if(!/^[A-Za-z0-9_.-]+$/.test(username))throw new Error("Username can only use letters, numbers, dots, dashes, and underscores.");
    assertStrongPassword(password,username);
    if(store.accounts.some(a=>a.username.toLowerCase()===username.toLowerCase()))throw new Error("That username already exists.");
    if(email&&store.accounts.some(a=>(a.email||"").toLowerCase()===email.toLowerCase()))throw new Error("That email is already in use.");
    if(!String(securityQuestion||"").trim())throw new Error("Choose a security question.");

    const securityRecord=await makeSecurityAnswerRecord(securityAnswer);
    const account={
      id:"acc_"+Date.now(),username,email,...await makePasswordRecord(password),
      securityQuestion:String(securityQuestion).trim(),...securityRecord,
      failedLoginCount:0,lockUntil:0,
      avatarImage:"",displayName:username,bio:"",favoriteModes:[],friends:[],
      profile:clone(defaultProfile),settings:clone(defaultSettings),wallet:clone(defaultWallet),role:"user"
    };
    store.accounts.push(account);store.currentId=account.id;save();return account;
  }
  async function login(identity,password){
    identity=identity.trim().toLowerCase();
    const a=store.accounts.find(x=>x.username.toLowerCase()===identity||(x.email||"").toLowerCase()===identity);
    if(!a)throw new Error("Username/email or password is incorrect.");
    await authenticateAccount(a,password);
    store.currentId=a.id;save();return a;
  }

  function patchCurrentAccount(patch){
    const a=currentAccount();if(!a)return false;
    Object.assign(a,patch);save();return true;
  }
  function patchCurrentProfile(patch){
    const a=currentAccount();
    if(a)Object.assign(a.profile,patch);else Object.assign(store.guestProfile,patch);
    save();
  }
  function patchCurrentSettings(patch){
    const a=currentAccount();
    if(a){
      Object.assign(a.settings,patch);
    }else{
      Object.assign(store.guestSettings,patch);
    }
    save();
    applyAppearance();
  }

  async function syncOnlineSession(){
    if(!window.AutoTypeBackend?.configured())return currentAccount();
    try{
      const session=await AutoTypeBackend.session();
      if(session){
        return await AutoTypeBackend.hydrateLocalMirror();
      }
      if(currentAccount()?.online){
        store.currentId=null;
        save();
      }
    }catch(error){
      console.warn("AutoType backend sync failed",error);
    }
    return currentAccount();
  }

  function ready(){return onlineReadyPromise;}

  window.AutoType={
    store:()=>store,save,currentAccount,currentProfile,currentSettings,accountName,avatarMarkup,avatarColor,
    escapeHTML,formatTime,levelInfo,unlockedAchievements,achievementDefs,toast,
    currentWallet,shopCatalog,collectionDefs,crateDefs,tournaments,tournamentById,equippedItem,addCoins,addTickets,
    purchaseShopItem,equipShopItem,collectionMissingItems,collectionPrice,purchaseCollection,equipCollection,openCrate,isDeveloper,isStaff,setDeveloperCoins,setDeveloperTickets,setDeveloperCrateKeys,
    grantDeveloperCoins,grantAllCosmetics,tournamentEntry,joinTournament,leaveTournament,
    createTournament,updateTournament,deleteTournament,restoreDefaultTournaments,awardTournamentWinner,
    developerAccounts,setPlayerBalances,grantPlayerAllCosmetics,resetPlayerProgress,removeSuggestionAdmin,setAnnouncement,exportLocalBackup,
    createAccount,login,passwordProblems,setSecurityQuestion,changePassword,deleteCurrentAccount,
    patchCurrentAccount,patchCurrentProfile,patchCurrentSettings,openSwitchModal,
    imageFileToBackground,relativeLuminanceFromHex,ready,syncOnlineSession
  };

  onlineReadyPromise=syncOnlineSession();
  document.addEventListener("DOMContentLoaded",async()=>{
    await onlineReadyPromise;
    initShell();
  });
})();