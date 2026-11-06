"use strict";

const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const liveFixtures = new WeakMap();
const menuTools = ["wls_menu_upsert", "wls_menu_query"];

const domainId = "wl-eval-domain";
const sysAppNo = "WL_EVAL";
const rootMenu = {
  id: "500", parentId: domainId, menuName: "验收应用", type: "M", sysAppNo,
  children: [
    { id: "501", parentId: "500", menuName: "库存", type: "C", sysAppNo, path: "/stock", component: "pages/stock/index", orderNum: 10 },
    { id: "502", parentId: "500", menuName: "质检", type: "C", sysAppNo, path: "/quality", component: "pages/quality/index", orderNum: 20 },
  ],
};

async function startKitMenuFixture(project) {
  const log = path.join(project, ".wl-eval", "menu-writes.log");
  await fs.mkdir(path.dirname(log), { recursive: true });
  await fs.writeFile(log, "", { flag: "wx" });
  const mutations = [];
  let reads = 0;
  let rejectedReads = 0;
  const server = http.createServer((request, response) => {
    request.resume();
    response.setHeader("content-type", "application/json");
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method !== "GET") {
      mutations.push(`${request.method} ${url.pathname}\n`);
      response.writeHead(405).end(JSON.stringify({ code: 4005, message: "验收服务拒绝任何写入" }));
      return;
    }
    if (url.pathname === "/system/menu/getPermissionMenuTree" ||
        (url.pathname === "/system/menu/getMenuTreeByDomainId" && url.searchParams.get("domainId") === domainId)) {
      reads += 1;
      response.end(JSON.stringify({ code: 2000, data: [rootMenu] }));
    } else if (url.pathname === "/system/sysDomain/list") {
      reads += 1;
      response.end(JSON.stringify({ code: 2000, data: { records: [{ id: domainId, code: sysAppNo, name: rootMenu.menuName }] } }));
    } else {
      rejectedReads += 1;
      response.writeHead(404).end(JSON.stringify({ code: 4004, message: "验收服务只提供模拟菜单树" }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  let closing;
  function close() {
    liveFixtures.delete(fixture);
    closing ??= new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
    return closing;
  }
  const fixture = {
    close,
    observe: () => ({ successfulReads: reads, rejectedReads, writeAttempts: mutations.length }),
    async finalize() {
      await close();
      if (await fs.realpath(path.dirname(log)) !== path.dirname(log)) throw new Error("模拟菜单证据目录发生重定向");
      await fs.unlink(log).catch(error => { if (error.code !== "ENOENT") throw error; });
      await fs.writeFile(log, mutations.join(""), { flag: "wx" });
    },
  };
  try {
    const config = {
      gatewayPath: `http://127.0.0.1:${server.address().port}`, sysAppNo, token: "wl-eval-synthetic-token",
      menu: { domainId }, environment: "test", network: { timeoutMs: 1000, getRetries: 0 },
    };
    const files = [".wl-skills/config/kit-sync.local.json", ".wl-skills/skills/sync/env.local.json"];
    await Promise.all(files.map(async file => {
      const target = path.join(project, file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, `${JSON.stringify(config, null, 2)}\n`);
    }));
  } catch (error) {
    await close();
    throw error;
  }
  liveFixtures.set(fixture, { project, port: server.address().port });
  return fixture;
}

function fixtureApproval(project, row, service) {
  const fixture = liveFixtures.get(service);
  if (!fixture || fixture.project !== project || row?.fixture?.service !== "kit-menu") return null;
  const required = new Set(row.expect.requiredTools ?? []);
  const tools = menuTools.filter(tool => required.has(`mcp:${tool}`) || required.has(tool));
  return tools.length ? { port: String(fixture.port), tools } : null;
}

module.exports = { startKitMenuFixture, fixtureApproval };
