# page-spec.json：从真实实现提取的领域镜像

页面业务定义以 `data.ts` 为唯一事实源，视图与样式分别由 `index.vue`、`index.scss` 实现。
页面目录的 `page-spec.json` 默认用于留存真实页面能力，供 AI 理解、领域模板归档和未来原型复刻；不得成为第二套需要手工维护的页面定义。

## 提取与使用方向

```text
需求和已确认接口 → data.ts + index.vue + index.scss → 验证真实实现
                                                 ↓ 显式提取
                                      page-spec.json（role: mirror）
                                                 ↓ 按领域整理、导出
                                        独立领域模板库 → 新项目实现
```

```sh
wl-skills template mirror --path src/views/domain/page --json
wl-skills template mirror --path src/views/domain/page --confirm
wl-skills template mirror --path src/views/domain/page --bundle --output .wl-skills/templates/domain/page.json --confirm
```

默认预览不写入；写入只更新镜像，不修改业务三文件。提取器不执行页面模块，不使用已有 JSON 的字段、按钮或业务备注推断实现。普通项目不强制拥有镜像。

镜像包含 `role: "mirror"`、页面标识，以及 `mirror` 内的页面定义证据、真实模板绑定、源码与本地依赖指纹、外部包声明版本/范围、未解析引用和还原条件。项目提供安全求值后的定义时可保留完整结构；否则以 `$source` 原样保留定义表达式，不能把未知函数假装解析成功。函数以 `$function` 保留源码证据，显式 undefined 用 `$undefined` 记录，不静默丢弃。

默认嵌入本页实现及接口文档，依赖记录路径和 SHA-256；导出到独立领域库时用 `--bundle` 嵌入本地依赖闭包。除静态导入外，提取器读取 `src/components.d.ts` 或 `components.d.ts` 中的 `GlobalComponents`，递归收集模板实际引用的自动导入组件及其源码、样式；显式组件导入优先。声明文件作为编译证据保留，但不展开其中未使用组件的源码，确保还原后仍可重新识别依赖。`autoImportedComponents` 记录引用文件、标签及组件和声明来源，声明冲突或源码缺失列为未解析引用。不执行项目 Vite 配置；没有声明的旧项目仍可按原方式提取，其他自动加载机制须在归档时补充证据。

动态加载原表达式明确记入未解析引用。归档前确认这些引用，并记录所需平台包。源码证据用于保真，不等于已转换成通用可执行 JSON DSL，也不等于完成浏览器和后端验收。领域库可在这些证据之上补充经验证的业务说明与模板参数，不把 AI 猜测标成实现事实。

镜像过期、结构被手改或依赖变化时，`validate` 的 M1 只提示重新提取，不要求按镜像改 `data.ts`，不阻断正常重构。真实代码的类型、无效代码、复杂度、接口和行为验证继续执行。镜像质量检查属于显式提取/领域库入库阶段。

## 项目、kit 与领域镜像库

三方可以独立演进，以版本化的镜像协议关联：

| 参与方                     | 持有的事实与职责                                                     |
| -------------------------- | -------------------------------------------------------------------- |
| 业务项目                   | 维护实际页面三文件和已确认接口，承担真实业务与交互验证               |
| kit                        | 维护通用提取器、镜像协议、兼容规则和代码校验，不内置各领域的页面内容 |
| 独立领域镜像库（后续建设） | 按领域保存经过验证的镜像、依赖要求与来源证据，提供检索和版本化发布   |

项目经 kit 提取与验证镜像，镜像库按 kit 协议接收材料；未来新项目通过 kit 选择领域材料、生成实际代码，再对实际实现验证。页面运行继续依赖项目代码和组件包；领域库与 kit 不成为第二套运行时页面定义。

领域库的最小关联约定：

