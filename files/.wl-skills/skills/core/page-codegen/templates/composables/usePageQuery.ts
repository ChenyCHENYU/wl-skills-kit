import { ref, type Ref } from "vue";

export interface PageState {
  current: number;
  size: number;
  total: number;
}

/** 接口响应只约定分页部分，其余业务字段由页面自行处理。 */
export interface PageResponse<Row> {
  data?: {
    records?: Row[];
    total?: number;
    summary?: Record<string, unknown>;
  };
  message?: string;
}

export interface PageQueryOptions<Row, Query> {
  initialQuery: () => Query;
  request: (query: Query, page: PageState) => Promise<PageResponse<Row>>;
  fixedQuery?: () => Partial<Query>;
  page?: { current: number; size: number };
  pageSizes?: readonly number[];
  beforeSelect?: (query: Query) => boolean | Promise<boolean>;
  transformRows?: (rows: Row[]) => Row[];
  loading?: (active: boolean) => void;
  updated?: () => void | Promise<void>;
  onPageSizeLimit?: (maximum: number) => void;
}

/** 仅管理查询、分页和请求竞态；接口、校验、表格刷新与业务动作由页面提供。 */
export const usePageQuery = <Row, Query extends Record<string, unknown>>(
  options: PageQueryOptions<Row, Query>
) => {
  const page = ref<PageState>({
    current: 1,
    size: 10,
    ...options.page,
    total: 0
  });
  // Vue 深层 ref 会展开行字段，边界处保留调用方声明的简单数据类型。
  const rows = ref<Row[]>([]) as Ref<Row[]>;
  const query = ref(options.initialQuery()) as Ref<Query>;
  const summary = ref<Record<string, unknown>>({});
  let sequence = 0;

  const clear = () => {
    sequence += 1;
    rows.value = [];
    page.value.total = 0;
    summary.value = {};
    options.loading?.(false);
    void options.updated?.();
  };

  const applyResponse = (response: PageResponse<Row>) => {
    const records = Array.isArray(response.data?.records)
      ? response.data.records
      : [];
    rows.value = options.transformRows?.(records) || records;
    page.value.total = response.data?.total || 0;
    summary.value = response.data?.summary || {};
    return options.updated?.();
  };

  const select = async () => {
    const sizes = options.pageSizes;
    if (sizes?.length && !sizes.includes(page.value.size)) {
      const maximum = Math.max(...sizes);
      page.value.size = maximum;
      options.onPageSizeLimit?.(maximum);
    }
    const currentSequence = ++sequence;
    const params = { ...query.value, ...options.fixedQuery?.() };
    try {
      if (options.beforeSelect && !(await options.beforeSelect(params))) return;
      // 异步校验期间发生了新查询或清空时，旧查询不得继续请求。
      if (currentSequence !== sequence) return;
      options.loading?.(true);
      const response = await options.request(params, { ...page.value });
      if (currentSequence !== sequence) return response;
      await applyResponse(response);
      return response;
    } finally {
      if (currentSequence === sequence) options.loading?.(false);
    }
  };

  // 删除后使用服务端最新总数回退，避免预估删除数量造成页码错误。
  const selectAfterDeletion = async () => {
    const expectedSequence = sequence + 1;
    const response = await select();
    if (!response || sequence !== expectedSequence) return response;
    const lastPage = Math.max(1, Math.ceil(page.value.total / page.value.size));
    if (page.value.current <= lastPage) return response;
    page.value.current = lastPage;
    return select();
  };

  const search = () => {
    page.value.current = 1;
    return select();
  };
  const reset = () => {
    query.value = options.initialQuery();
    return search();
  };

  return {
    page,
    rows,
    query,
    summary,
    select,
    search,
    reset,
    clear,
    selectAfterDeletion
  };
};
