# Sync Skill 通用护栏（MCP 调用纪律 + 自愈闭环）

> 所有 sync 类 Skill（menu-sync / dict-sync / permission-sync）共用本规则。
> SKILL.md 顶部需引用本文件，确保 AI 行为一致。

---

## 1. 调用纪律（AI 必读）

- ✅ **首选**：通过本 Skill 在「MCP 工具调用规范」中列出的工具调用（`wls_*`）
- ❌ **严禁**：使用 `curl` / `Invoke-RestMethod` / `Invoke-WebRequest` / `fetch` / `axios` / `Send-WebRequest` 等任何 shell 命令或代码直接发起 HTTP 请求
- ❌ **严禁**：自行推测、拼接、或从历史对话沿用接口路径
- ❌ **严禁**：在 SKILL.md 中看到 `POST /system/xxx/save` 字样后据此手动调用——HTTP 路径仅为 MCP **内部实现说明**

---

## 2. 自愈闭环（MCP 异常时 AI 该怎么做）

> 不是"立即停止"，而是"按层级引导用户完善配置，让它能跑通"。原则：**优先帮用户闭环，最后才放弃**。

### 2.1 错误分层判定

AI 调用 MCP 工具后，按返回内容判定属于哪一类，并按对应剧本处理：

| 错误特征 | 归类 | 处理剧本 |
|---|---|---|
| 工具不在 `tools/list` 中（编辑器根本没识别到 wls_*）| L0 MCP 未连接 | 走 §2.2 |
| 工具返回"❌ 配置加载失败"/"配置文件不存在"/"请填写真实的 xxx" | L1 配置缺失 | 走 §2.3 |
| 工具返回 `code === 401` 或包含 "token"/"鉴权"/"未登录" 字样 | L2 Token 失效 | 走 §2.4 |
| 工具返回 `code === 4004` / "url:GET; ..." / 接口不存在 | L3 接口路径不匹配 | 走 §2.5 |
| 工具返回业务错误（参数错误、唯一键冲突等） | L4 业务层 | 按工具返回的提示给用户看，不需要 fallback |

### 2.2 L0 — MCP 未连接

引导（不要默认放弃）：

```
🔧 当前编辑器似乎未识别到 wls_* 工具，请按顺序检查：
1. 编辑器的 MCP 配置文件存在吗？（Cursor/Kiro/Trae: 见各自 mcp.json）
2. 配置里 WL_PROJECT_ROOT 指向当前项目根了吗？
3. 重启编辑器后再看 MCP 面板的工具列表

请告诉我以上哪一步通不过，我帮你定位。
```

仅在用户明确表示**无法启用 MCP** 时，才退化为「手工去后台维护」的人肉方案，且**不再尝试**让 AI 拼 HTTP。

### 2.3 L1 — 配置缺失 / 占位值未替换

如果工具返回类似：
- `请在 env.local.json 中填写真实的 gatewayPath（当前为占位值）`
- `请在 .github/skills/sync/env.local.json 填写 menu.domainId`
- `配置文件不存在: .../env.local.json`

AI **立即转入引导模式**：

1. `read_file` 加载 `.github/skills/sync/menu-sync/env/guide.md`（统一配置说明）
2. 告诉用户具体哪个字段缺失、获取方式（如 token 抓包、domainId Network 查询）
3. 等待用户填好 `env.local.json` 后**自动重试同一个 MCP 工具调用**
4. 直到配置完整、调用成功为止 → 完成闭环

### 2.4 L2 — Token 失效

```
🔑 Token 似乎已过期。请：
1. 浏览器登录系统
2. F12 → Network → 任意接口 → 复制 authorization 头的值
3. 去掉开头的 `bearer ` 前缀，把纯 JWT 部分粘到 env.local.json 的 token 字段
4. 告诉我"token 已更新"，我会重新尝试同步
```

更新后**自动重跑**之前失败的 MCP 调用。

### 2.5 L3 — 接口路径不匹配（如 4004）

后端环境差异可能导致内置接口路径与实际不符。AI 应：

1. 提示用户："当前 MCP 内置的接口路径在你的后端未注册（返回 4004）。可能是该环境网关前缀不同。"
2. 引导用户：
   - 检查 `env.local.json.gatewayPath` 是否需要补一段前缀（如 `/uac`）
   - 或者联系后端确认该 sync 工具对应的真实路径
3. **不要**让 AI 自行去猜路径再 curl，否则就是绕开 MCP 的回旋
4. 路径前缀这类配置类问题可以由用户更新后**重试 MCP 工具**完成闭环

> 长期方案：将变化的接口前缀做成 `env.local.json` 中的可配置项，由 kit 维护者在 mcp/api/*.js 中支持读取覆盖。该改动属于 MCP 内部实现，AI 不需要也不应该自行 patch。

### 2.6 L4 — 业务错误

工具返回的业务层提示（如 "menuName 已存在"、"参数缺失"）属正常反馈，AI 直接展示给用户即可，不需要 fallback。

---

## 3. Pre-flight 自检模板（执行前必须输出）

```
🚀 已触发技能 {skill-name}/SKILL.md → {一句话用途}
✅ MCP 工具检查：{要用到的 wls_* 全部列出，✓/✗}
✅ 已读取 .github/skills/sync/env.local.json → gatewayPath/token/sysAppNo/{其他必填}
✅ 已读取 {本 Skill 的 SYS_*_INFO.md 基线}
✅ 操作模式：{pull / push / audit / ...}
```

任一项 ✗ → 进入 §2 自愈剧本，**不要直接放弃**。

---

## 4. 一句话总则

> **MCP 是默认通路，配置是参数化的；调不通时帮用户改配置，而不是绕开 MCP 自己拼 HTTP。**
