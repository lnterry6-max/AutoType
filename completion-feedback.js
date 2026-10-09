/* Round completion banner shared by all AutoType game modes. */
(function(root){
  "use strict";
  let hideTimer=null;
  function hide(){
    if(hideTimer!==null){clearTimeout(hideTimer);hideTimer=null;}
    const overlay=document.getElementById("roundDoneOverlay");
    if(!overlay)return;
    overlay.hidden=true;
    overlay.classList.remove("is-visible");
  }
  function show(){
    hide(); // Replays correctly on the next round; cancels previous timers.
    const overlay=document.getElementById("roundDoneOverlay");
    if(!overlay)return;
    const reduced=root.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches||
      document.body.classList.contains("reduced-motion")||
      document.body.classList.contains("animations-off");
    overlay.hidden=false;
    overlay.classList.add("is-visible");
    // Use a shorter, static confirmation when the player prefers no motion.
    hideTimer=setTimeout(hide,reduced?750:1650);
  }
  root.AutoTypeCompletion=Object.freeze({show,hide});
})(window);
