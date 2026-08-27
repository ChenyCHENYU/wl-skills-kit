"use strict";

/**
 * lib/scenario-compiler.js — wl-scenario 确定性代码编译器（双轨）
 *
 * A 轨（codegen）：scenario JSON → index.vue + data.ts + index.scss + page-spec.json，
 *   输出与 page-codegen/templates/universal/TPL-LIST.md 的最佳实践形态逐字符对齐
 *   （BaseTable + render-type="agGrid" + cid + defineColumns + renderOps + 标准生命周期）。
 * B 轨（runtime）：scenario JSON → definition.ts + 12 行薄壳 index.vue + 3 行 data.ts，
 *   page-spec.features.definitionSource 指向 definition，validate 走既有委托链校验；
 *   渲染器组件由项目提供（requires.renderer），kit 不分发运行时。
 *
 * 确定性约定：
 *   - 同一 scenario JSON + 同一 tableCid → 输出字节级一致（可 diff、可定点往返验证）
 *   - 声明式核心来自 JSON；extensions 代码逐字嵌入并打 @wl-scenario-ext 标记
 *   - 编译器不做任何语义猜测：缺 handler / 缺渲染器 / planned 模式一律报错
 */

const { findPattern, validateScenario, scenarioToPageSpec } = require("./scenario-template");
const {
  emitTreeList,
  emitRecordForm,
  emitFormRoute,
  emitChangeHistory,
} = require("./scenario-emitters-extra");

const CREATE_LABEL_RE = /^(?:新增|新建|添加|创建)/;
const DEFAULT_PAGE_BASELINE = Object.freeze({ method: "post", current: 1, size: 10 });

/** codegen 轨已实现 pattern → 发射器分派表（新增 pattern 先在 patterns.json 登记） */
const CODEGEN_EMITTERS = {
  "tree-list": emitTreeList,
  "record-form": emitRecordForm,
  "form-route": emitFormRoute,
  "change-history": emitChangeHistory,
};

function qs(value) {
  return JSON.stringify(String(value));
}

function base36Now(options) {
  if (options.now) return options.now();
  return Date.now().toString(36);
}

function buildTableCid(doc, options) {
  if (doc.tableCid) return doc.tableCid;
  if (doc.pattern === "change-history") return undefined; // 无表格页面，产物不依赖 cid
  return `${doc.pageAbbr}-${base36Now(options)}`;
}

function derivedApiPaths(doc) {
  const base = `/${doc.serviceShort}/${doc.resourceName}`;
  const paths = {
    list: `${base}/queryPage`,
    remove: `${base}/deleteById/{id}`,
    getById: `${base}/getById/{id}`,
    save: `${base}/save`,
    update: `${base}/updateById`,
    export: `${base}/export`,
  };
  if (doc.treeResource) paths.tree = `/${doc.serviceShort}/${doc.treeResource}/tree`;
  return paths;
}

function buildApiConfig(doc) {
  return { ...derivedApiPaths(doc), ...(doc.apiConfig || {}) };
}

function buildDeliveryProfile(doc) {
  return { ...DEFAULT_PAGE_BASELINE, ...(doc.deliveryProfile || {}) };
}

function hasForm(doc) {
  return (doc.formSections || []).some((s) => (s.fields || []).length > 0);
}

function hasDeleteOperation(doc) {
  return (doc.operations || []).some((op) => op.action === "del");
}

// ─── extensions 逐字嵌入（标记块，供提取器字节级回捞） ─────────────────────

function extensionCode(doc, slot) {
  const ext = (doc.extensions || []).find((item) => item.slot === slot);
  return ext ? String(ext.code || "") : "";
}

function markerBlock(indent, commentPrefix, commentSuffix, slot, code) {
  if (!code) return "";
  const begin = `${indent}${commentPrefix}@wl-scenario-ext:${slot}.begin${commentSuffix}`;
  const end = `${indent}${commentPrefix}@wl-scenario-ext:${slot}.end${commentSuffix}`;
  return [begin, code, end].join("\n");
}

// ─── 查询项发射 ────────────────────────────────────────────────────────────

function defaultPlaceholder(item) {
  if (item.type === "dict" || item.type === "select") return "请选择";
  return `请输入${item.label}`;
}

