import type { VNodeChild, CSSProperties } from "vue";
import type { TableColumnDesc } from "@jhlc/common-core/src/components/table/base-table/type";
import { BusLogicDataType } from "@jhlc/types/src/logical-data";
import { defineColumns } from "@agile-team/wl-skills-ui/runtime";

/** 基于现有 BaseTable 契约提供列扩展。 */
export interface ColumnOptions<Row = Record<string, unknown>> {
  width?: number;
  minWidth?: number;
  fixed?: "left" | "right";
  group?: string;
  dictCode?: string;
  editable?: boolean;
  maxLength?: number;
  numeric?: {
    min?: number;
    max?: number;
    fractionDigits?: number;
    step?: number;
  };
  logicType?: string;
  logicValue?: string;
  format?: (row: Row) => string;
  cell?: (row: Row) => VNodeChild;
  /** 保留已持久化的列 CID，避免重构后丢失用户列配置。 */
  cid?: string;
}

export interface TableColumn<Row = Record<string, unknown>>
  extends ColumnOptions<Row> {
  kind: "field" | "index" | "selection" | "group";
  name?: string;
  label: string;
  children?: TableColumn<Row>[];
}

/** 页面通过明确的列声明调用配置，平台渲染细节在此转换。 */
export const tableColumn = <Row>() => ({
  text: (
    name: keyof Row & string,
    label: string,
    minWidth = 110,
    options: ColumnOptions<Row> = {}
  ): TableColumn<Row> => ({
    kind: "field",
    name,
    label,
    minWidth,
    ...options
  }),
  dict: (
    name: keyof Row & string,
    label: string,
    dictCode: string,
    minWidth = 110,
    options: ColumnOptions<Row> = {}
  ): TableColumn<Row> => ({
    kind: "field",
    name,
    label,
    minWidth,
    dictCode,
    ...options
  }),
  index: (width = 70, label = "序号"): TableColumn<Row> => ({
    kind: "index",
    label,
    width
  }),
  selection: (): TableColumn<Row> => ({
    kind: "selection",
    label: "",
    width: 55,
    fixed: "left"
  }),
  group: (
    label: string,
    ...children: TableColumn<Row>[]
  ): TableColumn<Row> => ({
    kind: "group",
    label,
    children
  })
});

export interface BaseTableOptions<Row> {
  /** 业务方提供字典解析，扩展层不绑定具体模块。 */
  dictionary?: (name: string, code: string) => Record<string, unknown>;
  /** 业务方可按字段契约提供数字输入规则。 */
  numberInput?: (column: TableColumn<Row>) => Record<string, unknown>;
  /** 样式类名由调用方指定，便于其他业务模块复用。 */
  classes?: {
    header?: string;
    selectionHeader?: string;
    selectionCell?: string;
  };
}

const cellStyle = (): CSSProperties => ({ textAlign: "center" });
const logicTypeMap: Record<string, BusLogicDataType> = {
  number: BusLogicDataType.number,
  date: BusLogicDataType.date,
  datetime: BusLogicDataType.datetime,
  time: BusLogicDataType.time,
  dict: BusLogicDataType.dict,
  company: BusLogicDataType.company
};

/** 集中处理平台列类型与 UI 预设类型的边界。 */
export const defineTableColumns = (
  columns: TableColumnDesc[]
): TableColumnDesc[] => defineColumns(columns as never[]) as TableColumnDesc[];

const defaultNumberInput = <Row>(column: TableColumn<Row>) => ({
  controls: false,
  ...(column.numeric?.min !== undefined ? { min: column.numeric.min } : {}),
  ...(column.numeric?.max !== undefined ? { max: column.numeric.max } : {}),
  ...(column.numeric?.fractionDigits !== undefined
    ? { precision: column.numeric.fractionDigits }
    : {}),
  ...(column.numeric?.step !== undefined ? { step: column.numeric.step } : {})
});

// CID 只在原值缺失时按原前缀生成，保持用户已保存的列配置。
const columnCid = (
  cid: string | undefined,
  prefix: string | undefined,
  name: string
) => cid || (prefix ? `${prefix}-${name}` : undefined);

// 编辑器独立处理，表格渲染和编辑仍共用同一字段契约。
const columnEditor = <Row>(
  spec: TableColumn<Row>,
  hooks: BaseTableOptions<Row>
) => {
  if (!spec.editable) return {};
  if (spec.logicType === "number")
    return {
      customEditProps: () => ({
        tag: "jh-input-number",
        ...(hooks.numberInput?.(spec) || defaultNumberInput(spec)),
        textAlign: "left"
      })
    };
  if (spec.maxLength)
    return { customEditProps: () => ({ maxlength: spec.maxLength }) };
  return {};
};

