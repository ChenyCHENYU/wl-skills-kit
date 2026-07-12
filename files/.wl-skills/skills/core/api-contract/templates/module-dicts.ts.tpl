/**
 * 模块字典发布契约。由页面 api.md 的 dict-contract 汇总；MCP 仅从本文件读取待发布数据。
 * 禁止写函数、变量引用或动态表达式，确保可静态校验和审计。
 */
export const MODULE_DICTIONARIES = {
  "schemaVersion": 1,
  "module": {
    "code": "{{ModuleCode}}",
    "name": "{{ModuleName}}"
  },
  "dictionaries": []
} as const