function emitQueryItem(item) {
  const type = item.type || "input";
  const placeholder = item.placeholder || defaultPlaceholder(item);
  if (type === "dict") {
    return [
      "        {",
      `          name: ${qs(item.name)},`,
      `          label: ${qs(item.label)},`,
      `          placeholder: ${qs(placeholder)},`,
      "          logicType: BusLogicDataType.dict,",
      `          logicValue: ${qs(item.dictCode)}`,
      "        }",
    ].join("\n");
  }
  if (type === "select") {
    return [
      "        {",
      `          name: ${qs(item.name)},`,
      `          label: ${qs(item.label)},`,
      `          component: () => ({ tag: "jh-select", items: OPTS.${item.name}Options })`,
      "        }",
    ].join("\n");
  }
  if (type === "dateRange") {
    return [
      "        {",
      `          name: ${qs(item.name)},`,
      `          startName: ${qs(item.startName)},`,
      `          endName: ${qs(item.endName)},`,
      `          label: ${qs(item.label)},`,
      "          component: () => ({",
      '            tag: "jh-date",',
      '            type: "daterange",',
      '            rangeSeparator: "至",',
      '            showFormat: "YYYY-MM-DD",',
      '            valueFormat: "YYYY-MM-DD"',
      "          })",
      "        }",
    ].join("\n");
  }
  return [
    "        {",
    `          name: ${qs(item.name)},`,
    `          label: ${qs(item.label)},`,
    `          placeholder: ${qs(placeholder)}`,
    "        }",
  ].join("\n");
}

function emitQueryDef(doc) {
  const items = (doc.query || []).map(emitQueryItem);
  return [
    "    queryDef(): BaseQueryItemDesc<any>[] {",
    "      return [",
    items.join(",\n"),
    "      ];",
    "    }",
  ].join("\n");
}

function emitOptBlock(doc) {
  const selects = (doc.query || []).filter((item) => (item.type || "input") === "select");
  if (selects.length === 0) return "";
  const entries = selects.map((item) => {
    const opts = (item.options || [])
      .map((opt) => `    { label: ${qs(opt.label)}, value: ${qs(opt.value)} }`)
      .join(",\n");
    return [`  ${item.name}Options: [`, opts, "  ]"].join("\n");
  });
  return [
    "/** 静态下拉选项（无字典 code 时在前端定义） */",
    "const OPTS = {",
    entries.join(",\n"),
    "};",
  ].join("\n");
}

// ─── 工具栏 / 操作列发射 ──────────────────────────────────────────────────

function emitToolbarButton(btn) {
  const isCreate = CREATE_LABEL_RE.test(String(btn.label).trim());
  const action = btn.action || (isCreate ? "openModal" : "custom");
  const onClick =
    action === "openModal"
      ? "() => editModalRef?.value?.open()"
      : String(btn.handler || "");
  const lines = ["        {"];
  const color = btn.color || (isCreate ? "primary" : "default");
  if (color !== "default") lines.push(`          name: ${qs(color)},`);
  lines.push(`          label: ${qs(btn.label)},`);
  if (btn.plain === true) lines.push("          plain: true,");
  lines.push(`          onClick: ${onClick}`);
  lines.push("        }");
  return lines.join("\n");
}

function emitToolbarDef(doc) {
  const items = (doc.toolbar || []).map(emitToolbarButton);
  return [
    "    toolbarDef(): ActionButtonDesc[] {",
    "      return [",
    items.join(",\n"),
    "      ];",
    "    }",
  ].join("\n");
}

const STANDARD_OPERATION_EMITTERS = {
  edit: '              { type: "edit", onClick: () => editModalRef?.value?.open(row.id) }',
  del: '              { type: "del", onClick: () => this.deleteById(row.id) }',
  view: '              { type: "view", onClick: () => editModalRef?.value?.view(row.id) }',
};

function emitOperation(op) {
  const standard = STANDARD_OPERATION_EMITTERS[op.action];
  if (standard) return standard;
  return `              { label: ${qs(op.label)}, onClick: ${String(op.handler || "")} }`;
}

function emitActionColumn(doc) {
  const ops = (doc.operations || []).map(emitOperation);
  return [
    "        {",
    '          label: "操作",',
    '          name: "_action",',
    "          cid: `${TABLE_CID}-action`,",
    "          width: 140,",
    '          fixed: "right",',
    '          align: "center",',
    "          defaultSlot: ({ row }: any) =>",
    "            renderOps([",
    ops.join(",\n"),
    "            ])",
    "        }",
  ].join("\n");
}

