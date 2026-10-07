"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");
const Ajv = require("ajv/dist/2020");
const root = require("../support/workspace-root.cjs");

test("each published package has distinct capabilities and no sibling runtime prerequisite", () => {
  const ids = new Set();
  for (const name of ["design", "kit", "ui", "bd", "test"]) {
    const base = path.join(root, `wl-skills-${name}`);
    const directory = name === "ui" ? "bin" : "lib";
    const boundary = JSON.parse(fs.readFileSync(path.join(base, directory, "capabilities.json"), "utf8"));
    const pkg = JSON.parse(fs.readFileSync(path.join(base, "package.json"), "utf8"));
    assert.equal(boundary.package, pkg.name);
    assert.equal(boundary.boundaryVersion, 1);
    assert.deepEqual(boundary.standalone.requiresSiblingPackages, []);
    assert.ok(pkg.files.some((file) => file.replace(/\/$/, "") === directory));
    for (const capability of boundary.capabilities) {
      assert.ok(!ids.has(capability.id), capability.id);
      ids.add(capability.id);
      assert.ok(capability.inputs.length && capability.outputs.length);
    }
    assert.ok(!Object.keys(pkg.dependencies || {}).some((dependency) => /^@agile-team\/wl-skills-/.test(dependency)));
  }
});

test("every standalone package ships the same execution protocol in its own namespace", () => {
  const support = path.resolve(__dirname, "../support");
  const namespaces = new Set();
  for (const name of ["design", "kit", "ui", "bd", "test"]) {
    const base = path.join(root, `wl-skills-${name}`);
    const directory = name === "ui" ? "bin" : "lib";
    const boundary = JSON.parse(fs.readFileSync(path.join(base, directory, "capabilities.json"), "utf8"));
    const protocol = boundary.composition.observability;
    assert.equal(protocol.recordVersion, 1);
    assert.equal(protocol.runCorrelation, "explicit-runId-or-WL_TASK_RUN_ID");
    assert.equal(protocol.hostDiscovery, "unverified-without-host-events");
    assert.ok(!namespaces.has(protocol.storage));
    namespaces.add(protocol.storage);
    for (const file of ["task-observability.cjs", "task-observability.schema.json"]) {
      assert.equal(fs.readFileSync(path.join(base, directory, file), "utf8"), fs.readFileSync(path.join(support, file), "utf8"));
    }
    assert.equal(protocol.schema, `${directory}/task-observability.schema.json`);
    assert.ok(boundary.capabilities.some((item) => item.id.endsWith(".task-observability")));
  }
});

test("published API schema snapshots agree and allow project pagination values", () => {
  const expected = fs.readFileSync(path.resolve(__dirname, "../support/contracts/wl-api-contract.schema.json"), "utf8");
  for (const relative of [
    "wl-skills-kit/files/.wl-skills/contracts/wl-api-contract.schema.json",
    "wl-skills-bd/files/.wl-skills-bd/schemas/collaboration-contract.schema.json",
    "wl-skills-test/files/.wl-skills-test/contracts/wl-api-contract.schema.json",
  ]) assert.equal(fs.readFileSync(path.join(root, relative), "utf8"), expected);
  const schema = JSON.parse(expected);
  const ajv = new Ajv({ strict: true, allowUnionTypes: true });
  const { pagination } = schema.properties.transport.properties;
  const validatePagination = ajv.compile(pagination);
  const profile = { requestCurrent: "current", requestSize: "size", defaultCurrent: 1, defaultSize: 20, maxSize: 1000, recordsPath: "data.records", totalPath: "data.total" };
  assert.equal(validatePagination(profile), true);
  assert.equal(validatePagination({ ...profile, defaultSize: 0 }), false);
  const validateSource = ajv.compile({ ...schema.properties.source, $defs: schema.$defs });
  assert.equal(validateSource({ profile: "project-profile", mode: "requirements" }), true);
});

test("all default delivery profiles are the same semantic baseline", () => {
  const canonical = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../support/contracts/wl-delivery-profile.v1.json"), "utf8"));
  const profiles = [
    "wl-skills-kit/files/.wl-skills/contracts/wl-delivery-profile.v1.json",
    "wl-skills-bd/files/.wl-skills-bd/contracts/wl-delivery-profile.v1.json",
    "wl-skills-design/files/.github/contracts/wl-delivery-profile.v1.json",
  ].map((relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")));
  for (const value of profiles) assert.deepEqual(value, canonical);
});
