"use strict";

/**
 * MCP Tool 描述符集中注册（v2.7.0+ auto-discovery）
 *
 * 每个描述符字段：
 *   - name              工具唯一标识（wls_*）
 *   - description       工具说明（出现在 tools/list 响应中）
 *   - inputSchema       JSON Schema
 *   - handle(args, cfg) 处理函数，返回字符串文本
 *   - needsBackendConfig  是否需要 loadConfig()（false: 纯本地工具）
 *
 * server.js 仅做协议层 + 自动调度；新增 Tool 只改本文件，不动 server.js。
 *
 * 导出：
 *   - DESCRIPTORS  完整描述符数组（含 handle）
 *   - TOOLS        对外公开的 tools/list 数据（仅 name/description/inputSchema）
 *   - HANDLERS     工具名 → 描述符的映射，供 dispatchTool 查表
 */

const {
  handleDomainQuery,
  handleMenuQuery,
  handleMenuUpsert,
  handleMenuDelete,
  handleMenuSyncFromReport,
} = require("./tools/menuSync");
const { handleDictBootstrap, handleDictQuery, handleDictUpsert } = require("./tools/dictSync");
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
const {
  handleStandardEnvApply,
  handleStandardEnvScan,
  handleStandardEnvVerify,
} = require("./tools/standardEnvTools");

const STRUCTURED_RESULT_SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    state: { type: "string" },
    mode: { type: "string" },
    planHash: { type: "string" },
    currentPlanHash: { type: "string" },
    count: { type: "number" },
    items: { type: "array", items: { type: "object" } },
    actions: { type: "array", items: { type: "object" } },
    results: { type: "array", items: { type: "object" } },
    menuIds: { type: "array", items: { type: "string" } },
  },
  required: ["ok", "state"],
};

