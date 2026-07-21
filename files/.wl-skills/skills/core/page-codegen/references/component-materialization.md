# 标准业务组件落盘

> 页面使用 kit 过渡期业务组件时读取。平台已有同等能力时，优先使用平台组件。

## 当前目录

| 作用域 | 可落盘组件 |
| --- | --- |
| local | `c_formModal`、`c_formSections`、`c_listModal`、`c_spliterTitle` |
| global | `C_ParentView`、`C_TagStatus`、`C_Tree` |

`C_RightToolbar` 与 `C_SvgIcon` 已退出分发：前者旧实现不完整且无有效使用；后者会引入额外资源包依赖。工具栏改用平台 `BaseToolbar` 或项目等价组件，SVG 图标继续使用项目现有能力，确有跨项目需求时再独立封装。

## 目录职责

- `.wl-skills/src/components/`：kit 中的过渡期组件快照和说明，不参与业务构建。
- `src/components/local/` / `src/components/global/`：项目运行时源码，也是页面生成必须遵循的真实契约。
- `.wl-skills/components.lock.json`：只记录由 kit 首次落盘的快照版本和文件哈希，不取得项目源码所有权。

禁止让 Vite alias、自动组件扫描或业务 import 直接指向 `.wl-skills/src/components/`。

## 生成流程

1. 优先核对平台组件；确需使用上述业务组件时，列出本页所需组件。
2. 在 page-codegen Pre-flight 中执行只读预览：

   ```bash
   wl-skills component ensure --components c_formModal,c_listModal
   ```

   初始化项目或希望一次准备全部组件时：

   ```bash
   wl-skills component ensure --all
   ```

3. 把预览中的目标文件和 `planHash` 纳入本次写入确认。
4. 用户确认后，使用同一组件范围执行：

   ```bash
   wl-skills component ensure \
     --components c_formModal,c_listModal \
     --confirm \
     --plan-hash <预览返回值>
   ```

   全量落盘同理使用 `--all --confirm --plan-hash <预览返回值>`。

5. 若项目已有同名组件，先读取其真实 Props、Events、Slots、Expose 和导入方式；不得假设它与 kit 快照完全一致。
6. 页面只使用稳定项目路径：

   ```ts
   import c_formModal from "@/components/local/c_formModal/index.vue";
   ```

7. 生成结束执行 `wl-skills validate-page <页面目录>`，C1/C2 必须为零；C3/C4 是评估信息。

## 安全语义

| 状态 | 行为 |
| --- | --- |
| 项目中不存在且依赖完整 | 预览后落盘，只复制目录声明的运行文件，不复制 README |
| 锁与文件哈希一致 | 直接复用，零写入 |
| 目标已有有效入口但没有锁 | 认定为项目真实实现，C4 提醒读取契约，绝不接管或覆盖 |
| 已落盘组件被项目修改或重组 | 认定为项目已打磨实现，C4 提醒读取契约，绝不回滚或覆盖 |
| 目标目录存在但入口尚未落盘 | 只补齐目录中缺失的声明文件；任何已有文件都保留，之后按项目实现复用 |
| 目标路径不是目录 | C2 阻断，保留现场并人工处理 |
| 新落盘/补齐所需依赖或项目文件缺失 | C2 阻断，不生成残缺组件 |
| kit 有同契约新实现 | C3 提示，当前项目版本继续可用，不自动升级 |
| 预览后目标目录或依赖变化 | `planHash` 失效，零写入并重新预览 |

不得使用 `--force` 绕过组件检查，也不得生成转发文件、符号链接或 Vite fallback alias。

## 生命周期

- 当前组件是平台之上的过渡期业务快照，不是永久公共层；平台已有能力时不重复封装。
- 项目团队可以在落盘后继续打磨，项目里的真实实现优先于 kit 快照。
- 优化后的实现由团队评审后再人工反馈到 kit；工具不会反向同步项目源码，避免跨项目污染。
- 当稳定组件数量和复用范围足够时，再提取独立业务组件库；迁移前继续保持项目路径稳定。

## 项目检查

```bash
# 检查源码实际引用
wl-skills component check

# 检查全部目录状态
wl-skills component check --all

# 查看内置目录
wl-skills component list
```
