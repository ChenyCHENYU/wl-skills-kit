<!--
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-01-01 13:30:00
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-01-01 16:30:00
 * @FilePath: \cx-ui-sale\src\components\local\c_formSections\index.vue
 * @Description: 表单区块组件 - 集成楼层导航、工具栏、布局切换等功能
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 -->
<template>
  <div class="c-form-sections-wrapper">
    <!-- 顶部标题栏 -->
    <div v-if="showHeader" class="c-form-header">
      <span class="header-title">{{ headerTitle }}</span>
      <div class="header-right">
        <!-- 布局切换器 -->
        <div v-if="showLayoutSwitch" class="layout-switcher">
          <span
            v-for="option in internalLayoutOptions"
            :key="option.columns"
            class="layout-icon"
            :class="{ active: currentLayout === option.columns }"
            :title="option.title"
            @click="currentLayout = option.columns"
          >
            {{ option.icon }}
          </span>
        </div>
        <el-divider
          v-if="showLayoutSwitch && headerActions.length > 0"
          direction="vertical"
        />
        <!-- 顶部操作按钮 -->
        <template v-for="action in headerActions" :key="action.label">
          <el-button
            :type="action.type || ''"
            size="small"
            :disabled="action.disabled"
            @click="action.onClick"
          >
            <el-icon v-if="action.icon">
              <component :is="action.icon" />
            </el-icon>
            {{ action.label }}
          </el-button>
        </template>
      </div>
    </div>

    <!-- 工具栏 -->
    <div v-if="showToolbar" class="c-form-toolbar">
      <div class="toolbar-left">
        <!-- 必填字段过滤开关 -->
        <span v-if="showRequiredFilter" class="required-toggle">
          <span class="label">仅显示必填字段</span>
          <el-switch v-model="showRequiredOnly" size="small" />
        </span>
        <!-- 工具栏左侧插槽 -->
        <slot name="toolbar-left"></slot>
      </div>
      <div class="toolbar-right">
        <!-- 工具栏右侧插槽 -->
        <slot name="toolbar-right"></slot>
      </div>
    </div>

    <!-- 主体内容区域 -->
    <div class="c-form-content">
      <!-- 左侧楼层导航 -->
      <el-tabs
        v-if="showNavTabs"
        :tab-position="navTabsPosition"
        v-model="activeNavTab"
        @tab-click="handleNavTabClick"
        class="nav-tabs"
      >
        <el-tab-pane
          v-for="tab in navTabs"
          :key="tab.name"
          :label="tab.label"
          :name="tab.name"
        />
      </el-tabs>

      <!-- 表单区域 -->
      <div class="form-container" ref="formContainerRef">
        <el-form
          :label-width="labelWidth"
          :label-position="labelPosition"
          :model="form"
          :rules="rules"
        >
          <el-collapse v-model="activeNamesModel">
            <!-- 循环渲染折叠面板 -->
            <el-collapse-item
              v-for="section in visibleSections"
              :key="section.name"
              :name="section.name"
              :id="section.id"
            >
              <template #title>
                <span class="section-title">{{ section.title }}</span>
                <el-divider />
              </template>

              <!-- 特殊区块 - 使用具名插槽 -->
              <slot
                v-if="section.isSpecial"
                :name="`special-${section.name}`"
                :section="section"
              >
                <el-row :gutter="gutter">
                  <el-col :span="24">
                    <el-empty description="请通过插槽自定义特殊区块内容" />
                  </el-col>
                </el-row>
              </slot>

              <!-- 普通区块 - 循环渲染字段 -->
              <el-row v-else :gutter="gutter">
                <el-col
                  v-for="field in section.fieldsConfig"
                  :key="field.prop"
                  :span="currentFieldSpan"
                >
                  <el-form-item
                    :label="field.label"
                    :prop="field.prop"
                    :required="field.required"
                  >
                    <!-- 下拉选择框 -->
                    <el-select
                      v-if="field.type === 'select'"
                      v-model="form[field.prop]"
                      :placeholder="field.placeholder || '请选择'"
                      :clearable="field.clearable !== false"
                    >
                      <el-option
                        v-for="opt in field.options"
                        :key="opt.value"
                        :label="opt.label"
                        :value="opt.value"
                      />
                    </el-select>

                    <!-- 多行文本框 -->
                    <el-input
                      v-else-if="field.type === 'textarea'"
                      v-model="form[field.prop]"
                      type="textarea"
                      :rows="field.rows || 3"
                      :placeholder="field.placeholder || '请输入'"
                    />

                    <!-- 日期选择器 -->
                    <el-date-picker
                      v-else-if="field.type === 'date'"
                      v-model="form[field.prop]"
                      type="date"
                      :placeholder="field.placeholder || '选择日期'"
                      style="width: 100%"
                    />

                    <!-- 日期时间选择器 -->
                    <el-date-picker
                      v-else-if="field.type === 'datetime'"
                      v-model="form[field.prop]"
                      type="datetime"
                      :placeholder="field.placeholder || '选择日期时间'"
                      style="width: 100%"
                    />

                    <!-- 数字输入框 -->
                    <el-input-number
                      v-else-if="field.type === 'number'"
                      v-model="form[field.prop]"
                      :min="field.min"
                      :max="field.max"
                      :precision="field.precision"
                      :step="field.step || 1"
                      style="width: 100%"
                    />

                    <!-- 自定义字段 - 使用作用域插槽 -->
                    <slot
                      v-else-if="field.type === 'custom'"
                      :name="`field-${field.prop}`"
                      :field="field"
                      :form="form"
                    >
                      <el-input
                        v-model="form[field.prop]"
                        :placeholder="field.placeholder || '请输入'"
                      />
                    </slot>

                    <!-- 默认单行文本输入框 -->
                    <el-input
                      v-else
                      v-model="form[field.prop]"
                      :placeholder="field.placeholder || '请输入'"
                    />
                  </el-form-item>
                </el-col>
              </el-row>
            </el-collapse-item>
          </el-collapse>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import type {
  SectionConfig,
  FormDataType,
  NavTabConfig,
  HeaderAction,
  LayoutOption
} from "./data";

