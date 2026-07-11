import type { ProxyOptions, ServerOptions } from "vite";
import { APP_CONFIG, type LocalBackendRoute } from "./app";
import type { ViteContext } from "./context";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createLocalBackendProxy(
  context: ViteContext,
  matchPrefix: string,
  rewritePrefix: string
): ProxyOptions {
  const pattern = new RegExp(`^${escapeRegExp(matchPrefix)}`);
  return {
    target: context.localBackendUrl,
    changeOrigin: true,
    rewrite: (requestPath) => requestPath.replace(pattern, rewritePrefix),
    // 本地服务不经过平台 OAuth2，避免把远程 token 误传给本地后端。
    configure(proxy) {
      proxy.on("proxyReq", (proxyRequest) => {
        proxyRequest.removeHeader("Authorization");
      });
    }
  };
}

function resolveLocalBackendRoutes(): readonly LocalBackendRoute[] {
  if (APP_CONFIG.localBackendMode === "all") return [];
  if (APP_CONFIG.localBackendMode === "module") {
    return [{ match: APP_CONFIG.moduleName, rewrite: "" }];
  }
  return APP_CONFIG.localBackendRoutes;
}

function createApiProxies(context: ViteContext) {
  if (!context.useLocalBackend) {
    return {
      [context.baseApi]: {
        target: context.webUrl,
        changeOrigin: true,
        secure: false
      }
    };
  }

  if (APP_CONFIG.localBackendMode === "all") {
    return {
      [context.baseApi]: createLocalBackendProxy(context, context.baseApi, "")
    };
  }

  const localRoutes = Object.fromEntries(
    resolveLocalBackendRoutes().map((route) => {
      const requestPrefix = `${context.baseApi}/${route.match}`;
      const rewritePrefix = route.rewrite ? `/${route.rewrite}` : "";
      return [
        requestPrefix,
        createLocalBackendProxy(context, requestPrefix, rewritePrefix)
      ];
    })
  );

  return {
    ...localRoutes,
    [context.baseApi]: {
      target: context.webUrl,
      changeOrigin: true,
      secure: false
    }
  };
}

function createExtraProxies(): Record<string, ProxyOptions> {
  return Object.fromEntries(
    APP_CONFIG.extraProxies.map((item) => {
      const pattern = new RegExp(`^${escapeRegExp(item.prefix)}`);
      return [
        item.prefix,
        {
          target: item.target,
          changeOrigin: true,
          rewrite: (requestPath: string) =>
            requestPath.replace(pattern, item.rewritePrefix)
        }
      ];
    })
  );
}

function createProxyConfig(context: ViteContext) {
  return {
    ...createApiProxies(context),
    ...createExtraProxies(),
    "/assets": {
      target: context.isPublicLocal ? context.localPublicUrl : context.webUrl,
      changeOrigin: true,
      secure: false,
      rewrite: (requestPath: string) => requestPath
    },
    "/anyrt": {
      target: context.anyReportServer,
      rewrite: (requestPath: string) => requestPath.replace(/^\/anyrt/, "")
    },
    // /sub/public 必须在 /sub 之前声明，防止被宽泛规则提前截获。
    ...(context.isPublicLocal
      ? {
          "/sub/public": {
            target: context.localPublicUrl,
            rewrite: (requestPath: string) =>
              requestPath.replace(/^\/sub\/public/, "")
          }
        }
      : {}),
    "/sub": {
      target: context.webUrl,
      changeOrigin: true,
      secure: false,
      rewrite: (requestPath: string) => requestPath.replace(/^\/sub/, "/sub/")
    },
    "/node-server": {
      target: APP_CONFIG.nodeServerUrl,
      rewrite: (requestPath: string) =>
        requestPath.replace(/^\/node-server/, "")
    }
  };
}

export function createServerConfig(context: ViteContext): ServerOptions {
  return {
    hmr: true,
    host: "0.0.0.0",
    port: APP_CONFIG.devServerPort,
    strictPort: true,
    cors: true,
    headers: {
      "Permissions-Policy": "unload=(self)"
    },
    proxy: createProxyConfig(context)
  };
}
