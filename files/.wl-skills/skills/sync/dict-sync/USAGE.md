# dict-sync 使用示例

## 首次连接环境（必须先确认目标）

```text
wls_dict_query({
  moduleCode: "mdmAuth",
  includeSystemModules: true
})
→ 返回 target.gatewayPath / target.sysAppNo
→ 同时检查业务模块和系统模块同编码冲突
```

`gatewayPath` 必须与浏览器成功请求的协议、端口和 `/sit-api`、`/uat-api` 等环境前缀完全一致。域名相同不代表默认 443 与 8443 是同一套数据。

## 项目全量协调（推荐）

```text
wls_dict_upsert({ scope: "project" })
→ 自动发现全部模块 dicts.ts
→ 一次比较线上
→ 返回 safe-additive 计划和 planHash

wls_dict_upsert({ scope: "project", confirmApply: true, planHash })
→ 状态未变化且无冲突时只新增缺失项
→ 项目级回查
```

## 单模块排查

```text
wls_dict_upsert({
  scope: "module",
  sourcePath: "src/views/mdata/model/dicts.ts"
})
```

正式执行同样必须携带预览返回的 `planHash`。

## 没有 dicts.ts 的旧项目

```text
wls_dict_bootstrap({})
→ 聚合 api.md dict-contract，预览待创建文件
→ logicValue/useDictOpts 只列候选，不猜枚举

wls_dict_bootstrap({ confirmWrite: true, planHash })
→ 只创建本地 dicts.ts，不访问线上

wl-skills validate
→ D1 通过后再执行项目全量协调
```

如果返回 `needs-contracts`，先根据需求、原型和接口补齐页面 `api.md`。禁止直接把候选字典编码上传。

## 结果处理

| 状态 | 处理 |
|---|---|
| `ready` | 展示计划，等待用户确认 |
| `blocked` | 修复冲突/漂移后重新预览 |
| `stale-plan` | 状态已变化，重新预览 |
| `partial` | 查看 completed，修复失败原因后幂等重跑 |
| `verified` | 发布和回查完成 |

项目级发布不覆盖名称、排序和已有明细，也不删除线上额外项。

## 常见平台差异

### 浏览器能创建，MCP 查不到同一模块

1. 先看 `wls_dict_query` 返回的 `target`，确认没有连错端口/环境。
2. 确认 `sysAppNo` 来自目标应用，而不是明文领域名。
3. 少数后端依赖业务字典页面上下文，可在 `env.local.json#dict.headers` 配置同环境成功请求中的 `menupath/menupermission`。不要跨环境硬编码 `menuid`。
4. token 可用 `WL_SKILLS_TOKEN` 临时注入，不必落盘。

### 后端说模块已存在，但所有查询都看不到

工具会返回：

```json
{
  "failure": {
    "code": "DICT_MODULE_HIDDEN_CONFLICT"
  }
}
```

这通常是软删除、跨租户或历史残留占用。不要反复重试，也不要猜 `moduleId`。选择一种处理方式：

- 使用业务上明确且全局唯一的新 `module.code`，并同步模块 `dicts.ts` 与所有页面 `api.md`；
- 或由管理员清理不可见历史记录，再重新预览。

无论哪种方式，字典编码和值都不得为了规避模块冲突而擅自改变。
