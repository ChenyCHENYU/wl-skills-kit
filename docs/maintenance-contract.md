# 独立包与 Harness 的维护契约

业务规则、Skill、模板、检查器和参数语义由本包维护。Harness 通过公开 `protocol` 调用，不复制这些实现。本包不依赖 Harness，也不要求安装兄弟包；PC 接入、移动端排除和项目边界判断仍以本包真实 scope 判定为准。

## 稳定结构化执行入口

先用 `protocol request` 的 `task` 创建计划，再读取 `status.result.integration` 中的 `allowedExecutors`、`targets`、`ruleRefs`、准入和新鲜度。选定已允许的执行器后请求：

```json
{
  "protocolVersion": 1,
  "operation": "execute",
  "projectRoot": "/absolute/project",
  "runId": "same-task-id",
  "executorId": "从本包允许目录选择",
  "parameters": { "targets": ["使用计划返回的实际目标"] }
}
```

能力以本地 `protocol describe --json` 为准，特性为 `executor-invoke-v1`；参数遵守对应 `inventory.executors[].parameters` 的完整 JSON Schema。不能省略 projectRoot/runId，不能任意扩大目标、规则或执行权限。能力目录加载异常、缺口、歧义、只讨论任务、过期计划和版本不一致会拒绝执行。

`ok=true` 表示结构化调用完成，不代表检查通过。`result.execution` 保留原执行器 exitCode、signal 和有界 stdout/stderr；真正业务验证结论来自 `result.integration`、实际工具回执与未验证项。业务只读检查可以写本包任务记录和报告。

原 CLI 与结构化入口复用同一个原检查器。本包内部 CLI 参数调整只需修改本包映射；新版 Harness 不保存这些旗标。未提供此特性的旧包仍可独立使用原 CLI，宿主可以在明确提示 legacy 的情况下使用旧受控映射。

## 版本、快照与自动监督

- `npm run support:check` 依据本包自带的 sourceRevision、契约版本和 SHA256 清单离线检查共享核心，不要求兄弟源码。公共源修复统一分发，禁止人工单独编辑快照。
- 公共开发工具支持 `support:sync -- --packages <keys> --check` 与按选定包分发；只读检查不能修改文件。来源 revision 相同表示同源内容，不要求五包每次同步发版。
- `npm run compatibility:check` 对本包候选真实 tarball 做发布基线普通升级与已发布兄弟包共存验证；仅开发验收使用这些兄弟包，不构成运行依赖。
- 五包本包 CI 执行快照检查及本包门禁；兼容 CI 保存产物和验收证据。Harness 自身另有已发布包与候选 SDK 验收。工作流配置与远端执行回执分开记录。
- 包版本、协议版本、公共快照 revision、SDK 版本分别管理。版本不同允许存在；破坏性公开契约变化须声明版本和兼容迁移。

宿主可见回执应显示包及实际版本、技能/规则、目标、runId、准入与缺口、执行结果及证据新鲜度。宿主是否发现、读取或遵守规则必须有相应宿主证据，静态入口存在和模型自报不能代替。

## 单包能力保留

卸载 Harness 不改变本包 CLI/MCP、Skill 和检查器。未安装或未接入的兄弟项目不继承规则。公共契约检查不强制业务项目安装全部五包，也不会自动追随 npm latest。


取消与路径证据：POSIX 执行器拥有独立进程组，取消立即终止其进程树；只对本次子进程实际新写且未结束的开始记录补执行失败、验证未验证、零规则通过/零检查文件的终态。并行同 runId 的其他进程记录不被代写。UTF8 输出按完整字节解码，stdout/stderr共用4MiB预算；预算超限不能成为成功。Windows进程树处理有实现，真实Windows执行须由CI另行采证。

计划绑定原项目的真实路径；复制或移动项目后旧计划失效，需要重新建立任务。目录内外部符号链接不能扩大检查范围。快照清单同时记录可分发兼容脚本的哈希：源码中存在此脚本时离线验证其内容；运行时tarball可以不包含开发验收脚本，不因此依赖兄弟源码。实际编辑器加载、模型读取与远端CI运行记录仍由对应宿主提供。
