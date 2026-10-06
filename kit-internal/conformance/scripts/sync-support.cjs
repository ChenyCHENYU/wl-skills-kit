"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = require("../support/workspace-root.cjs");
const source = path.resolve(__dirname, "../support");
const targets = {
  "wl-skills-bd": "lib",
  "wl-skills-test": "lib",
  "wl-skills-ui": "bin",
  "wl-skills-kit": "lib",
};
for (const [name, directory] of Object.entries(targets)) {
  const destination = path.join(root, name, directory);
  fs.mkdirSync(destination, { recursive: true });
  fs.copyFileSync(path.join(source, "shared-jsonc.cjs"), path.join(destination, "shared-jsonc.cjs"));
  fs.cpSync(path.join(source, "vendor/jsonc-parser"), path.join(destination, "vendor/jsonc-parser"), { recursive: true });
  if (["wl-skills-kit", "wl-skills-ui"].includes(name)) {
    fs.copyFileSync(path.join(source, "atomic-write.cjs"), path.join(destination, "atomic-write.cjs"));
  }
}
const schemas = [
  "wl-skills-kit/files/.wl-skills/contracts/wl-api-contract.schema.json",
  "wl-skills-bd/files/.wl-skills-bd/schemas/collaboration-contract.schema.json",
  "wl-skills-test/files/.wl-skills-test/contracts/wl-api-contract.schema.json",
];
for (const target of schemas) {
  const destination = path.join(root, target);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(source, "contracts/wl-api-contract.schema.json"), destination);
}
const profiles = [
  "wl-skills-kit/files/.wl-skills/contracts/wl-delivery-profile.v1.json",
  "wl-skills-bd/files/.wl-skills-bd/contracts/wl-delivery-profile.v1.json",
  "wl-skills-design/files/.github/contracts/wl-delivery-profile.v1.json",
];
for (const target of profiles) {
  fs.copyFileSync(path.join(source, "contracts/wl-delivery-profile.v1.json"), path.join(root, target));
}
