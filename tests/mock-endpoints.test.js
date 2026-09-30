"use strict";

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { collectMockEndpoints } = require("../lib/mock-endpoints");

describe("mock endpoint extraction", () => {
  it("uses complete literal endpoints and ignores comments and dynamic templates", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-mock-endpoints-"));
    fs.mkdirSync(path.join(root, "mock"));
    fs.writeFileSync(path.join(root, "mock", "api.ts"), [
      '// "/dev-api/acme/old"',
      '/* "/dev-api/acme/hidden" */',
      'const a = "/dev-api/acme/list-all?status=1";',
      'const b = `/dev-api/acme/${name}`;',
      'const c = "/dev-api/acme/list";',
    ].join("\n"));
    const endpoints = collectMockEndpoints(root, ["mock/api.ts"]);
    expect([...endpoints].sort()).toEqual(["/dev-api/acme/list", "/dev-api/acme/list-all"]);
    expect(endpoints.has("/dev-api/acme/old")).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
