# 导入导出与 Mock 写操作

> 命中 Excel 导入导出或需要 Mock 写端点时读取。

### 导出/导入实现模式

> 使用 `xlsx` 库进行客户端 Excel 生成与解析，不依赖后端文件流。

**导出（data.ts 顶部需 `import * as XLSX from "xlsx"`）**：

```typescript
{
  label: "导出",
  plain: true,
  onClick: async () => {
    const data = this.list.value;
    if (!data?.length) { ElMessage.warning("无数据可导出"); return; }
    const exportData = data.map((row: any) => ({
      "列中文名1": row.fieldName1,
      "列中文名2": row.fieldName2
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "导出文件名.xlsx");
    ElMessage.success("导出成功");
  }
}
```

**导入（需 mock 提供 import 端点）**：

```typescript
{
  label: "导入",
  plain: true,
  onClick: () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
        if (!rows.length) { ElMessage.warning("文件无有效数据"); return; }
        await postAction(API_CONFIG.import, { rows });
        ElMessage.success(`导入成功 ${rows.length} 条`);
        this.select();
      } catch { ElMessage.error("导入失败，请检查文件格式"); }
    };
    input.click();
  }
}
```

### Mock 端点最佳实践

> **核心原则**：Mock 模式下所有操作必须能完整走通，不可出现接口报错。
> data.ts 中每个 `postAction(API_CONFIG.xxx, ...)` 调用，mock 文件中都必须有对应端点。

**1. 所有端点必须修改 dataPool**

mock 端点不能只返回 `{ code: 2000 }` — 必须实际修改内存中的 `dataPool` 数据，否则 `this.select()` 刷新后数据不变。

```typescript
// ✅ 正确：启用端点修改 dataPool 中的 enableStatus
{
  url: "/dev-api/sale/xxx/enable",
  method: "post",
  response: ({ body }: any) => {
    const ids = body?.ids || [];
    ids.forEach((id: string) => {
      const item = dataPool.find((d) => d.id === id);
      if (item) item.enableStatus = "已启用";
    });
    return { code: 2000, message: "启用成功", data: null };
  }
}

// ❌ 错误：只返回成功，不修改数据
{
  url: "/dev-api/sale/xxx/enable",
  method: "post",
  response: () => ({ code: 2000, message: "启用成功", data: null })
}
```

**2. 常见操作的 Mock 修改模式**

| 操作 | dataPool 修改方式 |
| --- | --- |
| 删除 | `dataPool.splice(idx, 1)` |
| 新增 | `dataPool.unshift({ ...genRecord(), ...body, id: Random.id() })` |
| 编辑 | `Object.assign(dataPool[idx], body)` |
| 启用/停用 | 修改 `item.enableStatus` |
| 提交/审批 | 修改 `item.approvalStatus` |
| 作废 | `dataPool.splice(idx, 1)` 或修改状态 |
| 分配/认领 | 修改 `item.businessPerson` |

**3. 端点覆盖检查**

生成完成后，逐个对比 `API_CONFIG` 的所有 key 与 mock 文件中的 `url`，确保一一对应、零遗漏。
