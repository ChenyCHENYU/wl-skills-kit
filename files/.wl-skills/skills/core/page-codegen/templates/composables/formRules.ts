import { createSpec, isBlank, toElementRule } from "@robot-admin/form-validate";

/** 仅用于保持原生表单的历史必填行为；新表单直接使用 ELEMENT_RULES.required。 */
export const requiredRule = (
  message: string,
  trigger: "blur" | "change" = "blur"
) => ({
  required: true,
  ...toElementRule(
    createSpec(
      trigger,
      (value) =>
        value != null &&
        value !== "" &&
        (!Array.isArray(value) || value.length > 0),
      message
    )
  )
});

/**
 * 起止时间允许相等，空值及无效日期不新增限制；解析方式由实际字段契约决定。
 * 每次校验读取当前起始值，表单被明细替换后也不会引用旧数据。
 */
export const notBeforeSpec = (
  getStart: () => unknown,
  message: string,
  parse: (value: unknown) => number = (value) =>
    new Date(String(value)).getTime()
) =>
  createSpec(
    "change",
    (value) => {
      const start = getStart();
      if (isBlank(value) || isBlank(start)) return true;
      const startTime = parse(start);
      const endTime = parse(value);
      return (
        !Number.isFinite(startTime) ||
        !Number.isFinite(endTime) ||
        endTime >= startTime
      );
    },
    message
  );
