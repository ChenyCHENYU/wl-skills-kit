# 系统菜单配置 — 客户档案模块（produce / production-mmwr / aiflow）

> 对应系统管理 → 菜单管理 → 新增菜单，每栏直接复制粘贴。
> **操作顺序：先建目录（第 0 步），再逐个添加菜单（第 1-5 步）。**
>
> **pages.ts 注册位置**：`vite/plugins/shared/pages.ts` → `steelPerformanceSubModule` → `aiflow`
>
> **命名规范**：
>
> | 字段     | 规则                                                        | 示例                                                             |
> | -------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
> | 菜单路径 | 页面 kebab-name 转 camelCase                                | `mmwr-customer-archive` → `mmwrCustomerArchive`                  |
> | 组件路径 | `produce/production-mmwr/aiflow/{页面kebab-name}/index.vue` | `produce/production-mmwr/aiflow/mmwr-customer-archive/index.vue` |
> | 权限标识 | 与菜单路径一致（camelCase）                                 | `mmwrCustomerArchive`                                            |
> | 应用选择 | 生产                                                        |                                                                  |

---

## 第 0 步：新建目录

> Tab 选 **目录**

| 字段     | 值                                 |
| -------- | ---------------------------------- |
| 上级目录 | `生产棒线材`（按实际上级目录选择） |
| 菜单名称 | `客户档案管理`                     |
| 显示排序 | `6`                                |

---

## 第 1 步：客户档案

> Tab 选 **菜单**

| 字段         | 值                                                               |
| ------------ | ---------------------------------------------------------------- |
| 上级目录     | `客户档案管理`                                                   |
| 应用选择     | `生产`                                                           |
| 使用缓存     | ◉ 使用                                                           |
| 显示排序     | `1`                                                              |
| 菜单路径     | `mmwrCustomerArchive`                                            |
| 菜单名称     | `客户档案`                                                       |
| 名称编码后缀 | `kehudangan`                                                     |
| 组件路径     | `produce/production-mmwr/aiflow/mmwr-customer-archive/index.vue` |
| 权限标识     | `mmwrCustomerArchive`                                            |
| 是否隐藏     | 否                                                               |

> pages.ts 对应：`["mmwr-customer-archive", "客户档案"]`

---

## 第 2 步：临时客户档案

> Tab 选 **菜单**

| 字段         | 值                                                                    |
| ------------ | --------------------------------------------------------------------- |
| 上级目录     | `客户档案管理`                                                        |
| 应用选择     | `生产`                                                                |
| 使用缓存     | ◉ 使用                                                                |
| 显示排序     | `2`                                                                   |
| 菜单路径     | `mmwrTempCustomerArchive`                                             |
| 菜单名称     | `临时客户档案`                                                        |
| 名称编码后缀 | `linshikehudangan`                                                    |
| 组件路径     | `produce/production-mmwr/aiflow/mmwr-temp-customer-archive/index.vue` |
| 权限标识     | `mmwrTempCustomerArchive`                                             |
| 是否隐藏     | 否                                                                    |

> pages.ts 对应：`["mmwr-temp-customer-archive", "临时客户档案"]`

---

## 第 3 步：客户申请新增

> Tab 选 **菜单**

| 字段         | 值                                                                 |
| ------------ | ------------------------------------------------------------------ |
| 上级目录     | `客户档案管理`                                                     |
| 应用选择     | `生产`                                                             |
| 使用缓存     | ◉ 使用                                                             |
| 显示排序     | `3`                                                                |
| 菜单路径     | `mmwrCustomerApplyAdd`                                             |
| 菜单名称     | `客户申请新增`                                                     |
| 名称编码后缀 | `kehushenqingxinzeng`                                              |
| 组件路径     | `produce/production-mmwr/aiflow/mmwr-customer-apply-add/index.vue` |
| 权限标识     | `mmwrCustomerApplyAdd`                                             |
| 是否隐藏     | 否                                                                 |

> pages.ts 对应：`["mmwr-customer-apply-add", "客户申请新增"]`

---

## 第 4 步：客户申请变更

> Tab 选 **菜单**

