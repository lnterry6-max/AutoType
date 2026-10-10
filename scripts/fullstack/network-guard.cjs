'use strict';
// Defence in depth: this harness accepts only the fixed runner-local ports.
const allowed = new Set([54321, 54322, 54324]);
function permit(host, port) {
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) || !allowed.has(Number(port)))
    throw new Error('Full-stack fixture blocked a non-local destination');
}
const originalFetch = globalThis.fetch;
globalThis.fetch = function(input, options) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  permit(url.hostname, url.port);
  if (url.protocol !== 'http:') throw new Error('Fixture requires loopback HTTP');
  return originalFetch(input, options);
};
const net = require('node:net'), connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (typeof options === 'object') {
    if (options.path) throw new Error('Fixture forbids arbitrary Unix sockets');
    permit(options.host || 'localhost', options.port);
  } else permit(typeof args[1] === 'string' ? args[1] : 'localhost', options);
  return connect.apply(this, args);
};
if (globalThis.WebSocket) {
  const Original = globalThis.WebSocket;
  globalThis.WebSocket = class extends Original {
    constructor(input, ...args) {
      const url = new URL(input); permit(url.hostname, url.port);
      if (url.protocol !== 'ws:') throw new Error('Fixture requires loopback WebSocket');
      super(input, ...args);
    }
  };
}
