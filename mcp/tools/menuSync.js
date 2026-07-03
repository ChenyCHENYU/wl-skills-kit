"use strict";

const fs = require("fs");
const path = require("path");
const { queryPermissionMenuTree, queryMenuTree, saveMenu } = require("../api/menuApi");

function getProjectRoot() {
  return process.env.WL_PROJECT_ROOT
    ? path.resolve(process.env.WL_PROJECT_ROOT)
    : process.cwd();
}

function cleanCell(value) {
  return String(value || "")
    .replace(/^`|`$/g, "")
    .replace(/\*\*/g, "")
    .trim();
}

function splitMarkdownRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(cleanCell);
}

function isDividerRow(line) {
  return /^\|\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(line.trim());
}

function parseBoolean(value) {
  const text = cleanCell(value).toLowerCase();
  return ["true", "yes", "y", "1", "是", "隐藏", "hidden"].includes(text);
}

function normalizeTree(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data && data.records)) return data.records;
  if (Array.isArray(data && data.list)) return data.list;
  if (Array.isArray(data && data.children)) return data.children;
  return [];
}

function flattenMenus(tree, parentId, result) {
  for (const node of normalizeTree(tree)) {
    result.push({ ...node, parentId: node.parentId || parentId });
    flattenMenus(
      node.children || node.childList || node.childrenList || [],
      node.id,
      result,
    );
  }
  return result;
}

function findExisting(flatMenus, item) {
  return flatMenus.find((menu) => {
    const sameParent =
      !item.parentId || String(menu.parentId || "") === String(item.parentId);
    const samePath =
      item.path && menu.path && String(menu.path) === String(item.path);
    const sameName =
      item.menuName &&
      menu.menuName &&
      String(menu.menuName) === String(item.menuName);
    return sameParent && (samePath || sameName);
  });
}

/**
 * 从 getPermissionMenuTree 顶层节点中，按关键字（menuName/sysAppNo/path）定位目标应用域。
 * 定位优先级：sysAppNo 精确匹配 > menuName 包含关键词 > path 包含关键词。
 *
 * @param {object[]} topNodes  顶层应用域节点
 * @param {{ sysAppNo?: string, keyword?: string }} matchers
 * @returns {object|null}  命中的应用域节点（含 id/parentId/sysAppNo/menuName）
 */
function locateAppDomain(topNodes, matchers) {
  if (!Array.isArray(topNodes) || topNodes.length === 0) return null;

  // ① sysAppNo 精确匹配（最可靠）
  if (matchers.sysAppNo) {
    const hit = topNodes.find(
      (n) => String(n.sysAppNo || "") === String(matchers.sysAppNo),
    );
    if (hit) return hit;
  }

  // ② menuName / path 关键词包含匹配
  const kw = (matchers.keyword || "").trim();
  if (kw) {
    const byName = topNodes.find((n) =>
      String(n.menuName || "").includes(kw),
    );
    if (byName) return byName;
    const byPath = topNodes.find((n) => String(n.path || "").includes(kw));
    if (byPath) return byPath;
  }

  return null;
}

/**
 * 自动解析 domainId（应用域归属 ID）。
 *
 * 链路：getPermissionMenuTree（仅需 token）
 *   → 顶层各应用域（主数据管理 等）
 *   → 按 sysAppNo 或关键词定位目标应用域
 *   → 取该节点的 parentId 即为 domainId
 *   → 同时可拿到 id（parentMenuId）、sysAppNo、menuName
 *
 * @param {object} config  含 gatewayPath/token，可选 sysAppNo
 * @param {{ keyword?: string }} [opts]  应用域名称关键词（如"主数据"）
 * @returns {Promise<{ ok: boolean, domainId?: string, appRootId?: string, sysAppNo?: string, menuName?: string, error?: string }>}
 */
