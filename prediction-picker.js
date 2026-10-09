/* AutoType's surprise autocomplete: draw a fresh matching guess on each clue.
 * The game owns its clue/erase/lock state. This module chooses only a word. */
(function(){
  "use strict";
  function choose({prefix="",candidates=[],recent=[],previous="",mode="classic",target="",random=Math.random}={}){
    const clue=String(prefix).toLowerCase();
    if(!clue)return "";
    // Never pick something the player did not actually type the prefix of.
    const matches=[...new Set(candidates.filter(word=>
      typeof word==="string"&&word.startsWith(clue)
    ))];
    if(!matches.length)return clue;

    // A bare prefix isn't an exciting prediction while a longer guess exists.
    const completions=matches.filter(word=>word.length>clue.length);
    let pool=completions.length?completions:matches;

    // Evil can surprise the player, but never with a word that violates the clue.
    if(mode==="evil"){
      const wrong=pool.filter(word=>word!==target);
      if(wrong.length)pool=wrong;
    }

    // Rotate guesses from the full vocabulary before reusing old completions.
    const recentlyUsed=new Set(recent);
    const fresh=pool.filter(word=>!recentlyUsed.has(word));
    if(fresh.length)pool=fresh;
    if(pool.length>1){
      const alternatives=pool.filter(word=>word!==previous);
      if(alternatives.length)pool=alternatives;
    }

    // Only draw randomness when a new clue is accepted, not on each render.
    const draw=Number(random());
    const unit=Number.isFinite(draw)?Math.max(0,Math.min(0.999999999,draw)):0;
    return pool[Math.floor(unit*pool.length)]||clue;
  }
  window.AutoTypePredictionPicker=Object.freeze({choose});
})();
