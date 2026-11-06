"use strict";

// Loaded only by the auto-approved fixture's pinned Kit MCP process.
// Kit's backend client uses Node's http(s).request; constrain it even if the
// model rewrites the fixture gateway JSON before invoking the tool.
const http = require("node:http");
const https = require("node:https");
const port = process.env.WL_EVAL_KIT_MENU_PORT;

if (!/^\d{1,5}$/u.test(port ?? "") || Number(port) < 1 || Number(port) > 65535) throw new Error("invalid fixture loopback port");

function blocked() { throw new Error("fixture MCP is restricted to its synthetic loopback service"); }

for (const name of ["request", "get"]) {
  const original = http[name];
  http[name] = function requestFixture(options, ...args) {
    if (options?.hostname !== "127.0.0.1" || String(options.port) !== port || options.socketPath || options.createConnection) blocked();
    return original.call(this, options, ...args);
  };
  https[name] = blocked;
}
