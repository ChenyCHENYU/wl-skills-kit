# 页面校验结果的按需读取

2026-10-12 源码修订，尚未发布或安装至业务项目。`wls_validate_page` 首次调用仍使用完整 CLI 校验规则；阅读下一页使用同一 MCP 进程中的快照，不再启动 CLI。检查不调用模型 API，宿主读取工具说明、结果或源码的上下文另计。

首次调用示例：

```json
{"path":"src/views","limit":20,"maxBytes":12000}
```

用返回的 `structuredContent.nextCursor` 续取：

```json
{"resultCursor":"<nextCursor>","limit":20,"maxBytes":12000}
```

limit 默认 40，范围 1～200；maxBytes 默认 12,000，范围 4,096～65,536，约束 UTF-8 序列化处理结果（文本和 structuredContent），不含外层 JSON-RPC/MCP 包装及宿主元信息，不等于精确 token。长描述显式裁剪，最多展示五个 checkedFiles 并标明完整数量。完整 CLI 事实和覆盖清单仍用于检查回执；阅读预算不缩减实际校验。

续取禁止改变 path/typecheck/offset；可调整阅读预算，显式 runId 必须与原扫描一致。项目不匹配、非法位置、过期或服务进程重启导致游标失效时明确报错，不自动扫描、不生成新检查回执。旧 offset/limit 入口兼容保留，其请求仍重新执行 CLI；推荐改用 resultCursor。

缓存仅在内存，快照固定五分钟有效期、最多 16 份、单份最多 8 MiB、总共最多 32 MiB；按存入顺序淘汰。超过单项预算不缓存，nextCursor=null；仍有未读项时查看完整 CLI 工件，不用重复 offset 请求获取快照。必要元信息或单项无法容纳时明确失败，不输出空页冒充完整。

所有阅读视图标记 `displayOnly:true`、snapshotAt 和 snapshotExpiresAt，保留全量问题数和原 ok/state。源码修改后旧游标仍读历史快照；需要修复复验时不传游标重新校验，并按同 runId 的任务约定执行。分页视图不能替代 `validate --json` 的完整输入，也不能用于签发放行或问题关闭。Gate 拒绝 displayOnly 和不完整分页输入。
