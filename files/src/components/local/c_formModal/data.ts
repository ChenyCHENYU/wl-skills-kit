/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-01-01 13:30:00
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-01-04 08:18:10
 * @FilePath: \cx-ui-sale\src\components\local\c_formModal\data.ts
 * @Description: 表单弹窗组件 - 数据逻辑层
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import type { Ref } from "vue";
import { AbstractFormHook } from "@jhlc/common-core/src/page-hooks/form-hook";
import type { BaseFormItemDesc } from "@jhlc/common-core/src/components/form/common/type";
import request from "@jhlc/common-core/src/util/request";

export interface ModalApi {
  getById: string;
  save: string;
  update: string;
}

export type ModalMode = "add" | "edit" | "view";

/**
 * 创建表单弹窗 Hook
 * @param props - 组件 Props
 * @param mode - 当前模式
 * @param emit - 事件触发器
 */
export function createFormModal(
  props: {
    formItems: BaseFormItemDesc<any>[];
    api: ModalApi;
    titlePrefix?: string;
  },
  mode: Ref<ModalMode>,
  emit: (event: "ok") => void
) {
  const Page = new (class extends AbstractFormHook {
    constructor() {
      super({});
    }

    formItemsDefine(): BaseFormItemDesc<any>[] {
      return props.formItems;
    }

    async save() {
      // 表单验证
      const valid = await new Promise<boolean>((resolve) => {
        this.validate((isValid) => resolve(isValid));
      });

      if (!valid) return;

      // 根据模式调用不同 API
      const res = await request({
        url: mode.value === "add" ? props.api.save : props.api.update,
        method: mode.value === "add" ? "post" : "put",
        data: this.form.value
      });

      // 成功提示并关闭
      this.msgSuccess(res.message || "操作成功");
      this.visible.value = false;
      emit("ok");

      return res;
    }

    async getById(id: string) {
      const data = await request({
        url: props.api.getById,
        method: "get",
        params: { id }
      });
      this.form.value = data.data;
      return data;
    }
  })();

  return Page.create();
}

/**
 * 计算弹窗标题
 */
export function computeTitle(mode: ModalMode, titlePrefix: string): string {
  const prefixMap = {
    add: "新增",
    edit: "编辑",
    view: "查看"
  };
  return `${prefixMap[mode]}${titlePrefix}`;
}
