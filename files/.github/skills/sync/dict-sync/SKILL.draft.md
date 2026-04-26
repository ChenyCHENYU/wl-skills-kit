---
name: dict-sync
description: "[PLANNED — DRAFT, not yet active] 字典同步 Skill 设计草稿。机制类同 menu-sync：基于 reports/SYS_DICT_INFO.md 基线 ↔ 线上字典对比，自动补齐。"
status: planned
---

# Skill: 字典同步（dict-sync）— 草稿

> ⚠️ **本文件为设计草稿（SKILL.draft.md），未启用，不参与 AI 调度。**
> 待相关后端接口稳定后，转正为 `SKILL.md`。

---

## 1. 设计目标

页面 `data.ts` 中常使用 `logicType: BusLogicDataType.dict` 引用数据字典（如 `customer_state`、`mmwr_apply_status`）。新增页面/字段时，需要：

1. 在系统字典表中**添加新字典码**（dictCode + 描述）
2. 在字典表中**添加各项条目**（value + label + sortNo）
3. 团队基线中保存当前线上字典（review/diff 用）

`dict-sync` 自动化以上 3 步。

---

## 2. 数据流

```
本地基线                                后端接口                            Skill 触发
─────────────────────────────────────  ─────────────────────────────────  ────────────────
reports/SYS_DICT_INFO.md  ──fetch───→  GET  /sys/dict/listAll
                          ←──compare───  POST /sys/dict/save
                          ──upload───→  POST /sys/dictItem/batchSave    ─→  "同步字典"
```

---

## 3. 三种工作模式

| 模式              | 触发                  | 动作                                      |
| ----------------- | --------------------- | ----------------------------------------- |
| `pull`（刷基线）  | "刷新字典基线"        | 从线上拉全量字典 → 写入 SYS_DICT_INFO.md  |
| `push`（推新增）  | "同步字典 / 创建字典" | 对比 data.ts 引用的字典 vs 基线，补齐线上 |
| `audit`（仅检查） | "字典审计"            | 输出报告，不调接口                        |

---

## 4. 配置文件

`.github/skills/sync/dict-sync/env/env.local.json`（不入 git）：

```json
{
  "gatewayPath": "https://uat-api.example.com",
  "token": "Bearer xxx",
  "tenantId": "10001",
  "_inherit": "复用 skills/sync/menu-sync/env/env.local.json 的 token、gatewayPath 等基础配置"
}
```

> 实现时支持 `_inherit`：本目录无 env.local.json 时回落到 menu-sync 的同名文件。

---

## 5. 冲突处理策略

| 场景                             | 策略                                         |
| -------------------------------- | -------------------------------------------- |
| 本地新增字典，线上不存在         | 调用 /sys/dict/save 创建                     |
| 本地有的字典项，线上字典已禁用   | 询问：跳过 / 重新启用 / 视为新建             |
| 本地与线上 value 相同 label 不同 | 询问：以本地为准 / 以线上为准 / 跳过         |
| 线上有的字典/项，本地没有        | 仅记录日志，**不主动删除**（防误删生产数据） |

---

## 6. 与其他 Skill 联动

- **page-codegen**：生成页面时如发现 data.ts 用到未在基线中的字典码，自动在生成报告中提示"运行 dict-sync 补齐"
- **convention-audit**：审计 standards/data-ts.md 时，对比基线检测"字典码未定义"
- **prototype-scan**：扫描原型阶段如识别出状态/枚举字段，提出字典码建议

---

## 7. 转正前的开发任务

- [ ] 确认后端字典批量保存接口（save / batchSave / 字段名 / 响应外壳是否 `{code:2000,data}`）
- [ ] 设计 SYS_DICT_INFO.md 自动序列化/反序列化（防 markdown 渲染破坏数据）
- [ ] 实现 `_inherit` 配置回落机制
- [ ] 决定字典审计严格度（必须有 enabled / sortNo / remark 等字段）
- [ ] 提供 `dict-collect` Skill 或集成到 prototype-scan：从代码自动汇总字典依赖
- [ ] 处理多语言字典（i18n label）
- [ ] PROD 环境保护机制（推送前必须二次确认）

---

## 8. 风险与边界

- **不删除**：永远不主动删除线上字典/字典项
- **租户隔离**：env.local.json 的 tenantId 严格隔离
- **审计日志**：每次 push 输出 `reports/DICT_SYNC_<YYYYMMDD>.md`，含调用接口列表 + 入参 + 响应 + 回滚 SQL
