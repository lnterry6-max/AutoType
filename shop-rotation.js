/* Single New England (EST/EDT) rotation shared by storefront and guest shop. */
(function(root){
"use strict";
const ZONE="America/New_York";
const FORMAT=new Intl.DateTimeFormat("en-US",{timeZone:ZONE,year:"numeric",month:"2-digit",day:"2-digit"});
const SLOTS=["title","banner","frame","trail","arena","fx"];
const eligible=item=>item&&item.price>0&&!item.collectionOnly&&!item.earnedOnly;
const pad=n=>String(n).padStart(2,"0");
function dayKey(date=new Date()){
  const parts=Object.fromEntries(FORMAT.formatToParts(date).map(p=>[p.type,p.value]));
  return parts.year+"-"+parts.month+"-"+parts.day;
}
function dayNumber(day){
  const ms=Date.parse(day+"T00:00:00.000Z");
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==day)throw Error("Invalid ET day");
  return Math.floor(ms/86400000);
}
function group(item){return ["cursor","predictor","result"].includes(item.slot)?"fx":item.slot}
function rotate(day,catalog,collections){
  const n=dayNumber(day);
  const items=SLOTS.map((slot,i)=>{
    const pool=(catalog||[]).filter(item=>eligible(item)&&group(item)===slot)
      .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    return pool.length?pool[((n+i*7)%pool.length+pool.length)%pool.length]:null;
  }).filter(Boolean);
  const available=(collections||[]).filter(c=>c&&Array.isArray(c.items)&&c.items.length)
    .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const featured=available.length?available[((n%available.length)+available.length)%available.length]:null;
  return {day,items,featured};
}
// Find local midnight even through 23/25-hour New York daylight-saving days.
const resetCache=new Map();
function nextReset(date=new Date()){
  const nextDay=new Date(Date.parse(dayKey(date)+"T00:00:00.000Z")+86400000).toISOString().slice(0,10);
  if(!resetCache.has(nextDay)){
    const base=Date.parse(nextDay+"T00:00:00.000Z");
    let found=null;
    for(let hour=0;hour<=12;hour++){
      const candidate=base+hour*3600000;
      if(dayKey(new Date(candidate))===nextDay){found=candidate;break}
    }
    if(found===null)throw Error("Cannot determine ET midnight");
    resetCache.set(nextDay,found);
  }
  return new Date(resetCache.get(nextDay));
}
function countdown(date=new Date()){
  const seconds=Math.max(0,Math.floor((nextReset(date).getTime()-date.getTime())/1000));
  return [Math.floor(seconds/3600),Math.floor((seconds%3600)/60),seconds%60].map(pad).join(":");
}
function currentOffers(catalog,collections,date=new Date()){return rotate(dayKey(date),catalog,collections)}
function itemAvailable(id,catalog,date=new Date()){return currentOffers(catalog,[],date).items.some(item=>item.id===id)}
function collectionAvailable(id,collections,date=new Date()){return currentOffers([],collections,date).featured?.id===id}
root.AutoTypeShopRotation={ZONE,dayKey,dayNumber,rotate,nextReset,countdown,currentOffers,itemAvailable,collectionAvailable};
})(typeof window!=="undefined"?window:globalThis);
