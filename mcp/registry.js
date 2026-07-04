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
const { handleEnvScan, handleEnvApply } = require("./tools/envTools");

const DESCRIPTORS = [
  // ── menu ───────────────────────────────────────────────────────────
  {
    name: "wls_menu_query",
    description:
      "查询当前应用的完整菜单树。自动从 .wl-skills/skills/sync/env.local.json 读取 domainId，" +
      "无需传参。在 wls_menu_upsert 前调用，用于判断哪些菜单需要新增、哪些需要更新。",
    inputSchema: { type: "object", properties: {}, required: [] },
    needsBackendConfig: true,
    handle: (_args, config) => handleMenuQuery(config),
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
    needsBackendConfig: true,
    handle: (args, config) => handleMenuUpsert(args, config),
  },
  {
    name: "wls_menu_sync_from_report",
    description:
      "读取 .wl-skills/reports/SYS_MENU_INFO*.md（兼容旧 .github/reports），按一级目录(type=M)优先、二级菜单(type=C)随后同步到后端菜单。" +
      "自动查询 domain 菜单树去重，复用或更新已存在菜单，避免把二级页面全部挂到根 parentMenuId。",
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
      },
      required: [],
    },
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
    name: "wls_dict_upsert",
    description:
      "精准补齐业务字典三层数据：业务模块 -> 字典 -> 字典明细。" +
      "依赖 env.local.json 的 sysAppNo 请求头定位应用；先查后写。" +
      "模块不存在时可创建，字典存在且同名时只追加缺失明细；编码/名称/明细冲突时停止或跳过，避免污染。",
    inputSchema: {
      type: "object",
      properties: {
        module: {
          type: "object",
          description:
            "业务字典模块。对应左侧一级模块，如 主数据系统授权/隐患排查治理。可用 id 精确定位；不存在且提供 strSn+strName 时自动创建。",
          properties: {
            id: { type: "string", description: "已有模块 ID；传 id 时若找不到不会自动创建" },
            strSn: { type: "string", description: '模块编码，如 "mdmAuth"' },
            strName: { type: "string", description: '模块名称，如 "主数据系统授权"' },
            sortPriority: {
              type: "string",
              description: '新建模块排序，字符串类型，如 "20"',
            },
            strLevel: { type: "number", description: "固定传 2" },
          },
          required: [],
        },
        dict: {
          type: "object",
          description:
            "模块下的字典定义。对应 /system/business/dict/save，strSn 是业务代码，strName 是显示名。",
          properties: {
            id: { type: "string", description: "已有字典 ID；通常由工具查询树后自动获取" },
            strSn: { type: "string", description: '字典编码，如 "mdmModelType" 或 "aq_miss_type"' },
            strName: { type: "string", description: '字典名称，如 "模型类型" 或 "隐患缺失类型"' },
            strLevel: { type: "number", description: "固定传 2" },
            dtlValueRequired: { type: "boolean", description: "明细 strValue 是否必填，默认 false" },
            dtlValue2Required: { type: "boolean", description: "明细 strValue2 是否必填，默认 false" },
            dtlValue3Required: { type: "boolean", description: "明细 strValue3 是否必填，默认 false" },
            dtlValue4Required: { type: "boolean", description: "明细 strValue4 是否必填，默认 false" },
          },
          required: ["strSn", "strName"],
        },
        items: {
          type: "array",
          description:
            "字典明细数组（可选）。推荐传 value/label，工具会映射为后端 strKey=value、strValue=label；" +
            "若明确知道后端字段，也可直接传 strKey/strValue 原样写入。",
          items: {
            type: "object",
            properties: {
              value: { type: ["string", "number"], description: "语义值，写入后端 strKey" },
              label: { type: "string", description: "显示名称，写入后端 strValue" },
              strKey: { type: ["string", "number"], description: "后端原始 strKey；传了则优先按原样写入" },
              strValue: { type: ["string", "number"], description: "后端原始 strValue；传了则优先按原样写入" },
              strValue2: { type: ["string", "number"], description: "可选扩展值 2" },
              strValue3: { type: ["string", "number"], description: "可选扩展值 3" },
              strValue4: { type: ["string", "number"], description: "可选扩展值 4" },
              strValueCode: { type: "string", description: "可选；默认 sysDict.dtl.strValue.<安全后缀>，优先 strValue，中文时回退 strKey" },
            },
          },
        },
      },
      required: ["module", "dict"],
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
    },
    needsBackendConfig: true,
    handle: (args, config) => handleRoleQuery(args, config),
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
    needsBackendConfig: true,
    handle: (args, config) => handleRoleUpsert(args, config),
  },
  {
    name: "wls_assignable_menus_query",
    description:
      "查询全量可授权菜单列表（扁平结构，含菜单 id/menuName/permission）。" +
      "在 wls_role_assign_menus 前调用，AI 据此选出要分配给角色的 menuIds。",
    inputSchema: { type: "object", properties: {}, required: [] },
    needsBackendConfig: true,
    handle: (args, config) => handleAssignableMenusQuery(args, config),
  },
  {
    name: "wls_role_assign_menus",
    description:
      "给指定角色批量分配菜单权限。menuIds 传字符串数组，内部自动拼成逗号分隔字符串提交后端。" +
      "该接口为全量覆盖式，应包含该角色所有菜单（含已有的，否则会被移除）；正式提交必须传 confirmFullReplace: true。",
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
      },
      required: ["roleId", "menuIds"],
    },
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
    },
    needsBackendConfig: true,
    handle: (args, config) => handleActionQuery(args, config),
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
    name: "wls_env_scan",
    description:
      "扫描前端项目环境配置形态与硬编码端点，识别 root .env.* / env/.env.* 两类项目，并输出标准化计划。纯本地只读工具，不读取后端配置、不需要 token。",
    inputSchema: {
      type: "object",
      properties: {
        profile: {
          type: "string",
          description: '环境 Profile 名称，默认 "walsin"',
        },
        profileFile: {
          type: "string",
          description: "可选。自定义环境 Profile JSON 文件路径。",
        },
        profileData: {
          type: "object",
          description:
            "可选。直接传入自定义 Profile 数据，支持 { name, title, envs } 或 { appName, baseUrls, proxyPrefixes }。",
        },
        projectType: {
          type: "string",
          enum: ["auto", "root-env", "env-dir"],
          description: "项目环境文件形态，默认 auto 自动识别。",
        },
        prodPrefix: {
          type: "string",
          description: "可选。覆盖生产环境 API 前缀，如 prod-api 或 prd-api。",
        },
        migrateViteConfig: {
          type: "boolean",
          description:
            "是否迁移 vite.config / public/env-dev.json 中可识别的硬编码环境映射，默认 true；传 false 时只处理 env 文件。",
        },
      },
      required: [],
    },
    needsBackendConfig: false,
    handle: (args) => handleEnvScan(args),
  },
  {
    name: "wls_env_apply",
    description:
      "按标准 Profile 生成或更新前端环境文件，仅处理前端 baseURL/API 前缀配置。默认 dry-run；必须传 confirmApply: true 才会写入文件，并自动备份到 .wl-skills/reports/env-backups。",
    inputSchema: {
      type: "object",
      properties: {
        profile: {
          type: "string",
          description: '环境 Profile 名称，默认 "walsin"',
        },
        profileFile: {
          type: "string",
          description: "可选。自定义环境 Profile JSON 文件路径。",
        },
        profileData: {
          type: "object",
          description:
            "可选。直接传入自定义 Profile 数据，支持 { name, title, envs } 或 { appName, baseUrls, proxyPrefixes }。",
        },
        projectType: {
          type: "string",
          enum: ["auto", "root-env", "env-dir"],
          description: "项目环境文件形态，默认 auto 自动识别。",
        },
        prodPrefix: {
          type: "string",
          description: "可选。覆盖生产环境 API 前缀，如 prod-api 或 prd-api。",
        },
        migrateViteConfig: {
          type: "boolean",
          description:
            "是否迁移 vite.config / public/env-dev.json 中可识别的硬编码环境映射，默认 true；传 false 时只处理 env 文件。",
        },
        confirmApply: {
          type: "boolean",
          description: "正式写入确认开关。未传 true 时永远只做 dry-run。",
        },
      },
      required: [],
    },
    needsBackendConfig: false,
    handle: (args) => handleEnvApply(args),
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
      "将最新审计报告推送到飞书机器人 webhook。未配置 env.local.json 的 feishu_webhook 时静默跳过，不影响其他流程。",
    inputSchema: {
      type: "object",
      properties: {
        reportPath: {
          type: "string",
          description:
            "审计报告路径，不传则自动选择 .wl-skills/reports 下最新 AUDIT_*.md 或规范审查报告.md，兼容旧 .github/reports",
        },
      },
      required: [],
    },
    needsBackendConfig: false,
    handle: (args) => handleAuditReportPush(args),
  },
];

const TOOLS = DESCRIPTORS.map((d) => ({
  name: d.name,
  description: d.description,
  inputSchema: d.inputSchema,
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

module.exports = { DESCRIPTORS, TOOLS, HANDLERS };
