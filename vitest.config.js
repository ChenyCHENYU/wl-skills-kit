import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 20000,
    hookTimeout: 20000,
    // CLI 黑盒测试会在 Windows 上同步启动大量 Node 子进程；fork worker 会放大
    // 子进程创建开销并触发 onTaskUpdate RPC 超时。单 thread 顺序运行保持隔离且稳定。
    pool: "threads",
    fileParallelism: false,
    maxWorkers: 1,
  },
});
