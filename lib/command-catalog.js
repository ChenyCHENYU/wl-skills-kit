"use strict";

/** Public CLI metadata and admission share one catalog; handlers remain in the original CLI. */
const rows = [
  ["init", "[--project <path>] [--dry-run]", "安装技能、规范与编辑器配置", "写本包受管文件、安装清单与项目工具配置"],
  ["update", "[--project <path>] [--dry-run]", "增量更新本包受管文件", "更新本包所有权文件和清单；保留用户改动"],
  ["clean", "[--project <path>] [--keep-reports] [--dry-run]", "清理本包安装内容", "删除本包未修改且登记所有权的文件"],
  ["check", "[--project <path>]", "检查安装状态", "无写入"],
  ["diff", "[--project <path>]", "查看已安装规范与当前包差异", "无写入"],
  ["validate", "[<path>] [--target <path>] [--run-id <id>] [--json]", "页面规范与契约检查", "写检查缓存与本包任务回执；--typecheck 运行项目检查"],
  ["validate-page", "[<path>] [--target <path>] [--run-id <id>] [--json]", "validate 的兼容别名", "与 validate 相同"],
  ["doctor-ui", "[--project <path>] [--json]", "静态检查 UI 接入配置", "无写入"],
  ["export", "[--project <path>] [--dry-run]", "导出 SYS 报告 Excel", "写 reports/exports 下导出文件"],
  ["mock-clean", "--domain <name> | --all [--dry-run]", "清理指定 mock 目录", "删除所选 mock 文件；dry-run 仅预览"],
  ["fix", "[<path>] [--dry-run]", "修复支持的页面规范问题", "修改目标源码；dry-run 仅预览"],
  ["env", "[--dry-run]", "项目环境配置自检与补齐", "可能补齐项目环境配置；dry-run 仅预览"],
  ["standard-env", "<check|init|migrate> [--apply]", "标准环境方案检查与迁移", "check 只读；确认应用后修改项目工程配置"],
  ["contract", "<profile|init|validate|compare|render>", "独立 API 契约建立与核验", "profile/validate/compare 只读；init/render 写指定输出"],
  ["component", "<check|plan|apply> [--confirm]", "标准业务组件检查与接入", "check/plan 只读；确认 apply 后写组件与工程配置"],
  ["template", "<extract|mirror|validate|search|diff|audit> [--confirm]", "页面蓝图与实现镜像", "查询与预览只读；extract/mirror 确认后写指定产物"],
  ["snapshot", "[--path <path>] [--limit <n>] [--json]", "项目页面结构快照", "无写入，结果输出到 stdout"],
  ["scenario", "<validate|render|extract|verify|from-spec>", "场景校验、渲染和提取", "validate 只读；其他操作可能写场景/页面/证据产物，按子命令确认"],
  ["task", "--text <task> [--target <path>] [--run-id <id>]", "判定并记录任务计划", "写 .wl-skills/runs/；不执行业务动作"],
  ["route", "--text <task> [--target <path>]", "只读任务判定", "无写入"],
  ["explain", "--text <task> [--target <path>]", "只读解释任务约束", "无写入"],
  ["status", "[--run-id <id>]", "读取真实工具回执与新鲜度", "无写入"],
  ["doctor-host", "[--host <name>]", "宿主入口静态诊断", "无写入；不证明宿主加载"],
  ["protocol", "describe | request --input-file <file>", "公开结构化调用", "describe 只读；request 按实际操作/执行器声明"],
];
const COMMAND_CATALOG = Object.freeze(rows.map(([name, args, summary, sideEffects]) => Object.freeze({ name, args, summary, sideEffects, execution: "programmatic" })));
module.exports = { COMMAND_CATALOG };
