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
  name: string;
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
  /** 当前应渲染的 items（全部或仅必填） */
  visibleItems: Ref<T[]>;
  /** 当前被隐藏的字段名列表 */
  hiddenFieldNames: Ref<string[]>;
  /** 切换模式 */
  toggleRequiredOnly: () => void;
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
  formRef?: MaybeRef<FormRefLike | null>
): UseFormRequiredOnlyReturn<T> {
  const showRequiredOnly = ref(false);

  const resolveItems = (): T[] => {
    const raw = unref(formItems);
    return Array.isArray(raw) ? raw : [];
  };

  const hasRequiredItems = computed(() =>
    resolveItems().some((item) => item.required === true)
  );

  const visibleItems = computed(() => {
    const items = resolveItems();
    if (!showRequiredOnly.value) return items;
    return items.filter((item) => item.required === true);
  });

  const hiddenFieldNames = computed(() => {
    const items = resolveItems();
    if (!showRequiredOnly.value) return [];
    return items
      .filter((item) => item.required !== true)
      .map((item) => item.name);
  });

  function toggleRequiredOnly() {
    showRequiredOnly.value = !showRequiredOnly.value;
  }

  // 切换时清除隐藏字段的残留校验状态，防止隐藏的必填项阻断 validate
  watch(showRequiredOnly, (isRequiredOnly) => {
    const ref = unref(formRef);
    if (!ref || typeof ref.clearValidate !== "function") return;
    if (isRequiredOnly) {
      // 切换到"仅必填"：清除即将隐藏的非必填字段校验
      ref.clearValidate(hiddenFieldNames.value);
    } else {
      // 切换回"全部"：清除所有校验状态，下次 validate 重新计算
      ref.clearValidate();
    }
  });

  return {
    showRequiredOnly,
    hasRequiredItems,
    visibleItems,
    hiddenFieldNames,
    toggleRequiredOnly,
  };
}
