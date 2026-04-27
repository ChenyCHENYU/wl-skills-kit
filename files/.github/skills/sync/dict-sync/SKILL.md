---
name: dict-sync
description: "Use when: syncing data dictionary entries to the backend, pulling the current online dictionary baseline, or checking which dictionaries used in data.ts are missing from the system. Triggers on: 同步字典, 创建字典, 刷新字典基线, 字典对比, 字典审计, dict sync, create dict."
---

# Skill: 字典同步（dict-sync）

将 `data.ts` 中引用的数据字典（`logicType: BusLogicDataType.dict`）同步到后端字典表，保持本地基线与线上一致。

> **与 menu-sync 的关系**：机制完全对称——同样读取本地基线报告 → 与线上对比 → 补齐差异。
> 配置直接复用 `menu-sync/env/env.local.json`，无需重复填写。

---

## ⚠️ 激活前请确认 3 个 API 端点

在开始使用本 Skill 前，请与后端团队核实以下 3 个接口路径，并将正确路径填入本文件对应位置（搜索 `TODO_CONFIRM`）：

| # | 用途 | 草稿路径（待确认） | 确认方式 |
|---|------|--------------------|---------|
| 1 | 查询全量字典列表（去重用） | `GET /system/dict/list` | DevTools → 进入"数据字典"列表页 → 查看 Network |
| 2 | 创建/更新单个字典码 | `POST /system/dict/save` | DevTools → 新增一条字典 → 查看 Request URL + Body |
| 3 | 批量保存字典项（value/label） | `POST /system/dictItem/save` | DevTools → 为字典添加项 → 查看 Request URL + Body |

确认完成后，删除此区块即可正式使用。

---

## 配置（复用 menu-sync，无需重复填写）

本 Skill 读取顺序：

1. 优先读取 `skills/sync/dict-sync/env/env.local.json`（如存在）
2. 回落到 `skills/sync/menu-sync/env/env.local.json`（_inherit 机制）

**绝大多数情况下无需单独创建字典配置**——menu-sync 配置的 `gatewayPath`、`token`、`sysAppNo` 完全共用。

仅当字典接口需要独立 token 或不同网关时，才在 `dict-sync/env/env.local.json` 单独配置：

```json
{
  "gatewayPath": "http://网关地址:端口",
  "sysAppNo": "应用编码",
  "token": "Bearer Token（不含 bearer 前缀）"
}
```

---

## Pre-flight 声明（执行前必须输出）

```
🚀 已触发技能 dict-sync/SKILL.md → 字典同步
✅ 已读取 menu-sync/env/env.local.json  → 网关地址、token、sysAppNo
✅ 已读取 reports/SYS_DICT_INFO.md       → 本地字典基线
✅ 操作模式：{pull / push / audit}
✅ 目标字典码：{用户指定 / 从 data.ts 扫描到的字典码列表}
```

---

## SYS_DICT_INFO.md — 本地基线格式

路径：`.github/reports/SYS_DICT_INFO.md`

写入规范（每次 pull 后覆盖更新，push 后追加）：

```markdown
## {DICT_CODE}（{字典中文名}）

| 值（value） | 显示名称（label） | 排序 | 备注 |
| ---------- | ---------------- | ---- | ---- |
| 0          | 草稿             | 1    |      |
| 1          | 待审核           | 2    |      |
| 2          | 审核通过         | 3    |      |
| 3          | 已驳回           | 4    |      |
```

**字典码命名规范**（来自项目 data.ts 分析）：

| 风格 | 正确 ✅ | 错误 ❌ |
|------|---------|---------|
| 全大写+下划线 | `ORDER_STATUS` / `SALES_COMPANY` | `orderStatus` / `salesCompany` |

---

## 三种工作模式

### pull — 刷新本地基线

**触发词**：`刷新字典基线` / `拉字典`

```
1. 调用 GET {TODO_CONFIRM: /system/dict/list?size=500} → 获取全量字典
2. 整理为 SYS_DICT_INFO.md 格式
3. 覆盖写入 reports/SYS_DICT_INFO.md
4. 输出：共拉取 N 个字典码，M 个字典项
```

