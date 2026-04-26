# standards/ 维护要点

## 13 条规范一览

| 编号 | 文件                   | 核心约束                                      |
| ---- | ---------------------- | --------------------------------------------- |
| 01   | toolchain.md           | @robot-admin/git-standards 安装检测（阻断式） |
| 02   | code-structure.md      | 4 文件原则、三段式、script 9 段顺序           |
| 03   | comments.md            | koroFileHeader、function/inline 注释          |
| 04   | coding-basics.md       | 13 条基础（命名、let/const、不变量上提等）    |
| 05   | logging.md             | console 管控（src/ 禁用 console.log）         |
| 06   | security.md            | v-html / Token / eval / for-in                |
| 07   | config.md              | VITE\_ 前缀、API_CONFIG 集中                  |
| 08   | git.md                 | git cz 强制 + scope                           |
| 09   | typescript.md          | interface 优先、any 约束                      |
| 10   | pinia.md               | Store 边界、data.ts 禁止 import Store         |
| 11   | form-validation.md     | c_formModal 内置 vs FORM_ROUTE 手动 validate  |
| 12   | base-table.md          | AGGrid 必用、cid 命名                         |
| 13   | platform-components.md | 平台组件对照表 + docs 前置读取清单（核心）    |

---

## 修改原则

1. **最小变更**：一次只改一条规范，避免跨规范影响
2. **同步更新 audit**：修改任何条目都要检查 `convention-audit/SKILL.md` 是否需联动
3. **同步 \_registry.md**：触发词受影响时同步更新
4. **CHANGELOG 必须记**

## 新增规范流程

参考 `CONTRIBUTING.md` 第一节。

## 已知讨论

- 是否考虑加入"性能规范"（如 v-for + computed 性能注意）？暂列入 v2.2 候选
- 是否考虑加入"无障碍规范"？需评估业务系统场景
