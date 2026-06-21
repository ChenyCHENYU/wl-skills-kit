"use strict";

/**
 * lib/vite-plugin-wl-skills.js — wl-skills-kit Vite 构建时约束插件
 *
 * 这是不依赖业务项目配置 CI 的"第五层防线"：
 *   dev 模式 → 启动时扫描 src/views，在终端输出 warning
 *   build 模式 → 构建前全量扫描，有 error 级别违规时中断构建
 *
 * 使用方式（业务项目 vite.config.ts）：
 *   import wlSkillsPlugin from "@agile-team/wl-skills-kit/lib/vite-plugin-wl-skills.js";
 *   export default defineConfig({
 *     plugins: [vue(), wlSkillsPlugin()],
 *   });
 *
 * 或在 init/update 时自动注入到 vite.config.ts 的 plugins 数组（可选）。
 *
 * 约束层级定位：
 *   ① AI 指令层（文字） → 可被忽略
 *   ② validate 检测层 → 手动调用
 *   ③ pre-commit 层 → --no-verify 可绕过
 *   ④ CI 层 → 业务项目需手动配置
 *   ⑤ Vite 插件层（本插件） → 构建时自动执行，无需额外配置 ← 不可绕开
 */

let astRules = null;
try {
  astRules = require("./ast-rules.js");
} catch {
  astRules = null;
}

function wlSkillsPlugin(options) {
  options = options || {};
  const scanRel = options.scanRel || "src/views";
  const failOnWarn = options.failOnWarn || false; // build 模式下 warn 也中断（等同 --strict）

  return {
    name: "wl-skills-guard",
    apply: "all", // serve + build 都生效

    configResolved(config) {
      // 只在业务项目运行，跳过 kit 自身
      if (!astRules || !astRules.hasAstAvailable()) return;

      const root = config.root || process.cwd();
      const isBuild = config.command === "build";

      const result = astRules.runAstRules(root, scanRel);
      if (!result.astAvailable) return;

      const errors = result.issues.filter((i) => i.level === "error");
      const warns = result.issues.filter((i) => i.level === "warn");

      if (result.issues.length === 0) {
        if (isBuild) {
          console.log("\n  ✔ wl-skills-guard: 页面规范检查通过（" + result.pages + " 个页面）\n");
        }
        return;
      }

      // 输出所有问题
      console.log("\n  wl-skills-guard: 发现 " + result.issues.length + " 个规范偏差（" + result.pages + " 页面）");
      for (const issue of result.issues.slice(0, 30)) {
        const icon = issue.level === "error" ? "✖" : "⚠";
        console.log("  " + icon + " [" + issue.rule + "] " + issue.dir + " — " + issue.text);
      }
      if (result.issues.length > 30) {
        console.log("  ... 还有 " + (result.issues.length - 30) + " 条");
      }

      // build 模式：error 中断构建
      if (isBuild && errors.length > 0) {
        console.log("\n  ✖ wl-skills-guard: 构建中断 — " + errors.length + " 个 error 级规范违规");
        console.log("  → 修复后重新构建，或使用 wl-skills:ignore 标记豁免");
        throw new Error(
          "wl-skills-guard: " + errors.length + " 个 error 级规范违规，构建已中断",
        );
      }

      // build 模式 + failOnWarn：warn 也中断
      if (isBuild && failOnWarn && warns.length > 0) {
        console.log("\n  ✖ wl-skills-guard: 构建中断 — " + warns.length + " 个 warn 级规范违规（failOnWarn）");
        throw new Error(
          "wl-skills-guard: " + warns.length + " 个 warn 级违规（failOnWarn 模式）",
        );
      }

      console.log("");
    },
  };
}

module.exports = wlSkillsPlugin;
module.exports.default = wlSkillsPlugin;
