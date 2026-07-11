import { defineConfig } from "vite";
import { createBaseConfig } from "./vite/config/base";
import { createBuildConfig } from "./vite/config/build";
import { resolveViteContext } from "./vite/config/context";
import { createConfigPlugins } from "./vite/config/plugins";
import { createServerConfig } from "./vite/config/server";

export default defineConfig(async (configEnv) => {
  const context = resolveViteContext(configEnv);

  return {
    ...createBaseConfig(context),
    server: createServerConfig(context),
    plugins: await createConfigPlugins(context),
    build: createBuildConfig(context)
  };
});
