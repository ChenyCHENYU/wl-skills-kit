"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const root = require("../support/workspace-root.cjs");
const { parseJsonc, getJsoncValue, getJsoncNodeText, setJsoncValue } = require("../support/shared-jsonc.cjs");

test("MCP contributions preserve comments, project settings, other servers and CRLF", () => {
  const input = '{\r\n  // project owned\r\n  "provider": "local",\r\n  "mcpServers": {\r\n    // keep server\r\n    "team": {"command":"team"},\r\n  },\r\n}\r\n';
  const installed = setJsoncValue(input, ["mcpServers", "wl-skills-test"], { command: "node", args: ["test.js"] });
  assert.match(installed, /\/\/ project owned/);
  assert.match(installed, /\/\/ keep server/);
  assert.deepEqual(getJsoncValue(installed, ["mcpServers", "team"]), { command: "team" });
  assert.equal(parseJsonc(installed).provider, "local");
  assert.ok(installed.includes("\r\n"));
  const cleaned = setJsoncValue(installed, ["mcpServers", "wl-skills-test"], undefined);
  assert.match(cleaned, /\/\/ keep server/);
  assert.equal(getJsoncValue(cleaned, ["mcpServers", "wl-skills-test"]), undefined);
  assert.deepEqual(getJsoncValue(cleaned, ["mcpServers", "team"]), { command: "team" });
});

test("malformed, duplicate-key and incompatible-shaped documents fail before mutation", () => {
  for (const text of ['{invalid}', '{"mcpServers":{},"mcpServers":{}}', '[]', '{"mcpServers": null}']) {
    assert.throws(() => setJsoncValue(text, ["mcpServers", "test"], {}));
  }
});

test("adding and removing entries do not reformat foreign entries or erase their comments", () => {
  const foreign = '"foreign": { "command": "custom", "args": ["--x"], },';
  for (const input of [
    `{ "mcpServers": { ${foreign} // trailing comment\n } }`,
    '{ "mcpServers": { "foreign": { "command": "custom" } /* keep, comma */ } }',
    '{ "mcpServers": { /* empty section owned by project */ } }',
  ]) {
    const installed = setJsoncValue(input, ["mcpServers", "wl-skills-test"], { command: "test" });
    if (input.includes(foreign)) assert.ok(installed.includes(foreign));
    const cleaned = setJsoncValue(installed, ["mcpServers", "wl-skills-test"], undefined);
    if (input.includes(foreign)) assert.ok(cleaned.includes(foreign));
    assert.deepEqual(parseJsonc(cleaned), parseJsonc(input));
    if (input.includes("trailing comment")) assert.match(cleaned, /trailing comment/);
    if (input.includes("keep, comma")) assert.match(cleaned, /keep, comma/);
  }
});

test("owned value replacement and every removal position preserve other values", () => {
  for (const key of ["first", "middle", "last"]) {
    const input = '{"entries":{"first":{"v":1},/* middle comment */"middle":{"v":2},"last":{"v":3}}}';
    const updated = setJsoncValue(input, ["entries", key], { v: 10 });
    assert.equal(getJsoncValue(updated, ["entries", key]).v, 10);
    const removed = setJsoncValue(input, ["entries", key], undefined);
    const expected = parseJsonc(input);
    delete expected.entries[key];
    assert.deepEqual(parseJsonc(removed), expected);
    assert.match(removed, /middle comment/);
  }
});

test("raw contribution baseline detects comments inside an otherwise identical server", () => {
  const original = '{"mcpServers":{"own":{"command":"node"}}}';
  const changed = '{"mcpServers":{"own":{/* project explanation */"command":"node"}}}';
  assert.deepEqual(getJsoncValue(original, ["mcpServers", "own"]), getJsoncValue(changed, ["mcpServers", "own"]));
  assert.notEqual(getJsoncNodeText(original, ["mcpServers", "own"]), getJsoncNodeText(changed, ["mcpServers", "own"]));
});

test("all standalone packages ship an identical parser snapshot with its MIT license", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  for (const [name, directory] of Object.entries({ "wl-skills-bd": "lib", "wl-skills-test": "lib", "wl-skills-ui": "bin", "wl-skills-kit": "lib" })) {
    const target = path.join(root, name, directory);
    assert.equal(fs.readFileSync(path.join(target, "shared-jsonc.cjs"), "utf8"), fs.readFileSync(path.resolve(__dirname, "../support/shared-jsonc.cjs"), "utf8"));
    assert.match(fs.readFileSync(path.join(target, "vendor/jsonc-parser/LICENSE.md"), "utf8"), /MIT License/);
  }
});

test("kit and UI ship the canonical atomic writer without a sibling runtime import", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const expected = fs.readFileSync(path.resolve(__dirname, "../support/atomic-write.cjs"), "utf8");
  for (const [name, directory] of Object.entries({ "wl-skills-kit": "lib", "wl-skills-ui": "bin" })) {
    const actual = fs.readFileSync(path.join(root, name, directory, "atomic-write.cjs"), "utf8");
    assert.equal(actual, expected);
    assert.ok(!actual.includes("@agile-team/wl-skills-"));
  }
});
