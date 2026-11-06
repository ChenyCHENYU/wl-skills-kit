# wl-skills-kit 使用指南

面向目标自身已接入 Kit 的 PC Vue/Web 管理端。UniApp、小程序、App/PDA、移动 H5 和未接入的兄弟项目不套用本包规则；先读取实际项目的 AGENTS 与技术约定。

## 安装与入口

在实际项目根目录使用项目既有包管理器安装经评审的本地版本，再初始化。例如使用 pnpm：

```sh
pnpm add -D --save-exact @agile-team/wl-skills-kit@<已确认版本>
pnpm exec wl-skills init --hosts codex
pnpm exec wl-skills doctor-host --host codex --json
```

`init` 默认 compact：具体 Skill、规范和模板保留在已安装包内，项目仅保存选中宿主的薄入口、配置和本包状态。通过任务返回的完整路径按需读取资源，不要求项目根出现整套 `.wl-skills/skills`。需要把参考资源落到项目时显式使用 `--integration expanded`。多宿主用 `--hosts codex,claude,zcode`；MCP 必须显式 `--mcp`，详见 [MCP 接入](mcp-setup.md)。

`doctor-host` 只诊断静态入口、版本和配置，不能证明当前宿主已经加载、模型已读取 Skill 或 MCP 已连接。按工具返回的宿主提示核对技能列表与启用状态，再进行一次真实任务。

## 执行任务与验收

```sh
pnpm exec wl-skills task "审计指定页面" --target src/views/example --run-id <任务ID> --json
# 按 notice 返回路径读取适用 Skill/规范，再执行任务。
pnpm exec wl-skills validate src/views/example --run-id <任务ID> --json
pnpm exec wl-skills status --run-id <任务ID> --json
```

`task` 只建立计划；`route`、`explain` 不写计划。自然语言触发取决于宿主发现、技能启用和任务匹配，不能承诺每次自动触发。模型的 Pre-flight 声明用于沟通，实际执行、检查结果、遗漏与过期证据以同 runId 的工具回执为准。

通过必须结合真实检查范围。静态 0 error 不证明类型检查已运行、功能正确或后端写入生效；`partial`、pending 和 stale 都需要继续处理。代码完成后按项目命令运行相关类型检查、构建与功能回归，缺少依赖或无法运行时明确未验证。

- 批量页面改动：核对共享组件和独立页，声明逐页预期与排除理由，再做静态覆盖和实际功能验证，见 [范围验收](change-scope.md)。
- 仅调整菜单顺序：定位菜单数据，保留页面目录、注册分组与路由结构；不能借排序重构页面。
- 菜单、字典、权限写入：查询事实 → 预览 planHash → 对具体计划明确确认 → 写前重查 → 写后回查，不能从一次工具响应推断全部业务已生效。

## 按任务使用能力

技能路由和命令清单由当前包提供：

```sh
pnpm exec wl-skills route "<任务>" --target <实际路径> --json
pnpm exec wl-skills protocol describe --json
pnpm exec wl-skills --help
```

页面开发可按需组合原型/详设解析、API 契约、页面生成、规范审计和机械修复；成熟页面可提取 Blueprint 或场景契约复用。不存在必须执行全部技能的固定流水线，未使用的兄弟包也不自动安装。

- 生成前确认规格和接口事实，保留项目现有组件、目录和已声明表格技术；不能仅因任务触发就迁移 UI 技术。
- 确定性场景：先 `scenario validate`，再预览 `scenario render`，经评审后显式 `--confirm`，最后复扫与相关项目测试。模式是否已实现以当前模式注册表为准，不沿用旧版本支持数量。
- 机械修复：`fix --dry-run` 先看具体差异，自动修改限当前执行器支持项；业务语义和无法确定的项由人工处理，不按告警颜色猜自动修复权限。
- UI 风格需要时单独使用已安装且适用的 UI 包；各包独立工作，不能用安装清单代替实际执行。

## 升级与清理

升级本地依赖和锁文件后，用同一版本执行 `update --dry-run` 查看受管变化，再按项目授权执行更新并复验。`init/update` 不是本地 npm 依赖安装器，也不会自动执行业务迁移。旧版本的复制资源与宿主入口只在本包登记所有权且未被修改时安全退役，用户与其他包内容保留。

```sh
pnpm exec wl-skills update --dry-run
pnpm exec wl-skills check
pnpm exec wl-skills diff
pnpm exec wl-skills clean --dry-run
```

`clean` 清理本包拥有且可清理的开发资产，不回退已生成的业务源码，不删除本地凭据。不要把升级、清理或诊断命令当作线上发布验证。

## 进一步阅读

- [当前架构与维护边界](architecture.md)
- [MCP 接入与验收](mcp-setup.md)
- [批量页面与菜单排序范围验收](change-scope.md)

使用问题和模板贡献联系 CHENY。历史演进查包根 `CHANGELOG.md` 和 `docs/version-history.md`，不把旧安装路径当作当前协议。
