import { loadEnv, type ConfigEnv } from "vite";
import type { PluginOption } from "../plugins/type";
import {
  APP_CONFIG,
  APP_ENVS,
  getEnvOption,
  isAppEnv,
  type AppEnv
} from "./app";
import { ENVIRONMENTS } from "./environments";

type Source = "remote" | "local";
export type DevMode = "remote" | "backend" | "public";

export interface RuntimeEnvironment {
  VUE_APP_BASE_API: string;
  VUE_APP_PREFIX: string;
  VUE_APP_TOKEN_LOCALSTORAGE: string;
  APP_NAME: string;
  ANY_REPORT_SERVER: string;
  ANY_REPORT_SECRET_KEY: string;
  IS_PLATFORM: true;
  VERSION: string;
  OPTION: PluginOption;
}

export interface ViteContext {
  root: string;
  command: ConfigEnv["command"];
  target: AppEnv;
  isBuild: boolean;
  devMode: DevMode;
  useLocalBackend: boolean;
  isPublicLocal: boolean;
  base: string;
  baseApi: string;
  webUrl: string;
  webApi: string;
  localBackendUrl: string;
  localPublicUrl: string;
  anyReportServer: string;
  version: string;
  buildTimestamp: number;
  rawEnv: Record<string, string>;
  pluginOption: PluginOption;
  runtimeEnv: RuntimeEnvironment;
}

function readCliValue(name: string, argv: string[]) {
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.split("=").slice(1).join("=");

  const index = argv.indexOf(`--${name}`);
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--")) {
    return argv[index + 1];
  }

  return "";
}

function resolveSource(name: "backend" | "public", argv: string[]): Source {
  const value = (readCliValue(name, argv) || "remote").toLowerCase();
  if (value !== "remote" && value !== "local") {
    throw new Error(`[dev] --${name} only supports "remote" or "local".`);
  }
  return value;
}

function normalizeApiPrefix(prefix: string) {
  return prefix.replace(/^\/+/, "").replace(/\/+$/, "");
}

function removeTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function formatVersion(now: Date) {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} ${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
}

// 平台运行时会在 getEnv() 中将下划线还原为点，避免 URL 被 define 序列化后误读。
function encodeRuntimeUrl(value: string) {
  return value.replace(/\./g, "_");
}

export function resolveViteContext(
  configEnv: ConfigEnv,
  argv = process.argv,
  root = process.cwd(),
  now = new Date()
): ViteContext {
  const requestedTarget = readCliValue("target", argv) || configEnv.mode;
  if (!isAppEnv(requestedTarget)) {
    throw new Error(
      `[env] Unsupported target "${requestedTarget}". Use: ${APP_ENVS.join(", ")}`
    );
  }

  const backendSource = resolveSource("backend", argv);
  const publicSource = resolveSource("public", argv);
  if (backendSource === "local" && publicSource === "local") {
    throw new Error(
      "[dev] Local backend and local public are separate workflows; choose one."
    );
  }

  const isBuild = configEnv.command === "build";
  if (isBuild && (backendSource === "local" || publicSource === "local")) {
    throw new Error(
      "[build] Local development sources cannot be used for builds."
    );
  }

  const target = requestedTarget;
  const rawEnv = loadEnv(target, root, "");
  const environment = ENVIRONMENTS[target];
  const webUrl = removeTrailingSlash(
    rawEnv["ENV_WEB_URL"] || environment.webUrl
  );
  const baseApi =
    "/" + normalizeApiPrefix(rawEnv["ENV_API_PREFIX"] || environment.apiPrefix);
  const webApi = `${webUrl}${baseApi}`;
  const useLocalBackend = backendSource === "local";
  const isPublicLocal = publicSource === "local";
  const devMode: DevMode = isPublicLocal
    ? "public"
    : useLocalBackend
      ? "backend"
      : "remote";
  const version = formatVersion(now);

  const pluginOption: PluginOption = {
    isBuild,
    // 兼容历史插件：isLocal 只表示 public 是否在本地。
    isLocal: isPublicLocal,
    isPublicLocal,
    devMode,
    baseApi,
    module: APP_CONFIG.moduleName,
    env: target,
    ...getEnvOption(target),
    version,
    webUrl,
    webApi
  };

  const runtimeEnv: RuntimeEnvironment = {
    VUE_APP_BASE_API: baseApi,
    VUE_APP_PREFIX: readCliValue("base", argv),
    VUE_APP_TOKEN_LOCALSTORAGE: rawEnv["TOKEN_LOCALSTORAGE"],
    APP_NAME: rawEnv["VITE_APP_TITLE"] || APP_CONFIG.defaultTitle,
    ANY_REPORT_SERVER: rawEnv["ENV_ANY_REPORT_SERVER"],
    ANY_REPORT_SECRET_KEY: rawEnv["ENV_ANY_REPORT_SECRET_KEY"],
    IS_PLATFORM: true,
    VERSION: version,
    OPTION: {
      ...pluginOption,
      webUrl: encodeRuntimeUrl(webUrl),
      webApi: encodeRuntimeUrl(webApi)
    }
  };

  return {
    root,
    command: configEnv.command,
    target,
    isBuild,
    devMode,
    useLocalBackend,
    isPublicLocal,
    base: runtimeEnv.VUE_APP_PREFIX,
    baseApi,
    webUrl,
    webApi,
    localBackendUrl: removeTrailingSlash(
      rawEnv["ENV_LOCAL_API"] || APP_CONFIG.defaultLocalBackendUrl
    ),
    localPublicUrl: removeTrailingSlash(
      rawEnv["ENV_LOCAL_PUBLIC"] || APP_CONFIG.defaultLocalPublicUrl
    ),
    anyReportServer: rawEnv["ENV_ANY_REPORT_SERVER"],
    version,
    buildTimestamp: now.getTime(),
    rawEnv,
    pluginOption,
    runtimeEnv
  };
}
