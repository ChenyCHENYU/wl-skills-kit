---
name: dict-sync
description: "Use when: syncing data dictionary entries to the backend, pulling the current online dictionary baseline, or checking which dictionaries used in data.ts are missing from the system. Triggers on: 同步字典, 创建字典, 刷新字典基线, 字典对比, 字典审计, dict sync, create dict."
---

# Skill: 字典同步（dict-sync）

将 `data.ts` 中引用的数据字典（`logicType: BusLogicDataType.dict, logicValue: "DICT_CODE"`）同步到后端字典表，保持本地基线与线上一致。

> **与 menu-sync 的关系**：机制完全对称——同样读取本地基线报告 → 与线上对比 → 补齐差异。  
> 配置直接复用 `skills/sync/env.local.json` 统一配置文件，无需重复填写。

---

## 配置（统一配置文件，无需重复填写）

读取 `.github/skills/sync/env.local.json`（已在 .gitignore，不入 git）：

```json
{
  "gatewayPath": "http://192.168.10.50:9000",
  "sysAppNo": "QjQuXy1kbKxZyjhS5N2",
  "token": "eyJhbGci...",
  "dict": {
    "moduleId": "7C909G0U2F8HI7E305LV0135LSJ3UBIO"
  }
}
```

`moduleId` 获取方式：进入低代码平台「数据字典」模块 → 新增一条字典 → DevTools Network → 查找 `moduleId` 字段值。

**向下兼容**：如上述文件不存在，回落到 `skills/sync/menu-sync/env/env.local.json`（老版本路径）。

---

## Pre-flight 声明（执行前必须输出）

```
🚀 已触发技能 dict-sync/SKILL.md → 字典同步
✅ 已读取 skills/sync/env.local.json   → 网关地址、token、sysAppNo、dict.moduleId
✅ 已读取 reports/SYS_DICT_INFO.md     → 本地字典基线
✅ 操作模式：{pull / push / audit}
✅ 目标字典码：{用户指定 / 从 data.ts 扫描到的字典码列表}
```

---

## API 调用规范

所有接口使用以下 Headers：

```
Authorization: Bearer {token}
Sysappno: {sysAppNo}
Content-Type: application/json
```

**成功判断**：`response.code === 2000`  
**Token 失效**：`code === 401` 或 `code` 不在 `[200, 2000]` 且 message 含 "token" → 停止执行，提示用户更新 token。

---

## 三种工作模式

### pull — 刷新本地基线

**触发词**：`刷新字典基线` / `拉字典`

```
调用 GET {gatewayPath}/system/business/dict/getDictionaryTreeData
→ 解析 data.data.dictionary.children（递归，无 children 的节点为字典叶节点）
→ 整理为 SYS_DICT_INFO.md 格式覆盖写入
→ 输出：共拉取 N 个字典码，M 个字典项
```

**接口**：
```
GET {gatewayPath}/system/business/dict/getDictionaryTreeData
Headers:
  Authorization: Bearer {token}
  Sysappno: {sysAppNo}
```

**响应结构**：
```json
{
  "code": 2000,
  "data": {
    "dictionary": {
      "children": [
        {
          "id": "节点ID",
          "strSn": "字典编码或模块编码",
          "strName": "字典名称",
          "children": [...]
        }
      ]
    }
  }
}
```
叶节点（无 `children`）= 实际字典，取其 `id`（用于后续创建字典项）和 `strSn`。

---

### push — 推送新增字典（核心模式）

**触发词**：`同步字典` / `创建字典` / `补字典`

#### Step 1：扫描 data.ts 中的字典引用

从用户指定范围扫描所有：
```typescript
logicType: BusLogicDataType.dict, logicValue: "DICT_CODE"
```
收集所有 `logicValue` 值去重，得到「当前用到的字典码集合」。

#### Step 2：与本地基线 + 线上对比（去重双保险）

```
① 读取 reports/SYS_DICT_INFO.md → 已知字典码（本地已记录，大概率线上有）
② 调用 getDictionaryTreeData → 当前线上实际存在的字典码（strSn 列表）
③ 待创建 = 用到的字典码 - 线上已有字典码
```

> **多人协同说明**：每人各自的 env.local.json 不入 git，各人用自己的 token。  
> 去重通过 Step ② 线上实时查询保证：A 创建了，B 运行时线上已有，自动跳过，**不会重复创建**。  
> 即使极端并发（两人同一秒执行），后端 `strSn` 字段有唯一约束，第二次创建会返回"已存在"，Skill 将其视为成功跳过。

#### Step 3：Pre-flight 输出清单，等待确认

```
📋 待同步字典清单：
  新建：ORDER_STATUS（订单状态）— 含 4 项
  新建：SALES_COMPANY（销售公司）— 含 3 项
  跳过（线上已有）：PRODUCT_SEGMENT

确认执行？(yes/no)
```

#### Step 4：创建字典码

```
POST {gatewayPath}/system/business/dict/save
Headers: Authorization / Sysappno / Content-Type

Body:
{
  "strSn": "ORDER_STATUS",
  "strName": "订单状态",
  "intIsVisible": 1,
  "intSort": 0,
  "moduleId": "{dict.moduleId}"
}
```

成功后再次调用 `getDictionaryTreeData` 获取新创建字典的 `id`（用于下一步）。

#### Step 5：创建字典项

**逐条**调用（服务端会跳过重复的 strKey）：

```
POST {gatewayPath}/system/dictDtl/save
Headers: Authorization / Sysappno / Content-Type

Body:
{
  "strKey": "1",
  "strValue": "待审核",
  "strSn": "ORDER_STATUS",
  "dictId": "{上一步获取的字典 id}"
}
```

#### Step 6：输出结果表 + 更新基线

| 字典码 | 字典名称 | 字典项数 | 状态 |
|--------|---------|---------|------|
| ORDER_STATUS | 订单状态 | 4 | ✅ created |
| SALES_COMPANY | 销售公司 | 3 | ✅ created |
| PRODUCT_SEGMENT | 产品板块 | - | ⏭️ skipped（线上已有） |

执行完成后，将新建字典追加写入 `reports/SYS_DICT_INFO.md`。

---

### audit — 仅检查，不调接口

**触发词**：`字典审计` / `检查字典`

```
1. 扫描指定范围的 data.ts，收集所有 logicValue 字典码
2. 对比 SYS_DICT_INFO.md 本地基线
3. 输出三类：
   ✅ 已在基线中（无需操作）
   ⚠️ data.ts 中用到但不在基线中（建议执行 push）
   💤 在基线中但未被任何 data.ts 使用（可能已废弃）
4. 不调用任何接口
```

---

## SYS_DICT_INFO.md — 本地基线格式

路径：`.github/reports/SYS_DICT_INFO.md`

```markdown
## ORDER_STATUS（订单状态）

| 值（strKey） | 显示名称（strValue） | 备注 |
| ----------- | ------------------- | ---- |
| 0           | 草稿                |      |
| 1           | 待审核              |      |
| 2           | 审核通过            |      |
```

**字典码命名规范**：全大写 + 下划线，如 `ORDER_STATUS` / `SALES_COMPANY`（来自项目实际 data.ts 用法）。

---

## 与其他 Skill 联动

| Skill | 联动方式 |
|-------|---------|
| **page-codegen** | 生成 data.ts 时，如 `logicValue` 不在基线中，报告末尾提示"建议运行 dict-sync 补齐" |
| **convention-audit** | 可调用 audit 模式，"字典码未在基线"列为 🟡 偏差 |
| **menu-sync** | 共享 `skills/sync/env.local.json`，gatewayPath / token / sysAppNo 同一份配置 |


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
