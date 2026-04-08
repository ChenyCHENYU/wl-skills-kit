/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2026-02-14
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-02-14
 * @FilePath: \cx-ui-produce\src\components\global\C_TagStatus\config.ts
 * @Description: 状态标签组件 - 配置中心
 * Copyright (c) 2026 by CHENY, All Rights Reserved 😎.
 */

import type { StatusTypeConfig, StatusConfig } from "./types";
import { StatusType } from "./types";

/**
 * 状态配置映射表
 *
 * 使用说明：
 * 1. value: 后端返回的状态值（字符串/数字/布尔值）
 * 2. label: 前端显示的文本
 * 3. type: Element Plus Tag 类型（success/warning/danger/info/''）
 * 4. color: 自定义颜色（可选，优先级高于 type）
 * 5. effect: Tag 效果（light/dark/plain，默认 light）
 *
 * 颜色方案：
 * - type='': 默认灰色 (#909399)
 * - type='info': 信息蓝 (#909399)
 * - type='success': 成功绿 (#67C23A)
 * - type='warning': 警告橙 (#E6A23C)
 * - type='danger': 危险红 (#F56C6C)
 * - 自定义 color: 任意合法的 CSS 颜色值
 */
export const STATUS_CONFIG: StatusTypeConfig = {
  /**
   * 计划状态配置
   * 字典: mmwrMillPlanStatus / mmwrFinishPlanStatus
   */
  [StatusType.PLAN]: [
    { value: "0", label: "待下达", type: "info" },
    { value: "1", label: "已下达", type: "", color: "#409EFF" },
    { value: "2", label: "执行中", type: "warning" },
    { value: "3", label: "已完成", type: "success" },
    { value: "4", label: "已取消", type: "danger" },
    { value: "A", label: "待入炉", type: "info" },
    { value: "B", label: "已入炉", type: "", color: "#409EFF" },
    { value: "C", label: "待完轧", type: "warning" },
    { value: "D", label: "已完轧", type: "success" }
  ],

  /**
   * 产品状态配置
   * 字典: mmwrProdStatus
   */
  [StatusType.PRODUCT]: [
    { value: "0", label: "待加工", type: "info" },
    { value: "1", label: "加工中", type: "", color: "#409EFF" },
    { value: "2", label: "已完成", type: "success" },
    { value: "3", label: "合格品", type: "success", effect: "dark" },
    { value: "4", label: "不合格", type: "danger" },
    { value: "A", label: "待产出", type: "info" },
    { value: "B", label: "已产出", type: "success" },
    { value: "C", label: "产出完毕", type: "success", effect: "dark" }
  ],

  /**
   * 材料状态配置
   * 字典: mmwrMatStatus
   */
  [StatusType.MATERIAL]: [
    { value: "0", label: "在库", type: "info" },
    { value: "1", label: "在线", type: "", color: "#409EFF" },
    { value: "2", label: "已使用", type: "success" },
    { value: "3", label: "待检", type: "warning" },
    { value: "4", label: "异常", type: "danger" }
  ],

  /**
   * 进程状态配置
   * 字典: mmwrProcessStatus
   */
  [StatusType.PROCESS]: [
    { value: "0", label: "待上料", type: "info" },
    { value: "1", label: "上料中", type: "", color: "#409EFF" },
    { value: "2", label: "已产出", type: "success" },
    { value: "3", label: "已取消", type: "danger" },
    { value: "A", label: "待处理", type: "info" },
    { value: "B", label: "处理中", type: "warning" },
    { value: "C", label: "已完成", type: "success" }
  ],

  /**
   * 切取确认状态配置
   * 字典: mmwrSampLingStus
   */
  [StatusType.SAMPLING]: [
    { value: "0", label: "未确认", type: "info" },
    { value: "1", label: "已确认", type: "success" },
    { value: "2", label: "已取消", type: "danger" }
  ],

  /**
   * 试样状态配置
   * 字典: mmwrSampleStatus
   */
  [StatusType.SAMPLE]: [
    { value: "0", label: "待检验", type: "info" },
    { value: "1", label: "检验中", type: "warning" },
    { value: "2", label: "已完成", type: "success" },
    { value: "3", label: "不合格", type: "danger" }
  ],

  /**
   * 出炉状态配置
   * 字典: mmwrSlabStatus
   */
  [StatusType.SLAB]: [
    { value: "0", label: "待出炉", type: "info" },
    { value: "1", label: "已出炉", type: "success" },
    { value: "2", label: "在线", type: "", color: "#409EFF" }
  ],

  /**
   * 布尔状态配置
   * 用于 是/否 类型字段
   */
  [StatusType.BOOLEAN]: [
    { value: true, label: "是", type: "success" },
    { value: false, label: "否", type: "info" },
    { value: 1, label: "是", type: "success" },
    { value: 0, label: "否", type: "info" },
    { value: "1", label: "是", type: "success" },
    { value: "0", label: "否", type: "info" },
    { value: "Y", label: "是", type: "success" },
    { value: "N", label: "否", type: "info" }
  ]
};

/**
 * 获取状态配置
 * @param statusType 状态类型
 * @param value 状态值
 * @returns 状态配置对象
 */
export function getStatusConfig(
  statusType: StatusType | string,
  value: string | number | boolean | null | undefined
): StatusConfig | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const configs = STATUS_CONFIG[statusType as StatusType];
  if (!configs) {
    return undefined;
  }

  // 精确匹配
  let config = configs.find((c) => c.value === value);

  // 如果精确匹配失败，尝试字符串化后匹配
  if (!config) {
    const valueStr = String(value);
    config = configs.find((c) => String(c.value) === valueStr);
  }

  return config;
}

/**
 * 获取状态显示文本
 * @param statusType 状态类型
 * @param value 状态值
 * @returns 显示文本
 */
export function getStatusLabel(
  statusType: StatusType | string,
  value: string | number | boolean | null | undefined
): string {
  const config = getStatusConfig(statusType, value);
  return config?.label || String(value || "-");
}

/**
 * 批量注册新的状态配置
 * @param statusType 状态类型
 * @param configs 状态配置数组
 */
export function registerStatusConfig(
  statusType: string,
  configs: StatusConfig[]
): void {
  STATUS_CONFIG[statusType as StatusType] = configs;
}