function emitDataColumn(item) {
  const isDict = item.type === "dict" || (item.dictCode && item.type !== "input");
  const cidLine = "          cid: `${TABLE_CID}-" + item.name + "`,";
  const lines = ["        {"];
  lines.push(`          label: ${qs(item.label)},`);
  lines.push(`          name: ${qs(item.name)},`);
  lines.push(cidLine);
  lines.push(`          minWidth: ${item.minWidth || 120},`);
  if (item.align) lines.push(`          align: ${qs(item.align)},`);
  if (isDict) {
    lines.push("          logicType: BusLogicDataType.dict,");
    lines.push(`          logicValue: ${qs(item.dictCode)},`);
    lines.push("          sortable: true,");
    lines.push("          filterable: true");
  } else {
    lines.push("          showOverflowTooltip: true,");
    lines.push("          sortable: true,");
    lines.push("          filterable: true");
  }
  lines.push("        }");
  return lines.join("\n");
}

function emitColumnsDef(doc) {
  const blocks = [
    '        { type: "selection", width: 55, fixed: "left", align: "center", headerAlign: "center" }',
    '        { type: "index", label: "序号", width: 60, align: "center" }',
    ...((doc.columns || []).map(emitDataColumn)),
  ];
  if ((doc.operations || []).length > 0) blocks.push(emitActionColumn(doc));
  return [
    "    columnsDef(): TableColumnDesc<any>[] {",
    "      return defineColumns([",
    blocks.join(",\n"),
    "      ] as any) as TableColumnDesc<any>[];",
    "    }",
  ].join("\n");
}

function emitDeleteById() {
  return [
    "    async deleteById(id: string) {",
    '      await ElMessageBox.confirm("确认删除该记录吗？", "提示", { type: "warning" });',
    "      await deleteAction(resolveApiPath(API_CONFIG.remove, id), {});",
    '      ElMessage.success("删除成功");',
    "      if ((this.list?.value?.length || 0) <= 1 && (this.page?.value?.current || 1) > 1) {",
    "        this.page.value.current -= 1;",
    "      }",
    "      await this.select();",
    "    }",
  ].join("\n");
}

// ─── modalConfig / data.ts 装配 ───────────────────────────────────────────

function emitFormField(field) {
  const placeholder =
    field.placeholder ||
    (field.type === "dict" || field.type === "select" ? "请选择" : `请输入${field.label}`);
  const lines = ["    {"];
  lines.push(`      name: ${qs(field.name)},`);
  lines.push(`      label: ${qs(field.label)},`);
  if (field.required) lines.push("      required: true,");
  lines.push(`      placeholder: ${qs(placeholder)}`);
  lines.push("    }");
  return lines.join("\n");
}

function emitModalConfig(doc) {
  const fields = (doc.formSections || []).flatMap((section) => section.fields || []);
  return [
    "/** 表单弹窗配置 */",
    "export const modalConfig = {",
    `  titlePrefix: ${qs(doc.page)},`,
    '  width: "850px",',
    "  columns: 2,",
    '  labelWidth: "110px",',
    "  formItems: [",
    fields.map(emitFormField).join(",\n"),
    "  ] as BaseFormItemDesc<any>[],",
    "  api: {",
    "    getById: API_CONFIG.getById,",
    "    save: API_CONFIG.save,",
    "    update: API_CONFIG.update",
    "  }",
    "};",
  ].join("\n");
}

function emitImports(form) {
  const lines = [];
  lines.push("import {");
  lines.push("  AbstractPageQueryHook,");
  lines.push("  RequestMethod,");
  lines.push("  BaseQueryItemDesc,");
  lines.push("  ActionButtonDesc,");
  lines.push("  TableColumnDesc,");
  lines.push("  BusLogicDataType");
  lines.push('} from "@/types/page";');
  if (form) {
    lines.push(
      'import type { BaseFormItemDesc } from "@jhlc/common-core/src/components/form/common/type";',
    );
  }
  lines.push('import { ElMessage, ElMessageBox } from "element-plus";');
  lines.push('import { deleteAction } from "@jhlc/common-core/src/api/action";');
  lines.push('import { defineColumns, renderOps } from "@agile-team/wl-skills-ui/runtime";');
  return lines.join("\n");
}

