#!/usr/bin/env node
"use strict";

/**
 * wl-skills MCP Server
 *
 * 实现 MCP 协议（stdio transport，JSON-RPC 2.0）
 * 暴露工具：
 *   wls_menu_query                查询菜单树
 *   wls_menu_upsert               批量新增/更新菜单
 *   wls_menu_sync_from_report     从 SYS_MENU_INFO*.md 确定性同步菜单
 *   wls_dict_query                查询字典模块
 *   wls_dict_upsert               新增/更新字典模块及字典项
 *   wls_role_query                查询角色列表
 *   wls_role_upsert               批量新增角色（按 code 去重）
 *   wls_assignable_menus_query    查询全量可授权菜单（用于角色授权）
 *   wls_role_assign_menus         给角色批量分配菜单权限
 *   wls_action_query              查询页面菜单下的动作（type=A）
 *   wls_action_upsert             批量新增动作（按 permission 去重）
 *   wls_code_scan                 扫描页面目录与文件完整性
 *   wls_route_check               检查页面目录在路由文件中的可发现性
 *   wls_git_log_extract           提取最近提交摘要
 *   wls_audit_report_push         推送最新审计报告（可选飞书 webhook）
 *
 * 启动方式（由 .cursor/mcp.json 自动注入）：
 *   node node_modules/@agile-team/wl-skills-kit/mcp/server.js
 */

const readline = require("readline");
const { loadConfig } = require("./config");
const {
  handleMenuQuery,
  handleMenuUpsert,
  handleMenuSyncFromReport,
} = require("./tools/menuSync");
const { handleDictQuery, handleDictUpsert } = require("./tools/dictSync");
const {
  handleRoleQuery,
  handleRoleUpsert,
  handleRoleAssignMenus,
  handleAssignableMenusQuery,
  handleActionQuery,
  handleActionUpsert,
} = require("./tools/permissionSync");
const {
  handleCodeScan,
  handleValidatePage,
  handleDoctorUi,
  handleRouteCheck,
  handleGitLogExtract,
  handleAuditReportPush,
} = require("./tools/projectTools");

const PKG = require("../package.json");

