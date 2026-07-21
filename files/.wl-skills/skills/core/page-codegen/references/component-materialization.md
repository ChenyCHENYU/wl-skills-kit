# 标准业务组件按需落盘

> 页面使用 `c_formModal`、`c_formSections`、`c_listModal`、`c_spliterTitle` 或 `C_Tree` 时读取。

## 目录职责

- `.wl-skills/src/components/local/`：kit 管理的模板源和 README，仅供生成与查阅。
- `src/components/local/` / `src/components/global/`：项目运行时源码，Vite、TypeScript 和业务页面只引用这里。
- `.wl-skills/components.lock.json`：记录已落盘组件的契约版本和文件哈希。

禁止让 Vite alias、自动组件扫描或业务 import 直接指向 `.wl-skills/src/components/`。

## 生成流程

1. 根据页面设计列出本次需要的标准组件。
2. 在 page-codegen Pre-flight 中执行只读预览：

   ```bash
   wl-skills component ensure --components c_formModal,c_listModal
   ```

3. 把预览中的目标文件和 `planHash` 放入 page-codegen 写入确认范围。
4. 用户确认后执行：

   ```bash
   wl-skills component ensure \
     --components c_formModal,c_listModal \
     --confirm \
     --plan-hash <预览返回值>
   ```

5. 页面继续使用稳定项目路径：

   ```ts
   import c_formModal from "@/components/local/c_formModal/index.vue";
   ```

6. 生成结束执行 `wl-skills validate-page <页面目录>`，C1/C2 必须为零。

## 安全语义

| 状态 | 行为 |
| --- | --- |
| 项目中不存在 | 预览后按需落盘，只复制运行文件，不复制 README |
| 锁与文件哈希一致 | 直接复用，零写入 |
| 目标目录已存在但没有锁 | C2 阻断，保留原文件，不覆盖 |
| 已落盘文件被修改 | C2 阻断，保留定制实现，不覆盖 |
| 契约版本不兼容或文件不完整 | C2 阻断，先人工评审 |
| kit 有同契约新实现 | C3 提示，当前项目版本继续可用，不自动升级 |
| 预览后目录或依赖变化 | `planHash` 失效，零写入并重新预览 |

不得使用 `--force` 绕过组件冲突，也不得生成转发文件、符号链接或 Vite fallback alias。

## 项目检查

只读检查当前源码实际引用的标准组件：

```bash
wl-skills component check
```

查看内置目录：

```bash
wl-skills component list
```
