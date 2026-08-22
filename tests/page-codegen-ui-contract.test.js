import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const codegenRoot = path.resolve(
  __dirname,
  "../files/.wl-skills/skills/core/page-codegen",
);

function read(relativePath) {
  return fs.readFileSync(path.join(codegenRoot, relativePath), "utf8");
}

describe("page-codegen 与 wl-skills-ui 闭环契约", () => {
  it("列表模板把分页放在独立右对齐容器中", () => {
    for (const file of [
      "templates/universal/TPL-LIST.md",
      "templates/universal/TPL-TREE-LIST.md",
      "templates/universal/TPL-MASTER-DETAIL.md",
      "templates/domains/produce/TPL-OPERATION-STATION.md",
    ]) {
      const source = read(file);
      expect(source).toContain('class="list-page__pager"');
      expect(source).toMatch(
        /\.list-page__pager\s*\{[\s\S]*?justify-content:\s*flex-end/,
      );
      expect(source).not.toMatch(/<\/BaseTable>\s*<jh-pagination/);
    }
  });

  it("操作列固定在右侧、居中并按按钮数量留出宽度", () => {
    const list = read("templates/universal/TPL-LIST.md");
    const tree = read("templates/universal/TPL-TREE-LIST.md");
    for (const source of [list, tree]) {
      expect(source).toMatch(
        /label:\s*"操作"[\s\S]*?width:\s*(?:140|200)[\s\S]*?fixed:\s*"right"[\s\S]*?align:\s*"center"[\s\S]*?renderOps\(/,
      );
      expect(source).toMatch(/type:\s*"edit"/);
      expect(source).toMatch(/type:\s*"del"/);
    }
  });

  it("生成规范锁定输入间距、placeholder、数字箭头和状态 Tag", () => {
    const skill = read("SKILL.md");
    const form = read("references/form-ui.md");
    const table = read("references/table-interactions.md");
    expect(skill).toMatch(/不得在页面样式中把 `\.el-input__inner`、`\.el-input__wrapper` 的 `padding` 清零/);
    expect(skill).toMatch(/数字输入框只声明业务语义/);
    expect(skill).toMatch(/状态\/字典列必须使用 `logicType/);
    expect(form).toMatch(/placeholder/);
    expect(form).toMatch(/不得在页面 `index\.scss` 中覆盖/);
    expect(table).toMatch(/list-page__pager/);
    expect(table).toMatch(/renderOps/);
    expect(table).toMatch(/ElTag/);
  });

  it("表单模板直接生成小尺寸控件并保留占位符", () => {
    const formRoute = read("templates/universal/TPL-FORM-ROUTE.md");
    const detailTabs = read("templates/universal/TPL-DETAIL-TABS.md");
    const recordForm = read("templates/universal/TPL-RECORD-FORM.md");
    for (const source of [formRoute, detailTabs, recordForm]) {
      expect(source).toMatch(/<(?:el-input|jh-select|jh-date)[\s\S]*?size="small"/);
    }
    expect(formRoute).toMatch(/<el-input[^>]+placeholder=/);
    expect(detailTabs).toMatch(/:placeholder="item\.placeholder \|\| '请输入'"/);
    expect(recordForm).toMatch(/placeholder="请选择"/);
  });
});
