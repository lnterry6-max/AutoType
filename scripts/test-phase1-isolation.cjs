"use strict";
const assert = require("node:assert/strict");
require("./phase1-network-guard.cjs");
const blocked = {code: "AUTOTYPE_TEST_NETWORK_DISABLED"};
for (const attempt of [
  () => require("node:http").get("http://fixture.invalid"),
  () => require("node:https").request("https://fixture.invalid"),
  () => require("node:net").connect(443, "fixture.invalid"),
  () => new (require("node:net").Socket)().connect(443, "fixture.invalid"),
  () => require("node:tls").connect(443, "fixture.invalid"),
  () => require("node:dgram").createSocket("udp4"),
  () => require("node:dns").lookup("fixture.invalid", () => {})
]) assert.throws(attempt, blocked);
(async () => {
  await assert.rejects(fetch("https://fixture.invalid"), blocked);
  await assert.rejects(require("node:dns").promises.lookup("fixture.invalid"), blocked);
  const {request} = await import("node:https");
  assert.throws(() => request("https://fixture.invalid"), blocked);
  console.log("Phase 1 isolation self-check passed: HTTP, HTTPS, TCP, TLS, UDP, DNS, fetch and ESM imports are blocked.");
})().catch(error => {console.error(error); process.exitCode = 1;});
