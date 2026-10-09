/* Sentence Mode: forecast a complete continuation from the existing sentence corpus.
 * It only suggests text. The normal player input, scoring and verified-round rules remain authoritative. */
(function(root){
  "use strict";
  const tokenize=s=>String(s||"").toLowerCase()
    .replace(/[^a-z0-9' ]+/g," ").trim().split(/\s+/).filter(Boolean);
  function draw(items,random){
    if(!items.length)return "";
    const n=Number(random());
    const choice=Number.isFinite(n)?Math.max(0,Math.min(items.length-1,Math.floor(n*items.length))):0;
    return items[choice];
  }
  function predict({completed=[],totalWords=0,corpus=[],exclude="",random=Math.random}={}){
    const prefix=completed.map(w=>String(w).toLowerCase());
    const length=Math.max(0,Math.min(200,Math.floor(totalWords)));
    if(!prefix.length||prefix.length>=length)return [];
    // Never sample the exact target as a memorized continuation: that would
    // reveal every remaining word as soon as the prefix became unique.
    const excluded=tokenize(exclude).join(" ");
    const samples=corpus.map(tokenize).filter(row=>
      row.length>1&&(!excluded||row.join(" ")!==excluded));
    const matching=samples.filter(row=>
      row.length===length&&prefix.every((word,i)=>row[i]===word));
    // Prefer an entire naturally written sentence with the same known beginning.
    // Once clues diverge, the continuation is built from real word pairs in the corpus.
    const example=draw(matching,random);
    const result=example?example.slice(prefix.length):[];
    while(prefix.length+result.length<length){
      const history=[...prefix,...result];
      const prev=history[history.length-1]||"";
      const before=history[history.length-2]||"";
      const pairs=[],singles=[];
      for(const row of samples){
        for(let i=1;i<row.length;i++){
          if(row[i-1]===prev)singles.push(row[i]);
          if(i>=2&&row[i-1]===prev&&row[i-2]===before)pairs.push(row[i]);
        }
      }
      const alternatives=pairs.length?pairs:singles.length?singles:
        ["the","and","to","a","in","on","with","today"];
      result.push(draw(alternatives,random));
    }
    return result.slice(0,length-prefix.length);
  }
  function clueGuess(prefix,forecastWord,fallback){
    const clue=String(prefix||"").toLowerCase();
    const predicted=String(forecastWord||"").toLowerCase();
    if(clue&&predicted.length>clue.length&&predicted.startsWith(clue))return predicted;
    return fallback();
  }
  function matchingPrefix(forecast,target){
    if(!Array.isArray(forecast)||!Array.isArray(target))return 0;
    let count=0;
    while(count<forecast.length&&count<target.length&&
      String(forecast[count]).toLowerCase()===String(target[count]).toLowerCase()){
      count++;
    }
    return count;
  }
  root.AutoTypeSentenceForecast=Object.freeze({predict,clueGuess,matchingPrefix});
})(window);
