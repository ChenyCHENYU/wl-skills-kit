import type { Plugin, PluginOption } from "vite";
import createVitePlugins from "../plugins";
import type { RuntimeEnvironment, ViteContext } from "./context";

// 开发时动态返回运行时配置，避免静态 env-dev.json 混入其他环境构建产物。
function createRuntimeEnvPlugin(runtimeEnv: RuntimeEnvironment): Plugin {
  return {
    name: "serve-runtime-env-json",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathName = request.url?.split("?")[0];
        if (pathName !== "/env-dev.json") {
          next();
          return;
        }

        response.setHeader("Content-Type", "application/json;charset=utf-8");
        response.end(JSON.stringify(runtimeEnv, null, 2));
      });
    }
  };
}

function createRootIndexPlugin(): Plugin {
  return {
    name: "serve-root-index",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.url === "/") request.url = "/index.html";
        next();
      });
    }
  };
}

export async function createConfigPlugins(
  context: ViteContext
): Promise<PluginOption[]> {
  const appPlugins = await createVitePlugins(
    context.rawEnv,
    context.pluginOption
  );

  return [
    createRuntimeEnvPlugin(context.runtimeEnv),
    createRootIndexPlugin(),
    ...appPlugins
  ];
}
