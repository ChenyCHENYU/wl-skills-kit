"use strict";

const fs = require("fs");
const path = require("path");
const { queryPermissionMenuTree, querySysDomainList } = require("../api/menuApi");
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
 * 优先链路：sysDomain/list（仅需 token，不依赖菜单权限）
 *   → 全部应用域（生产/质量/...，含系统内置域）
 *   → 按 code/sysAppNo/关键词定位目标域
 *   → 取域 id 即为 domainId
 *
 * Fallback 链路：getPermissionMenuTree（依赖菜单权限）
 *   → 顶层各应用域
 *   → 取该节点的 parentId 即为 domainId
 *
 * 注意：生产域（production）等可能存在但当前账号无菜单权限，
 *       此时 getPermissionMenuTree 查不到，必须用 sysDomain/list。
 *
 * @param {object} config  含 gatewayPath/token，可选 sysAppNo
 * @param {{ keyword?: string, domainCode?: string }} [opts]  应用域名称/编码关键词（如"生产"/"production"）
 * @returns {Promise<{ ok: boolean, domainId?: string, appRootId?: string, sysAppNo?: string, menuName?: string, error?: string }>}
 */
async function resolveDomainId(config, opts) {
  const domainCode = (opts && opts.domainCode) || "";
  const keyword = (opts && opts.keyword) || "";

  // ── ① 优先：sysDomain/list（不依赖菜单权限）──
  const domainResult = await querySysDomainList(config);
  if (domainResult.ok && Array.isArray(domainResult.data)) {
    const records = domainResult.data;
    // 按 code 精确匹配 > name 关键词 > code 关键词
    let matched = null;
    if (domainCode) {
      matched = records.find((d) => String(d.code || "") === domainCode);
    }
    if (!matched && keyword) {
      matched = records.find((d) => String(d.name || "").includes(keyword));
    }
    if (!matched && config.sysAppNo) {
      // sysDomain 不含 sysAppNo，跳过
    }
    if (matched) {
      return {
        ok: true,
        domainId: String(matched.id || ""),
        appRootId: String(matched.id || ""),
        sysAppNo: config.sysAppNo || "",
        menuName: matched.name || "",
        domainCode: matched.code || "",
      };
    }
  }

  // ── ② Fallback：getPermissionMenuTree（依赖菜单权限）──
  const result = await queryPermissionMenuTree(config);
  if (!result.ok) {
    return { ok: false, error: `查询应用域失败: ${result.error}（sysDomain/list 和 getPermissionMenuTree 均不可用）` };
  }

  const topNodes = normalizeTree(result.data);
  if (topNodes.length === 0) {
    return { ok: false, error: "权限菜单树为空，当前账号可能无任何菜单权限" };
  }

  const matchedNode = locateAppDomain(topNodes, {
    sysAppNo: config.sysAppNo,
    keyword,
  });

  if (!matchedNode) {
    const names = topNodes
      .map((n) => `${n.menuName || "?"}(sysAppNo=${n.sysAppNo || "?"})`)
      .join("、");
    return {
      ok: false,
      error: `未能匹配到目标应用域。请确认 sysAppNo/keyword/domainCode。当前可见应用域: ${names}`,
    };
  }

  return {
    ok: true,
    domainId: String(matchedNode.parentId || ""),
    appRootId: String(matchedNode.id || ""),
    sysAppNo: matchedNode.sysAppNo || config.sysAppNo || "",
    menuName: matchedNode.menuName || "",
  };
}

function getReportDirs(root) {
  return [
    path.join(root, ".wl-skills", "reports"),
    path.join(root, ".github", "reports"),
  ];
}

function findLatestReport(root) {
  for (const reportsDir of getReportDirs(root)) {
    if (!fs.existsSync(reportsDir)) continue;
    const reports = fs
      .readdirSync(reportsDir)
      .filter((name) => /^SYS_MENU_INFO.*\.md$/.test(name))
      .map((name) => path.join(reportsDir, name))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (reports[0]) return reports[0];
  }
  return null;
}

function resolveReportPath(inputPath) {
  const root = getProjectRoot();
  if (inputPath) {
    const full = path.resolve(root, inputPath);
    if (!fs.existsSync(full)) return null;
    const realRoot = fs.realpathSync(root);
    const realFile = fs.realpathSync(full);
    const relative = path.relative(realRoot, realFile);
    return relative && (relative.startsWith("..") || path.isAbsolute(relative)) ? null : realFile;
  }
  return findLatestReport(root);
}