function emitApiBlock(api) {
  const apiEntries = Object.entries(api)
    .map(([key, value]) => `  ${key}: ${qs(value)}`)
    .join(",\n");
  return [
    "export const API_CONFIG = {",
    apiEntries,
    "} as const;",
    "export const resolveApiPath = (template: string, id: string) =>",
    "  template.replace(\"{id}\", encodeURIComponent(id));",
  ].join("\n");
}

function emitClassBlock(doc) {
  const profile = buildDeliveryProfile(doc);
  const constructor = [
    "    constructor() {",
    "      // 下面是包基线；生成时必须替换为生效 Delivery Profile 的 method/defaultCurrent/defaultSize/maxSize。",
    "      super({",
    "        url: { list: API_CONFIG.list },",
    `        page: { current: ${profile.current}, size: ${profile.size} },`,
    `        requestMethod: RequestMethod.${profile.method},`,
    "      });",
    "    }",
  ].join("\n");
  const methodsExt = markerBlock(
    "    ",
    "// ",
    "",
    "customMethods",
    extensionCode(doc, "customMethods"),
  );
  const members = [
    constructor,
    emitQueryDef(doc),
    emitToolbarDef(doc),
    emitColumnsDef(doc),
    hasDeleteOperation(doc) ? emitDeleteById() : "",
    methodsExt,
  ].filter(Boolean);
  return [
    "export function createPage(editModalRef?: any) {",
    "  let Page = new (class extends AbstractPageQueryHook {",
    members.join("\n\n"),
    "  })();",
    "",
    "  return (Page as any).create() as any;",
    "}",
  ].join("\n");
}

function emitDataTs(doc, ctx) {
  const sections = [
    emitImports(hasForm(doc)),
    markerBlock("", "// ", "", "customImports", extensionCode(doc, "customImports")),
    `export const TABLE_CID = ${qs(ctx.tableCid)};`,
    emitApiBlock(buildApiConfig(doc)),
    emitOptBlock(doc),
    hasForm(doc) ? emitModalConfig(doc) : "",
    emitClassBlock(doc),
  ].filter(Boolean);
  return sections.join("\n\n") + "\n";
}

// ─── index.vue 装配（codegen 轨） ─────────────────────────────────────────

function emitIndexVue(doc) {
  const form = hasForm(doc);
  const listTitle = doc.listTitle || doc.page;
  const toolbarExt = markerBlock(
    "    ",
    "<!-- ",
    " -->",
    "template.afterToolbar",
    extensionCode(doc, "template.afterToolbar"),
  );
  const lines = [];
  lines.push("<template>");
  lines.push('  <div class="app-container app-page-container">');
  lines.push("    <BaseQuery");
  lines.push("      :form=\"queryParam\"");
  lines.push("      :items=\"queryItems\"");
  lines.push(`      :columns="${doc.queryColumns || 4}"`);
  lines.push("      :auto-select=\"false\"");
  lines.push("      @select=\"search\"");
  lines.push("      @reset=\"search\"");
  lines.push("    />");
  lines.push("    <!-- 固定结构：工具栏在列表标题上方，二者均独占一行 -->");
  lines.push('    <BaseToolbar size="small" :items="toolbars" />');
  lines.push(`    <div class="list-title">${listTitle}</div>`);
  if (toolbarExt) lines.push(toolbarExt);
  lines.push("    <BaseTable");
  lines.push("      ref=\"tableRef\"");
  lines.push('      render-type="agGrid"');
  lines.push("      :cid=\"TABLE_CID\"");
  lines.push("      :data=\"list\"");
  lines.push("      :columns=\"columns\"");
  lines.push("      showToolbar");
  lines.push("    />");
  lines.push("    <div class=\"list-page__pager\">");
  lines.push("      <jh-pagination");
  lines.push("        v-show=\"page.total && page.total > 0\"");
  lines.push("        :total=\"page.total || 0\"");
  lines.push("        v-model:currentPage=\"page.current\"");
  lines.push("        v-model:pageSize=\"page.size\"");
  lines.push("        @current-change=\"select\"");
  lines.push("        @size-change=\"changePageSize\"");
  lines.push("      />");
  lines.push("    </div>");
  lines.push("  </div>");
  if (form) {
    lines.push('  <c_formModal ref="editModalRef" v-bind="modalConfig" @ok="search" />');
  }
  lines.push("</template>");
  lines.push("");
  lines.push('<script setup lang="ts">');
  if (form) {
    lines.push('import c_formModal from "@/components/local/c_formModal/index.vue";');
    lines.push("");
    lines.push("// 表单弹窗引用");
    lines.push("const editModalRef = ref<InstanceType<typeof c_formModal>>();");
    lines.push("");
  }
  const dataImports = form
    ? "import { createPage, TABLE_CID, modalConfig } from \"./data\";"
    : "import { createPage, TABLE_CID } from \"./data\";";
  lines.push(dataImports);
  lines.push("");
  lines.push(form ? "const Page = createPage(editModalRef);" : "const Page = createPage();");
  lines.push("const {");
  lines.push("  tableRef,");
  lines.push("  page,");
  lines.push("  queryParam,");
  lines.push("  list,");
  lines.push("  queryItems,");
  lines.push("  columns,");
  lines.push("  toolbars,");
  lines.push("  select,");
  lines.push("} = Page;");
  lines.push("");
  lines.push(
    "// 标准生命周期：首次进入查询；仅点击搜索/重置查询；搜索、重置、页大小变化和保存后回第一页。",
  );
  lines.push("const search = () => {");
  lines.push("  page.value.current = 1;");
  lines.push("  return select();");
  lines.push("};");
  lines.push("const changePageSize = () => {");
  lines.push("  page.value.current = 1;");
  lines.push("  return select();");
  lines.push("};");
  lines.push("");
  lines.push("onMounted(() => select());");
  lines.push("</script>");
  lines.push("");
  lines.push('<style scoped lang="scss">');
  lines.push('@import "./index.scss";');
  lines.push("</style>");
  return lines.join("\n") + "\n";
}

