# 项目范围与精准触发

本包只应用于目标项目自身已接入、平台适用且任务属于本包职责的场景。父目录、全局安装、兄弟包、Vue文件和触发词都不能证明目标项目已接入。项目初始化与任务执行是不同阶段；已安装文件也不能证明宿主加载或检查通过。

## 判定顺序

1. 从目标文件确定最近项目边界：package.json、独立Git仓库、安装清单或范围配置。父清单不能越过未接入子项目。同一Java工程的Maven模块共享工程接入，独立嵌套仓库仍单独判断。
2. 排除移动端：UniApp/Taro/React Native/Expo/Ionic/Capacitor依赖、pages.json+manifest.json，或显式mobile配置。不靠“页面”“Vue”或仓库名字猜平台。
3. 检查本包自身接入：有效的本包安装清单、package.json直接依赖（含dev/optional），或范围文件显式启用。node_modules里的传递/提升依赖不作为接入证据。
4. 才进行既有技能、基础约束、歧义和缺口判断。每包独立执行此步骤，不要求兄弟包或harness。Kit/UI仍只支持PC Vue管理端；BD保留后端职责，design/test保留各自设计/测试职责。

| 情况 | 回执与行为 |
|---|---|
| PC开源项目未接入本包 | not-applicable，无规则/技能、无任务写入，不自动建议安装 |
| 父工作区已安装，子项目未接入 | not-applicable，不继承父安装 |
| 已接入但自己的canonical资产缺失 | gap，说明本包资产缺口 |
| 已接入的移动端 | not-applicable，移动事实优先于pc配置 |
| 多个目标跨独立项目 | needs-context，按项目拆分，复用用户任务runId，零写入 |
| 范围元数据无效、projectType=unknown | needs-context，零写入，不猜测 |
| 工具与项目版本不一致 | doctor-host显示mismatch，先正常升级对齐 |

## 可选显式配置

在实际项目根创建用户维护的 `.wl-skills-scope.json`；安装器不覆盖或登记该用户文件。它不需要共享包运行依赖。已有有效安装/直接依赖无需额外配置；平台不能可靠推断时（尤其纯Vue移动H5），应明确声明。

```json
{
  "schemaVersion": 1,
  "projectType": "pc",
  "packages": { "kit": true }
}
```

projectType可为pc/backend/documents/testing/mobile/workspace/unknown。packages中的布尔false禁用对应包，true表示明确接入；未列出的包只根据各自清单/直接依赖判断，不自动启用。projectType本身不是接入证明。mobile排除这套项目约束；workspace只作聚合入口，指定已接入子项目才继续。父配置不跨项目继承。严格Schema随本包 `lib/project-scope.schema.json` 分发，protocol describe同时公布此契约。

工作区根可声明 `{"schemaVersion":1,"projectType":"workspace"}`；未接入的开源项目无需新增任何文件。移动H5可声明 `{"schemaVersion":1,"projectType":"mobile"}`，其现有组件、构建、目录及测试约定仍由自身项目维护。

## 使用建议与证据

把依赖与init/update放在实际项目根，进入最近项目AGENTS和原生gateway；编辑前显示工具notice里的实际包版本、scope证据、判定、规则来源、目标、runId和待检查项。使用同runId执行真实校验并读status；范围/接入配置变化使旧计划过期，currentScope反映当前范围。

包提供确定性判定和真实工具记录，宿主负责发现入口、调用工具与聊天展示。只npm安装可执行器而未初始化资产，会出现明确gap；只分发资产但缺可执行器，也不能宣称工具执行。Markdown不能强制所有宿主/模型调用，不保证任意自然语言100%匹配。不要为“没触发”自动安装包或扩大PC规则范围；相关能力缺口应先记录复现、审阅后完善。

本轮范围护栏保护task/route/explain及其CLI/MCP/公开protocol入口。用户明确调用的独立业务CLI仍遵循原授权与检查契约；护栏不代表任意外部命令的强制沙箱。
