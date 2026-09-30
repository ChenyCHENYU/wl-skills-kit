"use strict";

const fs = require("fs");
const { resolveProjectPath } = require("./project-path");

function readQuoted(source, start) {
  const quote = source[start];
  let value = "";
  let dynamic = false;
  let end = start + 1;
  for (; end < source.length; end++) {
    const current = source[end];
    if (current === "\\") {
      value += source[++end] || "";
    } else if (current === quote) {
      break;
    } else {
      if (quote === "`" && current === "$" && source[end + 1] === "{") dynamic = true;
      value += current;
    }
  }
  return { value, dynamic, end };
}

function quotedValues(source) {
  const values = [];
  for (let i = 0; i < source.length; i++) {
    const pair = source.slice(i, i + 2);
    if (pair === "//") {
      i = source.indexOf("\n", i + 2);
      if (i < 0) break;
    } else if (pair === "/*") {
      i = source.indexOf("*/", i + 2);
      if (i < 0) break;
      i++;
    } else if (["'", '"', "`"].includes(source[i])) {
      const quoted = readQuoted(source, i);
      if (!quoted.dynamic) values.push(quoted.value);
      i = quoted.end;
    }
  }
  return values;
}

function normalizeEndpoint(value) {
  return value.startsWith("/dev-api/") ? value.split("?")[0] : "";
}

function collectMockEndpoints(root, files) {
  const endpoints = new Set();
  for (const file of files) {
    const source = fs.readFileSync(resolveProjectPath(root, file), "utf8");
    for (const value of quotedValues(source)) {
      const endpoint = normalizeEndpoint(value);
      if (endpoint) endpoints.add(endpoint);
    }
  }
  return endpoints;
}

module.exports = { collectMockEndpoints, normalizeEndpoint, quotedValues };
