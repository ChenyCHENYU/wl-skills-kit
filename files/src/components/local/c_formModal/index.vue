<!--
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-01-01 13:30:00
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-01-04 09:17:43
 * @FilePath: \cx-ui-sale\src\components\local\c_formModal\index.vue
 * @Description: 表单弹窗组件 （新增、编辑、详情）
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 -->
<template>
  <jh-dialog v-model="visible" :width="width" :title="currentTitle">
    <BaseForm
      ref="formRef"
      :form="form"
      :items="formItems"
      :columns="columns"
      :label-width="labelWidth"
      :disabled="mode === 'view'"
    />
    <template #footer>
      <div class="dialog-footer">
        <BaseToolbar
          v-if="mode !== 'view'"
          :items="cancelConfirmButtons(() => (visible = false), save)"
        />
        <BaseToolbar
          v-else
          :items="[{ label: '关闭', onClick: () => (visible = false) }]"
        />
      </div>
    </template>
  </jh-dialog>
</template>

<script setup lang="ts">
import type { BaseFormItemDesc } from "@jhlc/common-core/src/components/form/common/type";
import { cancelConfirmButtons } from "@jhlc/common-core/src/components/toolbar/toolbar-data";
import {
  createFormModal,
  computeTitle,
  type ModalApi,
  type ModalMode
} from "./data";

interface Props {
  formItems: BaseFormItemDesc<any>[];
  api: ModalApi;
  width?: string;
  columns?: number;
  labelWidth?: string;
  titlePrefix?: string;
}

const props = withDefaults(defineProps<Props>(), {
  width: "850px",
  columns: 2,
  labelWidth: "110px",
  titlePrefix: "数据"
});

const emit = defineEmits(["ok"]);

// 当前模式
const mode = ref<ModalMode>("add");

// 创建页面Hook实例
const Page = createFormModal(props, mode, emit);

// 解构使用
const { visible, formRef, form, formItems, save, reset } = Page;

// 计算标题
const currentTitle = computed(() =>
  computeTitle(mode.value, props.titlePrefix)
);

defineExpose({
  /** 打开新增弹窗 */
  open(formData?: Record<string, any>) {
    console.log("🚀 ~ file: index.vue:80 ~ open ~ formData:", formData);
    mode.value = "add";
    reset();
    if (formData) {
      form.value = {
        ...formData
      };
    }
    visible.value = true;
  },
  /** 打开编辑弹窗 */
  async edit(id: string) {
    mode.value = "edit";
    visible.value = true;
    await Page.getById(id);
  },
  /** 打开详情弹窗（只读） */
  async view(id: string) {
    mode.value = "view";
    visible.value = true;
    await Page.getById(id);
  }
});
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>