const DESCRIPTORS = [
  // ── menu ───────────────────────────────────────────────────────────
  {
    name: "wls_domain_query",
    description:
      "查询全部应用域列表（不依赖菜单权限）。返回所有系统内置域（生产/质量/销售/...），" +
      "含 id(code=domainId)/name/code。用途：当目标域存在但当前账号无菜单权限时，" +
      "用此接口获取 domainId 和 sysAppNo（比 getPermissionMenuTree 更全面）。" +
      "在建菜单前调用，确认 domainId/sysAppNo/parentMenuId。",
    inputSchema: { type: "object", properties: {}, required: [] },
    outputSchema: STRUCTURED_RESULT_SCHEMA,
    needsBackendConfig: true,
    handle: (_args, config) => handleDomainQuery(config),
  },
  {
    name: "wls_menu_query",
    description:
      "查询当前应用的完整菜单树。自动从 .wl-skills/skills/sync/env.local.json 读取 domainId，" +
      "无需传参。在 wls_menu_upsert 前调用，用于判断哪些菜单需要新增、哪些需要更新。",
    inputSchema: { type: "object", properties: {}, required: [] },
    outputSchema: STRUCTURED_RESULT_SCHEMA,
    needsBackendConfig: true,
    handle: (_args, config) => handleMenuQuery(config),
  },
  {
    name: "wls_menu_upsert",
    description:
      "批量新增或更新菜单项。有 id 字段 → 更新；无 id 字段 → 新增。" +
      "默认只预览并返回 planHash；正式写入必须同时传 confirmApply: true 和相同 planHash。",
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
        confirmApply: {
          type: "boolean",
          description: "默认 false，仅预览；明确确认后传 true 才写入菜单",
          default: false,
        },
        planHash: {
          type: "string",
          description: "confirmApply=true 时必填；必须等于当前线上状态对应的预览哈希",
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
    outputSchema: STRUCTURED_RESULT_SCHEMA,
    needsBackendConfig: true,
    handle: (args, config) => handleMenuUpsert(args, config),
  },
  {
    name: "wls_menu_delete",
    description:
      "删除菜单（⚠️ 敏感操作）。默认只预览删除范围（含子节点递归），确认后执行。" +
      "安全机制：① 默认预览 ② 需传 confirmApply:true + 正确 planHash ③ 生产环境阻断 ④ 自底向上逐个删除（后端不级联）。",
    inputSchema: {
      type: "object",
      properties: {
        menuIds: {
          type: "array",
          description: "要删除的菜单 ID 列表",
          items: { type: "string" },
        },
        cascadeChildren: {
          type: "boolean",
          description: "是否递归删除子菜单（默认 true）。传 false 时有子节点的菜单会被后端拒绝。",
          default: true,
        },
        confirmApply: {
          type: "boolean",
          description: "默认 false，仅预览删除范围；明确确认后传 true 才执行删除",
          default: false,
        },
        planHash: {
          type: "string",
          description: "confirmApply=true 时必填；必须等于预览返回的 planHash",
        },
      },
      required: ["menuIds"],
      additionalProperties: false,
    },
    outputSchema: STRUCTURED_RESULT_SCHEMA,
    needsBackendConfig: true,
    handle: (args, config) => handleMenuDelete(args, config),
  },
  {
    name: "wls_menu_sync_from_report",
    description:
      "读取 .wl-skills/reports/SYS_MENU_INFO*.md（兼容旧 .github/reports），按一级目录(type=M)优先、二级菜单(type=C)随后同步到后端菜单。" +
      "默认只预览并返回 planHash；正式写入必须携带相同 planHash，状态漂移时零写入。",
    inputSchema: {
      type: "object",
      properties: {
        reportPath: {
          type: "string",
          description:
            "可选。SYS_MENU_INFO*.md 路径；不传则使用 .wl-skills/reports 下最新报告，兼容旧 .github/reports。",
        },
        dryRun: {
          type: "boolean",
          description: "可选。true 时只解析和预览，不调用保存接口。",
        },
        confirmApply: {
          type: "boolean",
          description: "默认 false，仅预览；明确确认后传 true 才按报告同步菜单",
          default: false,
        },
        planHash: {
          type: "string",
          description: "confirmApply=true 时必填；必须等于报告和当前线上菜单对应的预览哈希",
        },
      },
      required: [],
      additionalProperties: false,
    },
    outputSchema: STRUCTURED_RESULT_SCHEMA,
    needsBackendConfig: true,
    handle: (args, config) => handleMenuSyncFromReport(args, config),
  },
  // ── dict ───────────────────────────────────────────────────────────
  {
    name: "wls_dict_query",
    description:
      "查询当前 sysAppNo 应用下的业务字典树：业务模块 -> 字典 -> 字典明细入口。" +
      "在 wls_dict_upsert 前调用，用于判断目标模块/字典是否已存在。",
    inputSchema: { type: "object", properties: {}, required: [] },
    needsBackendConfig: true,
    handle: (_args, config) => handleDictQuery(config),
  },
  {
    name: "wls_dict_bootstrap",
    description:
      "为尚无 dicts.ts 的项目扫描 api.md dict-contract，预览并生成标准模块字典契约。" +
      "只写本地新文件、绝不覆盖，代码中的 logicValue/useDictOpts 仅作为待补资料清单，不会猜值或直接上传。",
    inputSchema: {
      type: "object",
      properties: {
        searchRoot: {
          type: "string",
          description: "扫描根目录，默认 src/views，必须位于当前项目内",
        },
        confirmWrite: {
          type: "boolean",
          description: "默认 false，仅预览；明确确认后传 true 才创建本地 dicts.ts",
          default: false,
        },
        planHash: {
          type: "string",
          description: "confirmWrite=true 时必填，必须等于最近一次预览返回值",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        state: { type: "string" },
        mode: { type: "string" },
        planHash: { type: "string" },
        targets: { type: "array", items: { type: "string" } },
        created: { type: "array", items: { type: "string" } },
        issues: { type: "array", items: { type: "object" } },
        references: { type: "array", items: { type: "object" } },
      },
      required: ["ok", "state"],
    },
    needsBackendConfig: false,
    handle: (args) => handleDictBootstrap(args),
  },
  {
    name: "wls_dict_upsert",
    description:
      "自动发现并安全增量协调模块 dicts.ts：scope=project 扫描全部模块，scope=module 发布单模块。" +
      "默认只预览；只新增缺失模块/字典/明细，任何冲突或漂移全局阻断，不覆盖、不删除。",
    inputSchema: {
      type: "object",
      properties: {
        sourcePath: {
          type: "string",
          description: "scope=module 时必填，如 src/views/mdata/model/dicts.ts",
        },
        scope: {
          type: "string",
          enum: ["module", "project"],
          description: "module 发布一个文件；project 自动发现 searchRoot 下全部 dicts.ts",
          default: "project",
        },
        searchRoot: {
          type: "string",
          description: "scope=project 的扫描根目录，默认 src/views",
        },
        dictCodes: {
          type: "array",
          description: "可选；仅同步 dicts.ts 中指定的字典编码",
          items: { type: "string" },
        },
        confirmApply: {
          type: "boolean",
          description: "默认 false，仅预览；明确确认后传 true 才写后端并回查验证",
          default: false,
        },
        planHash: {
          type: "string",
          description: "confirmApply=true 时必填；必须等于当前线上和本地状态对应的预览哈希",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        state: { type: "string" },
        mode: { type: "string" },
        planHash: { type: "string" },
        summary: { type: "object" },
        actions: { type: "array", items: { type: "object" } },
        issues: { type: "array", items: { type: "object" } },
        warnings: { type: "array", items: { type: "object" } },
        completed: { type: "array", items: { type: "object" } },
      },
      required: ["ok", "state"],
    },
    needsBackendConfig: true,
    handle: (args, config) => handleDictUpsert(args, config),
  },
  // ── role / permission ──────────────────────────────────────────────
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
      additionalProperties: false,
    },
    outputSchema: STRUCTURED_RESULT_SCHEMA,
    needsBackendConfig: true,
    handle: (args, config) => handleRoleQuery(args, config),
  },
  {
    name: "wls_role_upsert",
    description:
      "批量新增角色（按 code 字段自动去重；已存在则跳过）。默认预览；正式写入必须同时传 confirmApply: true 和 planHash。" +
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
        confirmApply: {
          type: "boolean",
          description: "默认 false，仅预览；明确确认后传 true 才新增角色",
          default: false,
        },
        planHash: {
          type: "string",
          description: "confirmApply=true 时必填；必须等于当前角色列表对应的预览哈希",
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
    outputSchema: STRUCTURED_RESULT_SCHEMA,
    needsBackendConfig: true,
    handle: (args, config) => handleRoleUpsert(args, config),
  },
  {
    name: "wls_assignable_menus_query",
    description:
      "查询全量可授权菜单列表（扁平结构，含菜单 id/menuName/permission）。" +
      "在 wls_role_assign_menus 前调用，AI 据此选出要分配给角色的 menuIds。",
    inputSchema: { type: "object", properties: {}, required: [] },
    outputSchema: STRUCTURED_RESULT_SCHEMA,
    needsBackendConfig: true,
    handle: (args, config) => handleAssignableMenusQuery(args, config),
  },
  {
    name: "wls_role_assign_menus",
    description:
      "给指定角色批量分配菜单权限。menuIds 传字符串数组，内部自动拼成逗号分隔字符串提交后端。" +
      "该接口为全量覆盖式，应包含该角色所有菜单（含已有的，否则会被移除）；正式提交必须同时传 confirmFullReplace: true 和预览 planHash。",
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
        confirmFullReplace: {
          type: "boolean",
          description: "确认 menuIds 已包含该角色应保留的全部菜单/动作。未传 true 时工具会拒绝提交，避免误覆盖。",
        },
        planHash: {
          type: "string",
          description: "confirmFullReplace=true 时必填；必须等于当前可授权菜单对应的预览哈希",
        },
      },
      required: ["roleId", "menuIds"],
      additionalProperties: false,
    },
    outputSchema: STRUCTURED_RESULT_SCHEMA,
    needsBackendConfig: true,
    handle: (args, config) => handleRoleAssignMenus(args, config),
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
      additionalProperties: false,
    },
    outputSchema: STRUCTURED_RESULT_SCHEMA,
    needsBackendConfig: true,
    handle: (args, config) => handleActionQuery(args, config),
  },
  {
    name: "wls_action_upsert",
    description:
      "在指定页面菜单下批量新增动作按钮（type=A），按 permission 字段自动去重；正式写入必须同时传 confirmApply: true 和预览 planHash。" +
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
        confirmApply: {
          type: "boolean",
          description: "默认 false，仅预览；明确确认后传 true 才新增动作",
          default: false,
        },
        planHash: {
          type: "string",
          description: "confirmApply=true 时必填；必须等于当前页面动作列表对应的预览哈希",
        },
      },
      required: ["parentId", "items"],
      additionalProperties: false,
    },
    outputSchema: STRUCTURED_RESULT_SCHEMA,
    needsBackendConfig: true,
    handle: (args, config) => handleActionUpsert(args, config),
  },
  // ── project / local（无需后端配置）─────────────────────────────────
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
    needsBackendConfig: false,
    handle: (args) => handleCodeScan(args),
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
    needsBackendConfig: false,
    handle: (args) => handleRouteCheck(args),
  },
  {
    name: "wls_standard_env_scan",
    description:
      "只读识别子应用是否符合标准环境配置，并分类旧网关、旧直连、自定义和已标准化项目。不会写文件，也不读取后端配置。",
    inputSchema: { type: "object", properties: {}, required: [] },
    needsBackendConfig: false,
    handle: () => handleStandardEnvScan(),
  },
  {
    name: "wls_standard_env_apply",
    description:
      "将已识别的存量 Vite 子应用迁移为单 .env、五环境、三开发模式和模块化配置。默认只输出计划，confirmApply: true 才写入并执行静态验证。",
    inputSchema: {
      type: "object",
      properties: {
        profile: {
          type: "string",
          enum: ["walsin"],
          description: "内置目标环境，华新项目传 walsin。",
        },
        profileFile: {
          type: "string",
          description: "自定义完整五环境 Profile JSON 路径。",
        },
        profileData: {
          type: "object",
          description: "自定义完整五环境 Profile 对象。",
        },
        moduleName: {
          type: "string",
          description: "模块名；历史配置存在冲突时必须明确传入。",
        },
        localApi: { type: "string", description: "本地后端 URL。" },
        localPublic: { type: "string", description: "本地 public URL。" },
        localMode: {
          type: "string",
          enum: ["all", "module", "routes"],
          description: "本地后端代理范围。",
        },
        localRoutes: {
          description: "routes 模式映射，可传 match=rewrite 字符串或对象数组。",
        },
        confirmApply: {
          type: "boolean",
          description: "正式写入确认；未传 true 时只输出计划。",
        },
      },
      required: [],
    },
    needsBackendConfig: false,
    handle: (args) => handleStandardEnvApply(args),
  },
  {
    name: "wls_standard_env_verify",
    description:
      "验证标准环境配置结构、五环境、三开发模式、运行时配置和 Profile；可选执行五环境临时构建。",
    inputSchema: {
      type: "object",
      properties: {
        profile: { type: "string", enum: ["walsin"] },
        profileFile: { type: "string" },
        profileData: { type: "object" },
        runBuild: {
          type: "boolean",
          description: "是否在临时副本中执行五环境构建，默认 false。",
        },
      },
      required: [],
    },
    needsBackendConfig: false,
    handle: (args) => handleStandardEnvVerify(args),
  },
  {
    name: "wls_validate_page",
    description:
      "校验页面是否符合 wl-skills-kit 最新页面规范：BaseTable+AGGrid+cid、defineColumns、renderOps、mock-first、api.md 等。开启 typecheck 额外执行 vue-tsc/tsc 类型检查（R14）。",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "页面或目录路径，默认 src/views" },
        typecheck: {
          type: "boolean",
          description:
            "是否额外执行 vue-tsc/tsc --noEmit 类型检查（R14，体积较大，CI 场景开启）",
        },
      },
      required: [],
    },
    needsBackendConfig: false,
    handle: (args) => handleValidatePage(args),
  },
  {
    name: "wls_doctor_ui",
    description:
      "检查 @agile-team/wl-skills-ui 是否真正接入：依赖、tokens、styles preset、installCommonPreset、defineColumns、renderOps。",
    inputSchema: { type: "object", properties: {}, required: [] },
    needsBackendConfig: false,
    handle: (args) => handleDoctorUi(args),
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
    needsBackendConfig: false,
    handle: (args) => handleGitLogExtract(args),
  },
  {
    name: "wls_audit_report_push",
    description:
      "将最新审计报告推送到飞书机器人 HTTPS webhook。默认只预览，confirmPush: true 才推送；未配置时静默跳过。",
    inputSchema: {
      type: "object",
      properties: {
        reportPath: {
          type: "string",
          description:
            "审计报告路径，不传则自动选择 .wl-skills/reports 下最新 AUDIT_*.md 或规范审查报告.md，兼容旧 .github/reports",
        },
        confirmPush: {
          type: "boolean",
          description: "默认 false，仅预览；确认报告与 webhook 后传 true 才推送",
          default: false,
        },
      },
      required: [],
    },
    needsBackendConfig: false,
    handle: (args) => handleAuditReportPush(args),
  },
];