// ─── runtime 轨装配 ───────────────────────────────────────────────────────

function buildDefinitionObject(doc) {
  const strip = (item) => {
    const out = { ...item };
    delete out.handler;
    return out;
  };
  return {
    templateId: doc.templateId || "",
    pattern: doc.pattern,
    page: doc.page,
    pageId: doc.pageId,
    apiConfig: buildApiConfig(doc),
    deliveryProfile: buildDeliveryProfile(doc),
    query: doc.query || [],
    columns: doc.columns || [],
    toolbar: (doc.toolbar || []).map(strip),
    operations: (doc.operations || []).map(strip),
    formSections: doc.formSections || [],
    subTables: doc.subTables || [],
    features: doc.features || {},
  };
}

function emitDefinitionTs(doc) {
  const head = [
    "/**",
    " * 场景定义（wl-scenario runtime 轨）— 由 wl-skills 编译生成，请勿手改。",
    ` * 事实源：${doc.templateId || "scenario"} JSON；重新渲染：wl-skills scenario render --track runtime`,
    " * page-spec.features.definitionSource 指向本文件，validate 走 import/export 委托链校验。",
    " */",
    "export const pageDefinition = ",
  ].join("\n");
  return `${head}${JSON.stringify(buildDefinitionObject(doc), null, 2)};\n`;
}

function emitRuntimeIndexVue(doc) {
  const { renderer } = doc.requires;
  return [
    "<template>",
    "  <PatternPageRenderer :definition=\"pageDefinition\" />",
    "</template>",
    '<script setup lang="ts">',
    `import PatternPageRenderer from "${renderer}";`,
    'import { pageDefinition } from "./definition";',
    "</script>",
    '<style scoped lang="scss">',
    '@import "./index.scss";',
    "</style>",
    "",
  ].join("\n");
}

function emitRuntimeDataTs() {
  return [
    'import { pageDefinition } from "./definition";',
    "export { pageDefinition };",
    "",
  ].join("\n");
}

// ─── master-detail 发射（与 TPL-MASTER-DETAIL.md 逐字符对齐） ─────────────

const LIST_PAGER_SCSS = [
  ".list-page__pager {",
  "  display: flex;",
  "  justify-content: flex-end;",
  "  margin-top: 8px;",
  "}",
  "",
].join("\n");

const MASTER_DETAIL_SCSS = [
  ".app-page-container .drager_row {",
  "  height: 100%;",
  "}",
  "",
  ".base-toolbar-box {",
  "  margin-bottom: 4px;",
  "}",
  "",
  ".list-page__pager {",
  "  display: flex;",
  "  justify-content: flex-end;",
  "  margin-top: 8px;",
  "}",
  "",
].join("\n");

