---
name: convention-audit
description: "Use when: auditing project source code against the established coding conventions in copilot-instructions.md. Scans files and outputs a deviation report with remediation suggestions. Triggers on: audit code, check conventions, 规范审计, 规范检查, 代码审计, 对齐规范, 规范偏差."
---

# Skill: 规范审计（convention-audit）

以 `copilot-instructions.md` 为唯一规范源头，扫描项目源码，找出不符合规范的文件和写法，输出偏差报告及整改建议。

> **核心理念**：规范是"标准"，代码要对齐标准。不从代码提炼规范，而是用规范审计代码。

---

## 适用场景

| 场景 | 说明 |
|------|------|
| 新项目导入 wl-skills-kit 后 | 扫描旧代码，输出整改清单，逐步迁移到标准模式 |
| 日常 Code Review 辅助 | AI 比对单文件或目录，快速发现偏差 |
| 项目迁移/升级 | 老项目引入新架构，批量评估改造量 |
| 团队培训 | 新成员提交代码前，用审计验证是否符合规范 |

---

## 审计维度（10 项）

### 1. 页面结构审计

**标准**：每个页面目录必须包含 4 个文件：
```
[kebab-case目录]/
├── index.vue    ← 纯模板+解构
├── data.ts      ← AbstractPageQueryHook 类 + API_CONFIG
├── index.scss   ← 样式
└── api.md       ← 接口约定
```

**检查项**：
- [ ] 目录名是否 kebab-case
- [ ] 是否缺少 data.ts（逻辑写在 index.vue 里）
- [ ] 是否缺少 api.md
- [ ] 是否存在多余文件（如独立的 api.ts）

### 2. data.ts 模式审计

**标准**：使用 `class extends AbstractPageQueryHook` 配置化开发。

**检查项**：
- [ ] 是否有 `API_CONFIG` 常量（URL 配置集中管理）
- [ ] 是否继承 `AbstractPageQueryHook`
- [ ] 是否通过 `createPage()` 工厂函数导出
- [ ] `queryDef()` / `toolbarDef()` / `columnsDef()` 是否齐全
- [ ] 字典字段是否使用 `logicType: BusLogicDataType.dict`
- [ ] 操作列是否使用 `operations` 配置而非手写 slot

**严重偏差（红灯）**：
- ❌ 直接在 `<script setup>` 中写 `ref()` + `onMounted()` + 手动 fetch
- ❌ 独立 api.ts 文件包含 axios 调用
- ❌ 手动拼装表格列而不用 `columnsDef()`

### 3. index.vue 模式审计

**标准**：纯模板 + createPage 解构，不写业务逻辑。

**检查项**：
- [ ] `<script setup lang="ts">` 是否只有 import + createPage 解构 + onMounted
- [ ] 是否引用了 BaseQuery / BaseToolbar / BaseTable / jh-pagination 四件套
- [ ] 最外层 class 是否为 `app-container app-page-container`
- [ ] 是否有内联业务逻辑（computed、watch、methods 等）

**严重偏差（红灯）**：
- ❌ `<script setup>` 超过 30 行（大概率混入了业务逻辑）
- ❌ 手写 `<el-form>` + `<el-table>` 而非平台组件
- ❌ 直接调用 axios / fetch

### 4. 命名规范审计

| 位置 | 标准 | 检查方式 |
|------|------|---------|
| 路由/目录 | kebab-case | 目录名含大写或下划线 → 偏差 |
| 字段名 | camelCase | data.ts 中 name 属性含下划线 → 偏差 |
| 全局组件 | `C_PascalCase/` | src/components/global/ 下非此格式 → 偏差 |
| 局部组件 | `c_camelCase/` | src/components/local/ 下非此格式 → 偏差 |
| API URL | `/服务缩写/资源名CamelCase/操作` | URL 含下划线或全小写资源名 → 偏差 |

### 5. 组件使用审计

**标准**：优先使用平台组件，禁止手写替代品。

**检查项**：
- [ ] 查询区域是否用 `<BaseQuery>` 而非手写 `<el-form>`
- [ ] 工具栏是否用 `<BaseToolbar>` 而非手写按钮行
- [ ] 表格是否用 `<BaseTable>` 而非裸 `<el-table>`
- [ ] 分页是否用 `<jh-pagination>` 而非 `<el-pagination>`
- [ ] 下拉选择是否用 `<jh-select>` 而非 `<el-select>`
- [ ] 日期选择是否用 `<jh-date>` / `<jh-date-range>` 而非 `<el-date-picker>`
- [ ] 弹窗是否优先使用 `c_formModal` 等公共组件

### 6. API 写法审计

**标准**：使用 `getAction` / `postAction`（@jhlc/common-core），禁止直接用 axios。

