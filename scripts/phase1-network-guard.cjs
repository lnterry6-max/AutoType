"use strict";
// Preloaded by test:phase1 in the runner and its test workers. These tests use
// in-memory PostgreSQL and injected Auth/Stripe fixtures; no network is needed.
// Fail before DNS/socket creation if a fixture accidentally uses a real client.
function disabled() {
  const error = new Error("Phase 1 fixtures cannot access the network");
  error.code = "AUTOTYPE_TEST_NETWORK_DISABLED";
  throw error;
}
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const tls = require("node:tls");
const dgram = require("node:dgram");
const dns = require("node:dns");
for (const api of [http, https]) {
  api.request = disabled;
  api.get = disabled;
}
net.connect = net.createConnection = disabled;
net.Socket.prototype.connect = disabled;
tls.connect = disabled;
dgram.createSocket = disabled;
for (const name of Object.keys(dns)) {
  if (name === "lookup" || name === "lookupService" || name.startsWith("resolve") || name === "reverse") dns[name] = disabled;
}
for (const name of Object.keys(dns.promises)) {
  if (name === "lookup" || name === "lookupService" || name.startsWith("resolve") || name === "reverse") {
    dns.promises[name] = async () => disabled();
  }
}
globalThis.fetch = async () => disabled();
require("node:module").syncBuiltinESMExports();
