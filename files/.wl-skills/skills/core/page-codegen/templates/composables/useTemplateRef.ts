import { getCurrentInstance, shallowRef } from "vue";

/** 兼容宿主 Vue 3.2 的字符串模板引用，页面无需额外返回组件引用。 */
export const useTemplateRef = <T = unknown>(key: string) => {
  const instance = getCurrentInstance();
  if (!instance) throw new Error("模板引用必须在组件 setup 中创建");

  const result = shallowRef<T | null>(null);
  // 每个组件独享 refs；复制属性描述符，保留此前创建的引用绑定。
  const refs = Object.defineProperties(
    {},
    Object.getOwnPropertyDescriptors(instance.refs)
  );
  instance.refs = refs;
  Object.defineProperty(refs, key, {
    enumerable: true,
    get: () => result.value,
    set: (value: T | null) => {
      result.value = value;
    }
  });
  return result;
};