/** 组件 Props */
interface Props {
  // ===== 基础配置 =====
  /** 表单区块配置数组 */
  sections: SectionConfig[];
  /** 表单数据对象 */
  form: FormDataType;
  /** 激活的折叠面板 name 数组 */
  activeNames?: string[];
  /** 表单验证规则 */
  rules?: any;
  /** 表单标签宽度 */
  labelWidth?: string;
  /** 表单标签位置 */
  labelPosition?: "left" | "right" | "top";
  /** 栅格间距 */
  gutter?: number;
  /** 每个字段占据的栅格数（外部手动控制时使用，会覆盖内部布局切换） */
  fieldSpan?: number;

  // ===== 顶部标题栏配置 =====
  /** 是否显示顶部标题栏 */
  showHeader?: boolean;
  /** 标题栏标题文本 */
  headerTitle?: string;
  /** 顶部操作按钮 */
  headerActions?: HeaderAction[];

  // ===== 工具栏配置 =====
  /** 是否显示工具栏 */
  showToolbar?: boolean;
  /** 是否显示必填字段过滤开关 */
  showRequiredFilter?: boolean;

  // ===== 布局切换配置 =====
  /** 是否显示布局切换器 */
  showLayoutSwitch?: boolean;
  /** 默认布局列数 */
  defaultLayout?: 2 | 3 | 4 | 5;
  /** 可选布局列数 */
  layoutOptions?: Array<2 | 3 | 4 | 5>;

  // ===== 楼层导航配置 =====
  /** 是否显示楼层导航 */
  showNavTabs?: boolean;
  /** 楼层导航位置 */
  navTabsPosition?: "left" | "right";
  /** 楼层导航配置（不传则自动从 sections 生成） */
  navTabs?: NavTabConfig[];
}

