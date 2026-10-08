/* Shared UTC rotation for optional cosmetic spotlights. */
(function(root){
"use strict";
const SLOTS=["title","banner","frame","trail","arena","fx"];
const eligible=item=>item&&item.price>0&&!item.collectionOnly&&!item.earnedOnly;
function dayKey(date=new Date()){return date.toISOString().slice(0,10)}
function dayNumber(day){const ms=Date.parse(day+"T00:00:00.000Z");if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==day)throw Error("Invalid day");return Math.floor(ms/86400000)}
function group(item){return ["cursor","predictor","result"].includes(item.slot)?"fx":item.slot}
function rotate(day,catalog,collections){
 const n=dayNumber(day);
 const items=SLOTS.map((slot,i)=>{
   const pool=(catalog||[]).filter(item=>eligible(item)&&group(item)===slot).sort((a,b)=>a.id.localeCompare(b.id));
   return pool.length?pool[((n+i*7)%pool.length+pool.length)%pool.length]:null;
 }).filter(Boolean);
 const available=(collections||[]).filter(c=>c&&Array.isArray(c.items)&&c.items.length);
 const featured=available.length?available[((n%available.length)+available.length)%available.length]:null;
 return {day,items,featured,others:available.filter(c=>c.id!==featured?.id)};
}
function nextReset(date=new Date()){return new Date(Date.parse(dayKey(date)+"T00:00:00Z")+86400000)}
function countdown(date=new Date()){
 const seconds=Math.max(0,Math.floor((nextReset(date).getTime()-date.getTime())/1000));
 return [Math.floor(seconds/3600),Math.floor((seconds%3600)/60),seconds%60].map(x=>String(x).padStart(2,"0")).join(":");
}
root.AutoTypeShopRotation={dayKey,rotate,nextReset,countdown};
})(typeof window!=="undefined"?window:globalThis);
