import {
  computed,
  inject,
  onScopeDispose,
  onUnmounted,
  proxyRefs,
  shallowRef
} from "vue";
import {
  formContextKey,
  useGlobalConfig,
  type FormContext,
  type FormValidateCallback
} from "element-plus";
import type { BaseFormItemDesc } from "@jhlc/common-core/src/components/form/common/type";

/** 补齐 BaseForm 的原生校验接口；规则和错误展示仍由 Element Plus 负责。 */
export const useBaseForm = () => {
  const context = shallowRef<FormContext>();
  const mountedFields = new Set<symbol>();
  const layoutSize = useGlobalConfig("size");
  // 原生弹窗的字段卸载可能延后；页面销毁时立即断开校验入口。
  onScopeDispose(() => {
    context.value = undefined;
    mountedFields.clear();
  });

  const bindFields = (items: BaseFormItemDesc[]): BaseFormItemDesc[] =>
    items.map((item) => ({
      ...item,
      onMounted(...args) {
        // 平台公开的字段挂载钩子处于原生表单内部，无需读取组件私有 $refs。
        const form = inject(formContextKey, undefined);
        if (!form) {
          throw new Error("BaseForm 校验适配需要启用表单容器");
        }
        context.value = form;
        const field = Symbol();
        mountedFields.add(field);
        onUnmounted(() => {
          mountedFields.delete(field);
          if (!mountedFields.size) {
            context.value = undefined;
          }
        });
        item.onMounted?.apply(this, args);
      }
    }));

  return proxyRefs({
    bindFields,
    // useAttrs 才会将整表 rules 传入宿主表单；布局尺寸与控件尺寸分别保留。
    attrs: computed(() => ({
      useAttrs: true,
      "data-form-size": layoutSize.value || "default"
    })),
    validate: (callback?: FormValidateCallback) => {
      if (context.value) {
        return context.value.validateField(undefined, callback);
      }
      callback?.(false);
      return Promise.resolve(false);
    },
    validateField: (...args: Parameters<FormContext["validateField"]>) =>
      context.value?.validateField(...args) ?? Promise.resolve(false),
    clearValidate: (...args: Parameters<FormContext["clearValidate"]>) =>
      context.value?.clearValidate(...args),
    resetFields: (...args: Parameters<FormContext["resetFields"]>) =>
      context.value?.resetFields(...args)
  });
};
