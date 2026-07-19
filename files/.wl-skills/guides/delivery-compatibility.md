# 独立闭环与协同契约

`wl-skills-kit` 可以直接从已评审需求、原型或自然语言输入启动，不要求预先安装或执行 `wl-skills-design`。独立使用时，先建立可审计的 page-spec 与 API 契约草稿；存在未决问题时必须记录并阻断严格交付，不能静默猜测。

## 统一边界

- 交互与页面真值：`page-spec.json`，规范字段为 `page/mode/dir/name`。
- 前后端接口真值：`api.md` 内唯一的 `wl-api-contract` JSON 块，或等价的独立 JSON 文件。
- 默认交付 profile：`.wl-skills/contracts/wl-delivery-profile.v1.json`。
- 协议版本：`1.0`；标准 CRUD 为 `queryPage`、`getById/{id}`、`save`、`PUT updateById`、`DELETE deleteById/{id}`。
- 响应外壳：`code/message/data`，成功码 `2000`，分页为 `data.records/data.total`。
- 并发控制：更新请求和详情响应都包含 `revision`。

## 两种同等有效的入口

1. 上游存在 design-model：继承稳定 ID、需求追踪和 profile，校验后生成前端产物。
2. 只有评审需求：kit 独立创建契约和 page-spec，补齐稳定 ID、来源、未决问题与偏差记录。

两种入口最终收敛到同一份协议，不形成“设计包专用格式”和“独立开发格式”两套标准。

## 严格闭环

```text
需求/原型 → page-spec + API 契约草稿 → 双方确认契约
         → 页面/Mock 生成 → 静态规则 + 类型检查 + 规格对齐
         → 与后端契约 strict compare → 联调/验收证据
```

常用命令：

```bash
wl-skills contract init --contract-id sale.order --service sale --resource order --module sale
wl-skills contract validate --input wl-api-contract.json --strict
wl-skills contract compare --left wl-api-contract.json --right backend-contract.json --strict
wl-skills validate --strict
```

`init` 和 `render` 默认仅预览；显式增加 `--confirm` 才写入。严格模式要求 `contractStatus=confirmed`、`openQuestions/skeletonOperations` 为空，并比较资源核心字段、transport、全部标准/扩展操作、models、API_CONFIG 与 path 参数语义。仅一侧缺少可选 design `externalId` 不阻断；两侧都声明但值不同必须阻断。