const props = withDefaults(defineProps<Props>(), {
  activeNames: () => [],
  labelWidth: "100px",
  labelPosition: "right",
  gutter: 20,
  fieldSpan: undefined,

  showHeader: false,
  headerTitle: "主档维护",
  headerActions: () => [],

  showToolbar: false,
  showRequiredFilter: false,

  showLayoutSwitch: false,
  defaultLayout: 5,
  layoutOptions: () => [2, 3, 4, 5],

  showNavTabs: false,
  navTabsPosition: "left",
  navTabs: () => []
});

/** 组件 Emits */
interface Emits {
  (e: "update:activeNames", value: string[]): void;
}

const emit = defineEmits<Emits>();

// ===== 内部状态 =====
/** 仅显示必填字段开关 */
const showRequiredOnly = ref(false);

/** 当前布局列数 */
const currentLayout = ref<2 | 3 | 4 | 5>(props.defaultLayout);

/** 当前激活的导航标签 */
const activeNavTab = ref("");

/** 表单容器引用 */
const formContainerRef = ref<HTMLElement | null>(null);

// ===== 计算属性 =====
/** 激活的折叠面板（v-model） */
const activeNamesModel = computed({
  get: () => props.activeNames,
  set: (val) => emit("update:activeNames", val)
});

/**
 * 🆕 内部布局选项配置
 */
const internalLayoutOptions = computed<LayoutOption[]>(() => {
  return props.layoutOptions.map((col) => ({
    columns: col,
    icon: "|".repeat(col),
    title: `${col}列布局`
  }));
});

/**
 * 🆕 当前字段 span 值
 * 优先使用外部传入的 fieldSpan，否则根据内部布局计算
 */
const currentFieldSpan = computed(() => {
  if (props.fieldSpan !== undefined) {
    return props.fieldSpan;
  }
  return Math.floor(24 / currentLayout.value);
});

/**
 * 🆕 过滤后的区块（根据必填字段过滤）
 */
const filteredSections = computed(() => {
  if (!showRequiredOnly.value) {
    return props.sections;
  }

  return props.sections.map((section) => {
    if (section.isSpecial) {
      return section;
    }
    return {
      ...section,
      fieldsConfig: section.fieldsConfig.filter((field) => field.required)
    };
  });
});

/**
 * 过滤后的可见区块
 * 根据 section.visible 函数和字段过滤结果判断是否显示
 */
const visibleSections = computed(() => {
  return filteredSections.value.filter((section) => {
    // 特殊区块：必填模式下隐藏
    if (section.isSpecial) {
      return !showRequiredOnly.value;
    }
    // 普通区块：有字段才显示
    const hasFields = section.fieldsConfig.length > 0;
    const visibleByFunc = section.visible ? section.visible() : true;
    return hasFields && visibleByFunc;
  });
});

/**
 * 🆕 内部导航标签配置
 * 如果外部传入则使用外部的，否则自动从 sections 生成
 */
const internalNavTabs = computed<NavTabConfig[]>(() => {
  if (props.navTabs && props.navTabs.length > 0) {
    return props.navTabs;
  }
  // 自动从 sections 生成
  return props.sections.map((section) => ({
    name: section.name,
    label: section.title,
    sectionName: section.name
  }));
});

// ===== 方法 =====
/** 处理楼层导航点击 */
const handleNavTabClick = (tab: any) => {
  const tabName = tab.paneName || tab.props?.name;
  const tabConfig = internalNavTabs.value.find((t) => t.name === tabName);

  if (!tabConfig?.sectionName) return;

  // 展开对应的 collapse section
  if (!activeNamesModel.value.includes(tabConfig.sectionName)) {
    activeNamesModel.value = [...activeNamesModel.value, tabConfig.sectionName];
  }

  // 滚动到对应区域
  setTimeout(() => {
    const section = props.sections.find(
      (s) => s.name === tabConfig.sectionName
    );
    if (section?.id) {
      const sectionEl = document.getElementById(section.id);
      if (sectionEl) {
        sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, 150);
};
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>
