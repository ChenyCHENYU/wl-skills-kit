"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { validateCheckouts } = require("../scripts/composition-checkouts.cjs");
const plan = () => Object.fromEntries(["ui", "bd", "design", "test"].map(key => [key, { repository: `example/wl-skills-${key}`, ref: "a".repeat(40) }]));
test("composition checkouts require four explicitly authorized repositories and exact commits", () => {
  assert.deepEqual(validateCheckouts(JSON.stringify(plan())), plan());
  for (const ref of ["main", "latest", "v1.0.0", "a".repeat(39), "A".repeat(40), "${{ secrets.TOKEN }}"]) {
    const invalid = plan(); invalid.bd.ref = ref;
    assert.throws(() => validateCheckouts(invalid), /40位提交SHA/);
  }
});
test("composition checkouts reject missing, extra, unsafe and malformed repository rows", () => {
  for (const value of [undefined, null, [], {}, '{"ui":', "null"]) assert.throws(() => validateCheckouts(value));
  for (const repository of ["../repo", "org/repo/extra", "https://github.com/org/repo", "org/repo; echo secret", "-org/repo", "org/"]) {
    const invalid = plan(); invalid.ui.repository = repository;
    assert.throws(() => validateCheckouts(invalid));
  }
  const missing = plan(); delete missing.test;
  assert.throws(() => validateCheckouts(missing));
  const extra = plan(); extra.gate = extra.bd;
  assert.throws(() => validateCheckouts(extra));
});
