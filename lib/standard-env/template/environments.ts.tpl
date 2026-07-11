import type { AppEnv } from "./app";

type HttpUrl = `http://${string}` | `https://${string}`;

interface EnvironmentConfig {
  apiPrefix: string;
  webUrl: HttpUrl;
}

export const ENVIRONMENTS: Record<AppEnv, EnvironmentConfig> = __ENVIRONMENTS__;
