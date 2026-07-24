---
name: dict-sync
description: "Discover, bootstrap, preview, and safely reconcile standardized module dictionary contracts with the backend. Use for 同步字典, 全量字典发布, 创建字典, 缺少 dicts.ts, 字典对比, 字典审计, dict sync, or module dicts.ts maintenance."
---

# 字典同步

只从模块 `dicts.ts` 发布线上字典。先读取 `.wl-skills/docs/dictionary-contract.md`；项目级发布或旧项目迁移时再读取 `.wl-skills/docs/dictionary-reconcile.md`。首次访问线上同时读取 `../_mcp-guardrail.md`。

## 真值边界

```text
需求/原型/接口              → 字典需求来源
页面 api.md dict-contract   → 可审计页面片段
模块 dicts.ts               → 唯一发布真值
SYS_DICT_INFO.md             → 线上只读快照
```

不得从聊天数组、`data.ts`、代码扫描结果或 `SYS_DICT_INFO.md` 直接拼写线上请求。
严禁使用 curl、PowerShell、fetch、axios 或自拼 HTTP 绕过 `wls_dict_*` MCP 工具访问线上字典接口。

## 入口选择

### 项目已有 dicts.ts

默认使用项目级自动发现：

```json
{ "scope": "project" }
```

工具扫描当前项目 `src/views/**/dicts.ts`，一次建立线上索引并生成 `safe-additive` 计划。完全一致的跳过；只新增缺失模块、字典和明细；名称、排序、value/label/扩展字段漂移全部阻断；线上额外项只报告。

局部排查才使用单模块：

```json
{
  "scope": "module",
  "sourcePath": "src/views/mdata/model/dicts.ts"
}
```

### 项目没有 dicts.ts

先调用本地工具：

```json
{}
```

工具名：`wls_dict_bootstrap`。它从已有 `api.md dict-contract` 确定性聚合，默认只预览；代码中的 `logicValue/useDictOpts` 仅列为待补资料，不猜枚举。

确认创建本地契约：

```json
{
  "confirmWrite": true,
  "planHash": "<预览返回值>"
}
```

若没有可聚合契约，先根据需求、原型和接口完善页面 `api.md`，再运行 bootstrap。不得为了省步骤恢复直接 `module/dict/items` 上传。

## 线上发布

1. 运行 `wl-skills validate`，D1 必须通过。
2. 首次访问目标环境先调用：

```json
{
  "moduleCode": "<dicts.ts 的 module.code>",
  "includeSystemModules": true
}
```

工具名：`wls_dict_query`。必须核对返回的 `target.gatewayPath` 和 `target.sysAppNo`；协议、端口、环境前缀或应用任一不符都停止，不得在错误环境继续预览/写入。
3. 调用 `wls_dict_upsert` 预览，禁止传 `confirmApply`。
4. 展示应用、扫描范围、动作、阻断项、警告和 `planHash`。
5. 存在任一阻断项时停止，不请求用户强行覆盖。
6. 用户明确确认后，重新调用并携带相同 `planHash`：

```json
{
  "scope": "project",
  "confirmApply": true,
  "planHash": "<预览返回值>"
}
```

执行前会重读本地与线上；哈希变化则零写入并要求重新预览。执行中断不做危险回滚删除；修复后重跑，已完成项自动跳过。

## 平台兼容与失败码

MCP 会联合读取字典树、业务模块列表和全局业务模块，避免“空模块未出现在树上”时误建重复模块。模块/字典/明细的父 ID 为空会在下一层写入前硬阻断。

| `failure.code` | 含义 | AI 必须采取的动作 |
|---|---|---|
| `DICT_MODULE_SYSTEM_CONFLICT` | 模块编码或名称被系统字典模块占用 | 停止；修改本地稳定 `module.code/name` 或由管理员处理冲突 |
| `DICT_MODULE_HIDDEN_CONFLICT` | 后端报告已存在，但业务树、业务模块和系统模块都不可见 | 停止盲重试；通常是软删除、跨租户或历史残留。修改本地唯一模块编码并同步全部 `api.md`，或请管理员清理 |
| `DICT_MODULE_CREATE_FAILED` | 非重复类模块创建失败 | 按 `failure.details.backendError` 定位权限、参数或服务问题 |
| `DICT_SYNC_FAILED` | 其他同步失败 | 查看 `completed`，修复后重新预览并幂等补齐 |

禁止模型为了“继续执行”而复用空 `moduleId/dictId`、猜测历史记录 ID、自动删除冲突记录，或只改线上不改本地契约。

## 强制安全规则

- 项目根由当前 MCP 进程确定；禁止跨项目扫描。
- 符号链接目录不参与全量发现，显式路径也必须解析后仍位于项目内。
- 所有本地契约先完整校验，再查询和写入线上。
- 同一模块编码唯一；同一字典编码只能有一个所有者。
- 预览零写入；正式执行必须同时具备 `confirmApply=true` 和有效 `planHash`。
- 项目级策略固定为 `safe-additive`：不改名、不改排序、不改已有明细、不删除。
- 同 key 不同 label、同 label 不同 key、扩展字段漂移全部阻断整个计划。
- 线上额外模块、字典或明细只报告，不反向删除。
- 每个字典写入前再次读取完整定义和全部明细，写后再次回查。
- 同一 `sysAppNo + projectRoot` 的执行在 MCP 进程内串行化。

## Pre-flight

```text
已触发 dict-sync
项目根：{projectRoot}
目标应用：{sysAppNo}
目标网关：{gatewayPath，必须含真实端口和环境前缀}
范围：project / module / bootstrap
策略：safe-additive
本地契约：{count / sourcePath}
模式：预览 / 确认创建本地契约 / 确认线上写入
```

回查未通过、执行部分完成或存在阻断项时，不得宣称同步完成。
