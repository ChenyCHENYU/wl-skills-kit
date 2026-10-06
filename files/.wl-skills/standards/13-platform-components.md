# 13 — 平台组件合规规范（核心 AI 质量门控）

> 平台组件优先，存量有效实现兼容。组件选择和类/组合函数差异只建议改进，契约错误、无效代码及复杂度问题继续阻断。

---

## 总原则

> **优先复用平台封装组件；有效的原生组件实现可保留；
> 跨 3+ 页面相同 `el-*` 模式 → convention-audit 输出"组件提取建议"到 `reports/`，由人工评审决定是否封装。**

---

## 组件选择建议

| 场景                | 优先复用                          | 替代方案                     |
| ------------------- | --------------------------------------------- | ---------------------------- |
| 查询栏              | `BaseQuery`                                   | 可保留：el-form 手写查询区        |
| 工具栏 / 操作按钮行 | `BaseToolbar`                                 | 可保留：自定义按钮排列            |
| 列表 / 表格         | `BaseTable` (`render-type="agGrid"`)          | 可保留：el-table                  |
| 表单弹窗            | `c_formModal`                                 | 可保留：el-dialog + el-form 手写  |
| 列表选择弹窗        | `c_listModal`                                 | 可保留：el-dialog + el-table 手写 |
| 表单内容分区        | `c_formSections`                              | 可保留：裸分组                    |
| 分割标题            | `c_spliterTitle`                              | 可保留：el-divider                |
| 复杂路由表单页      | FORM-ROUTE 模板                               | 可保留：完全手写                  |
| 日期 / 日期范围     | `jh-date` / `jh-date-range`                   | 可保留：el-date-picker            |
| 文件上传            | `jh-file-upload`                              | 可保留：el-upload                 |
| 用户选择            | `jh-user-picker`                              | 可保留：自定义弹窗选人            |
| 部门选择            | `jh-dept-picker`                              | 可保留：同上                      |
| 下拉 / 选择器       | `jh-select` / `jh-picker`                     | 可保留：el-select 手写 options    |
| 只读文本展示        | `jh-text`                                     | 可保留：span/div 直接渲染         |
| 分页                | `jh-pagination`                               | 可保留：el-pagination             |
| 上下分栏            | `jh-drag-row` (#top/#bottom)                  | 可保留：手动 flex/grid          |
| 左右分割            | `jh-drag-col` (#left/#right)                  | 可保留：el-aside + el-main 手写 flex |
| 树形面板            | `C_Tree`                                      | 可保留：el-tree 手写              |
| 状态标签            | `C_TagStatus`                                 | 可保留：el-tag + 颜色映射         |
| HTTP 请求           | `getAction/postAction/putAction/deleteAction` | 可保留：axios / fetch 直接调用    |

> **📋 完整组件列表（35 个）+ 在线 API 查询**：见 `.wl-skills/docs/component-online-index.md`。
> 需要未列入上表的组件 API（如 `jh-input` / `jh-radio-group` / `jh-dialog` / `jh-drawer` / `jh-cascader` / `jh-switch` 等）时，webfetch 在线文档获取权威用法。最终以 `common-core/lib/*.d.ts` 类型声明为准。

---

## 组件在 template 中的书写顺序

当页面同时存在多个区块时，**有则按下列顺序排列**（**全部可选，不强制必须存在**）：

```
BaseQuery → BaseToolbar → BaseTable → jh-pagination
```

✅ 仅有 BaseTable 的页面：直接写 BaseTable，没问题
✅ 仅 BaseQuery + BaseToolbar 的录入型页面：按此顺序，后接表单区即可
可保留：顺序颠倒：BaseToolbar 写在 BaseQuery 之前

---

## .wl-skills/docs/ 文档前置读取清单

生成涉及以下场景的代码时，AI 必须先读取对应文档（按需，不全读）：

| 涉及组件 / 模式             | 必读文档                                      |
| --------------------------- | --------------------------------------------- |
| `jh-date` / `jh-date-range` | `.wl-skills/docs/jh-date.md` / `.wl-skills/docs/jh-date-range.md`   |
| `jh-file-upload`            | `.wl-skills/docs/jh-file-upload.md`                      |
| `jh-user-picker`            | `.wl-skills/docs/jh-user-picker.md`                      |
| `jh-dept-picker`            | `.wl-skills/docs/jh-dept-picker.md`                      |
| `jh-select`                 | `.wl-skills/docs/jh-select.md`                           |
| `jh-picker`                 | `.wl-skills/docs/jh-picker.md`                           |
| `jh-text`                   | `.wl-skills/docs/jh-text.md`                             |
| `jh-pagination`             | `.wl-skills/docs/jh-pagination.md`                       |
| `jh-drag-row`               | `.wl-skills/docs/jh-drag-row.md`                         |
| HTTP 请求方式               | `.wl-skills/docs/request.md`                             |
| 页面 Hook 模式              | `.wl-skills/docs/page-query-hook-best-practices.md`      |
| BaseQuery / BaseTable 等    | `.wl-skills/src/components/remote/{Component}/README.md` |
| c_formModal / c_listModal   | `.wl-skills/src/components/local/{component}/README.md`  |

> AI 在 Pre-flight 声明中明确列出已读文档。

---

## 页面逻辑组织

新写或重构页面优先选择简洁的组合函数，平铺字段、状态与业务方法。已有 `AbstractPageQueryHook` 可继续使用，以下是兼容示例；不得为通过门禁强制转换类和函数。

```typescript
import { AbstractPageQueryHook } from '@jhlc/common-core/src/page-hooks/page-query-hook.ts'

export function createPage() {
  let Page = new (class extends AbstractPageQueryHook {
    constructor() { super({ url: { list: '...' } }) }
    queryDef() { return [...] }
    toolbarDef() { return [...] }
    columnsDef() { return [...] }
  })()
  return Page.create() as any
}
```

---

## 提取建议触发规则

`convention-audit` 扫描发现 **3+ 个页面**出现相同的未封装 `el-*` 模式时，输出到 `reports/组件提取建议.md`：

```markdown
| 建议组件名    | 出现次数 | 页面路径                        | 菜单位置（来自文件头）  | 模式描述         |
| ------------- | -------- | ------------------------------- | ----------------------- | ---------------- |
| c_statusBadge | 5 处     | src/views/sale/.../index.vue 等 | 销售管理 > 国内贸易订单 | 状态枚举彩色标签 |
| c_priceFormat | 4 处     | ...                             | ...                     | 千分位金额显示   |
```

> 提取前确认复用收益和项目授权；用户已授权整体重构时可直接整理，避免只因出现次数创建新组件。

---

## AI 检查清单（每次代码生成前自查）

- [ ] 查询区优先复用 BaseQuery，现有表单事件与校验保真？
- [ ] 表格优先复用 BaseTable，持久化 CID 稳定且无冲突？
      （现有有效的 el-table 和其他渲染方式兼容，见 standards/12）
- [ ] 弹窗已评估 c_formModal / c_listModal 复用，现有行为有效？
- [ ] 日期组件已评估 jh-date 复用，格式、范围和事件正确？
- [ ] HTTP 请求遵守项目统一封装与已确认的接口契约？
- [ ] data.ts 使用清晰的组合函数或既有 AbstractPageQueryHook，且没有无效封装？
- [ ] 涉及 jh-_ 组件时已读取对应 .wl-skills/docs/jh-_.md？
