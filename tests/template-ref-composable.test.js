import { describe, expect, it } from "vitest";
import { createRenderer, h } from "vue";
import { useTemplateRef } from "../files/.wl-skills/skills/core/page-codegen/templates/composables/useTemplateRef.ts";

// 使用真实 Vue 运行时挂载，验证字符串 ref；不依赖 DOM 或平台组件。
const renderer = createRenderer({
  createElement: () => ({ children: [] }),
  createText: (text) => ({ text }),
  createComment: (text) => ({ text }),
  setText: (node, text) => { node.text = text; },
  setElementText: (node, text) => { node.text = text; },
  parentNode: (node) => node.parent,
  nextSibling: () => null,
  patchProp: () => {},
  insert: (node, parent) => { node.parent = parent; parent.children.push(node); },
  remove: (node) => { node.parent.children = node.parent.children.filter((item) => item !== node); }
});

describe("模板引用兼容入口", () => {
  it("两个引用和两个实例互不覆盖，卸载清空各自引用", () => {
    const states = [];
    const Child = {
      props: ["name"],
      setup(props, { expose }) {
        expose({ name: props.name });
        return () => h("span");
      }
    };
    const Parent = {
      setup() {
        const first = useTemplateRef("first");
        const second = useTemplateRef("second");
        states.push({ first, second });
        return () => h("div", [h(Child, { ref: "first", name: "一" }), h(Child, { ref: "second", name: "二" })]);
      }
    };
    const apps = [renderer.createApp(Parent), renderer.createApp(Parent)];
    apps.forEach((app) => app.mount({ children: [] }));
    expect(states[0].first.value.name).toBe("一");
    expect(states[0].second.value.name).toBe("二");
    expect(states[0].first.value).not.toBe(states[1].first.value);
    apps[0].unmount();
    expect(states[0].first.value).toBeNull();
    expect(states[0].second.value).toBeNull();
    expect(states[1].first.value.name).toBe("一");
    apps[1].unmount();
  });

  it("离开 setup 时明确报错，不创建全局共享状态", () => {
    expect(() => useTemplateRef("field")).toThrow("模板引用必须在组件 setup 中创建");
  });
});
