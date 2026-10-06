# 10 — Pinia 状态管理规范

> **强制度**：🔴 必遵。

---

## 何时用 Store

- ✅ 跨页面共享：用户信息、权限、全局配置、主题
- ✅ 需要持久化到 `localStorage` 的状态
- ✅ 多个不相邻组件共享的会话级状态

## 何时不用 Store（保留页面级 ref）

- ❌ 当前页的查询参数、列表数据、分页、弹窗状态
- ❌ data.ts 内部的所有状态（默认页面级，不提升到 Store）

## 使用边界

Store 可在实际使用它的组件、data.ts 组合函数或业务服务中读取，不按 import 位置强制迁移。明确的字段契约文件推荐保持纯声明；依赖上下文时可传参或在组合函数内读取。

模块联邦场景明确 Store 所属 Pinia，在宿主完成初始化后读取，避免依赖可能被远程应用切换的全局 active Pinia。页面查询、列表、分页与弹窗状态优先保留页面级 ref，不为统一写法提升到全局 Store。

## Store 文件结构

```
src/stores/
└── {domain}/
    └── index.ts        每个领域独立目录，避免单文件膨胀
```

## Store 命名

- `useXxxStore` 标准命名
- 若项目已统一 `s_` 前缀（如 `s_userStore`），全项目保持一致

```typescript
// src/stores/user/index.ts
export const useUserStore = defineStore("user", () => {
  const userInfo = ref<User | null>(null);
  function setUser(u: User) {
    userInfo.value = u;
  }
  return { userInfo, setUser };
});
```

## 持久化

如需持久化，推荐 `pinia-plugin-persistedstate`：

```typescript
defineStore('user', () => { ... }, {
  persist: { storage: localStorage, paths: ['userInfo'] }
})
```