| 字段         | 值                                                                    |
| ------------ | --------------------------------------------------------------------- |
| 上级目录     | `客户档案管理`                                                        |
| 应用选择     | `生产`                                                                |
| 使用缓存     | ◉ 使用                                                                |
| 显示排序     | `4`                                                                   |
| 菜单路径     | `mmwrCustomerApplyChange`                                             |
| 菜单名称     | `客户申请变更`                                                        |
| 名称编码后缀 | `kehushenqingbiangeng`                                                |
| 组件路径     | `produce/production-mmwr/aiflow/mmwr-customer-apply-change/index.vue` |
| 权限标识     | `mmwrCustomerApplyChange`                                             |
| 是否隐藏     | 否                                                                    |

> pages.ts 对应：`["mmwr-customer-apply-change", "客户申请变更"]`

---

## 第 5 步：客户详情（隐藏菜单）

> Tab 选 **菜单**

| 字段         | 值                                                              |
| ------------ | --------------------------------------------------------------- |
| 上级目录     | `客户档案管理`                                                  |
| 应用选择     | `生产`                                                          |
| 使用缓存     | ◉ 使用                                                          |
| 显示排序     | `5`                                                             |
| 菜单路径     | `mmwrCustomerDetail`                                            |
| 菜单名称     | `客户详情`                                                      |
| 名称编码后缀 | `kehuxiangqing`                                                 |
| 组件路径     | `produce/production-mmwr/aiflow/mmwr-customer-detail/index.vue` |
| 权限标识     | `mmwrCustomerDetail`                                            |
| 是否隐藏     | **是**                                                          |

> pages.ts 对应：`["mmwr-customer-detail", "客户详情"]`

---

## 第 6 步：客户申请新增表单（隐藏菜单）

> Tab 选 **菜单**

| 字段         | 值                                                                      |
| ------------ | ----------------------------------------------------------------------- |
| 上级目录     | `客户档案管理`                                                          |
| 应用选择     | `生产`                                                                  |
| 使用缓存     | ◉ 使用                                                                  |
| 显示排序     | `6`                                                                     |
| 菜单路径     | `mmwrCustomerApplyAddForm`                                              |
| 菜单名称     | `客户申请新增表单`                                                      |
| 名称编码后缀 | `kehushenqingxinzengbiaodan`                                            |
| 组件路径     | `produce/production-mmwr/aiflow/mmwr-customer-apply-add-form/index.vue` |
| 权限标识     | `mmwrCustomerApplyAddForm`                                              |
| 是否隐藏     | **是**                                                                  |

> pages.ts 对应：`["mmwr-customer-apply-add-form", "客户申请新增表单"]`

---

## 第 7 步：客户申请变更表单（隐藏菜单）

> Tab 选 **菜单**

| 字段         | 值                                                                         |
| ------------ | -------------------------------------------------------------------------- |
| 上级目录     | `客户档案管理`                                                             |
| 应用选择     | `生产`                                                                     |
| 使用缓存     | ◉ 使用                                                                     |
| 显示排序     | `7`                                                                        |
| 菜单路径     | `mmwrCustomerApplyChangeForm`                                              |
| 菜单名称     | `客户申请变更表单`                                                         |
| 名称编码后缀 | `kehushenqingbiangengbiaodan`                                              |
| 组件路径     | `produce/production-mmwr/aiflow/mmwr-customer-apply-change-form/index.vue` |
| 权限标识     | `mmwrCustomerApplyChangeForm`                                              |
| 是否隐藏     | **是**                                                                     |

> pages.ts 对应：`["mmwr-customer-apply-change-form", "客户申请变更表单"]`

---

## 第 8 步：变更历史查询（隐藏菜单）

> Tab 选 **菜单**

| 字段         | 值                                                                                      |
| ------------ | --------------------------------------------------------------------------------------- |
| 上级目录     | `客户档案管理`                                                                          |
| 应用选择     | `生产`                                                                                  |
| 使用缓存     | ◉ 使用                                                                                  |
| 显示排序     | `8`                                                                                     |
| 菜单路径     | `mmwrCustomerApplyChangeHistory`                                                        |
| 菜单名称     | `变更历史查询`                                                                          |
| 名称编码后缀 | `biangenglishipinshi`                                                                   |
| 组件路径     | `produce/production-mmwr/aiflow/mmwr-customer-apply-change-history/index.vue`           |
| 权限标识     | `mmwrCustomerApplyChangeHistory`                                                        |
| 是否隐藏     | **是**                                                                                  |

> pages.ts 对应：`["mmwr-customer-apply-change-history", "变更历史查询"]`
> 入口：客户申请新增表单 / 客户申请变更表单 顶部工具栏「变更历史查询」按钮，传入 `query.id = 当前申请ID`

