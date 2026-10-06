import { describe, it, expect } from "vitest";
import { proxyRefs, ref, toRaw, toRef } from "vue";
import { usePageQuery } from "../files/.wl-skills/skills/core/page-codegen/templates/composables/usePageQuery.ts";

function createList(options = {}) {
  const pending = [];
  const loading = [];
  const list = usePageQuery({
    initialQuery: () => ({ name: "默认", statuses: ["A"], count: 0, active: false }),
    loading: (active) => loading.push(active),
    request: (query, page) => new Promise((resolve, reject) => pending.push({ query, page, resolve, reject })),
    ...options,
  });
  return { list, pending, loading };
}
const response = (id, total = 1) => ({ data: { records: [{ id }], total, summary: { count: total } } });

describe("可移植的分页查询组合函数", () => {
  it("页面对象兼容 Vue 3.2，保留 ref 连接、状态替换和实例隔离", async () => {
    const { list, pending } = createList();
    const vm = proxyRefs({ ...list, tableRef: ref() });
    const tableRef = toRef(vm, "tableRef");
    const table = { loading() {} };
    tableRef.value = table;
    expect(toRaw(vm.tableRef)).toBe(table);
    vm.query.name = "修改名称";
    vm.page.current = 4;
    const searching = vm.search();
    expect(pending[0].query.name).toBe("修改名称");
    expect(pending[0].page.current).toBe(1);
    pending[0].resolve(response("查询结果"));
    await searching;
    expect(vm.rows).toEqual([{ id: "查询结果" }]);
    expect(vm.rows).toBe(list.rows.value);
    const previous = vm.query;
    const resetting = vm.reset();
    expect(vm.query).not.toBe(previous);
    expect(vm.query.name).toBe("默认");
    pending[1].resolve(response("重置结果"));
    await resetting;
    const other = proxyRefs(createList().list);
    vm.query.statuses.push("B");
    expect(other.query.statuses).toEqual(["A"]);
    tableRef.value = null;
    expect(vm.tableRef).toBeNull();
  });

  it("后发请求先返回时，旧响应不覆盖新行和汇总，也不关闭新请求的加载状态", async () => {
    const { list, pending, loading } = createList();
    const first = list.select();
    const second = list.select();
    pending[0].resolve(response("旧", 100));
    await first;
    expect(loading).toEqual([true, true]);
    expect(list.rows.value).toEqual([]);
    pending[1].resolve(response("新", 3));
    await second;
    expect(list.rows.value).toEqual([{ id: "新" }]);
    expect(list.summary.value).toEqual({ count: 3 });
    expect(list.page.value.total).toBe(3);
    expect(loading).toEqual([true, true, false]);
  });

  it("清空使进行中的响应失效，且重置行、总数、汇总和加载状态", async () => {
    const { list, pending, loading } = createList();
    const request = list.select();
    list.clear();
    pending[0].resolve(response("过期"));
    await request;
    expect(list.rows.value).toEqual([]);
    expect(list.page.value.total).toBe(0);
    expect(list.summary.value).toEqual({});
    expect(loading).toEqual([true, false]);
  });

  it("异步校验后不继续发送已清空的请求", async () => {
    let finish;
    const { list, pending } = createList({ beforeSelect: () => new Promise((resolve) => { finish = resolve; }) });
    const request = list.select();
    list.clear();
    finish(true);
    await request;
    expect(pending).toHaveLength(0);
  });

  it("校验失败和校验异常均结束加载状态；异常交给调用方处理", async () => {
    let valid = true;
    const { list, pending, loading } = createList({ beforeSelect: async () => valid });
    const first = list.select();
    await Promise.resolve();
    valid = false;
    await list.select();
    expect(loading).toEqual([true, false]);
    pending[0].resolve(response("旧"));
    await first;
    expect(list.rows.value).toEqual([]);
    const failure = createList({ beforeSelect: async () => { throw new Error("校验失败"); } });
    await expect(failure.list.select()).rejects.toThrow("校验失败");
    expect(failure.loading).toEqual([false]);
  });

  it("重置重新创建数组默认值，保留零值与布尔值，固定上下文覆盖输入", async () => {
    const { list, pending } = createList({ fixedQuery: () => ({ company: "固定厂别" }) });
    list.query.value.company = "输入厂别";
    list.query.value.statuses.push("B");
    list.page.value.current = 4;
    const request = list.reset();
    expect(pending[0].query).toEqual({ name: "默认", statuses: ["A"], count: 0, active: false, company: "固定厂别" });
    expect(pending[0].page.current).toBe(1);
    pending[0].resolve(response("重置"));
    await request;
  });

  it("限制请求页大小，删除后根据服务端总数回退到最后有效页", async () => {
    const limits = [];
    const { list, pending } = createList({ pageSizes: [10, 20], onPageSizeLimit: (max) => limits.push(max) });
    list.page.value.size = 1000;
    list.page.value.current = 4;
    const request = list.selectAfterDeletion();
    expect(pending[0].page.size).toBe(20);
    expect(limits).toEqual([20]);
    pending[0].resolve(response("空页", 21));
    await new Promise((resolve) => setImmediate(resolve));
    expect(pending[1].page.current).toBe(2);
    pending[1].resolve(response("有效页", 21));
    await request;
    expect(list.page.value.current).toBe(2);
  });

  it("过期的删除刷新不改变新查询页码，也不额外发起回退请求", async () => {
    const { list, pending } = createList();
    list.page.value.current = 4;
    const deletion = list.selectAfterDeletion();
    const searching = list.search();
    pending[0].resolve(response("过期删除", 1));
    await deletion;
    expect(pending).toHaveLength(2);
    expect(list.page.value.current).toBe(1);
    pending[1].resolve(response("搜索"));
    await searching;
  });

  it("请求失败保留原行并结束加载状态，不用空数组假装成功", async () => {
    const { list, pending, loading } = createList();
    list.rows.value = [{ id: "原行" }];
    const request = list.select();
    pending[0].reject(new Error("请求失败"));
    await expect(request).rejects.toThrow("请求失败");
    expect(list.rows.value).toEqual([{ id: "原行" }]);
    expect(loading).toEqual([true, false]);
  });
});
