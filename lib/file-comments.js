"use strict";

/** 只读取文件开头的真实注释，避免把模板或字符串中的 @Description 当文件头。 */
function inspectFileHeader(source, kind) {
  const text = source.replace(/^\uFEFF/, "");
  const match = kind === "vue"
    ? /^\s*<!--([\s\S]*?)-->/.exec(text)
    : /^\s*\/\*([\s\S]*?)\*\//.exec(text) || /^\s*((?:\/\/[^\n]*(?:\n|$))+)/.exec(text);
  if (!match) return { hasHeader: false };
  const body = match[1].replace(/^\s*(?:\*|\/\/)[ \t]?/gm, "").trim();
  const tagged = /^[ \t]*@Description[ \t]*:[ \t]*(.*)$/im.exec(body);
  const hasMetadata = /^[ \t]*@(?:Author|Date|LastEditors|LastEditTime|FilePath|Description)\b/im.test(body);
  const description = tagged ? tagged[1].trim() : hasMetadata ? undefined : body;
  return { hasHeader: true, description, hasMetadata };
}

function headerCommentIssue(source, kind) {
  const header = inspectFileHeader(source, kind);
  if (!header.hasHeader) return null; // 存量无头文件不新增全量阻断；新产物由生成器和审查保证。
  if (header.description === undefined) return { level: "info", text: "元数据文件头缺少职责说明；补 @Description，或使用简短职责注释" };
  if (!header.description || /这是默认设置|请设置\s*[`'"]?customMade|打开\s*koroFileHeader\s*查看配置/i.test(header.description)) {
    return { level: "warn", text: "文件头职责说明为空或仍是插件占位模板；按 03-comments 填写已确认菜单与文件职责" };
  }
  return null;
}

module.exports = { inspectFileHeader, headerCommentIssue };
