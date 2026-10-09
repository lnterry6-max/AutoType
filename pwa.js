/* AutoType install experience: works as a website and installed PWA. */
(() => {
  "use strict";
  let installEvent=null;
  const standalone=()=>Boolean(window.matchMedia?.("(display-mode: standalone)").matches||navigator.standalone===true);
  const $=id=>document.getElementById(id);
  const setStatus=(message)=>{const el=$("installStatus");if(el)el.textContent=message;};

  function setInstallUI(){
    const btn=$("installPromptButton");
    if(standalone()){
      document.body.classList.add("pwa-standalone");
      const title=document.querySelector(".pwa-install-copy h2");
      if(title)title.textContent="AutoType is installed.";
      setStatus("You're already using the Home Screen app. Jump into a match.");
      if(btn)btn.hidden=true;
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
      {href:"/play.html",label:"Play",symbol:"▶",page:"play"},
      {href:"/leaderboard.html",label:"Ranks",symbol:"♜",page:"leaderboard"},
      {href:"/profile.html",label:"Profile",symbol:"◉",page:"profile"}
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
    event.preventDefault();
    installEvent=event;
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setInstallUI,{once:true});
    else setInstallUI();
  });
  window.addEventListener("appinstalled",()=>{
    installEvent=null;
    setStatus("AutoType was added to your device. Open it from your Home Screen.");
    setInstallUI();
  });
  document.addEventListener("DOMContentLoaded",()=>{
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
    navigator.serviceWorker.register("/service-worker.js",{scope:"/",updateViaCache:"none"})
      .catch(error=>console.info("AutoType install worker unavailable",error));
  });
})();
