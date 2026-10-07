import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { createRequire } from "node:module";
import * as vue from "vue";

const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve("vitest/package.json"));
const { transformWithEsbuild } = await import(viteRequire.resolve("vite"));
const source = fs.readFileSync(process.env.WL_BASE_FORM_SOURCE || new URL(
  "../files/.wl-skills/skills/core/page-codegen/templates/composables/useBaseForm.ts", import.meta.url
), "utf8");
const compiled = await transformWithEsbuild(source, "useBaseForm.ts", { loader: "ts", format: "cjs" });
const formContextKey = Symbol("formContext");
const size = vue.ref("small");
const module = { exports: {} };
new Function("require", "exports", "module", compiled.code)((id) => {
  if (id === "vue") return vue;
  if (id === "element-plus") return { formContextKey, useGlobalConfig: () => size };
  throw new Error(`适配器出现未核实的运行依赖：${id}`);
}, module.exports, module);
const { useBaseForm } = module.exports;

// 使用真实 Vue 3.2 生命周期；替身只提供平台公开字段钩子与原生校验契约。
const renderer = vue.createRenderer({
  createElement: () => ({ children: [] }),
  createText: (text) => ({ text }), createComment: (text) => ({ text }),
  setText: (node, text) => { node.text = text; },
  setElementText: (node, text) => { node.text = text; },
  parentNode: (node) => node.parent, nextSibling: () => null, patchProp: () => {},
  insert: (node, parent) => { node.parent = parent; parent.children.push(node); },
  remove: (node) => { node.parent.children = node.parent.children.filter((child) => child !== node); }
});
const Field = {
  props: ["item", "model"],
  setup(props) {
    const instance = vue.getCurrentInstance().proxy;
    vue.onMounted(() => props.item.onMounted?.(instance, props.model));
    return () => vue.h("span");
  }
};
const mount = ({ provide = true, originalHook = vi.fn() } = {}) => {
  const contexts = [];
  const model = { name: "原值" };
  const definitions = [{ name: "name", onMounted: originalHook }, { name: "other" }];
  const visible = vue.ref(true);
  const names = vue.ref(["name", "other"]);
  let api;
  const Form = {
    setup(_, { slots }) {
      const context = {
        validateField: vi.fn(async (_fields, callback) => { callback?.(true); return true; }),
        clearValidate: vi.fn(), resetFields: vi.fn()
      };
      contexts.push(context);
      if (provide) vue.provide(formContextKey, context);
      return () => vue.h("form", slots.default?.());
    }
  };
  const Parent = {
    setup() {
      api = useBaseForm();
      const items = vue.computed(() => api.bindFields(definitions.filter((item) => names.value.includes(item.name))));
      return () => visible.value ? vue.h(Form, {}, () => items.value.map((item) =>
        vue.h(Field, { key: item.name, item, model }))) : null;
    }
  };
  const app = renderer.createApp(Parent);
  const errors = [];
  app.config.errorHandler = (error) => errors.push(error);
  app.mount({ children: [] });
  return { app, api, contexts, model, definitions, names, visible, errors, originalHook };
};

describe("BaseForm 原生校验适配", () => {
  it("保留规则校验结果、回调、指定字段及原挂载回调，不预先清除错误", async () => {
    const state = mount();
    try {
      const { api, contexts: [context] } = state;
      expect(state.errors).toEqual([]);
      expect(state.originalHook).toHaveBeenCalledTimes(1);
      expect(state.originalHook.mock.instances[0].name).toBe("name");
      expect(state.originalHook.mock.calls[0][1]).toBe(state.model);
      const callback = vi.fn();
      expect(await api.validate(callback)).toBe(true);
      expect(context.validateField).toHaveBeenLastCalledWith(undefined, callback);
      expect(callback).toHaveBeenCalledWith(true);
      await api.validateField(["name", "other"], callback);
      expect(context.validateField).toHaveBeenLastCalledWith(["name", "other"], callback);
      expect(context.clearValidate).not.toHaveBeenCalled();
      const invalid = { name: [{ message: "原错误提示" }] };
      context.validateField.mockRejectedValueOnce(invalid);
      await expect(api.validate()).rejects.toBe(invalid);
      api.clearValidate("name"); api.resetFields(["name"]);
      expect(context.clearValidate).toHaveBeenCalledWith("name");
      expect(context.resetFields).toHaveBeenCalledWith(["name"]);
      expect(state.definitions[0].onMounted).toBe(state.originalHook);
    } finally { state.app.unmount(); }
  });

  it("多实例隔离；隐藏最后字段及卸载释放上下文，重开绑定新表单", async () => {
    const first = mount(); const second = mount();
    let firstUnmounted = false;
    try {
      expect(first.api).not.toBe(second.api);
      first.names.value = ["other"];
      await vue.nextTick();
      expect(await first.api.validate()).toBe(true);
      first.names.value = [];
      await vue.nextTick();
      const callback = vi.fn();
      expect(await first.api.validate(callback)).toBe(false);
      expect(callback).toHaveBeenCalledWith(false);
      expect(await second.api.validate()).toBe(true);
      first.visible.value = false;
      await vue.nextTick();
      first.names.value = ["name"];
      first.visible.value = true;
      await vue.nextTick();
      expect(first.contexts).toHaveLength(2);
      await first.api.validateField("name");
      expect(first.contexts[1].validateField).toHaveBeenCalledWith("name");
      first.app.unmount();
      firstUnmounted = true;
      expect(await first.api.validateField("name")).toBe(false);
      expect(await second.api.validate()).toBe(true);
    } finally { if (!firstUnmounted) first.app.unmount(); second.app.unmount(); }
  });

  it("布局尺寸随全局配置变化，缺失原生表单时明确报告契约错误", () => {
    const state = mount();
    const unsupported = mount({ provide: false });
    try {
      size.value = "large";
      expect(state.api.attrs).toEqual({ useAttrs: true, "data-form-size": "large" });
      size.value = "";
      expect(state.api.attrs["data-form-size"]).toBe("default");
      expect(unsupported.errors).toHaveLength(2);
      expect(unsupported.errors.every((error) => error.message === "BaseForm 校验适配需要启用表单容器")).toBe(true);
    } finally { state.app.unmount(); unsupported.app.unmount(); size.value = "small"; }
  });
});
