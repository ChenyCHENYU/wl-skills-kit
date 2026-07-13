"use strict";

const crypto = require("crypto");

const PLAN_SCHEMA_VERSION = 1;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function createPlanHash(kind, value) {
  const envelope = { planSchemaVersion: PLAN_SCHEMA_VERSION, kind, value };
  return crypto.createHash("sha256").update(stableStringify(envelope)).digest("hex");
}

module.exports = { PLAN_SCHEMA_VERSION, canonicalize, createPlanHash, stableStringify };