// ─── Tool 注册表 ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "wls_menu_query",
    description:
      "查询当前应用的完整菜单树。自动从 .github/skills/sync/env.local.json 读取 domainId，" +
      "无需传参。在 wls_menu_upsert 前调用，用于判断哪些菜单需要新增、哪些需要更新。",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "wls_menu_upsert",
    description:
      "批量新增或更新菜单项。有 id 字段 → 更新；无 id 字段 → 新增。" +
      "新增时响应自动包含服务端生成的 id，可链式用于创建子菜单。",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description:
            "MenuSaveBody 数组。每项字段：" +
            "id(更新时传), sysAppNo, menuName, menuNameCode, parentId, " +
            'type("M"=目录/"C"=菜单), path, icon, orderNum, ' +
            "useCache(1), common(2), hidden(false), editMode(false), " +
            "component(type=C时传), permission(type=C时传)",
          items: { type: "object" },
        },
      },
      required: ["items"],
    },
  },
  {
    name: "wls_menu_sync_from_report",
    description:
      "读取 .github/reports/SYS_MENU_INFO*.md，按一级目录(type=M)优先、二级菜单(type=C)随后同步到后端菜单。" +
      "自动查询 domain 菜单树去重，复用或更新已存在菜单，避免把二级页面全部挂到根 parentMenuId。",
    inputSchema: {
      type: "object",
      properties: {
        reportPath: {
          type: "string",
          description:
            "可选。SYS_MENU_INFO*.md 路径；不传则使用 .github/reports 下最新报告。",
        },
        dryRun: {
          type: "boolean",
          description: "可选。true 时只解析和预览，不调用保存接口。",
        },
      },
      required: [],
    },
  },
  {
    name: "wls_dict_query",
    description:
      "查询当前应用的所有字典模块及字典项。在 wls_dict_upsert 前调用，" +
      "用于判断哪些模块/字典项已存在。",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "wls_dict_upsert",
    description:
      "新增或更新字典模块及其字典项。内部自动处理：" +
      "若模块不存在则创建（data=null 后自动 re-query 获取 id），" +
      "若已存在则直接取 id；字典项自动跳过已存在的 strSn。",
    inputSchema: {
      type: "object",
      properties: {
        module: {
          type: "object",
          description:
            'DictModuleSaveBody: strSn(必填), strName(必填), sortPriority("1"), strLevel(2)',
          properties: {
            strSn: { type: "string", description: '模块标识符，如 "gender"' },
            strName: { type: "string", description: '模块显示名，如 "性别"' },
            sortPriority: {
              type: "string",
              description: '排序，字符串类型，如 "1"',
            },
            strLevel: { type: "number", description: "固定传 2" },
          },
          required: ["strSn", "strName"],
        },
        items: {
          type: "array",
          description:
            "DictItemSaveBody 数组（可选）。每项字段：" +
            "strSn(必填), strName(必填), strLevel(2), " +
            'dtlValue(""), dtlValueRequired(false), dtlValue2Required(false), ' +
            "dtlValue3Required(false), dtlValue4Required(false)",
          items: { type: "object" },
        },
      },
      required: ["module"],
    },
  },
  {
    name: "wls_role_query",
    description:
      "查询角色列表。可选参数 current/size 翻页，默认 size=100。返回精简字段：id, roleName, code, sysAppNo, roleDesc。",
    inputSchema: {
      type: "object",
      properties: {
        current: { type: "number", description: "页码，默认 1" },
        size: { type: "number", description: "每页数量，默认 100" },
      },
      required: [],
    },
  },
  {
    name: "wls_role_upsert",
    description:
      "批量新增角色（按 code 字段自动去重；已存在则跳过）。每项必填 roleName 和 code，可选 configDesc。" +
      "注意：角色仅新增不更新，因角色变更通常需要业务确认。",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description:
            "角色数组。字段：roleName(必填，显示名), code(必填，唯一标识), configDesc(可选，描述)",
          items: { type: "object" },
        },
      },
      required: ["items"],
    },
  },
  {
    name: "wls_assignable_menus_query",
    description:
      "查询全量可授权菜单列表（扁平结构，含菜单 id/menuName/permission）。" +
      "在 wls_role_assign_menus 前调用，AI 据此选出要分配给角色的 menuIds。",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "wls_role_assign_menus",
    description:
      "给指定角色批量分配菜单权限。menuIds 传字符串数组，内部自动拼成逗号分隔字符串提交后端。" +
      "该接口为全量覆盖式，应包含该角色所有菜单（含已有的，否则会被移除）。",
    inputSchema: {
      type: "object",
      properties: {
        roleId: {
          type: "string",
          description: "角色 id（来自 wls_role_query）",
        },
        menuIds: {
          type: "array",
          description: "该角色应拥有的全部菜单 id 数组",
          items: { type: "string" },
        },
      },
      required: ["roleId", "menuIds"],
    },
  },
  {
    name: "wls_action_query",
    description:
      "查询指定页面菜单（type=C）下的动作按钮列表（type=A）。返回 id/menuName/permission/orderNum/icon。",
    inputSchema: {
      type: "object",
      properties: {
        menuId: { type: "string", description: "父菜单 id（页面菜单）" },
      },
      required: ["menuId"],
    },
  },
  {
    name: "wls_action_upsert",
    description:
      "在指定页面菜单下批量新增动作按钮（type=A），按 permission 字段自动去重。" +
      "权限码命名规范：{资源camelCase}_{动作} 或 {模块}:{资源}:{动作}（与项目既有约定保持一致）。" +
      "常见动作：add/edit/remove/export/import/approve。",
    inputSchema: {
      type: "object",
      properties: {
        parentId: {
          type: "string",
          description: "页面菜单 id（动作挂在它下面）",
        },
        items: {
          type: "array",
          description:
            "动作数组。字段：menuName(必填，显示名), permission(必填，权限码), icon(可选，默认list), orderNum(可选，默认1), useCache(可选，默认1)",
          items: { type: "object" },
        },
      },
      required: ["parentId", "items"],
    },
  },
  {
    name: "wls_code_scan",
    description:
      "扫描项目页面目录，返回 index.vue/data.ts/index.scss/api.md 完整性与 API_CONFIG 概览。" +
      "默认扫描 src/views，可传 path 指定目录。适用于 convention-audit / Agent Pipeline 前置感知项目结构。",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "相对项目根目录的扫描路径，默认 src/views",
        },
      },
      required: [],
    },
  },
  {
    name: "wls_route_check",
    description:
      "检查 src/views 页面目录是否能在路由文件中被发现。默认查找 vite/plugins/shared/pages.ts 等常见路由文件，" +
      "可传 path 和 routeFile 定制。用于 page-codegen/menu-sync 后闭环验证。",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "页面扫描路径，默认 src/views" },
        routeFile: {
          type: "string",
          description: "路由文件路径，默认自动探测",
        },
      },
      required: [],
    },
  },
  {
    name: "wls_validate_page",
    description:
      "校验页面是否符合 wl-skills-kit 最新页面规范：BaseTable+AGGrid+cid、defineColumns、renderOps、mock-first、api.md 等。",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "页面或目录路径，默认 src/views" },
      },
      required: [],
    },
  },
  {
    name: "wls_doctor_ui",
    description:
      "检查 @agile-team/wk-skills-ui 是否真正接入：依赖、tokens、styles preset、installCommonPreset、defineColumns、renderOps。",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "wls_git_log_extract",
    description:
      "提取最近 N 次 git commit 摘要，用于 convention-audit 的 Git 规范检查或 changelog-gen 的数据源。",
    inputSchema: {
      type: "object",
      properties: {
        n: { type: "number", description: "提取数量，默认 20，最大 100" },
      },
      required: [],
    },
  },
  {
    name: "wls_audit_report_push",
    description:
      "将最新审计报告推送到飞书机器人 webhook。未配置 env.local.json 的 feishu_webhook 时静默跳过，不影响其他流程。",
    inputSchema: {
      type: "object",
      properties: {
        reportPath: {
          type: "string",
          description:
            "审计报告路径，不传则自动选择 .github/reports 下最新 AUDIT_*.md 或规范审查报告.md",
        },
      },
      required: [],
    },
  },
];

