# 12 — BaseTable 扩展、渲染与 CID

## 推荐写法与兼容边界

优先复用已有 BaseTable，按页面需求选择 AG Grid 或现有有效渲染方式。存量 el-table、非 AG Grid 表格及组件写法差异给出建议，不单独阻断；不要求项目为这些差异登记豁免。

安装 wl-skills-ui 后，推荐经 `defineColumns()` 统一列预设，操作列推荐 `renderOps()`。允许通过 `composables/useBaseTable.ts` 等已有组合函数间接调用，也接受行为相同的有效自定义列与操作实现。静态检查无法跟踪调用链时提示核实，不宣判功能缺失。

扩展层负责平台列类型、编辑器和预设的转换。字典解析、数字契约和样式由业务参数提供，不绑定单个业务模块，不为每种页面再造适配器。

## CID 的稳定性

启用列配置持久化的表格应提供稳定、项目内唯一的 CID；确证不同页面重复使用导致配置冲突时继续阻断。

- 重构保留已有表格和列 CID，禁止为满足新格式重新生成，避免丢失用户配置。
- 新表格可使用业务域、页面、表格的语义前缀，也可一次性生成时间戳。时间戳不保证跨项目全局唯一，不能作为唯一性证明。
- 列 CID 推荐 `${TABLE_CID}-fieldName`，接受已持久化的其他稳定格式。
- 缺失 CID 或命名格式差异先提示；确需持久化时补齐，并验证配置可恢复。

```vue
<BaseTable
  render-type="agGrid"
  :cid="TABLE_CID"
  :columns="columns"
  :data="rows"
/>
```

## 布局缺陷仍需修复

渲染方式的兼容不豁免真实布局缺陷。弹窗零高度初始化、长工作台无法滚动和分栏高度链断裂仍按 K19/K20/K21 校验；结合实际挂载与高度传递验证。

## 弹窗内 AG Grid 延迟挂载（K19）

> AG Grid 依赖容器高度初始化。弹窗在打开动画期间容器高度为 0，AG Grid 会"有数据但不渲染行"。

**规则**：`jh-dialog` 或 `el-dialog` 内如果使用 `render-type="agGrid"` 的 BaseTable/SteelListPanel，**必须用 `v-if` 包裹弹窗内容**，确保 AG Grid 在弹窗可见后才初始化。

```vue
<!-- ✅ 正确 -->
<jh-dialog v-model="visible">
  <div v-if="visible">
    <BaseTable render-type="agGrid" ... />
  </div>
</jh-dialog>

<!-- ❌ 错误：无 v-if，AG Grid 在动画期间初始化导致零高度渲染 -->
<jh-dialog v-model="visible">
  <BaseTable render-type="agGrid" ... />
</jh-dialog>
```

**AST 检测**：K19 自动检测弹窗内 AG Grid 是否有 `v-if` 包裹，缺失时报 error。

---