**接口调用**：
```
GET {gatewayPath}/system/dict/list?current=1&size=500       ← TODO_CONFIRM 路径
Headers:
  authorization: bearer {token}
  Sysappno: {sysAppNo}
```

**响应处理**：取 `data.records`（或 `data.list`，以实际为准），`code === 2000` 为成功。

---

### push — 推送新增字典（核心模式）

**触发词**：`同步字典` / `创建字典` / `补字典`

#### Step 1：扫描当前 data.ts 中的字典引用

从用户指定范围（单文件 / 整个 src/views/）扫描所有：
```typescript
logicType: BusLogicDataType.dict, logicValue: "DICT_CODE"
```
收集所有 `logicValue` 值，去重后得到「当前用到的字典码集合」。

#### Step 2：与本地基线对比

读取 `reports/SYS_DICT_INFO.md`，找出「未在基线中的字典码」（即需要新建的字典）。

> 若本地基线为空或过期，提示用户先执行 `pull` 模式拉取基线。

#### Step 3：Pre-flight 输出待新建清单

在执行任何 API 调用前，输出：

```
📋 待同步字典清单：
  新建字典码：ORDER_STATUS（订单状态）— 含 4 个字典项
  新建字典码：SALES_COMPANY（销售公司）— 含 3 个字典项
  跳过（已在基线中）：PRODUCT_SEGMENT

确认执行？(yes/no)
```

等待用户确认后再执行。

#### Step 4：逐条创建字典码

```
POST {gatewayPath}/system/dict/save      ← TODO_CONFIRM 路径
Headers:
  authorization: bearer {token}
  Sysappno: {sysAppNo}
  Content-Type: application/json

Body（待确认字段名）:
{
  "dictCode": "ORDER_STATUS",
  "dictName": "订单状态",
  "remark": ""
}
```

#### Step 5：批量写入字典项

```
POST {gatewayPath}/system/dictItem/save  ← TODO_CONFIRM 路径
Headers:
  authorization: bearer {token}
  Sysappno: {sysAppNo}
  Content-Type: application/json

Body（待确认字段名，按实际接口响应调整）:
{
  "dictCode": "ORDER_STATUS",
  "items": [
    { "dictItemValue": "0", "dictItemLabel": "草稿",   "sortNo": 1 },
    { "dictItemValue": "1", "dictItemLabel": "待审核", "sortNo": 2 }
  ]
}
```

#### Step 6：输出结果表

| 字典码 | 字典名称 | 字典项数 | 状态 |
|--------|---------|---------|------|
| ORDER_STATUS | 订单状态 | 4 | ✅ created |
| SALES_COMPANY | 销售公司 | 3 | ✅ created |
| PRODUCT_SEGMENT | 产品板块 | 5 | ⏭️ skipped（已存在） |

执行完成后，将新建字典追加写入 `reports/SYS_DICT_INFO.md`。

---

### audit — 仅检查，不调接口

**触发词**：`字典审计` / `检查字典`

```
1. 扫描指定范围的 data.ts，收集所有 logicValue 字典码
2. 与 SYS_DICT_INFO.md 基线对比
3. 输出三个清单：
   ✅ 已在基线中（无需操作）
   ⚠️ 在 data.ts 中使用但不在基线中（建议执行 push）
   💤 在基线中但未被任何 data.ts 使用（可能已废弃）
4. 不调用任何接口
```

---

## 冲突处理原则

| 场景 | 策略 |
|------|------|
| 本地新增字典，线上不存在 | 调接口创建 |
| 字典码已存在，字典名不同 | 询问用户：以本地为准（更新）/ 保留线上 / 跳过 |
| 字典项 value 相同，label 不同 | 询问用户：以本地为准 / 以线上为准 / 跳过 |
| 线上存在，本地无记录 | 仅在 audit 中报告，**绝不主动删除** |

---

## 与其他 Skill 联动

| Skill | 联动方式 |
|-------|---------|
| **page-codegen** | 生成 data.ts 时，如发现 `logicValue` 字典码不在基线中，报告末尾追加"⚠️ 建议运行 dict-sync 补齐以下字典" |
| **convention-audit** | 审计 12 号规范时，可调用 dict-sync audit 模式，将"字典码未在基线中"列为 🟡 偏差 |
| **menu-sync** | 共享 env.local.json 配置，无需重复填写 |
