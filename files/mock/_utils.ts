/**
 * Mock 公共工具函数
 * 由 wl-skills-kit 提供，所有 mock 模块文件统一 import 此文件。
 * 注意：本文件无 export default，vite-plugin-mock 会安全跳过，不会报错。
 */
import Mock from "mockjs";

export const Random = Mock.Random;
export const pick = <T>(arr: T[]): T => Random.pick(arr) as T;
export const bool = () => Random.boolean();

/** 标准分页响应 */
export function pageResult(records: any[], total: number) {
  return { code: 2000, message: "操作成功", data: { records, total } };
}

/** 标准成功响应 */
export function ok(data: any = null) {
  return { code: 2000, message: "操作成功", data };
}

/** 通用分页截取（兼容 pageNo/current、pageSize/size 两种参数名） */
export function paginate(pool: any[], query: any) {
  const current = Number(query?.current || query?.pageNo) || 1;
  const size = Number(query?.size || query?.pageSize) || 10;
  const start = (current - 1) * size;
  return pageResult(pool.slice(start, start + size), pool.length);
}

/** 当前时间字符串 */
export function nowStr() {
  return new Date()
    .toLocaleString("zh-CN", { hour12: false })
    .replace(/\//g, "-");
}
