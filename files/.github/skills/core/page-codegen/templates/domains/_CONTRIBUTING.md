# 领域模板贡献规范

> 如何向 `domains/` 贡献领域专属模板。

---

## 何时贡献领域模板

✅ **建议提取**的场景：

- 同一业务域内 **3+ 个页面**遵循相同的非标准交互模式
- 该模式无法通过通用模板（`universal/`）覆盖
- 标杆页面已稳定运行，业务字段已成熟

❌ **不建议提取**的场景：

- 该模式未来 6 个月可能频繁变化
- 仅 1~2 个页面使用
- 通用模板稍加配置即可满足

---

## 推荐方式：使用 template-extract Skill

最低门槛，**全 AI 辅助**：

```
开发者：触发模板提取，目标页：src/views/produce/.../mmwr-rolling-management/

AI: 1. 读取目标页 4 文件（index.vue + data.ts + index.scss + api.md）
    2. 自动识别交互模式，对比已有 TPL，输出识别结论
    3. 反问 3 个问题：领域归属 / 模板命名 / 脱敏需求
    4. 生成标准 TPL 文件
    5. 写入 domains/{domain}/
    6. 自动更新 templates/_index.md
    7. 输出后续提交步骤
```

详见 `skills/core/template-extract/SKILL.md`。

---

## TPL 文件格式规范

每个领域模板必须包含以下章节：

```markdown
# {TPL_NAME}：{中文名}

> **适用场景**：（一句话场景描述）
> **识别特征**：（原型/详设中如何识别本模式）
> **布局核心**：（关键组件 / 布局方式）
> **⚠️ 重要约束**：（与通用模板的核心区别）
> **参考标杆**：`src/views/.../{kebab-page-name}/`

---

## 识别规则

（5 条以内的明确判定条件）

---

## 代码模板

### index.vue

（完整可运行代码，使用占位符 `[资源名]` `[服务缩写]`）

### data.ts

（同上）

### index.scss

---

## 注意事项

（陷阱 / 易错点 / 性能提示）
```

---

## 命名规范

- TPL 文件名：`TPL-{ALL-CAPS-KEBAB}.md`
  示例：`TPL-OPERATION-STATION.md`、`TPL-BATCH-INSPECT.md`
- 模板标识符：与文件名一致，全大写下划线
  示例：`OPERATION_STATION`、`BATCH_INSPECT`

---

## 提交流程

1. 通过 `template-extract` Skill 生成 TPL 文件
2. 人工 review 生成的内容（脱敏 / 占位符 / 注意事项）
3. 提交 PR：`feat(template): 新增领域模板 TPL-XXX`
4. CHENY 评审合入

---

## 模板维护

- 标杆页面变更 → 同步更新 TPL（保持模板与实际代码一致）
- 模板使用频率低于预期 → 评估是否归档或合并到通用模板
- 通过 `convention-audit` 定期对比各 TPL 标杆页面与最新规范的一致性
