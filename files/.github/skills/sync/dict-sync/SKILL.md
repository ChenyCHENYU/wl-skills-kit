---
name: dict-sync
description: "Use when: syncing data dictionary entries to the backend, pulling the current online dictionary baseline, or checking which dictionaries used in data.ts are missing from the system. Triggers on: 同步字典, 创建字典, 刷新字典基线, 字典对比, 字典审计, dict sync, create dict."
---

# Skill: 字典同步（dict-sync）

将 `data.ts` 中引用的数据字典（`logicType: BusLogicDataType.dict, logicValue: "DICT_CODE"`）同步到后端字典表，保持本地基线与线上一致。

> **与 menu-sync / permission-sync 对称**：同样读取本地基线 → 与线上对比 → 补齐差异。配置共用 `skills/sync/env.local.json`。

---

## 📖 必读公共护栏

本 Skill 遵守 `../_mcp-guardrail.md`（MCP 调用纪律与自愈闭环）。AI 首次执行 sync 类任务时先 `read_file` 加载它。

本 Skill 使用的 MCP 工具：`wls_dict_query` / `wls_dict_upsert`。调用失败时按 guardrail §2 剧本引导用户完善 `env.local.json` 后重试，**不得用 curl/手拼 HTTP 绕开 MCP**。

---

## 配置（统一配置文件）

读取 `.github/skills/sync/env.local.json`（已在 `.gitignore`，不入 git）：

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

| 字段 | 说明 |
|---|---|
| `gatewayPath` | 后端网关，末尾不加斜杠 |
| `sysAppNo` | 应用编码（非明文） |
| `token` | 纯 JWT，**不含 `bearer ` 前缀**（MCP 内部自动拼接） |
| `dict.moduleId` | 字典所属模块 ID（字典管理后台 Network 抓取） |

> 字段获取方式见同目录 `../menu-sync/env/guide.md`。

---

## Pre-flight 声明（执行前必须输出）

```
🚀 已触发技能 dict-sync/SKILL.md → 字典同步
✅ MCP 工具检查：wls_dict_query / wls_dict_upsert 均可用
✅ 已读取 .github/skills/sync/env.local.json → 网关 + token + sysAppNo + dict.moduleId
✅ 已读取 .github/reports/SYS_DICT_INFO.md   → 本地字典基线
✅ 操作模式：{pull / push / audit}
✅ 目标字典码：{用户指定 / data.ts 扫描结果}
```

> Pre-flight 任一项失败（特别是 MCP 工具检查），立即停止并向用户报告，**不得**降级为手动调接口。

---

## 三种工作模式

### pull — 刷新本地基线

**触发词**：`刷新字典基线` / `拉字典`

**执行**：
1. 调用 MCP 工具 `wls_dict_query`（无参）
2. 工具返回当前应用域全部字典模块 + 字典项树
3. AI 解析返回结果，整理为 SYS_DICT_INFO.md 格式覆盖写入
4. 输出："共拉取 N 个字典码，M 个字典项"

> MCP 内部对应 `GET /system/business/dict/getDictionaryTreeData`，AI **无需关心**。

---

### push — 推送新增字典（核心模式）

**触发词**：`同步字典` / `创建字典` / `补字典`

#### Step 1：扫描 data.ts 中的字典引用

从用户指定范围扫描所有：

```typescript
logicType: BusLogicDataType.dict, logicValue: "DICT_CODE"
```

去重得到「当前用到的字典码集合」。

#### Step 2：与本地基线 + 线上对比（去重双保险）

```
① 读取 reports/SYS_DICT_INFO.md → 本地已知字典码
② 调用 wls_dict_query           → 线上当前字典码（strSn 列表）
③ 待创建 = 用到的字典码 - 线上已有字典码
```

> **多人协同**：每人 env.local.json 不入 git。去重通过 ② 线上实时查询保证；后端 `strSn` 字段有唯一约束，并发场景下第二次创建会被服务端跳过，Skill 视为成功。

#### Step 3：Pre-flight 输出待新建清单，等待确认