// ─── JSON-RPC 协议层 ────────────────────────────────────────────────────

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

// ─── Tool 调度 ───────────────────────────────────────────────────────────

async function dispatchTool(id, toolName, toolArgs) {
  let config;
  const needsBackendConfig = ![
    "wls_code_scan",
    "wls_route_check",
    "wls_validate_page",
    "wls_doctor_ui",
    "wls_git_log_extract",
    "wls_audit_report_push",
  ].includes(toolName);
  if (needsBackendConfig) {
    try {
      config = loadConfig();
    } catch (e) {
      // 配置加载失败：以文本形式返回给 AI（不是 JSON-RPC error，AI 能读）
      sendResult(id, {
        content: [{ type: "text", text: `❌ 配置加载失败: ${e.message}` }],
        isError: true,
      });
      return;
    }
  }

  try {
    let text;
    switch (toolName) {
      case "wls_menu_query":
        text = await handleMenuQuery(config);
        break;
      case "wls_menu_upsert":
        text = await handleMenuUpsert(toolArgs, config);
        break;
      case "wls_menu_sync_from_report":
        text = await handleMenuSyncFromReport(toolArgs, config);
        break;
      case "wls_dict_query":
        text = await handleDictQuery(config);
        break;
      case "wls_dict_upsert":
        text = await handleDictUpsert(toolArgs, config);
        break;
      case "wls_role_query":
        text = await handleRoleQuery(toolArgs, config);
        break;
      case "wls_role_upsert":
        text = await handleRoleUpsert(toolArgs, config);
        break;
      case "wls_assignable_menus_query":
        text = await handleAssignableMenusQuery(toolArgs, config);
        break;
      case "wls_role_assign_menus":
        text = await handleRoleAssignMenus(toolArgs, config);
        break;
      case "wls_action_query":
        text = await handleActionQuery(toolArgs, config);
        break;
      case "wls_action_upsert":
        text = await handleActionUpsert(toolArgs, config);
        break;
      case "wls_code_scan":
        text = await handleCodeScan(toolArgs);
        break;
      case "wls_route_check":
        text = await handleRouteCheck(toolArgs);
        break;
      case "wls_validate_page":
        text = await handleValidatePage(toolArgs);
        break;
      case "wls_doctor_ui":
        text = await handleDoctorUi(toolArgs);
        break;
      case "wls_git_log_extract":
        text = await handleGitLogExtract(toolArgs);
        break;
      case "wls_audit_report_push":
        text = await handleAuditReportPush(toolArgs);
        break;
      default:
        sendError(id, -32601, `未知工具: ${toolName}`);
        return;
    }
    sendResult(id, { content: [{ type: "text", text }] });
  } catch (e) {
    sendResult(id, {
      content: [{ type: "text", text: `❌ 工具执行异常: ${e.message}` }],
      isError: true,
    });
  }
}

// ─── 消息循环 ────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  const raw = line.trim();
  if (!raw) return;

  let msg;
  try {
    msg = JSON.parse(raw);
  } catch (e) {
    send({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
    return;
  }

  const { id, method, params = {} } = msg;

  // Notifications（无 id）不需要响应
  if (id === undefined || id === null) return;

  switch (method) {
    case "initialize":
      sendResult(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "wl-skills", version: PKG.version },
      });
      break;

    case "tools/list":
      sendResult(id, { tools: TOOLS });
      break;

    case "tools/call":
      await dispatchTool(id, params.name, params.arguments || {});
      break;

    case "ping":
      sendResult(id, {});
      break;

    default:
      sendError(id, -32601, `Method not found: ${method}`);
  }
});

rl.on("close", () => {
  process.exit(0);
});
