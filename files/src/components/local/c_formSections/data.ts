/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-01-01 13:30:00
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-01-01 13:30:00
 * @FilePath: \cx-ui-sale\src\components\local\c_formSections\data.ts
 * @Description: 表单区块组件 - 类型定义
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import type { Component } from "vue";

// ========== 类型定义 ==========

/**
 * 字段配置接口
 * 定义表单字段的基本属性和行为
 */
export interface FieldConfig {
  /** 字段属性名（对应 form 对象的 key） */
  prop: string;
  /** 字段标签 */
  label: string;
  /** 字段类型 */
  type?:
    | "input"
    | "select"
    | "textarea"
    | "date"
    | "datetime"
    | "number"
    | "custom";
  /** 栅格占据列数（1-24） */
  span?: number;
  /** 是否必填 */
  required?: boolean;
  /** 占位符文本 */
  placeholder?: string;
  /** 是否可清空（select） */
  clearable?: boolean;
  /** 下拉选项（select） */
  options?: Array<{ label: string; value: string | number }>;
  /** 文本域行数（textarea） */
  rows?: number;
  /** 最小值（number） */
  min?: number;
  /** 最大值（number） */
  max?: number;
  /** 数字精度（number） */
  precision?: number;
  /** 步长（number） */
  step?: number;
}

/**
 * 区块配置接口
 * 定义折叠面板区块的结构和行为
 */
export interface SectionConfig {
  /** 折叠面板的 name 值（唯一标识） */
  name: string;
  /** 折叠面板 ID（用于锚点跳转） */
  id: string;
  /** 显示的标题 */
  title: string;
  /** 字段配置数组 */
  fieldsConfig: FieldConfig[];
  /** 显示条件函数（可选，返回 true 显示，false 隐藏） */
  visible?: () => boolean;
  /** 是否为特殊处理的区块（如特殊需求） */
  isSpecial?: boolean;
}

/**
 * 表单数据类型
 * 使用索引签名支持动态字段
 */
export interface FormDataType {
  [key: string]: any;
}

/**
 * 楼层导航配置接口
 */
export interface NavTabConfig {
  /** 标签名称（唯一标识） */
  name: string;
  /** 显示文本 */
  label: string;
  /** 关联的 section name（用于锚点跳转） */
  sectionName?: string | null;
}

/**
 * 顶部操作按钮配置接口
 */
export interface HeaderAction {
  /** 按钮文本 */
  label: string;
  /** 按钮类型 */
  type?: "primary" | "success" | "warning" | "danger" | "info" | "text" | "";
  /** 图标名称（Element Plus Icon 组件或字符串） */
  icon?: string | Component;
  /** 点击事件回调 */
  onClick: () => void;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 布局选项配置接口
 */
export interface LayoutOption {
  /** 列数 */
  columns: 2 | 3 | 4 | 5;
  /** 显示图标 */
  icon: string;
  /** 提示文本 */
  title: string;
}

// ========== 工具函数 ==========

/**
 * 根据必填条件过滤字段配置
 * @param fields 原始字段配置数组
 * @param onlyRequired 是否只显示必填字段
 */
export function filterFieldsByRequired(
  fields: FieldConfig[],
  onlyRequired: boolean
): FieldConfig[] {
  if (!onlyRequired) return fields;
  return fields.filter((field) => field.required);
}

/**
 * 判断区块是否有可显示的字段
 * @param fields 字段配置数组
 */
export function hasSectionFields(fields: FieldConfig[]): boolean {
  return fields.length > 0;
}

/**
 * 生成默认表单数据
 * @param sections 区块配置数组
 */
export function generateDefaultFormData(
  sections: SectionConfig[]
): FormDataType {
  const formData: FormDataType = {};

  sections.forEach((section) => {
    section.fieldsConfig.forEach((field) => {
      // 根据字段类型设置默认值
      switch (field.type) {
        case "number":
          formData[field.prop] = field.min || 0;
          break;
        case "select":
          formData[field.prop] = "";
          break;
        case "date":
        case "datetime":
          formData[field.prop] = null;
          break;
        default:
          formData[field.prop] = "";
      }
    });
  });

  return formData;
}
