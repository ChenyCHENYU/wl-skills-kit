import type { PluginOption } from "../plugins/type";

export const APP_ENVS = ["dev", "sit", "uat", "pre", "prd"] as const;

export type AppEnv = (typeof APP_ENVS)[number];

export interface LocalBackendRoute {
  match: string;
  rewrite: string;
}

export interface ExtraProxyConfig {
  prefix: string;
  target: `http://${string}` | `https://${string}`;
  rewritePrefix: string;
}

export const APP_CONFIG = {
  moduleName: __MODULE_NAME__,
  devServerPort: 8001,
  defaultTitle: __APP_TITLE__,
  defaultLocalBackendUrl: __LOCAL_API__,
  defaultLocalPublicUrl: __LOCAL_PUBLIC__,
  nodeServerUrl: "http://127.0.0.1:2000",
  localBackendMode: __LOCAL_MODE__ as "all" | "module" | "routes",
  localBackendRoutes: __LOCAL_ROUTES__ as readonly LocalBackendRoute[],
  extraProxies: __EXTRA_PROXIES__ as readonly ExtraProxyConfig[]
} as const;

const FR_DIR_BY_ENV: Record<AppEnv, PluginOption["frDir"]> = {
  dev: "jh_dev",
  sit: "jh_sit",
  uat: "jh_uat",
  pre: "jh_pre",
  prd: "jh"
};

export function isAppEnv(value: string): value is AppEnv {
  return APP_ENVS.includes(value as AppEnv);
}

export function getEnvOption(env: AppEnv): Pick<PluginOption, "frDir"> {
  return { frDir: FR_DIR_BY_ENV[env] };
}
