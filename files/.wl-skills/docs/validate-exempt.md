# validate 豁免配置（.wl-skills-validate.json）

> **版本**：v2.11.3+ 引入。对应执行器 `loadExemptions`（`lib/ast-rules.js`）。
> **零功能影响**：kit 不主动创建该文件；不存在时 validate 行为完全不变。

---

## 用途

对"标准列表页强制 `BaseTable + AGGrid`"等规则，**批量豁免特殊场景目录**：
表单设计器内嵌表格、行内编辑明细表等 BaseTable 受限的场景。

与单文件注释豁免（`<!-- wl-skills:ignore R3 -->`）互补：

| 机制 | 粒度 | 适用 |
|---|---|---|
| 单文件注释 | 精确到单个文件 | 个别特殊页面 |
| 项目级配置（本文件） | 批量到目录前缀 | 整片特殊场景（设计器/编辑器域） |

---

## 文件位置

业务项目**根目录**（与 `.wl-skills-manifest.json` 同级）：

```
你的业务项目/
├── .wl-skills-validate.json   ← 本文件（可选，按需创建）
├── .wl-skills-manifest.json
└── src/
```

---

## Schema

```json
{
  "exemptions": [
    {
      "paths": ["<页面目录前缀，支持 /**>"],
      "rules": ["<规则编号，如 R3 R10，大小写不敏感>"],
      "reason": "<必填，审计用途，说明为何豁免>"
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `exemptions` | array | 是 | 豁免条目数组 |
| `exemptions[].paths` | string[] | 是 | 页面目录前缀。支持 `/**` glob；命中该目录**及其子目录**下所有页面 |
| `exemptions[].rules` | string[] | 是 | 规则编号（`R3`/`R10` 等），大小写不敏感 |
| `exemptions[].reason` | string | 是 | 审计字段，说明豁免原因，避免滥用 |

### 路径匹配规则

- `src/views/produce/designer` → 命中 `src/views/produce/designer` 及 `src/views/produce/designer/**`
- `src/views/sale/order/**` → 等价于上一行（显式 glob）
- 路径分隔符自动规范化（Windows `\` → `/`），末尾 `/` 被忽略

---

## 当前可豁免规则

| 规则 | 检测内容 | 典型豁免场景 |
|---|---|---|
| `R3` | el-table 未用 BaseTable | 表单设计器内嵌表格、行内编辑明细表 |
| `R10` | el-form/el-select 等原生组件未用平台封装 | 设计器/自定义编辑器内部 |

> 其他规则（R1/R2/R4~R9/R11~R14）原则上不豁免；确有需要时用单文件注释豁免。

---

## 完整示例

```json
{
  "exemptions": [
    {
      "paths": ["src/views/produce/designer"],
      "rules": ["R3", "R10"],
      "reason": "表单设计器内嵌表格 + 自定义编辑器，BaseTable AGGrid 内联编辑受限"
    },
    {
      "paths": ["src/views/sale/order-edit/**"],
      "rules": ["R3"],
      "reason": "订单行内编辑明细表，AGGrid 行编辑成本高于收益"
    },
    {
      "paths": ["src/components/business/rich-table"],
      "rules": ["R3"],
      "reason": "复杂合并单元格/自定义行列布局，AGGrid 不易实现"
    }
  ]
}
```

---

## 验证

```bash
# 跑 validate，命中豁免的页面不再报对应规则
wl-skills validate src/views

# 豁免配置格式错误时，validate 输出 warn 提示（不阻断），行为退化为无豁免
```

> 豁免项升级为主列表页时，必须迁移回 `BaseTable + AGGrid` 并从本文件移除豁免。
> `convention-audit` 审计会列出所有豁免项供人工复核。
