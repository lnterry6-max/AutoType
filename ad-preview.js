/* AutoType ad inventory preview only: no ads, cookies, third-party calls or payouts. */
(() => {
  if(new URLSearchParams(location.search).get("ad-preview")!=="1")return;
  const titles={
    "home-discovery":"Homepage · after game discovery",
    "leaderboard-bottom":"Leaderboard · below rankings",
    "guide-bottom":"How to Play · after instructions"
  };
  document.querySelectorAll("[data-autotype-ad-slot]").forEach(slot=>{
    slot.hidden=false;
    const name=titles[slot.dataset.autotypeAdSlot];
    if(!name)return;
    slot.innerHTML="<span>ADVERTISEMENT PLACEMENT · PREVIEW ONLY</span><strong></strong><small>No advertising is active. This shows the planned space.</small>";
    slot.querySelector("strong").textContent=name;
  });
})();