- 用 `domain + pageId` 作为稳定身份；按 `镜像包名@版本 + 身份` 引用已发布材料，页面名称只用于展示。库中的重复身份必须报告。
- 包版本标识内容发布，`schemaVersion` 标识镜像协议，`sourceHash/mirrorHash` 校验来源与材料内容。归档时关联来源项目、源码提交及是否包含未提交变更，不能只记录分支名或把当前工作区冒充已发布提交。
- 入库需检查嵌入源码、依赖要求及未解析引用；把 `--bundle` 产物还原到隔离目录后重新提取，确认源码、绑定与镜像指纹一致。静态源码还原与浏览器/后端验收分开记录，不能把前者升级成后者的通过证据。
- 声称“1:1 还原”时，归档还需关联宿主脚手架版本、依赖锁文件及其指纹、平台组件/模块联邦版本、字典与接口条件。镜像中的包版本范围只能说明依赖要求，不能替代解析后的版本锁定。环境变量仅保存名称和用途，不归档真实令牌、账号、密码或环境密钥。
- 入库验收分别记录源码还原、同版本宿主构建、浏览器交互和样式结果，并保留对应验证版本、用例、截图或报告。原型可使用明确标注的模拟数据；模拟交互不计作真实后端验收。仅有字段、按钮和接口名的摘要，不能宣称可以还原完整业务。
- 协议升级保留读取旧版本的能力；不支持的协议在导入阶段明确说明。项目中的知识镜像缺失或过期仍只提示，不影响正常业务校验；领域材料自身无效则不允许入库。

这是一套后续镜像包的关联约定，不表示目前已经创建独立镜像包或完成从任意模板参数化生成新页面的工具。

## 旧需求规格与 scenario 兼容

未声明 `role: "mirror"` 的旧 page-spec 继续按原需求规格使用 S1~S7。已有或用户显式选择 `scenarioRef` 的生成项目继续往返校验；不得强制把实现驱动页面改成 scenario。镜像不能通过旧 `from-spec` 降格成只有字段和按钮的模板，否则会丢失交互逻辑。

以下 Schema 和 S1~S7 说明仅适用于这条旧需求规格链，或用户明确提供的生成输入；它们不适用于实现驱动页面的镜像。

## 旧需求规格 Schema

```jsonc
{
  "schemaVersion": 1,
  "pageId": "SCREEN_CUSTOMER_ARCHIVE", // 当前项目稳定唯一，design 映射可选
  "page": "客户档案", // 必填，页面中文名
  "dir": "src/views/mdata/customer", // 可选，页面目录（相对项目根）
  "mode": "LIST", // 严格模式必填
  "profileId": "jh4j3-openapi3",
  "protocolVersion": "1.0",
  "apiContract": "contracts/customer-archive.json",
  "openQuestions": [], // 严格模式必须为空
  "features": {
    "contextFields": [
      {
        "name": "companyId",
        "source": "server",
        "operations": ["page", "create", "update"]
      },
      {
        "name": "factory",
        "source": "client",
        "operations": ["page", "create"]
      }
    ],
    "listLifecycle": {
      "initialLoad": true,
      "queryTrigger": "manual",
      "queryResetPage": true,
      "saveRefresh": "first",
      "deleteEmptyPageFallback": true
    },
    "acceptance": {
      "queryControls": [
        {
          "kind": "step-navigation",
          "field": "heatNo",
          "requireValue": true,
          "source": "requirement:炉号上下键"
        },
        {
          "kind": "default-date-range",
          "startField": "startDate",
          "endField": "endDate",
          "startOffsetDays": -1,
          "endOffsetDays": 0,
          "source": "requirement:默认日期"
        }
      ],
      "uniqueness": [
        {
          "fields": ["prepItem"],
          "operations": ["create", "update"],
          "activeOnly": true,
          "normalization": ["trim"],
          "message": "整备项目已存在，请勿重复添加",
          "source": "requirement:整备项目去重"
        }
      ],
      "batchOperations": [
        {
          "operation": "mergeCast",
          "selectionScope": "selected-only",
          "minItems": 2,
          "sameFields": ["steelGrade", "productType"],
          "distinct": [{ "field": "castNo", "count": 2 }],
          "source": "requirement:浇次统合"
        }
      ],
      "verification": {
        "authContext": ["companyId"],
        "queryCases": ["positive", "negative", "reset"],
        "readAfterWrite": "same-tenant"
      }
    }
  },
  "validationRules": [
    {
      "kind": "chronology",
      "startField": "startTime",
      "endField": "endTime",
      "allowEqual": true,
      "operations": ["create", "update"],
      "message": "结束时间不能早于开始时间",
      "source": "requirement:customer-validity"
    }
  ],

  // 查询字段：顺序 = 原型从左到右、从上到下
  "query": [
    {
      "name": "customerCode",
      "label": "客户编码",
      "type": "input",
      "constraints": { "maxLength": 64 },
      "constraintSource": "api-contract:models.pageRequest.customerCode"
    },
    { "name": "customerName", "label": "客户名称" }
  ],

  // 表格列：顺序 = 原型表头从左到右（selection/index/_action 可省略，不参与比对）
  "columns": [
    { "name": "customerCode", "label": "客户编码" },
    { "name": "customerName", "label": "客户名称" },
    { "name": "enableStatus", "label": "状态" }
  ],

  // 工具栏按钮：顺序 = 原型从左到右；color 取原型颜色
  "toolbar": [
    { "label": "新增", "color": "primary", "plain": false },
    { "label": "批量删除", "color": "danger", "plain": false },
    { "label": "导出", "color": "default", "plain": true }
  ],

  // 操作列按钮：与原型严格一一对应，禁止自行增减
  "operations": [{ "label": "编辑" }, { "label": "删除" }]
}
```

