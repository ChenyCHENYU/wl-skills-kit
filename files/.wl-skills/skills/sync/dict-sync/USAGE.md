# dict-sync 使用示例

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
