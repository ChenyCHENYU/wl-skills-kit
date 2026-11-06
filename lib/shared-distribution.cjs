"use strict";

/** One distribution definition, used by development sync and packaged verification. */
const CORE_FILES = ["task-observability.cjs", "task-observability.schema.json", "host-profiles.cjs", "project-integration.cjs", "mcp-config.cjs", "mcp-config-format.cjs", "vendor/smol-toml/index.cjs", "vendor/smol-toml/LICENSE", "vendor/smol-toml/provenance.json", "schema-validation.cjs", "integration-protocol.cjs", "project-scope.cjs", "maven-scope.cjs", "vendor/saxes/saxes.js", "vendor/saxes/LICENSE", "vendor/saxes/package.json", "vendor/xmlchars/xml/1.0/ed5.js", "vendor/xmlchars/xml/1.1/ed2.js", "vendor/xmlchars/xmlns/1.0/ed3.js", "vendor/xmlchars/LICENSE", "vendor/xmlchars/package.json", "vendor/PROVENANCE.json", "project-scope.schema.json", "task-intent.cjs", "integration-result.cjs", "executor-invoke.cjs", "executor-process.cjs", "json-rpc-request.cjs", "shared-support-check.cjs", "shared-distribution.cjs"];
const DIRECTORIES = { kit: "lib", ui: "bin", bd: "lib", design: "lib", test: "lib", gate: "lib/shared-support" };
const DEFAULT_PACKAGES = ["kit", "ui", "bd", "design", "test"];
const DEVELOPMENT_MANIFEST = "scripts/shared-development-manifest.json";
const LICENSE = "vendor/jsonc-parser/LICENSE.md";
const JSONC_FILES = [LICENSE, "vendor/jsonc-parser/main.js", "vendor/jsonc-parser/package.json", ...["edit", "format", "parser", "scanner", "string-intern"].map(name => `vendor/jsonc-parser/impl/${name}.js`)];
const EXTRA_FILES = ["shared-jsonc.cjs", ...JSONC_FILES, "atomic-write.cjs", "contracts/wl-api-contract.schema.json", "contracts/wl-delivery-profile.v1.json"];
const SCHEMAS = { kit: "files/.wl-skills/contracts/wl-api-contract.schema.json", bd: "files/.wl-skills-bd/schemas/collaboration-contract.schema.json", test: "files/.wl-skills-test/contracts/wl-api-contract.schema.json" };
const PROFILES = { kit: "files/.wl-skills/contracts/wl-delivery-profile.v1.json", bd: "files/.wl-skills-bd/contracts/wl-delivery-profile.v1.json", design: "files/.github/contracts/wl-delivery-profile.v1.json" };

function distributionFiles(key) {
  if (key === "canonical") return Object.fromEntries([...CORE_FILES, ...EXTRA_FILES].map(name => [name, name]));
  if (!Object.hasOwn(DIRECTORIES, key)) throw new Error("未知共享分发配置");
  const directory = DIRECTORIES[key];
  const runtime = [...CORE_FILES];
  if (key !== "design") runtime.push("shared-jsonc.cjs", ...JSONC_FILES);
  if (["kit", "ui", "gate"].includes(key)) runtime.push("atomic-write.cjs");
  const files = Object.fromEntries(runtime.map(name => [`${directory}/${name}`, name]));
  if (SCHEMAS[key]) files[SCHEMAS[key]] = "contracts/wl-api-contract.schema.json";
  if (PROFILES[key]) files[PROFILES[key]] = "contracts/wl-delivery-profile.v1.json";
  return files;
}

function developmentScripts(key) {
  return key === "gate" ? [] : ["scripts/compatibility-check.cjs", "scripts/pack-integrity-check.cjs"];
}

module.exports = { CORE_FILES, DIRECTORIES, DEFAULT_PACKAGES, DEVELOPMENT_MANIFEST, EXTRA_FILES, LICENSE, distributionFiles, developmentScripts };
