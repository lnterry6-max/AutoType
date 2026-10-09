"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const read = filename => fs.readFileSync(path.join(ROOT, filename), "utf8");
const publicPaths = [
  "index.html", "play.html", "how-to.html", "explore.html", "leaderboard.html",
  "plinko.html", "predictions.html", "tournaments.html", "shop.html"
];
const canonical = filename => filename === "index.html"
  ? "https://auto-type.net/"
  : "https://auto-type.net/" + filename;
const sitemap = read("sitemap.xml");
const found = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
assert.match(sitemap, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
assert.deepEqual(found.sort(), publicPaths.map(canonical).sort(), "Only selected public URLs belong in sitemap");
assert.equal(new Set(found).size, found.length, "No duplicate sitemap URLs");
const robots=read("robots.txt");
assert.match(robots, /Sitemap: https:\/\/auto-type\.net\/sitemap\.xml/);
assert.doesNotMatch(robots, /Disallow:\s*\//, "No crawl block that interferes with noindex");
const files=fs.readdirSync(ROOT).filter(f=>f.endsWith(".html"));
for(const filename of files){
  const html=read(filename),head=html.match(/<head>([\s\S]*?)<\/head>/i)?.[1];
  assert.ok(head,"Missing HTML head on "+filename);
  if(publicPaths.includes(filename)){
    assert.ok(head.includes('<meta name="description" content="'),"Missing SEO description: "+filename);
    assert.ok(head.includes('<link rel="canonical" href="'+canonical(filename)+'">'),"Bad canonical: "+filename);
    assert.doesNotMatch(head,/name="robots"\s+content="noindex"/,"Public page must remain indexable: "+filename);
  }else{
    assert.match(head,/<meta name="robots" content="noindex">/,"Non-public page should be noindex: "+filename);
    assert.ok(!found.includes(canonical(filename)),"Non-public page in sitemap: "+filename);
  }
}
console.log("AutoType SEO audit passed: "+found.length+" public sitemap URLs; "+(files.length-found.length)+" noindex pages.");