### 字段说明

| 字段                              | 类型         | 必填                           | 比对规则                                                                                             | 偏差级别    |
| --------------------------------- | ------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------- |
| `page`                            | string       | ✅                             | —                                                                                                    | —           |
| `pageId`                          | string       | strict ✅                      | 当前项目稳定唯一；可选映射 design screen.id                                                          | S0 error    |
| `profileId/protocolVersion`       | string       | strict ✅                      | 与 API contract 一致                                                                                 | S0 error    |
| `apiContract`                     | string       | strict ✅                      | 指向当前项目契约，不要求上游包                                                                       | S0 error    |
| `formSections/subTables/features` | array/object | 按页面                         | 结构、字段唯一性和子项完整性                                                                         | S0 error    |
| `openQuestions`                   | array        | strict ✅                      | 严格模式必须为空                                                                                     | S0 error    |
| `query[].name`                    | string       | —                              | 与 `queryDef()` 字段**集合 + 顺序**比对                                                              | S1 warn     |
| `columns[].name`                  | string       | —                              | 与 `columnsDef()` 列**集合 + 顺序**比对（忽略 selection/index/\_action）                             | S2 error    |
| `toolbar[].label`                 | string       | —                              | 与 `toolbarDef()` 按钮**集合 + 顺序**比对                                                            | S3 error    |
| `toolbar[].color`                 | enum         | —                              | 集合一致时逐个核对颜色（primary/danger/warning/success/default）                                     | S3 warn     |
| `operations[].label`              | string       | —                              | 与 `renderOps([...])` 按钮**集合**比对                                                               | S4 error    |
| `*.type=dict`                     | string       | —                              | 必须同时声明已确认的 `dictCode`                                                                      | S0 error    |
| `*.constraints`                   | object       | —                              | 仅校验显式长度/格式/数值边界，不做字段名推断                                                         | S0 error    |
| `*.constraintSource`              | string       | strict 条件必填                | 声明 constraints 时必须指向 API/数据库/需求契约                                                      | S0 error    |
| `*.contractField`                 | boolean      | 否                             | 默认 true；纯展示字段必须显式设 false 才不参加机器契约字段白名单比对                                 | S6 error    |
| `features.fixedQueryFields`       | string[]     | 条件必填                       | 固定工厂/类型等上下文字段；查询、新增、更新必须同时携带                                              | S0 error    |
| `features.contextFields`          | object[]     | 推荐                           | `client` 只进入显式 operations；`server` 必须由鉴权上下文注入且不得出现在请求模型                    | S0/S6 error |
| `features.listLifecycle`          | object       | 列表页推荐                     | 首次查询、手动/自动触发、回第一页刷新、删除空页回退的显式契约                                        | S0 error    |
| `features.acceptance`             | object       | 有业务交互/去重/批量规则时必填 | 查询控件行为、业务去重、selected-only 批量门禁和租户验收矩阵；字段必须真实存在，技术化重复提示会阻断 | S0 error    |
| `validationRules`                 | object[]     | 跨字段边界必填                 | chronology 等规则必须与 wl-api-contract 完全一致，禁止前后端各猜一套                                 | S0/S6 error |
| `features.definitionSource`       | string       | 集中定义必填                   | 共享定义模块的项目相对路径；必须与 `data.ts` 的 `pageDefinition` import 一致                         | S0 error    |

