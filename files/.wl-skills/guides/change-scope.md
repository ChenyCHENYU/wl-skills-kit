# 批量页面与菜单排序的范围验收

仅在批量页面改动或菜单排序任务启用，复用 `task → validate/MCP → status` 的同一 runId。普通单页任务不增加这些检查。静态扫描不能证明页面行为，组件引用不代表独立页面已覆盖。

## 批量页面

先运行 `wl-skills task "统一给工位页面增加查询反馈" --json --run-id <id>`。`changeScope.baseline.pages` 列出 `src/views`、`src/pages` 中含 `index.vue` 的候选，包括独立页面与可能的组件；候选是文件系统事实，不是业务范围结论。公开返回最多200页与总数，完整清单/哈希保存在本地 `recordPath`；遍历上限4000文件，单文件2MiB、取证总量32MiB，超过预算或遇到未跟随链接会明确提示证据不完整。

按需求、页面注册/路由与独立页实现核对候选，创建项目内 JSON，再用同 runId 重新 task：

```json
{
  "basis": "工位与配料站都属于本次查询反馈范围；已核对注册表与独立页面",
  "affectedPages": [
    {"path": "src/views/station", "expectation": "查询成功显示一次成功反馈，失败不显示成功反馈"},
    {"path": "src/views/batching", "expectation": "独立配料站查询同样显示成功反馈，空结果有明确提示"}
  ],
  "excludedPages": [
    {"path": "src/views/settings", "reason": "设置页，无本次工位查询能力"}
  ]
}
```

```sh
wl-skills task "统一给工位页面增加查询反馈" --page-scope checks/query-pages.json --run-id <id> --json
wl-skills validate src/views --run-id <id> --json
wl-skills status --run-id <id> --json
```

`batch-page-inventory` 检查范围、功能预期和未声明/排除页面的实际修改。默认 `src/views`、`src/pages` 扫描根内每个候选都必须归入影响页或提供排除理由；未分类候选会列出并保持待检查，不能仅因 JSON 存在就通过。大项目可在清单中显式声明 `scanRoots:["src/views/selected-domain"]` 并在 `basis` 说明需求范围；工具不会从已声明的 affectedPages 反推候选全集。完整基线仍保留根外候选，避免隐藏独立页。工具不声称自动识别全部业务关联。

`batch-page-coverage` 对照每个影响页的当前 `index.vue` 实际扫描记录。扫描部分目录、缺少页面或只执行 grep 均不能证明完整覆盖。范围未闭合时不运行或采信逐页功能验证。

`batch-page-behavior` 在未执行功能测试时保持待验收，不能用文档或模型自报置为通过。可以显式选用项目已有且不超过2MiB的 JS 测试适配脚本：

```sh
wl-skills validate src/views --run-id <id> --page-verifier scripts/check-query-pages.cjs --json
```

工具显示/记录实际 Node 命令、项目目录、脚本 SHA，使用参数数组、无 shell、30 秒及 1 MiB 输出上限。脚本从 stdin 接收 `{pages:[{path,expectation}],fingerprint}`；应调用项目真实测试并断言成功/失败/空结果等适用行为，输出：

```json
{"pages":[{"path":"src/views/station","status":"passed","assertions":3},{"path":"src/views/batching","status":"passed","assertions":3}]}
```

退出非零、少页、重复页、零断言、断言失败、源码在验证中变化均不采信；源码或验证脚本后续变化会使旧结果失效。测试适配器的断言真实性与场景质量仍要评审，不能编写恒为真的脚本充数。不传该参数不会自动执行项目脚本。MCP 对应 `wls_task.pageScope`、`wls_validate_page.pageVerifier`。

复用行为证据时取同一源码/范围的最近一次实际结果；最近一次失败不能由更旧的成功或后来只做静态扫描消项。指纹覆盖 `src`、`vite` 内有界普通文件（含共享 JSON、样式和模板）及依赖清单/锁文件；这些输入共同遵守单文件和总字节预算，超限保持待验收。项目外、远程系统或未声明的测试辅助输入不属于自动追踪证明，仍须按实际场景重跑测试。

统一协议/harness 通过 `task` 的 `context.pageScope` 传范围清单路径；复用原有 `context` 扩展，不增加新的执行器参数。协议 `execute(validate)` 只做原静态检查，功能仍待验证；需要主动运行功能脚本时使用上述 CLI/MCP 显式参数，不因协议调用静默执行项目脚本。

## 仅调整菜单顺序

先定位菜单的真实数据源；页面注册表（如 `vite/plugins/shared/pages.ts`）不当然是菜单数据。仅排序不授权改页面目录、注册分组、组件路径、路由、权限或接口。应保留项目现有分组和路径。

`task "调整菜单顺序"` 自动保存页面源码、pages 注册表和 `src/router` / `src/routes` 基线。`validate`、`status` 会对照新增/删除/改名和内容变化；发现越界保持失败。它检测外部编辑，不能拦截编辑器直接写磁盘，也不自动恢复可能属于用户的改动。

MCP 使用 `wls_menu_upsert({orderOnly:true,items:[{id:"已有ID",orderNum:3}]})`，只接受已有 ID 和整数顺序；从查询快照保留其他字段，预览/应用均拒绝创建和其他字段。匹配菜单排序 task 的 MCP 调用自动进入该模式，并在源码边界未通过时停止写入。仍复用查询、planHash 预览、明确确认、漂移检查与回查；不生成新的页面或重排注册分组。

未显式传 runId 的 MCP 调用承接当前已判定任务，避免每次调用随机另起链路。当前存在范围约束时，不能仅填一个未经过 task 的新 runId 绕开；确有独立任务时先明确 task，再使用其 runId。范围约束不能替代宿主对用户授权和任务切换的判断。

项目若用另一份本地菜单排序配置，只在已确认的数据源和授权字段中调整；本检查不自动猜测配置所有权或放开路由结构。实际需要改注册/路由属于另一项明确授权任务。
