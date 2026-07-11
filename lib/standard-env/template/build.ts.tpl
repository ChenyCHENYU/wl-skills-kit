import path from "path";
import type { BuildOptions } from "vite";
import type { ViteContext } from "./context";

export function createBuildConfig(context: ViteContext): BuildOptions {
  const timestamp = context.buildTimestamp;

  return {
    // Federation 历史发布流程依赖保留已有 chunk，清理策略后续单独治理。
    emptyOutDir: false,
    chunkSizeWarningLimit: 1000,
    minify: "esbuild",
    reportCompressedSize: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        main: path.resolve(context.root, "index.html")
      },
      output: {
        chunkFileNames: `assets/js/src-[name].[hash]-jh_d-${timestamp}.js`,
        entryFileNames: `assets/js/[name]-jh_d-${timestamp}.js`,
        assetFileNames: "assets/[name].[hash].[ext]"
      }
    }
  };
}
