import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 20000,
    hookTimeout: 20000,
    // CLI 黑盒测试会在 Windows 上同步启动大量 Node 子进程；文件并行会使
    // Vitest worker 的 onTaskUpdate RPC 超时，即使所有断言已经通过。
    fileParallelism: false,
    maxWorkers: 1,
  },
});