function parseReport(content) {
  const dirs = [];
  const pages = [];
  const state = { section: "", currentDirName: "", header: null };
  for (const line of content.split(/\r?\n/)) {
    if (updateReportSection(state, line)) continue;
    const subMenu = line.match(/^###\s+\d+\.\s+(.+?)\s*子菜单/);
    if (subMenu) state.currentDirName = cleanCell(subMenu[1]);
    if (!line.trim().startsWith("|") || isDividerRow(line)) continue;
    const cells = splitMarkdownRow(line);
    if (!state.header) {
      state.header = cells;
      continue;
    }
    const row = rowFromCells(state.header, cells);
    if (state.section === "dir") appendDirectoryRow(dirs, row);
    if (state.section === "page") appendPageRow(pages, row, state.currentDirName);
  }
  return { dirs, pages };
}

function updateReportSection(state, line) {
  if (/^##\s+.*一级目录/.test(line)) {
    state.section = "dir";
    state.header = null;
    return true;
  }
  if (!/^##\s+.*二级菜单/.test(line)) return false;
  state.section = "page";
  state.header = null;
  return true;
}

function rowFromCells(header, cells) {
  return Object.fromEntries(header.map((key, index) => [key, cells[index] || ""]));
}

function firstValue(...values) {
  return values.find((value) => value != null && value !== "") || "";
}

function appendDirectoryRow(dirs, row) {
  const menuName = firstValue(row["菜单名"], row.menuName);
  const menuPath = firstValue(row.path, row["菜单路径"]);
  if (!menuName || !menuPath) return;
  if (menuName.includes("目录名") || menuPath.includes("目录path")) return;
  dirs.push({
    type: "M",
    menuName,
    path: menuPath,
    orderNum: Number(firstValue(row.orderNum, row["显示排序"], dirs.length + 1)),
  });
}

function appendPageRow(pages, row, parentMenuName) {
  const menuName = firstValue(row["菜单名"], row.menuName);
  const menuPath = firstValue(row.path, row["菜单路径"]);
  const component = firstValue(row.component, row["组件路径"]);
  if (!menuName || !menuPath || !component || menuName.includes("页面名称")) return;
  pages.push({
    type: "C",
    menuName,
    path: menuPath,
    component,
    permission: firstValue(row.permission, row["权限标识"]),
    hidden: parseBoolean(firstValue(row.hidden, row["是否隐藏"])),
    parentMenuName,
  });
}

function buildMenuBody(item, config, parentId, parentMenuNameCode, orderNum) {
  const codePrefix = parentMenuNameCode ? `${parentMenuNameCode}:` : "";
  // ⚠️ path 必须是 camelCase 短名（如 mmwrCustomerArchive），禁止斜杠路径（/xxx/yyy）
  // 平台用 path 做唯一性检查，斜杠路径会与同前缀目录冲突报"该权限标识已存在"
  const rawPath = String(item.path || "");
  if (rawPath.includes("/")) {
    throw new Error(
      `菜单 path 不能含斜杠：收到 "${rawPath}"。path 必须是 camelCase 短名（如 mmwrCustomerArchive），不是路由路径（如 /steelmaking/planning）。` +
      `参考 SKILL.md: kebab-case 目录名转 camelCase（mmwr-customer-archive → mmwrCustomerArchive）。`,
    );
  }
  const camelPath = toCamelCase(rawPath);
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
    menuNameCode: item.menuNameCode || `${codePrefix}${camelPath}`,
    path: camelPath,
    component: item.type === "C" ? item.component : undefined,
    // permission 默认 = path（camelCase），确保权限标识不遗漏
    permission: item.type === "C" ? (item.permission || camelPath) : undefined,
  };
}

/**
 * kebab-case 或下划线 → camelCase（mmwr-customer-archive → mmwrCustomerArchive）
 * 已是 camelCase 则原样返回。
 */
function toCamelCase(str) {
  if (!str) return str;
  // 已经是纯 camelCase（无 - _）直接返回
  if (!/[-_]/.test(str)) return str;
  return str
    .replace(/^[-_]+/, "")
    .replace(/[-_](.)/g, (_, c) => c.toUpperCase());
}

/**
 * wls_menu_query 工具处理器
 * 自动从 config.menu.domainId 读取应用域 ID，查询完整菜单树。
 * 若 domainId 缺失，则通过 getPermissionMenuTree 自动反推（仅需 token + sysAppNo/关键词）。
 *
 * @param {object} config
 * @returns {Promise<string>} 返回给 AI 的文本内容
 */
module.exports = {
  buildMenuBody,
  cleanCell,
  findExisting,
  findLatestReport,
  flattenMenus,
  getProjectRoot,
  getReportDirs,
  isDividerRow,
  locateAppDomain,
  normalizeTree,
  parseBoolean,
  parseReport,
  resolveDomainId,
  resolveReportPath,
  splitMarkdownRow,
  toCamelCase,
};
