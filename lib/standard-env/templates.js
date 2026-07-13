"use strict";

const fs = require("fs");
const path = require("path");

const TEMPLATE_ROOT = path.join(__dirname, "template");

const DEFAULT_OPTIMIZED_DEPENDENCIES = [
  "@jhlc/common-core",
  "element-plus/es",
  "element-plus/es/components/base/style/css",
  "element-plus/es/components/loading/style/css",
  "jquery",
  "lodash",
  "json-bigint",
  "jszip",
  "dayjs",
  "dayjs/plugin/customParseFormat.js",
  "dayjs/plugin/advancedFormat.js",
  "dayjs/plugin/localeData.js",
  "dayjs/plugin/weekOfYear.js",
  "dayjs/plugin/weekYear.js",
  "dayjs/plugin/dayOfYear.js",
  "dayjs/plugin/isSameOrAfter.js",
  "dayjs/plugin/isSameOrBefore.js",
];

function template(name) {
  return fs.readFileSync(path.join(TEMPLATE_ROOT, `${name}.tpl`), "utf8");
}

function replaceAll(content, replacements) {
  let result = content;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.split(key).join(value);
  }
  return result.endsWith("\n") ? result : `${result}\n`;
}

function json(value) {
  return JSON.stringify(value);
}

function renderEnv(values, profile) {
  const title =
    profile.preset === "walsin"
      ? "华新丽华数字化平台"
      : values.VITE_APP_TITLE || profile.title;
  const lines = [
    `ENV_ANY_REPORT_SERVER=${
      values.ENV_ANY_REPORT_SERVER ||
      (profile.preset === "walsin" ? "http://172.18.247.123:8096" : "")
    }`,
    `ENV_ANY_REPORT_SECRET_KEY=${values.ENV_ANY_REPORT_SECRET_KEY || ""}`,
    "",
    `TOKEN_LOCALSTORAGE=${values.TOKEN_LOCALSTORAGE || "true"}`,
    `VITE_APP_TITLE=${title}`,
    "",
    `ENV_LOCAL_API=${values.ENV_LOCAL_API || "http://localhost:10010"}`,
    `ENV_LOCAL_PUBLIC=${values.ENV_LOCAL_PUBLIC || "http://localhost:8002"}`,
  ];
  return `${lines.join("\n")}\n`;
}

function renderEnvironments(profile) {
  const values = {};
  for (const [key, item] of Object.entries(profile.environments)) {
    values[key] = { apiPrefix: item.apiPrefix, webUrl: item.webUrl };
  }
  return replaceAll(template("environments.ts"), {
    __ENVIRONMENTS__: JSON.stringify(values, null, 2),
  });
}

function renderApp(options) {
  return replaceAll(template("app.ts"), {
    __MODULE_NAME__: json(options.moduleName),
    __APP_TITLE__: json(options.appTitle),
    __LOCAL_API__: json(options.localApi),
    __LOCAL_PUBLIC__: json(options.localPublic),
    __LOCAL_MODE__: json(options.localMode),
    __LOCAL_ROUTES__: JSON.stringify(options.localRoutes || [], null, 2),
    __EXTRA_PROXIES__: JSON.stringify(options.extraProxies || [], null, 2),
  });
}

function renderBase(inspection) {
  const dependencies = [
    ...new Set([
      ...DEFAULT_OPTIMIZED_DEPENDENCIES,
      ...(inspection.optimizedDependencies || []),
    ]),
  ];
  const extraAliases = (inspection.aliases || [])
    .map(
      (alias) =>
        `,\n        {\n          find: ${json(alias.find)},\n          replacement: path.resolve(context.root, ${json(alias.replacement)})\n        }`,
    )
    .join("");
  return replaceAll(template("base.ts"), {
    __OPTIMIZED_DEPENDENCIES__: JSON.stringify(dependencies, null, 2),
    __EXTRA_ALIASES__: extraAliases,
  });
}

function renderPackage(pkg, options) {
  const next = JSON.parse(JSON.stringify(pkg || {}));
  next.scripts = { ...(next.scripts || {}) };
  next.scripts.preinstall = next.scripts.preinstall || "npx only-allow pnpm";
  next.scripts.dev = "vite --open --mode dev --";
  next.scripts["dev:local"] = "vite --open --mode dev -- --backend=local";
  next.scripts["dev:public"] = "vite --open --mode dev -- --public=local";
  next.scripts.build =
    "cross-env NODE_OPTIONS=--max_old_space_size=8192 vite build --mode dev";
  for (const key of ["dev", "sit", "uat", "pre", "prd"]) {
    next.scripts[`build:${key}`] =
      `cross-env NODE_OPTIONS=--max_old_space_size=8192 vite build --mode ${key}`;
  }

  if (options.packageName && !next.name) next.name = options.packageName;
  return `${JSON.stringify(next, null, 2)}\n`;
}