```
📋 待同步字典清单：
  新建：ORDER_STATUS（订单状态）— 含 4 项
  新建：SALES_COMPANY（销售公司）— 含 3 项
  跳过（线上已有）：PRODUCT_SEGMENT
确认执行？(yes/no)
```

#### Step 4：批量创建字典码 + 字典项

调用 MCP 工具 `wls_dict_upsert`（**逐个字典模块**调一次）：

```jsonc
// MCP 工具入参
{
  "module": {
    "strSn": "ORDER_STATUS",
    "strName": "订单状态",
    "sortPriority": "1",
    "strLevel": 2
  },
  "items": [
    { "strSn": "0", "strName": "草稿",   "strLevel": 2 },
    { "strSn": "1", "strName": "待审核", "strLevel": 2 },
    { "strSn": "2", "strName": "已通过", "strLevel": 2 },
    { "strSn": "3", "strName": "已驳回", "strLevel": 2 }
  ]
}
```

> 工具内部：模块不存在则创建并自动 re-query 取 id；字典项按 strSn 自动跳过已存在项。AI 无需手动管理 id。

#### Step 5：输出结果表 + 更新基线

| 字典码 | 字典名称 | 字典项数 | 状态 |
|---|---|---|---|
| ORDER_STATUS | 订单状态 | 4 | ✅ created |
| SALES_COMPANY | 销售公司 | 3 | ✅ created |
| PRODUCT_SEGMENT | 产品板块 | - | ⏭️ skipped（线上已有） |

执行完成后，将新建字典追加写入 `.github/reports/SYS_DICT_INFO.md`。

---

### audit — 仅检查，不调写接口

**触发词**：`字典审计` / `检查字典`

```
1. 扫描指定范围的 data.ts，收集所有 logicValue 字典码
2. 调用 wls_dict_query 获取线上现状
3. 对比 SYS_DICT_INFO.md 本地基线
4. 输出三类清单：
   ✅ 已在基线 + 线上（健康）
   ⚠️ data.ts 用到但缺失（建议执行 push）
   💤 在基线但未被任何 data.ts 引用（可能已废弃）
5. 不调用任何写接口
```

---

## SYS_DICT_INFO.md — 本地基线格式

路径：`.github/reports/SYS_DICT_INFO.md`

```markdown
## ORDER_STATUS（订单状态）

| 值（strSn） | 显示名称（strName） | 备注 |
| ---------- | ------------------ | ---- |
| 0          | 草稿               |      |
| 1          | 待审核             |      |
| 2          | 已通过             |      |
| 3          | 已驳回             |      |
```

**字典码命名规范**：全大写 + 下划线，如 `ORDER_STATUS` / `SALES_COMPANY`。

---

## 冲突处理原则

| 场景 | 策略 |
|---|---|
| 本地新增、线上不存在 | 调 `wls_dict_upsert` 创建 |
| 字典码已存在、字典名不同 | 询问用户：以本地为准 / 保留线上 / 跳过 |
| 字典项 strSn 相同、strName 不同 | 询问用户决定（Skill 默认跳过，不覆盖） |
| 线上存在、本地无记录 | 仅在 audit 中报告，**绝不主动删除** |

---

## 与其他 Skill 联动

| Skill | 联动方式 |
|---|---|
| **page-codegen** | 生成 data.ts 时如 `logicValue` 不在基线中，报告末尾提示"建议运行 dict-sync 补齐" |
| **convention-audit** | 调用 audit 模式，"字典码未在基线"列为 🟡 偏差 |
| **menu-sync / permission-sync** | 共享 `skills/sync/env.local.json`，gatewayPath / token / sysAppNo 同一份 |

---

## MCP 不可用或调用失败时怎么办

见 `../_mcp-guardrail.md` §2 自愈闭环剧本。**原则**：先帮用户完善 `env.local.json` 里的 token / dict.moduleId，重试 MCP 工具。**绝不允许** AI 用 curl/PowerShell/fetch 绕开 MCP 手拼 HTTP。