const fieldColumn = <Row>(
  spec: TableColumn<Row>,
  cidPrefix: string | undefined,
  hooks: BaseTableOptions<Row>
): TableColumnDesc => {
  const name = spec.name || "";
  const cid = columnCid(spec.cid, cidPrefix, name);
  const headerClass = hooks.classes?.header;
  return {
    name,
    label: spec.label,
    ...(cid ? { cid } : {}),
    ...(spec.width !== undefined ? { width: spec.width } : {}),
    minWidth: spec.minWidth ?? spec.width ?? 110,
    align: "center",
    headerAlign: "center",
    cellStyle,
    headerClass,
    fixed: spec.fixed,
    editable: spec.editable,
    alwaysEditable: spec.editable,
    showOverflowTooltip: true,
    ...columnEditor(spec, hooks),
    ...(spec.dictCode && hooks.dictionary
      ? hooks.dictionary(name, spec.dictCode)
      : {}),
    ...(spec.format ? { formatter: (row: Row) => spec.format?.(row) } : {}),
    ...(spec.cell
      ? { defaultSlot: ({ row }: { row: Row }) => spec.cell?.(row) }
      : {}),
    logicType: logicTypeMap[spec.logicType],
    logicValue: spec.logicValue
  } as TableColumnDesc & { headerClass: string };
};

const convertColumn = <Row>(
  spec: TableColumn<Row>,
  cidPrefix: string | undefined,
  hooks: BaseTableOptions<Row>
): TableColumnDesc => {
  switch (spec.kind) {
    case "group":
      return {
        label: spec.label,
        children: (spec.children || []).map((child) =>
          convertColumn(child, cidPrefix, hooks)
        )
      };
    case "selection":
      return createSelectionColumn(
        columnCid(spec.cid, cidPrefix, "selection"),
        hooks.classes
      );
    case "index": {
      const cid = columnCid(spec.cid, cidPrefix, "index");
      return {
        type: "index",
        label: spec.label,
        width: spec.width ?? 70,
        ...(spec.fixed ? { fixed: spec.fixed } : {}),
        ...(cid ? { cid } : {}),
        align: "center",
        headerAlign: "center",
        cellStyle,
        headerClass: hooks.classes?.header
      } as TableColumnDesc & { headerClass: string };
    }
    default:
      return fieldColumn(spec, cidPrefix, hooks);
  }
};

/** 将业务列声明转换为当前 BaseTable/AG Grid 的原生列。 */
export const toBaseTableColumns = <Row>(
  columns: TableColumn<Row>[],
  cidPrefix?: string,
  hooks: BaseTableOptions<Row> = {}
): TableColumnDesc[] => {
  const result: TableColumnDesc[] = [];
  const convert = (spec: TableColumn<Row>) =>
    convertColumn(spec, cidPrefix, hooks);

  // 相邻且同组的字段按原顺序合并，保留原有分组层级。
  for (const spec of columns) {
    const column = convert(spec);
    if (!spec.group) {
      result.push(column);
      continue;
    }
    const previous = result[result.length - 1];
    if (previous?.label === spec.group && Array.isArray(previous.children)) {
      previous.children.push(column);
    } else {
      result.push({ label: spec.group, children: [column] });
    }
  }
  return result;
};

export const createSelectionColumn = (
  cid?: string,
  classes: BaseTableOptions<unknown>["classes"] = {}
): TableColumnDesc =>
  ({
    type: "selection",
    label: "",
    width: 55,
    fixed: "left",
    ...(cid ? { cid } : {}),
    align: "center",
    headerAlign: "center",
    cellStyle: () => ({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      paddingLeft: 0,
      paddingRight: 0
    }),
    cellClass: () => classes.selectionCell ?? "",
    headerClass: classes.selectionHeader
  }) as TableColumnDesc & { headerClass: string };

/** 表格扩展集中于一个组合函数，各实例独立持有业务选项。 */
export const useBaseTable = (hooks: BaseTableOptions<unknown> = {}) => ({
  column: tableColumn,
  columns: <Row>(columns: TableColumn<Row>[], cidPrefix?: string) =>
    defineTableColumns(toBaseTableColumns(columns, cidPrefix, hooks)),
  // 字段模型页面先组装原生操作列，再统一补齐列配置。
  adapt: <Row>(columns: TableColumn<Row>[], cidPrefix?: string) =>
    toBaseTableColumns(columns, cidPrefix, hooks),
  normalize: defineTableColumns,
  selection: (cid?: string) => createSelectionColumn(cid, hooks.classes)
});
