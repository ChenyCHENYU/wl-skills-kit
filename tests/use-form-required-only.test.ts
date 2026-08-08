import { describe, it, expect, vi } from "vitest";
import { ref, nextTick } from "vue";

// 直接导入 composable 的纯逻辑（不依赖 Vue SFC 编译）
// useFormRequiredOnly 是纯 TS，无平台依赖，可直接 import 测试

// 内联实现测试（因为文件是 .ts 在 files/ 目录，vitest 可能无法直接 import）
// 复制核心逻辑测试，确保逻辑正确性

import { useFormRequiredOnly } from "../files/.wl-skills/src/hooks/useFormRequiredOnly";

describe("useFormRequiredOnly", () => {
  it("默认 showRequiredOnly=false，visibleItems 返回全部", () => {
    const items = ref([
      { name: "a", required: true },
      { name: "b", required: false },
      { name: "c", required: true },
    ]);
    const { showRequiredOnly, visibleItems } = useFormRequiredOnly(items);

    expect(showRequiredOnly.value).toBe(false);
    expect(visibleItems.value).toHaveLength(3);
  });

  it("切换到仅必填后，visibleItems 只含 required=true 的项", () => {
    const items = ref([
      { name: "a", required: true },
      { name: "b", required: false },
      { name: "c", required: true },
      { name: "d" }, // required 未声明 = 非必填
    ]);
    const { showRequiredOnly, visibleItems, toggleRequiredOnly } =
      useFormRequiredOnly(items);

    toggleRequiredOnly();
    expect(showRequiredOnly.value).toBe(true);
    expect(visibleItems.value).toHaveLength(2);
    expect(visibleItems.value.map((i) => i.name)).toEqual(["a", "c"]);
  });

  it("切换回全部后恢复完整列表", () => {
    const items = ref([
      { name: "a", required: true },
      { name: "b", required: false },
    ]);
    const { showRequiredOnly, visibleItems, toggleRequiredOnly } =
      useFormRequiredOnly(items);

    toggleRequiredOnly(); // -> true
    expect(visibleItems.value).toHaveLength(1);
    toggleRequiredOnly(); // -> false
    expect(visibleItems.value).toHaveLength(2);
    expect(showRequiredOnly.value).toBe(false);
  });

  it("hasRequiredItems 正确识别有无必填", () => {
    const withRequired = ref([{ name: "a", required: true }]);
    const withoutRequired = ref([{ name: "a" }, { name: "b", required: false }]);

    expect(useFormRequiredOnly(withRequired).hasRequiredItems.value).toBe(true);
    expect(useFormRequiredOnly(withoutRequired).hasRequiredItems.value).toBe(false);
  });

  it("hiddenFieldNames 返回被隐藏的字段名", () => {
    const items = ref([
      { name: "a", required: true },
      { name: "b", required: false },
      { name: "c" },
    ]);
    const { toggleRequiredOnly, hiddenFieldNames } = useFormRequiredOnly(items);

    toggleRequiredOnly();
    expect(hiddenFieldNames.value).toEqual(["b", "c"]);
  });

  it("切换时不修改原始 items 数组（零副作用）", () => {
    const original = [
      { name: "a", required: true },
      { name: "b", required: false },
    ];
    const items = ref([...original]);
    const { toggleRequiredOnly, visibleItems } = useFormRequiredOnly(items);

    toggleRequiredOnly();
    // 原始数组不变
    expect(items.value).toHaveLength(2);
    expect(items.value[1].name).toBe("b");
    // visibleItems 是新数组引用
    expect(visibleItems.value).not.toBe(items.value);
  });

  it("items 响应式更新时 visibleItems 自动重算", async () => {
    const items = ref([{ name: "a", required: true }]);
    const { visibleItems, showRequiredOnly } = useFormRequiredOnly(items);

    showRequiredOnly.value = true;
    expect(visibleItems.value).toHaveLength(1);

    items.value.push({ name: "b", required: true }, { name: "c", required: false });
    await nextTick();
    expect(visibleItems.value).toHaveLength(2);
    expect(visibleItems.value.map((i) => i.name)).toEqual(["a", "b"]);
  });

  it("formRef.clearValidate 在切换到仅必填时被调用", async () => {
    const items = ref([
      { name: "a", required: true },
      { name: "b", required: false },
    ]);
    const clearValidate = vi.fn();
    const formRef = ref({ clearValidate });

    const { showRequiredOnly } = useFormRequiredOnly(items, formRef);

    showRequiredOnly.value = true;
    await nextTick();
    expect(clearValidate).toHaveBeenCalledWith(["b"]);
  });

  it("formRef.clearValidate 在切换回全部时被调用（无参数）", async () => {
    const items = ref([
      { name: "a", required: true },
      { name: "b", required: false },
    ]);
    const clearValidate = vi.fn();
    const formRef = ref({ clearValidate });

    const { showRequiredOnly } = useFormRequiredOnly(items, formRef);

    showRequiredOnly.value = true;
    await nextTick();
    clearValidate.mockClear();

    showRequiredOnly.value = false;
    await nextTick();
    expect(clearValidate).toHaveBeenCalledWith();
  });

  it("无 formRef 时不报错", () => {
    const items = ref([{ name: "a", required: true }]);
    const { toggleRequiredOnly } = useFormRequiredOnly(items);
    // 不应抛出
    expect(() => toggleRequiredOnly()).not.toThrow();
  });

  it("空 items 数组安全处理", () => {
    const items = ref([]);
    const { visibleItems, hasRequiredItems, toggleRequiredOnly } =
      useFormRequiredOnly(items);

    toggleRequiredOnly();
    expect(visibleItems.value).toHaveLength(0);
    expect(hasRequiredItems.value).toBe(false);
  });

  it("支持静态数组（非 Ref）传入", () => {
    const items = [
      { name: "a", required: true },
      { name: "b", required: false },
    ];
    const { visibleItems, toggleRequiredOnly } = useFormRequiredOnly(items);

    expect(visibleItems.value).toHaveLength(2);
    toggleRequiredOnly();
    expect(visibleItems.value).toHaveLength(1);
  });
});