**检查项**：
- [ ] 是否 import 了 axios / 自封装的 request
- [ ] 是否使用 `getAction` / `postAction` / `putAction` / `deleteAction`
- [ ] URL 是否集中在 `API_CONFIG` 中（不散落在各处）

### 7. 样式规范审计

**检查项**：
- [ ] 是否使用 `:deep()` 而非 `::v-deep` / `/deep/`
- [ ] 页面样式是否写在 `index.scss` 中（非行内 style）
- [ ] 是否使用 Windi CSS 工具类优先

### 8. 状态管理审计

**检查项**：
- [ ] 是否使用 Pinia 而非 Vuex
- [ ] Store 是否从主应用远程加载（微前端场景）

### 9. 弹窗/组件提取审计

**检查项**：
- [ ] 2+ 页面复用的弹窗是否提取到 `src/components/local/c_xxxModal/`
- [ ] 页面私有弹窗是否只在 c_modal 无法满足时才内联

### 10. 路由导航审计（微前端）

**检查项**：
- [ ] 前进导航是否使用 `location.href`（而非 `router.push()`）
- [ ] 返回是否使用 `useRouter().back()`

---

## 执行步骤

### 第 1 步：确定审计范围

用户可指定：
- **全量审计**："审计整个项目" → 扫描 `src/views/` 全部页面
- **模块审计**："审计 produce/mmwr" → 只扫描该模块目录
- **单页审计**："审计 mmwr-customer-archive 页面" → 只扫描该页面

### 第 2 步：读取规范基线

读取 `.github/copilot-instructions.md` 获取当前项目的编码规范（唯一源头）。

### 第 3 步：扫描源码

按页面目录逐个扫描：
1. 列出目录内所有文件 → 检查结构完整性
2. 读取 `data.ts` → 检查 AbstractPageQueryHook 模式、API_CONFIG、命名等
3. 读取 `index.vue` → 检查模板结构、是否混入业务逻辑
4. 读取 `index.scss` → 检查样式规范
5. 检查 `components/` 子目录 → 评估弹窗提取合理性

### 第 4 步：输出偏差报告

报告格式如下：

```markdown
# 规范审计报告

## 概要

| 指标 | 值 |
|------|----|
| 扫描范围 | src/views/produce/mmwr/ |
| 页面总数 | 12 |
| 合规页面 | 8 |
| 偏差页面 | 4 |
| 严重偏差数 | 3 |
| 轻微偏差数 | 7 |

## 严重偏差（必须整改）

### 🔴 [页面路径] — [偏差类型]

**现状**：[当前代码的写法]
**标准**：[规范要求的写法]
**整改建议**：[具体怎么改]
**影响范围**：[改动涉及哪些文件]

## 轻微偏差（建议整改）

### 🟡 [页面路径] — [偏差类型]

**现状**：...
**标准**：...
**整改建议**：...

## 合规页面（无需改动）

- ✅ mmwr-customer-archive/
- ✅ mmwr-customer-detail/
- ...

## 整改优先级建议

1. 先改严重偏差（结构性问题）
2. 再改轻微偏差（命名/样式等）
3. 新增页面一律使用 page-codegen Skill 自动生成，天然合规
```

### 第 5 步：按需生成整改代码

如果用户要求，可对偏差页面逐个生成整改后的代码。
整改时读取 `page-codegen/SKILL.md` 及对应模板，确保整改后代码完全合规。

---

## 偏差严重度定义

| 级别 | 标记 | 定义 | 示例 |
|------|------|------|------|
| 🔴 严重 | 必须整改 | 架构性违反，影响可维护性和团队协作 | 不用 AbstractPageQueryHook、直接用 axios、index.vue 混入业务逻辑 |
| 🟡 轻微 | 建议整改 | 风格/命名不统一，不影响功能 | 目录名用 camelCase 而非 kebab-case、缺少 api.md |
| ✅ 合规 | 无需改动 | 完全符合规范 | — |

---

## 与其他 Skill 的关系

| Skill | 关系 |
|-------|------|
| **page-codegen** | 审计发现偏差后，可调用 page-codegen 重新生成合规代码 |
| **prototype-scan** | 审计不涉及原型，仅检查已有代码 |
| **api-contract** | 审计可检查 api.md 是否存在但不检查其内容（内容由 api-contract 负责） |

---

## 注意事项

1. **规范是不可协商的** — 偏差报告中不会因为"旧代码一直这么写"就放行，旧代码不合规就是不合规
2. **AI 生成的代码必须合规** — 如果用 page-codegen 等 Skill 生成的代码出现偏差，那是 Skill 模板的 bug，需要反馈修复
3. **规范的演进** — 如果团队决定调整规范，更新 `copilot-instructions.md`（唯一源头），然后重新审计
