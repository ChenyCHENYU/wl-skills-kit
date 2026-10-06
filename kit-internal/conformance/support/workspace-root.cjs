"use strict";

const fs = require("node:fs");
const path = require("node:path");
const packages = ["design", "kit", "ui", "bd", "test"];

function containsPackages(directory) {
  return packages.every((name) => fs.existsSync(path.join(directory, `wl-skills-${name}`, "package.json")));
}

function locateWorkspace() {
  if (process.env.WL_PACKAGES_ROOT) {
    const explicit = path.resolve(process.env.WL_PACKAGES_ROOT);
    if (!containsPackages(explicit)) throw new Error(`WL_PACKAGES_ROOT must contain the five WL source packages: ${explicit}`);
    return explicit;
  }
  let directory = __dirname;
  while (true) {
    if (containsPackages(directory)) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error("Set WL_PACKAGES_ROOT to the directory containing the five WL source packages.");
}

module.exports = locateWorkspace();
