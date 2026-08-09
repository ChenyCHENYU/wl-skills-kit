/*
 * useFormRequiredOnly — 表单"仅必填"切换 composable
 *
 * 功能：在全部字段和仅必填字段之间切换显示，快速填写提交。
 * 原理：过滤 items 数组控制渲染，表单数据始终在 form 对象中，切换不丢数据。
 *
 * 设计原则：
 *   - 零副作用：不改原始 items，用 computed 派生
 *   - 零平台依赖：纯 Vue 3，不依赖 @jhlc/common-core 或 Element Plus
 *   - opt-in：默认关闭，不影响现有行为
 *   - 校验安全：隐藏非必填项时同步 clearValidate，防止隐藏字段残留校验错误
 */

import { computed, ref, watch, unref, type Ref, type MaybeRef } from "vue";

export interface FormItemLike {
  name?: string;
  prop?: string;
  required?: boolean;
  [key: string]: any;
}

export interface FormRefLike {
  clearValidate?: (props?: string | string[]) => void;
  validate?: (callback?: (valid: boolean) => void) => Promise<boolean>;
}

export interface UseFormRequiredOnlyReturn<T> {
  /** 是否处于"仅必填"模式 */
  showRequiredOnly: Ref<boolean>;
  /** 是否存在必填字段（无必填项时切换无意义） */
  hasRequiredItems: Ref<boolean>;
  /** 是否同时存在必填和非必填字段，只有此时才展示切换 */
  canToggleRequiredOnly: Ref<boolean>;
  /** 当前应渲染的 items（全部或仅必填） */
  visibleItems: Ref<T[]>;
  /** 当前被隐藏的字段名列表 */
  hiddenFieldNames: Ref<string[]>;
  /** 切换模式 */
  toggleRequiredOnly: () => void;
  /** 显式设置模式，便于页面按钮或外部状态驱动 */
  setRequiredOnly: (value: boolean) => void;
}

export interface UseFormRequiredOnlyOptions<T> {
  /** 父页面控制的模式；Tab 子组件可直接传入只读 prop */
  requiredOnly?: MaybeRef<boolean>;
  /** 受控模式变更回调；未提供时仅由父级改变 */
  onRequiredOnlyChange?: (value: boolean) => void;
  /** 非受控模式初值，默认展示全部字段 */
  defaultRequiredOnly?: boolean;
  /** 字段名提取器，默认依次读取 name / prop */
  getFieldName?: (item: T) => string | undefined;
  /** 必填判断器，默认 required === true */
  isRequired?: (item: T) => boolean;
}

/**
 * 表单"仅必填"切换
 *
 * @param formItems  - 表单字段数组（Ref 或静态数组）
 * @param formRef    - 可选，el-form / BaseForm 的 ref，用于切换时清除隐藏字段校验
 *
 * @example
 * ```ts
 * const { showRequiredOnly, visibleItems, toggleRequiredOnly } =
 *   useFormRequiredOnly(formItems, formRef);
 * ```
 *
 * 在模板中：
 * ```vue
 * <el-switch v-model="showRequiredOnly" /> 仅必填
 * <BaseForm :items="visibleItems" :form="form" />
 * ```
 */
export function useFormRequiredOnly<T extends FormItemLike>(
  formItems: MaybeRef<T[]>,
  formRef?: MaybeRef<FormRefLike | null>,
  options: UseFormRequiredOnlyOptions<T> = {}
): UseFormRequiredOnlyReturn<T> {
  const internalRequiredOnly = ref(options.defaultRequiredOnly ?? false);
  const showRequiredOnly = computed({
    get: () => options.requiredOnly === undefined
      ? internalRequiredOnly.value
      : Boolean(unref(options.requiredOnly)),
    set: (value: boolean) => {
      if (options.requiredOnly === undefined) internalRequiredOnly.value = value;
      options.onRequiredOnlyChange?.(value);
    }
  });
  const isRequired = options.isRequired ?? ((item: T) => item.required === true);
  const getFieldName = options.getFieldName ?? ((item: T) => item.name ?? item.prop);

  const resolveItems = (): T[] => {
    const raw = unref(formItems);
    return Array.isArray(raw) ? raw : [];
  };

  const hasRequiredItems = computed(() =>
    resolveItems().some(isRequired)
  );

  const canToggleRequiredOnly = computed(() => {
    const items = resolveItems();
    return items.some(isRequired) && items.some((item) => !isRequired(item));
  });

  const visibleItems = computed(() => {
    const items = resolveItems();
    if (!showRequiredOnly.value || !canToggleRequiredOnly.value) return items;
    return items.filter(isRequired);
  });

  const hiddenFieldNames = computed(() => {
    const items = resolveItems();
    if (!showRequiredOnly.value || !canToggleRequiredOnly.value) return [];
    return items
      .filter((item) => !isRequired(item))
      .map(getFieldName)
      .filter((name): name is string => Boolean(name));
  });

  function toggleRequiredOnly() {
    if (canToggleRequiredOnly.value) showRequiredOnly.value = !showRequiredOnly.value;
  }

  function setRequiredOnly(value: boolean) {
    showRequiredOnly.value = value && canToggleRequiredOnly.value;
  }

  // 切换时清除隐藏字段的残留校验状态，防止隐藏的必填项阻断 validate
  watch([showRequiredOnly, canToggleRequiredOnly], ([isRequiredOnly, canToggle]) => {
    const ref = unref(formRef);
    if (!ref || typeof ref.clearValidate !== "function") return;
    if (isRequiredOnly && canToggle) {
      // 切换到"仅必填"：清除即将隐藏的非必填字段校验
      ref.clearValidate(hiddenFieldNames.value);
    } else {
      // 切换回"全部"：清除所有校验状态，下次 validate 重新计算
      ref.clearValidate();
    }
  }, { flush: "post" });

  return {
    showRequiredOnly,
    hasRequiredItems,
    canToggleRequiredOnly,
    visibleItems,
    hiddenFieldNames,
    toggleRequiredOnly,
    setRequiredOnly,
  };
}
