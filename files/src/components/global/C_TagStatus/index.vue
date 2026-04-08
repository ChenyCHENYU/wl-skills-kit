<!--
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-02-14
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-02-14
 * @FilePath: \cx-ui-produce\src\components\global\C_TagStatus\index.vue
 * @Description: 状态标签组件 - 统一的状态展示
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
-->
<template>
  <el-tag
    v-if="statusConfig"
    :type="statusConfig.type"
    :color="statusConfig.color"
    :effect="statusConfig.effect || 'light'"
    :size="size"
    :round="round"
    :closable="closable"
    :disable-transitions="disableTransitions"
    @click="handleClick"
    @close="handleClose"
  >
    {{ statusConfig.label }}
  </el-tag>
  <span v-else class="status-fallback">{{ displayValue }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { getStatusConfig } from "./config";
import type { StatusType, TagEffect } from "./types";

/**
 * 组件属性定义
 */
interface Props {
  /** 状态值 */
  value: string | number | boolean | null | undefined;
  /** 状态类型（plan/product/material/process/sampling/sample/slab/boolean） */
  type: StatusType | string;
  /** Tag 尺寸 */
  size?: "" | "large" | "default" | "small";
  /** 是否圆角 */
  round?: boolean;
  /** 是否可关闭 */
  closable?: boolean;
  /** 是否禁用过渡动画 */
  disableTransitions?: boolean;
  /** 默认 Tag 效果（当配置中未指定时使用） */
  defaultEffect?: TagEffect;
}

const props = withDefaults(defineProps<Props>(), {
  size: "default",
  round: true,
  closable: false,
  disableTransitions: false,
  defaultEffect: "light"
});

/**
 * 组件事件定义
 */
const emit = defineEmits<{
  click: [event: MouseEvent];
  close: [event: MouseEvent];
}>();

/**
 * 获取状态配置
 */
const statusConfig = computed(() => {
  const config = getStatusConfig(props.type, props.value);
  if (config && !config.effect) {
    // 如果配置中没有指定 effect，使用默认值
    return { ...config, effect: props.defaultEffect };
  }
  return config;
});

/**
 * 显示值（降级方案）
 */
const displayValue = computed(() => {
  if (props.value === null || props.value === undefined || props.value === "") {
    return "-";
  }
  return String(props.value);
});

/**
 * 点击事件处理
 */
const handleClick = (event: MouseEvent) => {
  emit("click", event);
};

/**
 * 关闭事件处理
 */
const handleClose = (event: MouseEvent) => {
  emit("close", event);
};
</script>

<style scoped lang="scss">
.status-fallback {
  display: inline-block;
  padding: 0 8px;
  font-size: 12px;
  color: #909399;
  line-height: 22px;
  white-space: nowrap;
}

// 增强 el-tag 的视觉效果
:deep(.el-tag) {
  font-weight: 500;
  border: none;

  // 为淡色效果添加边框
  &.el-tag--light {
    border: 1px solid currentColor;
    border-color: var(--el-tag-border-color);
  }
}
</style>
