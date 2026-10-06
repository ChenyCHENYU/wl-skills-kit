"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function existingMode(io, target) {
  try {
    const entry = io.lstatSync(target);
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`Atomic write target is not a regular file: ${target}`);
    return entry.mode & 0o7777;
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

function closeQuietly(io, descriptor) {
  if (descriptor === undefined) return;
  try { io.closeSync(descriptor); } catch {}
}

function unlinkQuietly(io, temporary) {
  try { io.unlinkSync(temporary); } catch {}
}

/** Single-file replacement; installed contributions are not a cross-file transaction. */
function createAtomicWriter(io = fs) {
  return function atomicWriteFile(target, content) {
    const mode = existingMode(io, target);
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.wl-skills-${crypto.randomBytes(16).toString("hex")}.tmp`);
    let descriptor;
    let created = false;
    try {
      descriptor = io.openSync(temporary, "wx", mode === undefined ? 0o666 : mode);
      created = true;
      io.writeFileSync(descriptor, content, "utf8");
      if (mode !== undefined) io.fchmodSync(descriptor, mode);
      io.closeSync(descriptor);
      descriptor = undefined;
      io.renameSync(temporary, target);
      created = false;
    } finally {
      closeQuietly(io, descriptor);
      if (created) unlinkQuietly(io, temporary);
    }
  };
}

module.exports = { atomicWriteFile: createAtomicWriter(), createAtomicWriter };
