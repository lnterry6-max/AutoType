/* AutoType install experience: works as a website and installed PWA. */
(() => {
  "use strict";
  let installEvent=null;
  let installedThisSession=false;
  const standalone=()=>Boolean(window.matchMedia?.("(display-mode: standalone)").matches||navigator.standalone===true);
  const isMobileDevice=()=>{
    const ua=navigator.userAgent||"";
    return /Android|iPhone|iPod|iPad/i.test(ua)||
      (navigator.platform==="MacIntel"&&(navigator.maxTouchPoints||0)>1);
  };
  // Explicitly separate mobile Safari/Chrome, standalone PWA, and the desktop site.
  // Default CSS hides install invitations until a mobile browser is confirmed.
  function syncDeviceMode(){
    const installed=standalone()||installedThisSession;
    document.documentElement.classList.toggle("pwa-installed",installed);
    document.documentElement.classList.toggle("pwa-mobile-browser",!installed&&isMobileDevice());
    document.documentElement.classList.toggle("pwa-desktop-browser",!installed&&!isMobileDevice());
    if(standalone())document.body?.classList.add("pwa-standalone");
  }
  syncDeviceMode();
  const $=id=>document.getElementById(id);

  // Publish concise page addresses while retaining the existing .html files.
  // GitHub Pages resolves /play to play.html without an additional web server.
  // Preserve query parameters and fragments used by races and account recovery.
  function cleanLocalPageUrl(value){
    try{
      const url=new URL(value,location.href);
      if(url.origin!==location.origin||!/\\/[a-z0-9-]+\\.html$/i.test(url.pathname)||
         url.pathname==="/404.html")return null;
      url.pathname=url.pathname==="/index.html"?"/":url.pathname.replace(/\\.html$/i,"");
      return url;
    }catch{return null;}
  }
  function upgradeLink(link){
    const target=cleanLocalPageUrl(link.href);
    if(target)link.href=target.pathname+target.search+target.hash;
  }
  function syncCleanUrls(){
    // Existing navigation, profile links and deep-links keep working as before.
    if(!document.querySelectorAll)return;
    for(const link of document.querySelectorAll("a[href]"))upgradeLink(link);
    const current=cleanLocalPageUrl(location.href);
    if(current&&window.history?.replaceState){
      window.history.replaceState(window.history.state,"",current.pathname+current.search+current.hash);
    }
  }
  document.addEventListener("click",event=>{
    const link=event.target?.closest?.("a[href]");
    if(link)upgradeLink(link); // Covers dynamically generated links too.
  },true);

  const setStatus=(message)=>{const el=$("installStatus");if(el)el.textContent=message;};

  function setInstallUI(){
    syncDeviceMode();
    const btn=$("installPromptButton");
    if(standalone()){
      document.body.classList.add("pwa-standalone");
      const title=document.querySelector(".pwa-install-copy h2");
      if(title)title.textContent="AutoType is installed.";
      setStatus("You're already using the Home Screen app. Jump into a match.");
      if(btn)btn.hidden=true;
      return;
    }
    if(installedThisSession){
      if(btn)btn.hidden=true;
      setStatus("AutoType is installed. Launch it from your Home Screen.");
      return;
    }
    if(!isMobileDevice()){
      if(btn)btn.hidden=true;
      const heading=document.querySelector(".pwa-install-page .platform-page-heading h1");
      const intro=document.querySelector(".pwa-install-page .platform-page-heading p");
      const title=document.querySelector(".pwa-install-copy h2");
      if(heading)heading.textContent="Play AutoType in your browser.";
      if(intro)intro.textContent="The full AutoType game runs right here. To add it to your phone, open auto-type.net on your mobile device.";
      if(title)title.textContent="Made for your mobile Home Screen.";
      setStatus("This install guide is for iPhone, iPad, and Android. There is nothing to install on desktop.");
      return;
    }
    if(btn){
      btn.hidden=!installEvent;
      btn.disabled=!installEvent;
    }
    if(installEvent)setStatus("Your browser is ready to install AutoType.");
    else setStatus("Choose your device below to add AutoType to your Home Screen.");
  }

  function addAppDock(){
    if(!standalone())return;
    const excluded=new Set(["admin","account","create","backend-test","plinko"]);
    const page=document.body?.dataset.page||"";
    if(excluded.has(page)||location.pathname.endsWith("/404.html"))return;
    // Keep the keyboard and actual game surfaces completely unobstructed.
    document.body.classList.add("pwa-standalone");
    if(document.querySelector(".pwa-app-dock"))return;
    const dock=document.createElement("nav");
    dock.className="pwa-app-dock";
    dock.setAttribute("aria-label","Installed app navigation");
    const links=[
      {href:"/",label:"Home",symbol:"⌂",page:"home"},
      {href:"/play",label:"Play",symbol:"▶",page:"play"},
      {href:"/leaderboard",label:"Ranks",symbol:"♜",page:"leaderboard"},
      {href:"/profile",label:"Profile",symbol:"◉",page:"profile"}
    ];
    for(const link of links){
      const a=document.createElement("a");
      a.href=link.href;
      a.className="pwa-dock-link";
      const icon=document.createElement("span");
      icon.setAttribute("aria-hidden","true");
      icon.textContent=link.symbol;
      const text=document.createElement("span");
      text.textContent=link.label;
      a.append(icon,text);
      if(page===link.page){a.classList.add("is-current");a.setAttribute("aria-current","page");}
      dock.append(a);
    }
    document.body.classList.add("pwa-has-dock");
    document.body.append(dock);
  }

  window.addEventListener("beforeinstallprompt",event=>{
    if(standalone()||!isMobileDevice())return;
    event.preventDefault();
    installEvent=event;
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setInstallUI,{once:true});
    else setInstallUI();
  });
  window.addEventListener("appinstalled",()=>{
    installEvent=null;
    installedThisSession=true;
    setStatus("AutoType was added to your device. Open it from your Home Screen.");
    setInstallUI();
  });
  document.addEventListener("DOMContentLoaded",()=>{
    syncCleanUrls();
    setInstallUI();
    addAppDock();
    $("installPromptButton")?.addEventListener("click",async()=>{
      if(!installEvent)return;
      const pending=installEvent;
      installEvent=null;
      setInstallUI();
      try{
        await pending.prompt();
        const choice=await pending.userChoice;
        setStatus(choice?.outcome==="accepted"
          ?"Installation requested. Look for AutoType on your device."
          :"You can install AutoType later from your browser menu.");
      }catch(_error){
        setStatus("Use your browser menu to add AutoType to the Home Screen.");
      }
    });
  });

  // Register only a pass-through worker. It no longer intercepts navigations:
  // iOS WebKit could mistake a temporary failed fetch for a permanent offline state.
  window.addEventListener("load",()=>{
    if(!("serviceWorker" in navigator)||!window.isSecureContext)return;
    if(!standalone()&&!isMobileDevice())return; // Never bootstrap the app worker on desktop.
    navigator.serviceWorker.register("/service-worker.js",{scope:"/",updateViaCache:"none"})
      .catch(error=>console.info("AutoType install worker unavailable",error));
  });
})();