---

## 汇总对照表

| #   | 菜单名称         | 菜单路径                      | 组件路径（views/下）                                                       | pages.ts 注册名                   | 隐藏   |
| --- | ---------------- | ----------------------------- | -------------------------------------------------------------------------- | --------------------------------- | ------ |
| 1   | 客户档案         | `mmwrCustomerArchive`         | `produce/production-mmwr/aiflow/mmwr-customer-archive/index.vue`           | `mmwr-customer-archive`           | 否     |
| 2   | 临时客户档案     | `mmwrTempCustomerArchive`     | `produce/production-mmwr/aiflow/mmwr-temp-customer-archive/index.vue`      | `mmwr-temp-customer-archive`      | 否     |
| 3   | 客户申请新增     | `mmwrCustomerApplyAdd`        | `produce/production-mmwr/aiflow/mmwr-customer-apply-add/index.vue`         | `mmwr-customer-apply-add`         | 否     |
| 4   | 客户申请变更     | `mmwrCustomerApplyChange`     | `produce/production-mmwr/aiflow/mmwr-customer-apply-change/index.vue`      | `mmwr-customer-apply-change`      | 否     |
| 5   | 客户详情         | `mmwrCustomerDetail`          | `produce/production-mmwr/aiflow/mmwr-customer-detail/index.vue`            | `mmwr-customer-detail`            | **是** |
| 6   | 客户申请新增表单 | `mmwrCustomerApplyAddForm`    | `produce/production-mmwr/aiflow/mmwr-customer-apply-add-form/index.vue`    | `mmwr-customer-apply-add-form`    | **是** |
| 7   | 客户申请变更表单 | `mmwrCustomerApplyChangeForm` | `produce/production-mmwr/aiflow/mmwr-customer-apply-change-form/index.vue` | `mmwr-customer-apply-change-form` | **是** |
| 8   | 变更历史查询     | `mmwrCustomerApplyChangeHistory` | `produce/production-mmwr/aiflow/mmwr-customer-apply-change-history/index.vue` | `mmwr-customer-apply-change-history` | **是** |

---

## pages.ts 对应关系

```typescript
// 生产棒线材 → 客户档案子模块
aiflow: [
  ["mmwr-customer-archive", "客户档案"],
  ["mmwr-temp-customer-archive", "临时客户档案"],
  ["mmwr-customer-apply-add", "客户申请新增"],
  ["mmwr-customer-apply-change", "客户申请变更"],
  ["mmwr-customer-apply-add-form", "客户申请新增表单"],
  ["mmwr-customer-apply-change-form", "客户申请变更表单"],
  ["mmwr-customer-detail", "客户详情"],
  ["mmwr-customer-apply-change-history", "变更历史查询"]
];
```

## 详情交互说明

| 列表页       | 详情入口           | 实现方式                                                                              |
| ------------ | ------------------ | ------------------------------------------------------------------------------------- |
| 客户档案     | 操作列「详情」按钮 | 页内 detailDialog 弹窗（8 个 Tab：基本/资质/联系人/地址/银行/发票/适用范围/跟进记录） |
| 临时客户档案 | 客户编号可点击列   | 路由跳转 → `mmwrCustomerDetail`（平铺详情页：基本/联系/送货/银行/发票/跟进记录）       |
| 客户申请新增 | 操作列「详情」按钮 | 共享组件 `c_applyDetailDialog`（7 个 Tab）                                            |
| 客户申请变更 | 操作列「详情」按钮 | 共享组件 `c_applyDetailDialog`（7 个 Tab）                                            |

## 备注

- 客户档案详情通过页内 `c_formModal` 弹窗查看；临时客户详情通过路由跳转 `mmwrCustomerDetail` 查看
- 新增/编辑弹窗复用平台 `c_formModal` 组件
- 客户申请新增与客户申请变更共享 `src/components/local/c_applyDetailDialog/index.vue` 详情弹窗
- 变更历史查询通过路由跳转 `mmwrCustomerApplyChangeHistory` 查看，入口在申请表单页工具栏
- **显示排序**：目录排 `6`（接在实绩统计查询后面），菜单从 `1` 开始
- **mmwr- 前缀**：生产棒线材模块下所有页面统一使用 `mmwr-` 前缀（kebab）/ `mmwr` 前缀（camelCase）
