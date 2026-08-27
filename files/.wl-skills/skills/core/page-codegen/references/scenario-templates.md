# 场景模板确定性渲染（scenario JSON 双轨）

> 本文件是 page-codegen 的**确定性渲染前置层**：当页面规格能表达为 wl-scenario JSON 时，
> 必须优先走 `wl-skills scenario render`（编译器输出，零 AI 自由度），
> AI 只处理 scenario JSON 里填不进去的语义增量（复杂联动、跨页流程），再走本 Skill 主流程补齐。

## 何时用哪条路

| 条件 | 路线 |
| --- | --- |
| pattern 已在 `templates/patterns.json` 标记 `implemented`，且页面规格能完整落进 scenario JSON | **先 scenario render，再 validate-page 复扫** |
| pattern 为 `planned`，或存在渲染器/组件不满足的定制交互 | 走本 Skill 主流程（TPL 模板 + AI 填充），产出后再 `scenario extract` 沉淀 |
| 复杂嵌套页（多资源/多 Tab/工位编排）且项目已有 PatternPageRenderer | runtime 轨（definition + 薄壳），页面本体 10 行 |

## 双轨产物

- **codegen 轨**（list 已实现）：`data.ts + index.vue + index.scss + page-spec.json` 四件套，
  与 TPL-LIST canonical 形态逐字符对齐（agGrid/cid/defineColumns/renderOps/标准生命周期/删除末页回退）。
- **runtime 轨**（workstation 已实现）：`definition.ts + 10 行 index.vue + 2 行 data.ts + page-spec.json`，
  `features.definitionSource = "./definition"`，validate 走既有委托链校验；
  渲染器组件由项目提供（`requires.renderer`），render 前置检查存在性，缺失即阻断并建议降级 codegen 轨。

## 硬规则

1. scenario JSON 是唯一事实源：`render` 产物、`extract` 产物、page-spec 投影三者不一致以 JSON 为准；
   禁止手改渲染产物后不回写 JSON（下次 render 会覆盖）。
2. 非声明式定制代码只能进 `extensions`（customImports / customMethods / template.afterToolbar），
   逐字嵌入/回捞；**禁止**在 handler/extensions 里写 import/export（校验阻断）。
3. runtime 轨 v1 仅支持渲染器内置标准动作（openModal/edit/del/view）；
   需要 custom handler 的页面走 codegen 轨（handler 以源码文本嵌入，不经 eval）。
4. 创建类按钮（新增/新建/添加/创建）强制 primary 填充；dictCode 必须显式声明，禁止按字段名猜。
5. `render --confirm` 落盘后必须执行 `wl-skills validate-page <dir>` 走 S1~S7/K 系门禁复扫闭环。

## 往返等价性（已由 tests/scenario-roundtrip.test.js 机器锁定）

- 声明式核心：`extract(render(doc)) === doc`（定点），`data.ts / index.vue / page-spec.json` 字节级一致。
- 旧形态页面提取后按 canonical **升级**（补 cid/agGrid/renderOps/标准删除回退），语义不丢：
  查询/列/按钮/操作顺序、label、字典绑定、API 路径全部保真。
- extensions 字节级往返。

## 与主流程的衔接

```
prototype-scan / spec-doc-parse → page-spec.json
        │
        ├─ pattern implemented 且规格完备 → 手写/转换 scenario JSON
        │       → wl-skills scenario validate
        │       → wl-skills scenario render --confirm
        │       → wl-skills validate-page（S/K 门禁复扫）
        │
        └─ 否则 → 本 Skill 主流程（TPL + AI 填充）
                → 生成后 wl-skills scenario extract 沉淀 JSON（下次同场景直接 render）
```

模板库与 CLI 细节见 `.wl-skills/templates/scenarios/README.md` 与
`.wl-skills/docs/scenario-template.md`。