function subTableOf(doc) {
  return (doc.subTables || [])[0] || null;
}

function buildMasterApiConfig(doc) {
  const sub = subTableOf(doc);
  const api = buildApiConfig(doc);
  if (!sub) return api;
  const override = doc.apiConfig && doc.apiConfig.bottomList;
  api.bottomList = override || `/${doc.serviceShort}/${sub.resource}/queryPage`;
  return api;
}

function emitMasterImports() {
  return emitImports(false)
    .replace(
      'import { deleteAction } from "@jhlc/common-core/src/api/action";',
      'import { deleteAction, getAction } from "@jhlc/common-core/src/api/action";',
    );
}

function emitBottomColumns(sub) {
  const blocks = ['        { type: "index", label: "序号", width: 60, align: "center" }'];
  for (const item of (sub && sub.columns) || []) {
    const lines = ["        {"];
    lines.push(`          label: ${qs(item.label)},`);
    lines.push(`          name: ${qs(item.name)},`);
    lines.push("          cid: `${BOTTOM_TABLE_CID}-" + item.name + "`,");
    lines.push(`          minWidth: ${item.minWidth || 120},`);
    if (item.type === "dict" && item.dictCode) {
      lines.push("          logicType: BusLogicDataType.dict,");
      lines.push(`          logicValue: ${qs(item.dictCode)},`);
    }
    lines.push("          showOverflowTooltip: true");
    lines.push("        }");
    blocks.push(lines.join("\n"));
  }
  return blocks.join(",\n");
}

function emitSubTableMarker(sub) {
  const meta = JSON.stringify({ name: sub.name, label: sub.label, resource: sub.resource });
  return `/** @wl-scenario-subtable:${meta} */`;
}

function emitBottomSection(doc) {
  const sub = subTableOf(doc);
  if (!sub) return "";
  return [
    emitSubTableMarker(sub),
    "// 从表 Hook",
    "export function createBottomPage() {",
    "  let Page = new (class extends AbstractPageQueryHook {",
    "    constructor() {",
    "      super({ url: { list: API_CONFIG.bottomList } });",
    "    }",
    "    queryDef(): BaseQueryItemDesc<any>[] {",
    "      return [];",
    "    }",
    "    toolbarDef(): ActionButtonDesc[] {",
    "      return [];",
    "    }",
    "    columnsDef(): TableColumnDesc<any>[] {",
    "      return defineColumns([",
    emitBottomColumns(sub),
    "      ] as any) as TableColumnDesc<any>[];",
    "    }",
    "  })();",
    "  return (Page as any).create() as any;",
    "}",
  ].join("\n");
}

function emitRowDblclick() {
  return [
    "// 双击主表行 → 加载从表数据",
    "export function handleRowDblclick(",
    "  row: any,",
    "  bottomSelect: Function,",
    "  BottomPage: any,",
    ") {",
    "  BottomPage.queryParam.value.mainId = row.id;",
    "  BottomPage.tableRef.value.loading();",
    "  getAction(API_CONFIG.bottomList, BottomPage.queryParam.value)",
    "    .then((res) => {",
    "      BottomPage.list.value = res.data;",
    "      BottomPage.tableRef.value.clearSelection();",
    "    })",
    "    .finally(() => {",
    "      BottomPage.tableRef.value.closeLoading();",
    "    });",
    "}",
  ].join("\n");
}

function emitMasterDetailDataTs(doc, ctx) {
  const sections = [
    emitMasterImports(),
    markerBlock("", "// ", "", "customImports", extensionCode(doc, "customImports")),
    `export const TABLE_CID = ${qs(ctx.tableCid)};`,
    'export const BOTTOM_TABLE_CID = `${TABLE_CID}-sub1`;',
    emitApiBlock(buildMasterApiConfig(doc)),
    emitOptBlock(doc),
    emitClassBlock(doc),
    emitRowDblclick(),
    emitBottomSection(doc),
  ].filter(Boolean);
  return sections.join("\n\n") + "\n";
}

