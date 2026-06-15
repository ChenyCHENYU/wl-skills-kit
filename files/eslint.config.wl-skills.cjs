/**
 * ESLint Flat Config 模板 — wl-skills-kit 生成
 *
 * init/update 时复制到业务项目根目录作为 eslint.config.cjs
 * 适用于 Vue 3 + TypeScript 项目，与 wl-skills validate 的规则互补：
 *   - validate 负责"架构级"约束（页面结构、组件使用、AST 语义）
 *   - ESLint 负责"代码级"约束（语法质量、安全、未使用变量、属性顺序）
 *
 * 对齐 wl-skills-kit 14 条 standards：
 *   04 编码基础: eslint:recommended → no-var / prefer-const / no-redeclare / curly / no-restricted-syntax
 *   05 日志:     no-console (warn)
 *   06 安全:     vue/no-v-html (warn), no-eval, no-new-func
 *   09 TS 质量:   @typescript-eslint/recommended
 *   13 组件:     vue/attributes-order, vue/no-unused-components
 *
 * 依赖（业务项目需安装）：
 *   pnpm add -D eslint eslint-plugin-vue @typescript-eslint/parser @typescript-eslint/eslint-plugin vue-eslint-parser
 */

const pluginVue = require("eslint-plugin-vue");
const vueParser = require("vue-eslint-parser");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

module.exports = [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/*.d.ts",
      "src/auto-imports.d.ts",
      "src/components.d.ts",
      "src/env.d.ts",
      "vite/**/*",
      "scripts/**/*",
      "mock/**/*",
      "demo/**/*",
      ".github/**/*",
    ],
  },

  // ── JS 基础规则（standard 04: no-var / prefer-const / no-redeclare / curly 等）
  // eslint:recommended 提供 no-var, prefer-const, no-redeclare, no-cond-assign, no-debugger, no-dupe-keys 等
  {
    rules: {
      "no-var": "error",
      "prefer-const": "error",
      "no-redeclare": "error",
      "no-cond-assign": "error",
      "no-debugger": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-empty": "warn",
      "no-irregular-whitespace": "warn",
      "no-sparse-arrays": "warn",
      "no-unreachable": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
      "no-fallthrough": "error",
      "curly": ["warn", "multi-line"],
    },
  },

  // ── 安全规则（standard 06: eval / new Function / v-html）
  {
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
    },
  },

  // Vue 3 essential rules
  ...pluginVue.configs["flat/essential"],

  // TypeScript: parser + recommended rules
  {
    files: ["**/*.{ts,tsx,vue}"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 2020,
        sourceType: "module",
        extraFileExtensions: [".vue"],
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
    },
  },

  // ── 项目专属规则（与 wl-skills-kit 14 条 standards 精确对齐）
  {
    rules: {
      // 09 TS: strict: false 项目允许 any，但标记未使用变量
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // 05 日志: console.log 残留（允许 warn/error）
      "no-console": ["warn", { allow: ["warn", "error"] }],

      // 06 安全: v-html 必须有注释说明（warn 级，让开发者留意）
      "vue/no-v-html": "warn",

      // Vue 组件质量
      "vue/multi-word-component-names": ["error", { ignores: ["index"] }],
      "vue/require-default-prop": "off",
      "vue/attributes-order": "warn",
      "vue/no-unused-components": "warn",
    },
  },
];
