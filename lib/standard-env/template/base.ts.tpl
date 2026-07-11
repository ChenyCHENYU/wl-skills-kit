import path from "path";
import type { UserConfig } from "vite";
import { APP_CONFIG } from "./app";
import type { ViteContext } from "./context";

const OPTIMIZED_DEPENDENCIES = __OPTIMIZED_DEPENDENCIES__;

export function createBaseConfig(context: ViteContext): UserConfig {
  return {
    appType: "spa",
    define: {
      "process.env": context.runtimeEnv
    },
    base: context.isBuild ? `/sub/${APP_CONFIG.moduleName}/` : "/",
    css: {
      postcss: {
        plugins: []
      }
    },
    resolve: {
      extensions: [".mjs", ".js", ".ts", ".jsx", ".tsx", ".json", ".vue"],
      alias: [
        {
          find: "@",
          replacement: path.resolve(context.root, "src")
        }__EXTRA_ALIASES__
      ]
    },
    optimizeDeps: {
      exclude: ["@jhlc/utils", "@jhlc/types", "pinia", "vue-router"],
      include: OPTIMIZED_DEPENDENCIES
    },
    esbuild: {
      target: "es2022"
    }
  };
}