function emitMasterDetailIndexVue(doc) {
  const listTitle = doc.listTitle || doc.page;
  const lines = [];
  lines.push("<template>");
  lines.push('  <div class="app-container app-page-container">');
  lines.push('    <jh-drag-row :top-height="350">');
  lines.push("      <template #top>");
  lines.push("        <BaseQuery");
  lines.push("          :form=\"queryParam\"");
  lines.push("          :items=\"queryItems\"");
  lines.push(`          :columns="${doc.queryColumns || 4}"`);
  lines.push("          @select=\"select\"");
  lines.push("          @reset=\"select\"");
  lines.push("        />");
  lines.push('        <BaseToolbar size="small" :items="toolbars" />');
  lines.push(`        <div class="list-title">${listTitle}</div>`);
  lines.push("        <BaseTable");
  lines.push("          ref=\"tableRef\"");
  lines.push('          render-type="agGrid"');
  lines.push("          :cid=\"TABLE_CID\"");
  lines.push("          :data=\"list\"");
  lines.push("          :columns=\"columns\"");
  lines.push("          showToolbar");
  lines.push("          @row-dblclick=\"");
  lines.push("            (row) => handleRowDblclick(row, bottomSelect, BottomPage)");
  lines.push("          \"");
  lines.push("        />");
  lines.push("        <div class=\"list-page__pager\">");
  lines.push("          <jh-pagination");
  lines.push("            v-show=\"page.total && page.total > 0\"");
  lines.push("            :total=\"page.total || 0\"");
  lines.push("            v-model:currentPage=\"page.current\"");
  lines.push("            v-model:pageSize=\"page.size\"");
  lines.push("            @current-change=\"select\"");
  lines.push("            @size-change=\"select\"");
  lines.push("          />");
  lines.push("        </div>");
  lines.push("      </template>");
  lines.push("      <template #bottom>");
  lines.push('        <BaseToolbar size="small" :items="bottomToolbars" />');
  lines.push("        <BaseTable");
  lines.push("          ref=\"bottomTableRef\"");
  lines.push('          render-type="agGrid"');
  lines.push("          :cid=\"BOTTOM_TABLE_CID\"");
  lines.push("          :data=\"bottomList\"");
  lines.push("          :columns=\"bottomColumns\"");
  lines.push("          showToolbar");
  lines.push("        />");
  lines.push("      </template>");
  lines.push("    </jh-drag-row>");
  lines.push("  </div>");
  lines.push("</template>");
  lines.push("");
  lines.push('<script setup lang="ts">');
  lines.push("import {");
  lines.push("  createPage,");
  lines.push("  createBottomPage,");
  lines.push("  handleRowDblclick,");
  lines.push("  TABLE_CID,");
  lines.push("  BOTTOM_TABLE_CID,");
  lines.push('} from "./data";');
  lines.push("");
  lines.push("const Page = createPage();");
  lines.push("const {");
  lines.push("  tableRef,");
  lines.push("  page,");
  lines.push("  queryParam,");
  lines.push("  list,");
  lines.push("  queryItems,");
  lines.push("  columns,");
  lines.push("  toolbars,");
  lines.push("  select,");
  lines.push("} = Page;");
  lines.push("");
  lines.push("const BottomPage = createBottomPage();");
  lines.push("const {");
  lines.push("  tableRef: bottomTableRef,");
  lines.push("  list: bottomList,");
  lines.push("  columns: bottomColumns,");
  lines.push("  select: bottomSelect,");
  lines.push("  toolbars: bottomToolbars,");
  lines.push("} = BottomPage;");
  lines.push("");
  lines.push("onMounted(() => select());");
  lines.push("</script>");
  lines.push("");
  lines.push('<style scoped lang="scss">');
  lines.push('@import "./index.scss";');
  lines.push("</style>");
  return lines.join("\n") + "\n";
}

// ─── 入口 ─────────────────────────────────────────────────────────────────

function pageSpecJson(doc, scenarioRef) {
  const spec = scenarioToPageSpec(doc);
  if (scenarioRef) spec.scenarioRef = scenarioRef;
  return JSON.stringify(spec, null, 2) + "\n";
}

/** 供 extra 发射器复用的内部函数集合（保持主发射器与分发射器输出一致） */
function emitterHelpers() {
  return {
    emitImports,
    emitApiBlock,
    emitClassBlock,
    emitModalConfig,
    emitListCore: (doc) => ({ classBlock: emitClassBlock(doc) }),
    markerBlock,
    extensionCode,
    buildApiConfig: (doc) => {
      const api = buildApiConfig(doc);
      if (doc.pattern === "tree-list") delete api.export;
      return api;
    },
  };
}

