# 项目级字典协调

## 目标

项目级协调自动发现当前项目的模块 `dicts.ts`，一次比较当前 `sysAppNo` 的线上数据，并以 `safe-additive` 策略只补缺失项。单模块和全项目共用解析、差异、执行与回查引擎。

## 状态机

```text
bootstrap-required → ready → verified
                         ↘ blocked
                         ↘ stale-plan
                         ↘ partial → 重新预览后幂等重跑
```

| 状态 | 含义 | 是否写入 |
|---|---|---|
| `bootstrap-required` | 未发现标准 `dicts.ts` | 否 |
| `ready` | 预检通过，等待确认 | 否 |
| `blocked` | 本地错误、线上冲突或漂移 | 否 |
| `stale-plan` | 本地或线上在预览后变化 | 否 |
| `partial` | 多请求执行中断，报告已完成项 | 可能部分新增 |
| `verified` | 执行完成并通过项目级回查 | 是 |

## 自动发现边界

- 默认扫描 `src/views/**/dicts.ts`。
- 仅扫描当前 `WL_PROJECT_ROOT`；`searchRoot` 必须位于项目内。
- 忽略 `.git/.wl-skills/node_modules/dist/coverage/target` 和符号链接目录。
- 文件数量安全上限为 500；超过时阻断并要求缩小范围。
- 每个文件必须是静态 `MODULE_DICTIONARIES`，禁止执行项目代码。

## 差异语义

| 差异 | 处理 |
|---|---|
| 完全一致 | 跳过 |
| 缺少模块/字典/明细 | 计划新增 |
| 模块或字典名称不同 | 阻断 |
| 排序字段或方向不同 | 阻断，不自动更新 |
| 同 value 不同 label/扩展字段 | 阻断 |
| 同 label 不同 value | 阻断 |
| 线上存在本地未声明明细 | 警告，不删除 |
| 字典跨模块重复归属 | 阻断 |

比较明细时包含 `strKey/strValue/strValue2/strValue3/strValue4/strValueCode`，不是只比较显示名称。

## 旧项目引导

`wls_dict_bootstrap` 是本地标准化工具，不访问后端：

1. 查找页面 `api.md` 中的 `dict-contract`。
2. 按模块聚合并检测编码和定义冲突。
3. 预览目标 `dicts.ts` 和 `planHash`。
4. 确认后只创建缺失文件，绝不覆盖已有文件。
5. 只有 `logicValue/useDictOpts` 而没有枚举资料时，仅返回引用清单。

需求资料不完整时，先使用 `business-doc-extract` / `api-contract` 补齐页面契约。代码引用不是字典定义，不能直接转成线上数据。

兼容矩阵：

| 本地现状 | 结果 |
|---|---|
| 有 `dicts.ts`，有或没有 `api.md` | 可预览；有 `api.md dict-contract` 时额外通过 D1 验证来源闭环 |
| 无 `dicts.ts`，有 `api.md dict-contract` | bootstrap 可预览并创建本地契约 |
| 无 `dicts.ts`，普通 `api.md` 无结构化字典 | 返回 `needs-contracts` 和代码引用候选，零文件/零线上写入 |
| 无 `dicts.ts`，也无 `api.md` | 扫描 `logicValue/useDictOpts` 辅助盘点；必须先从需求补齐定义 |

`api.md` 不是 MCP 在线发布的硬依赖；`dicts.ts` 才是唯一发布输入。但缺少 `api.md` 时无法证明字典来源，适合存量项目迁移，不应成为新页面的常态。

## 非事务说明

现有后端使用模块、字典、明细多个独立接口，没有项目级事务。执行前通过全量预检和 `planHash` 降低漂移风险；执行中断时不删除已成功数据，而是报告 `completed`，重新预览后幂等补齐。