async function resolveDomainId(config, opts) {
  const result = await queryPermissionMenuTree(config);
  if (!result.ok) {
    return { ok: false, error: `查询权限菜单树失败: ${result.error}` };
  }

  const topNodes = normalizeTree(result.data);
  if (topNodes.length === 0) {
    return { ok: false, error: "权限菜单树为空，当前账号可能无任何菜单权限" };
  }

  const matched = locateAppDomain(topNodes, {
    sysAppNo: config.sysAppNo,
    keyword: opts && opts.keyword,
  });

  if (!matched) {
    const names = topNodes
      .map((n) => `${n.menuName || "?"}(sysAppNo=${n.sysAppNo || "?"})`)
      .join("、");
    return {
      ok: false,
      error: `未能匹配到目标应用域。请确认 sysAppNo 或关键词。当前可见应用域: ${names}`,
    };
  }

  return {
    ok: true,
    domainId: String(matched.parentId || ""),
    appRootId: String(matched.id || ""),
    sysAppNo: matched.sysAppNo || config.sysAppNo || "",
    menuName: matched.menuName || "",
  };
}

function findLatestReport(root) {
  const reportsDir = path.join(root, ".github", "reports");
  if (!fs.existsSync(reportsDir)) return null;
  return fs
    .readdirSync(reportsDir)
    .filter((name) => /^SYS_MENU_INFO.*\.md$/.test(name))
    .map((name) => path.join(reportsDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

function resolveReportPath(inputPath) {
  const root = getProjectRoot();
  if (inputPath) {
    const full = path.isAbsolute(inputPath)
      ? inputPath
      : path.join(root, inputPath);
    return fs.existsSync(full) ? full : null;
  }
  return findLatestReport(root);
}

function parseReport(content) {
  const lines = content.split(/\r?\n/);
  const dirs = [];
  const pages = [];
  let section = "";
  let currentDirName = "";
  let header = null;

  for (const line of lines) {
    if (/^##\s+.*一级目录/.test(line)) {
      section = "dir";
      header = null;
      continue;
    }
    if (/^##\s+.*二级菜单/.test(line)) {
      section = "page";
      header = null;
      continue;
    }
    const subMenu = line.match(/^###\s+\d+\.\s+(.+?)\s*子菜单/);
    if (subMenu) currentDirName = cleanCell(subMenu[1]);
    if (!line.trim().startsWith("|") || isDividerRow(line)) continue;
    const cells = splitMarkdownRow(line);
    if (!header) {
      header = cells;
      continue;
    }
    const row = {};
    header.forEach((key, index) => {
      row[key] = cells[index] || "";
    });
    if (section === "dir") {
      const menuName = row["菜单名"] || row.menuName;
      const menuPath = row.path || row["菜单路径"];
      if (
        menuName &&
        menuPath &&
        !menuName.includes("目录名") &&
        !menuPath.includes("目录path")
      ) {
        dirs.push({
          type: "M",
          menuName,
          path: menuPath,
          orderNum: Number(row.orderNum || row["显示排序"] || dirs.length + 1),
        });
      }
    }
    if (section === "page") {
      const menuName = row["菜单名"] || row.menuName;
      const menuPath = row.path || row["菜单路径"];
      const component = row.component || row["组件路径"];
      const permission = row.permission || row["权限标识"];
      if (menuName && menuPath && component && !menuName.includes("页面名称")) {
        pages.push({
          type: "C",
          menuName,
          path: menuPath,
          component,
          permission: permission || "",
          hidden: parseBoolean(row.hidden || row["是否隐藏"]),
          parentMenuName: currentDirName,
        });
      }
    }
  }

  return { dirs, pages };
}

function buildMenuBody(item, config, parentId, parentMenuNameCode, orderNum) {
  const codePrefix = parentMenuNameCode ? `${parentMenuNameCode}:` : "";
  return {
    useCache: 1,
    icon: item.icon || "list",
    common: 2,
    hidden: Boolean(item.hidden),
    editMode: false,
    type: item.type,
    parentId,
    sysAppNo: config.sysAppNo,
    orderNum,
    menuName: item.menuName,
    menuNameCode: item.menuNameCode || `${codePrefix}${item.path}`,
    path: item.path,
    component: item.type === "C" ? item.component : undefined,
    permission: item.type === "C" ? item.permission : undefined,
  };
}

/**
 * wls_menu_query 工具处理器
 * 自动从 config.menu.domainId 读取应用域 ID，查询完整菜单树。
 * 若 domainId 缺失，则通过 getPermissionMenuTree 自动反推（仅需 token + sysAppNo/关键词）。
 *
 * @param {object} config
 * @returns {Promise<string>} 返回给 AI 的文本内容
 */
async function handleMenuQuery(config) {
  let domainId = config.menu && config.menu.domainId;

  // domainId 缺失或为占位符时，自动反推
  if (!domainId || domainId.toString().includes("domainId")) {
    const resolved = await resolveDomainId(config);
    if (!resolved.ok) {
      return [
        "❌ 未能自动获取 domainId：" + resolved.error,
        "",
        "请确认 env.local.json 中已填写 token，并配置 sysAppNo 或 menu.keyword。",
        "也可手动填写 menu.domainId（从 getMenuTreeByDomainId?domainId=xxx 获取）。",
      ].join("\n");
    }
    domainId = resolved.domainId;
  }

  const result = await queryMenuTree(domainId, config);

  if (!result.ok) {
    return `❌ 查询菜单树失败: ${result.error} (code: ${result.code})`;
  }

  const tree = result.data;
  const isEmpty = !tree || (Array.isArray(tree) && tree.length === 0);
  if (isEmpty) {
    return `✅ 菜单树查询成功，当前应用域（domainId=${domainId}）暂无菜单数据`;
  }

  return `✅ 菜单树查询成功（domainId=${domainId}）\n\n${JSON.stringify(tree, null, 2)}`;
}

/**
 * wls_menu_upsert 工具处理器
 * 批量新增（无 id）或更新（有 id）菜单项
 * 新增时从响应 data 取服务端生成的 id，可用于链式创建子菜单
 *
 * @param {{ items: object[] }} args
 * @param {object} config
 * @returns {Promise<string>}
 */
async function handleMenuUpsert(args, config) {
  const { items } = args;

  if (!Array.isArray(items) || items.length === 0) {
    return "❌ 参数错误：items 必须是非空数组";
  }

  const results = [];

  for (const item of items) {
    const isUpdate = Boolean(item.id);
    const action = isUpdate ? "更新" : "新增";

    const result = await saveMenu(item, config);

    if (result.ok) {
      const saved = result.data;
      results.push({
        action,
        menuName: item.menuName || "(未命名)",
        id: saved ? saved.id : item.id,
        status: "✅ 成功",
      });
    } else {
      results.push({
        action,
        menuName: item.menuName || "(未命名)",
        id: item.id || "(新增)",
        status: `❌ 失败: ${result.error}`,
      });
    }
  }

  const successCount = results.filter((r) => r.status.startsWith("✅")).length;
  const failCount = results.length - successCount;

  let output = `菜单操作完成：成功 ${successCount} 条，失败 ${failCount} 条\n\n`;
  output += "| 操作 | 菜单名 | ID | 状态 |\n";
  output += "|---|---|---|---|\n";
  for (const r of results) {
    output += `| ${r.action} | ${r.menuName} | ${r.id} | ${r.status} |\n`;
  }

  return output;
}

async function handleMenuSyncFromReport(args, config) {
  let domainId = config.menu && config.menu.domainId;
  // domainId 缺失时自动反推
  if (!domainId || domainId.toString().includes("domainId")) {
    const resolved = await resolveDomainId(config);
    if (!resolved.ok)
      return "❌ 未能自动获取 domainId：" + resolved.error + "\n请确认 token 与 sysAppNo 已填写，或手动填写 menu.domainId。";
    domainId = resolved.domainId;
  }
  const rootParentId =
    (config.menu && config.menu.parentMenuId) || config.parentMenuId;
  if (!rootParentId || rootParentId.toString().includes("parentMenuId")) {
    return "❌ 请先在 .github/skills/sync/env.local.json 填写 menu.parentMenuId";
  }
  if (!config.sysAppNo)
    return "❌ 请先在 .github/skills/sync/env.local.json 填写 sysAppNo";

  const reportPath = resolveReportPath(args && args.reportPath);
  if (!reportPath)
    return "❌ 未找到 SYS_MENU_INFO*.md，请传 reportPath 或先生成 .github/reports/SYS_MENU_INFO.md";

  const parsed = parseReport(fs.readFileSync(reportPath, "utf8"));
  if (parsed.dirs.length === 0 && parsed.pages.length === 0) {
    return `❌ 未从报告解析到菜单数据：${path.relative(getProjectRoot(), reportPath)}`;
  }

  const query = await queryMenuTree(domainId, config);
  if (!query.ok)
    return `❌ 查询菜单树失败: ${query.error} (code: ${query.code})`;

  const flatMenus = flattenMenus(query.data, null, []);
  const parentNode =
    flatMenus.find((item) => String(item.id) === String(rootParentId)) || {};
  const parentMenuNameCode =
    parentNode.menuNameCode || parentNode.nameCode || "";
  const resultRows = [];
  const dirIdMap = new Map();
  const dryRun = Boolean(args && args.dryRun);

  for (let index = 0; index < parsed.dirs.length; index += 1) {
    const dir = parsed.dirs[index];
    const existing = findExisting(flatMenus, {
      ...dir,
      parentId: rootParentId,
    });
    const body = buildMenuBody(
      dir,
      config,
      rootParentId,
      parentMenuNameCode,
      dir.orderNum || index + 1,
    );
    if (existing) body.id = existing.id;
    if (dryRun) {
      dirIdMap.set(
        dir.menuName,
        existing ? existing.id : `[dry-run:${dir.path}]`,
      );
      resultRows.push({
        action: existing ? "update(dry-run)" : "create(dry-run)",
        item: body,
        status: "预览",
      });
      continue;
    }
    const saved = await saveMenu(body, config);
    if (saved.ok) {
      const savedData = saved.data || body;
      dirIdMap.set(dir.menuName, savedData.id || body.id);
      flatMenus.push({ ...body, ...savedData });
      resultRows.push({
        action: existing ? "update" : "create",
        item: body,
        status: "✅ 成功",
      });
    } else {
      resultRows.push({
        action: existing ? "update" : "create",
        item: body,
        status: `❌ ${saved.error}`,
      });
    }
  }

  for (let index = 0; index < parsed.pages.length; index += 1) {
    const page = parsed.pages[index];
    const parentId = dirIdMap.get(page.parentMenuName) || rootParentId;
    const parent =
      flatMenus.find((item) => String(item.id) === String(parentId)) || {};
    const existing = findExisting(flatMenus, { ...page, parentId });
    const body = buildMenuBody(
      page,
      config,
      parentId,
      parent.menuNameCode || parentMenuNameCode,
      index + 1,
    );
    if (existing) body.id = existing.id;
    if (dryRun) {
      resultRows.push({
        action: existing ? "update(dry-run)" : "create(dry-run)",
        item: body,
        status: "预览",
      });
      continue;
    }
    const saved = await saveMenu(body, config);
    if (saved.ok) {
      flatMenus.push({ ...body, ...(saved.data || {}) });
      resultRows.push({
        action: existing ? "update" : "create",
        item: body,
        status: "✅ 成功",
      });
    } else {
      resultRows.push({
        action: existing ? "update" : "create",
        item: body,
        status: `❌ ${saved.error}`,
      });
    }
  }

  const rel = path.relative(getProjectRoot(), reportPath).replace(/\\/g, "/");
  const lines = [
    `✅ SYS_MENU_INFO 同步完成：${rel}`,
    "",
    `- 一级目录：${parsed.dirs.length}`,
    `- 二级菜单：${parsed.pages.length}`,
    `- dryRun：${dryRun ? "是" : "否"}`,
    "",
    "| 操作 | 类型 | 菜单名 | path | parentId | 状态 |",
    "|---|---|---|---|---|---|",
  ];
  for (const row of resultRows) {
    lines.push(
      `| ${row.action} | ${row.item.type} | ${row.item.menuName} | ${row.item.path} | ${row.item.parentId} | ${row.status} |`,
    );
  }
  return lines.join("\n");
}

module.exports = {
  handleMenuQuery,
  handleMenuUpsert,
  handleMenuSyncFromReport,
  // 导出纯工具函数供单测覆盖
  _internal: {
    cleanCell,
    splitMarkdownRow,
    isDividerRow,
    parseBoolean,
    normalizeTree,
    flattenMenus,
    findExisting,
    locateAppDomain,
    resolveDomainId,
    parseReport,
  },
};