function compileCodegenTrack(doc, options) {
  const ctx = { tableCid: buildTableCid(doc, options) };
  const extraEmitter = CODEGEN_EMITTERS[doc.pattern];
  if (extraEmitter) {
    return {
      track: "codegen",
      tableCid: ctx.tableCid,
      files: {
        ...extraEmitter(doc, ctx, emitterHelpers()),
        "page-spec.json": pageSpecJson(doc, options.scenarioRef),
      },
    };
  }
  if (doc.pattern === "master-detail") {
    return {
      track: "codegen",
      tableCid: ctx.tableCid,
      files: {
        "data.ts": emitMasterDetailDataTs(doc, ctx),
        "index.vue": emitMasterDetailIndexVue(doc),
        "index.scss": MASTER_DETAIL_SCSS,
        "page-spec.json": pageSpecJson(doc, options.scenarioRef),
      },
    };
  }
  return {
    track: "codegen",
    tableCid: ctx.tableCid,
    files: {
      "data.ts": emitDataTs(doc, ctx),
      "index.vue": emitIndexVue(doc),
      "index.scss": LIST_PAGER_SCSS,
      "page-spec.json": pageSpecJson(doc, options.scenarioRef),
    },
  };
}

function compileRuntimeTrack(doc, options) {
  return {
    track: "runtime",
    files: {
      "definition.ts": emitDefinitionTs(doc),
      "index.vue": emitRuntimeIndexVue(doc),
      "data.ts": emitRuntimeDataTs(),
      "index.scss": "// 页面特有样式（无特殊需求可留空）\n",
      "page-spec.json": pageSpecJson(doc, options.scenarioRef),
    },
  };
}

/**
 * 编译 scenario JSON → 页面文件集
 * @returns {{ ok: boolean, errors: string[], track?: string, tableCid?: string, files?: object }}
 */
function compileScenario(doc, options = {}) {
  const errors = validateScenario(doc, { requireImplemented: true });
  if (errors.length) return { ok: false, errors };
  const pattern = findPattern(doc.pattern);
  const track = options.track || doc.renderTrack || pattern.track;
  if (track !== doc.renderTrack) {
    return { ok: false, errors: [`--track=${track} 与 scenario renderTrack=${doc.renderTrack} 不一致`] };
  }
  const result = track === "runtime"
    ? compileRuntimeTrack(doc, options)
    : compileCodegenTrack(doc, options);
  return { ok: true, ...result };
}

/**
 * 防漂移校验：重编译 scenario JSON 并与磁盘产物逐字节比对。
 * 用途：锁定"JSON 是唯一事实源"——渲染产物被手改而未回写 JSON 时报 drift。
 * @param {object} doc  scenario JSON
 * @param {{ readFile(name: string): string|null }} io  磁盘读取注入（返回 null 表示文件缺失）
 * @param {object} options { scenarioRef?: string } 与 render 时注入 page-spec 的引用保持一致
 * @returns {{ ok: boolean, errors: string[], issues: Array<{file, kind}> }}
 */
function verifyScenarioRender(doc, io, options = {}) {
  const compiled = compileScenario(doc, { scenarioRef: options.scenarioRef });
  if (!compiled.ok) return { ok: false, errors: compiled.errors, issues: [] };
  // change-history 产物不依赖 cid（无表格），其余 codegen 页面必须显式 tableCid 才能确定性比对
  const needsStableCid = compiled.track === "codegen" && doc.pattern !== "change-history";
  if (needsStableCid && !doc.tableCid) {
    return {
      ok: false,
      errors: ["verify 需要确定性渲染：codegen 轨必须显式声明 tableCid（否则 cid 含时间戳，无法定点比对）"],
      issues: [],
    };
  }
  const issues = [];
  for (const [name, expected] of Object.entries(compiled.files)) {
    const actual = io.readFile(name);
    if (actual === null || actual === undefined) issues.push({ file: name, kind: "missing" });
    else if (actual !== expected) issues.push({ file: name, kind: "drift" });
  }
  return { ok: issues.length === 0, errors: [], issues };
}

module.exports = {
  compileScenario,
  verifyScenarioRender,
  buildApiConfig,
  buildTableCid,
  buildDeliveryProfile,
  buildDefinitionObject,
};
