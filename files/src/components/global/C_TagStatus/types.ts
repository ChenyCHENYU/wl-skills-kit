/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-02-14
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-02-14
 * @FilePath: \cx-ui-produce\src\components\global\C_TagStatus\types.ts
 * @Description: 状态标签组件 - 类型定义
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

/**
 * Element Plus Tag 组件的类型
 */
export type TagType = "" | "success" | "warning" | "danger" | "info";

/**
 * Element Plus Tag 组件的效果
 */
export type TagEffect = "light" | "dark" | "plain";

/**
 * 状态类型枚举
 */
export enum StatusType {
  /** 计划状态 */
  PLAN = "plan",
  /** 产品状态 */
  PRODUCT = "product",
  /** 材料状态 */
  MATERIAL = "material",
  /** 进程状态 */
  PROCESS = "process",
  /** 切取确认状态 */
  SAMPLING = "sampling",
  /** 试样状态 */
  SAMPLE = "sample",
  /** 出炉状态 */
  SLAB = "slab",
  /** 布尔状态 */
  BOOLEAN = "boolean"
}

/**
 * 状态配置项
 */
export interface StatusConfig {
  /** 状态值（用于匹配） */
  value: string | number | boolean;
  /** 显示文本 */
  label: string;
  /** Element Plus Tag 类型 */
  type?: TagType;
  /** 自定义颜色（优先级高于 type） */
  color?: string;
  /** Tag 效果 */
  effect?: TagEffect;
}

/**
 * 状态类型配置映射
 */
export type StatusTypeConfig = {
  [key in StatusType]?: StatusConfig[];
};
