# 任务判定与真实检查回执

安装、宿主发现、AI 读取、路由选择、工具执行和检查成功是不同阶段。文件存在只证明静态就绪；模型声明不证明读取或执行。`doctor-host --host codex` 只诊断本包入口，宿主实际发现和读取保持 `unverified`。

```bash
wl-skills route "修改页面文字" --target src --json
wl-skills task "修改页面文字" --target src --json
# 把上一步返回的 runId 用于实际工具
wl-skills validate src/views/example --typecheck --run-id <runId>
wl-skills status --run-id <runId> --json
```

`route/explain` 只读；`task` 保存计划，尚未执行任何检查。同一用户任务在已安装且适用的包间复用 `--run-id` 或 `WL_TASK_RUN_ID`，各包只读写自己的 `.wl-skills/runs`，不要求安装未使用的兄弟包。请为每次新任务使用新 ID；每个工具结束和任务结束时简短报告 runId、执行状态、验证状态、真实检查范围及未验证项。

判定包括 `matched`、`baseline`、`ambiguous`、`gap`、`not-applicable`、`needs-context`。普通相关修改使用基础规范；缺本包 canonical Skill/规则资产返回 `gap`、`ready:false`、`missingInputs`，保留 `routingStatus` 与选定技能。`--skill <未发布ID>` 和显式未支持专项请求报告能力缺口，而不是用基础规范掩盖。确定性路由覆盖已发布目录和明确列出的未支持意图，不能保证理解所有自然语言；遇到歧义/缺上下文须补充目标与意图，缺口只形成审阅建议，不自动增改技能。

每条真实 CLI/MCP 回执分开记录 `executionStatus` 与 `validationStatus`：退出零只代表工具完成；没有检查则 `unverified`，错误为 `failed`，相关检查跳过/人工复核/范围缺口为 `partial` 或 `unverified`。明确不适用单独标识。实际执行器的 `checkedFiles` 才证明处理过的文件；输入目录快照不当作全目录覆盖。未报告检查文件的工具保留范围未知，不把工具运行当作业务规范通过。

状态核对源码、规则、配置、任务所需资产及包版本快照，编辑后旧证据标记 stale，须复检。重复同工具+同目标按开始时间选最新回执；未解决的计划缺口和未覆盖目标不能报 overall passed。

安装会生成本包独有 `.agents/skills/wl-skills-kit/SKILL.md` 薄适配器，先判定，再按需读 selected canonical Skill 与标准。现有 editor 入口也提示同样流程，安装/更新/清理继续遵守各自 manifest 所有权；没有归属证据不会接管用户内容。宿主是否重新索引新入口须由真实宿主确认，CLI 不伪造宿主事件。

Kit Vite 插件显式配置后在 serve/build 生效，并对范围内 `.vue/.ts/.scss` 热更新去抖检查所属 index.vue 页面；`watch:false` 可关闭热更新。只运行 AST，完整 validate 和项目 typecheck 不因此通过。解析器不可用或零适用页面打印 skipped；构建 error 阻断，开发警告仍记录 failed 检查。

当前验证回执覆盖 validate / Vite AST 与本包 MCP；其他 CLI 生成、同步、模板操作继续返回既有产物与日志，不自动等同于业务约束验证。未由执行器报告实际文件的操作，其检查范围明确未知；不能用输入目录快照或成功退出补造文件覆盖。