function patchLegacyPluginIndex(content) {
  if (!content || !/remotes\s*:\s*\{\s*\}/.test(content)) return content;
  const webUrlPattern = /  const webUrl = option\.isBuild \? "" : option\.webUrl;/;
  if (!webUrlPattern.test(content)) {
    throw new Error("旧 Federation 插件结构无法安全迁移：未识别 webUrl 声明");
  }

  let next = content.replace(
    webUrlPattern,
    [
      '  const webUrl = option.isBuild || option.isPublicLocal ? "" : option.webUrl;',
      "  const mainRemoteEntry =",
      "    option.isPublicLocal && !option.isBuild",
      "      ? `/sub/public/assets/${filename}?t=${t}`",
      "      : `/assets/${filename}?t=${t}`;",
      "  const remotes = {",
      "    main: mainRemoteEntry,",
      "    systemApp: `${webUrl}/sub/systemApp/assets/remoteEntry.js?t=${t}`,",
      "    agGridApp: `${webUrl}/sub/ag-grid/assets/remoteEntry.js?t=${t}`",
      "  };",
    ].join("\n"),
  );
  next = next.replace(/remotes\s*:\s*\{\s*\}/g, "remotes");
  next = next.replace(
    /(\}\s*else\s*\{\s*\r?\n(?:\s*\/\/[^\n]*\r?\n)*)\s*(?:const\s+localOrRemote\s*=\s*[^;]+;\s*\r?\n)?\s*const\s+remotes\s*=\s*\{(?:[^\r\n]*\};\s*\r?\n|[\s\S]*?\r?\n\s*\};\s*\r?\n)/m,
    "$1",
  );
  const remoteDeclarations = next.match(/\bconst\s+remotes\s*=/g) || [];
  if (
    remoteDeclarations.length !== 1 ||
    /\bconst\s+localOrRemote\b/.test(next) ||
    /remotes\s*:\s*\{\s*\}/.test(next)
  ) {
    throw new Error("旧 Federation 插件结构无法安全迁移：remotes 分支未完整收敛");
  }
  return next;
}

function patchLegacyMain(content) {
  if (!content || !content.includes("VITE_USE_MOCKJS")) return content;
  const next = content.replace(
    /\n?\s*\/\/[^\n]*Mock[^\n]*\n\s*if\s*\(\s*import\.meta\.env\.DEV\s*&&\s*import\.meta\.env\.VITE_USE_MOCKJS\s*===\s*["']true["']\s*\)\s*\{\s*\n\s*import\(["']@\/mock["']\);[^\n]*\n\s*\}\s*/m,
    "\n",
  );
  if (next === content) {
    throw new Error("旧 Mock 入口无法安全迁移：请先人工确认 VITE_USE_MOCKJS 逻辑");
  }
  return next;
}

function renderManagedFiles(inspection, profile, options) {
  const appTitle =
    profile.preset === "walsin"
      ? "华新丽华数字化平台"
      : inspection.envValues.VITE_APP_TITLE || profile.title;
  const localApi = options.localApi || "http://localhost:10010";
  const localPublic = options.localPublic || "http://localhost:8002";
  const appOptions = {
    moduleName: options.moduleName,
    appTitle,
    localApi,
    localPublic,
    localMode: options.localMode,
    localRoutes: options.localRoutes,
    extraProxies: inspection.extraProxies,
  };

  const files = {
    ".env": renderEnv(
      {
        ...inspection.envValues,
        ENV_LOCAL_API: localApi,
        ENV_LOCAL_PUBLIC: localPublic,
      },
      profile,
    ),
    "package.json": renderPackage(inspection.packageJson, {
      packageName: `wl-ui-${options.moduleName}`,
    }),
    "vite.config.ts": template("vite.config.ts"),
    "vite/config/app.ts": renderApp(appOptions),
    "vite/config/base.ts": renderBase(inspection),
    "vite/config/build.ts": template("build.ts"),
    "vite/config/context.ts": template("context.ts"),
    "vite/config/environments.ts": renderEnvironments(profile),
    "vite/config/plugins.ts": template("plugins.ts"),
    "vite/config/server.ts": template("server.ts"),
    "vite/plugins/type.ts": template("plugin-type.ts"),
  };
  appendPatchedPlugin(files, inspection);
  appendPatchedMain(files, inspection.root);
  return files;
}

function appendPatchedPlugin(files, inspection) {
  if (!inspection.viteContent) return;
  const pluginPath = path.join(inspection.root, "vite/plugins/index.ts");
  if (!fs.existsSync(pluginPath)) return;
  const before = fs.readFileSync(pluginPath, "utf8");
  const after = patchLegacyPluginIndex(before);
  if (after !== before) files["vite/plugins/index.ts"] = after;
}

function appendPatchedMain(files, root) {
  const mainPath = path.join(root, "src/main.ts");
  if (!fs.existsSync(mainPath)) return;
  const before = fs.readFileSync(mainPath, "utf8");
  const after = patchLegacyMain(before);
  if (after !== before) files["src/main.ts"] = after;
}

module.exports = {
  DEFAULT_OPTIMIZED_DEPENDENCIES,
  renderManagedFiles,
  _internal: {
    renderApp,
    renderBase,
    renderEnv,
    renderEnvironments,
    renderPackage,
    patchLegacyPluginIndex,
    patchLegacyMain,
  },
};