const READ_ONLY_TOOLS = new Set([
  "wls_code_scan",
  "wls_route_check",
  "wls_git_log_extract",
  "wls_validate_page",
  "wls_doctor_ui",
  "wls_standard_env_scan",
  "wls_standard_env_verify",
  "wls_menu_query",
  "wls_dict_query",
  "wls_role_query",
  "wls_assignable_menus_query",
  "wls_action_query",
]);
const IDEMPOTENT_WRITE_TOOLS = new Set([
  "wls_menu_sync_from_report",
  "wls_menu_upsert",
  "wls_dict_upsert",
  "wls_dict_bootstrap",
  "wls_role_upsert",
  "wls_action_upsert",
  "wls_standard_env_apply",
]);
const DESTRUCTIVE_TOOLS = new Set(["wls_role_assign_menus", "wls_standard_env_apply"]);
const CLOSED_WORLD_TOOLS = new Set([
  "wls_code_scan",
  "wls_route_check",
  "wls_git_log_extract",
  "wls_validate_page",
  "wls_doctor_ui",
  "wls_standard_env_scan",
  "wls_standard_env_apply",
  "wls_standard_env_verify",
  "wls_dict_bootstrap",
]);

function annotationsFor(name) {
  const readOnly = READ_ONLY_TOOLS.has(name);
  return {
    readOnlyHint: readOnly,
    destructiveHint: readOnly ? false : DESTRUCTIVE_TOOLS.has(name),
    idempotentHint: readOnly || IDEMPOTENT_WRITE_TOOLS.has(name),
    openWorldHint: !CLOSED_WORLD_TOOLS.has(name),
  };
}

for (const descriptor of DESCRIPTORS) {
  if (descriptor.inputSchema.additionalProperties === undefined) {
    descriptor.inputSchema.additionalProperties = false;
  }
}

const TOOLS = DESCRIPTORS.map((d) => ({
  name: d.name,
  description: d.description,
  inputSchema: d.inputSchema,
  annotations: annotationsFor(d.name),
  ...(d.outputSchema ? { outputSchema: d.outputSchema } : {}),
}));

const HANDLERS = Object.create(null);
for (const d of DESCRIPTORS) {
  if (HANDLERS[d.name]) {
    throw new Error(
      "[mcp/registry] 工具名重复: " + d.name + "（请检查 DESCRIPTORS 数组）",
    );
  }
  HANDLERS[d.name] = d;
}

module.exports = { DESCRIPTORS, TOOLS, HANDLERS, annotationsFor };