> `color` 合法值：`primary` `danger` `warning` `success` `default`
> 颜色映射见 `page-codegen/SKILL.md` §按钮颜色映射表。

---

## 校验规则（validate S1~S6）

执行 `wl-skills validate src/views/xxx` 时，若页面目录存在 `page-spec.json`，自动追加比对：

| 规则 | 检查                              | 级别           | 含义                                             |
| ---- | --------------------------------- | -------------- | ------------------------------------------------ |
| S0   | page-spec.json 结构合法性         | error/warn     | JSON、完整区块、稳定 ID、profile、契约、未决问题 |
| S1   | 查询字段顺序/集合                 | warn           | queryDef 与 spec.query 不一致                    |
| S2   | 表格列顺序/集合                   | **error**      | columnsDef 与 spec.columns 不一致（阻断提交）    |
| S3   | 工具栏按钮顺序/集合/颜色/填充形态 | **error**/warn | toolbarDef 与 spec.toolbar 不一致                |

创建类主按钮（新增/新建/添加/创建）必须固定为
`{ "color": "primary", "plain": false }`。S3 同时比较颜色与 `plain`，
不得用 `primary + plain: true` 伪装成已满足主色要求。
| S4 | 操作列按钮集合 | **error** | renderOps 与 spec.operations 不一致（含"多了原型外按钮"）|
| S5 | 按钮和字段 label 文字保真 | warn | 规格与代码文字不一致 |
| S6 | page-spec 与机器 API 契约对齐 | **error** | 阻断字段多传/漏传、显式 required/constraints 漂移、client/server 上下文方向错误、chronology 规则漂移及多资源绑定不唯一；未声明边界不按字段名猜测 |

- 无 `page-spec.json` 的页面**静默跳过**，不影响其他检查
- 解析失败报告 S0；严格模式下缺契约元数据或存在未决问题直接阻断
- `features.definitionSource` 明确声明共享定义源时，校验器确认
  `data.ts import/export pageDefinition` 委托链，不再误套旧式
  `queryDef/columnsDef` 解析器；建议在 `.wl-skills-validate.json`
  的 `definitionValidators` 为该来源绑定项目语义校验脚本，闭合真实字段、按钮和接口验证
- S6 仅在 `apiContract` 文件或 `api.md` 中存在 `wl-api-contract` 机器契约时执行；字段名只做
  snake_case/camelCase 规范化，不根据中文标签猜测。纯展示字段用 `contractField:false` 精确豁免。
- error 级别在 `--pre-commit` 时阻断提交，形成"生成 → 卡控 → 修复 → 复扫"闭环

### constraints 支持项

| 类型   | 支持字段                                                                                      |
| ------ | --------------------------------------------------------------------------------------------- |
| 字符串 | `minLength`、`maxLength`、`pattern`                                                           |
| 数值   | `minimum`、`maximum`、`minExclusive`、`maxExclusive`、`step`、`totalDigits`、`fractionDigits` |

约束只在契约显式声明时检查。不得按“编码通常 64 位”“状态通常 2 位”等经验
自动补值；未确认的边界应进入 `openQuestions`。

---

## 旧需求规格 Pipeline（兼容保留）

```
prototype-scan / spec-doc-parse
  └─ 产出 page-spec（reports/*_PARSE_*.md 含完整 JSON）
       ↓
page-codegen
  └─ 把 page-spec 写入页面目录 page-spec.json（真值落盘）
  └─ 按 page-spec 生成 data.ts（精准实现）
       ↓
wl-skills validate（S1~S6）
  └─ 比对 page-spec.json vs data.ts → 偏差即报 → 闭环
```

> 这一步让"精准实现"从 **AI 自觉** 升级为 **代码卡控**。
