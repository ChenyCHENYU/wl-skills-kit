# validate 项目配置（.wl-skills-validate.json）

> **版本**：v2.11.3 引入规则豁免；v2.14.1 增加非页面排除和集中定义语义校验；v2.16.0 增加 Mock 三态策略。
> **零功能影响**：kit 只安装 `.wl-skills-validate.example.json` 示例，不主动创建或覆盖真实配置；不存在时 Mock 默认为按需 `optional`。

---

## 用途

该文件只描述 validate 的项目级、显式例外与扩展：

1. 对表单设计器等特殊场景批量豁免指定规则；
2. 排除放在 `src/views` 下、但不是业务页面的样式或微前端入口；
3. 为 `features.definitionSource` 绑定项目已有的集中定义语义校验脚本。
4. 明确团队的 Mock 策略，避免“无 Mock 即失败”或禁止 Mock 项目被生成器污染。

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
  "mockPolicy": "optional",
  "excludePagePaths": ["src/views/produce/style"],
  "definitionValidators": [
    {
      "source": "src/views/produce/definitions",
      "script": "validate:definitions"
    }
  ],
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
| `mockPolicy` | enum | 否 | `disabled` 不生成/不检查；`optional` 默认按需；`required` 全量阻断 |
| `excludePagePaths` | string[] | 否 | 非业务页面入口的项目相对路径；支持末尾 `/**`，禁止绝对路径和 `..` |
| `definitionValidators` | array | 集中定义建议 | 共享定义源与 `package.json#scripts` 的确定性绑定 |
| `definitionValidators[].source` | string | 是 | 与 page-spec 的 `features.definitionSource` 完全一致 |
| `definitionValidators[].script` | string | 是 | 已存在的安全脚本名，只允许字母、数字、`:`、`_`、`-` |
| `exemptions` | array | 是 | 豁免条目数组 |
| `exemptions[].paths` | string[] | 是 | 页面目录前缀。支持 `/**` glob；命中该目录**及其子目录**下所有页面 |
| `exemptions[].rules` | string[] | 是 | 规则编号（`R3`/`R10` 等），大小写不敏感 |
| `exemptions[].reason` | string | 是 | 审计字段，说明豁免原因，避免滥用 |

### 路径匹配规则

- `src/views/produce/designer` → 命中 `src/views/produce/designer` 及 `src/views/produce/designer/**`
- `src/views/sale/order/**` → 等价于上一行（显式 glob）
- 路径分隔符自动规范化（Windows `\` → `/`），末尾 `/` 被忽略

### 集中定义校验规则

- kit 先确认页面 `data.ts` 确实从 `definitionSource` 导入并导出 `pageDefinition`；
- 同一 `source` 的项目校验脚本在一次 validate 中只执行一次；
- 脚本退出码非 0 时按 error 阻断；
- 脚本不得再次执行 `wl-skills validate`，防止递归；
- 未配置脚本时只报告“委托链已验证、语义尚未闭合”，不得伪报字段不一致；
- 项目校验脚本应逐字段核对显式 `dictCode/logicValue`；未配置时按 D3 提示，`--strict` 阻断，禁止由 kit 按字段名猜测字典；
- 配置只引用项目已经审计的 `package.json#scripts`，不接受任意命令字符串。

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
  "mockPolicy": "disabled",
  "excludePagePaths": [
    "src/views/produce/style"
  ],
  "definitionValidators": [
    {
      "source": "src/views/produce/definitions",
      "script": "validate:definitions"
    }
  ],
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

# 普通模式 error 阻断、warn 提示
wl-skills validate src/views

# CI 严格模式中 error/warn 全部阻断
wl-skills validate src/views --strict
```

> 豁免项升级为主列表页时，必须迁移回 `BaseTable + AGGrid` 并从本文件移除豁免。
> `convention-audit` 审计会列出所有豁免项供人工复核。
