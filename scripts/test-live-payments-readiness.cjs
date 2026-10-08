"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const file=p=>fs.readFileSync(path.join(root,p),"utf8");
const checkout=file("supabase/functions/create-checkout-session/index.ts");
const webhook=file("supabase/functions/stripe-webhook/index.ts");
const browser=file("backend-config.js");
const shop=file("shop.html");
const docs=file("DEPLOYMENT.md");

assert.match(checkout,/STRIPE_LIVE_ENABLED/);
assert.match(checkout,/liveOrigins=new Set\(\["https:\/\/auto-type.net","https:\/\/www.auto-type.net"\]\)/);
assert.match(checkout,/stripeMode==="live"&&!permittedLiveOrigin/);
assert.match(checkout,/base.origin!==requestOrigin/);
assert.match(checkout,/base.protocol!=="https:"/);
assert.match(checkout,/base.pathname!=="\/"/);
assert.match(checkout,/!liveOrigins.has\(base.origin\)/);
assert.match(checkout,/admin.rpc\("autotype_create_payment_order"/);
assert.match(checkout,/checkout.sessions.create/);
assert.match(webhook,/constructEventAsync/);
assert.match(webhook,/keyIsLive&&!liveEnabled/);
assert.match(webhook,/event.livemode!==keyIsLive/);
assert.match(webhook,/autotype_credit_coin_purchase/);
assert.match(webhook,/autotype_apply_stripe_refund/);
assert.match(webhook,/autotype_apply_stripe_dispute/);
assert.match(browser,/AUTOTYPE_FRIENDS_BETA=true/);
assert.match(shop,/Coin-pack checkout is disabled during testing/);
assert.match(docs,/has a valid TLS certificate/);
assert.match(docs,/adult representative/);
assert.match(docs,/Never allow real money or purchased coins to enter randomized reward crates/);
for(const input of [checkout,webhook,browser]){
  assert.doesNotMatch(input,/sk_live_[A-Za-z0-9]{12,}/,"Private live API keys must never be in tracked source");
}
console.log("Live-payment readiness checks PASSED (HTTPS origin, webhook mode, server ledger, beta kill switch, no live keys).");
