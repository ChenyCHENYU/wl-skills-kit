"use strict";

/**
 * Kit 内置 AST 规则的唯一编号注册表。
 *
 * 面向 CLI 帮助、治理校验和测试提供统一的规则范围，避免实现已新增规则、
 * 文档/帮助仍停留在旧编号的漂移。
 */
const AST_RULE_IDS = Object.freeze(
  Array.from({ length: 20 }, (_value, index) => `K${index + 1}`),
);

const AST_RULE_RANGE = `${AST_RULE_IDS[0]}~${AST_RULE_IDS.at(-1)}`;

function isAstRule(rule) {
  return AST_RULE_IDS.includes(String(rule).toUpperCase());
}

module.exports = {
  AST_RULE_IDS,
  AST_RULE_RANGE,
  isAstRule,
};
