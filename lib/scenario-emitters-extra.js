"use strict";

/**
 * lib/scenario-emitters-extra.js — tree-list / record-form / form-route / change-history 发射器
 *
 * 每个 emitter 与对应 universal TPL 的 canonical 形态逐字符对齐；
 * 与 scenario-compiler.js 的主发射器共享 qs/markerBlock/extensionCode 约定。
 * 非列表分页类页面（record-form/form-route/change-history）的 page-spec 投影
 * 不携带 query/columns（S1~S5 列表比对不适用），结构真值由 W1 字节级防漂移兜底。
 */

function qs(value) {
  return JSON.stringify(String(value));
}

function pascal(value) {
  return String(value)
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

// ─── tree-list（TPL-TREE-LIST.md 对齐） ───────────────────────────────────

function buildTreeClassBlock(doc, helpers) {
  return helpers
    .emitClassBlock(doc)
    .replace(
      "export function createPage(editModalRef?: any) {",
      "export function createPage(editModalRef?: any) {\n  let _editModalRef = editModalRef;",
    )
    .replace(/editModalRef\?\.value/g, "_editModalRef?.value")
    .replace(
      /\n {2}return \(Page as any\)\.create\(\) as any;\n\}/,
      [
        "",
        "  const created = (Page as any).create() as any;",
        "",
        "  // ⭐ 树节点点击 → 过滤右侧列表",
        "  function handleNodeClick(data: any) {",
        "    currentNodeId = data.id;",
        "    created.queryParam.value.treeId = data.id;",
        "    created.page.current = 1;",
        "    created.select();",
        "  }",
        "",
        "  return {",
        "    ...created,",
        "    treeData,",
        "    handleNodeClick,",
        "  };",
        "}",
      ].join("\n"),
    );
}

function emitTreeList(doc, ctx, helpers) {
  const form = (doc.formSections || []).some((s) => (s.fields || []).length > 0);
  const classBlock = buildTreeClassBlock(doc, helpers);
  const dataTs = [
    helpers
      .emitImports(form)
      .replace(
        'import { deleteAction } from "@jhlc/common-core/src/api/action";',
        'import { deleteAction, getAction } from "@jhlc/common-core/src/api/action";',
      ),
    helpers.markerBlock("", "// ", "", "customImports", helpers.extensionCode(doc, "customImports")),
    `export const TABLE_CID = ${qs(ctx.tableCid)};`,
    helpers.emitApiBlock(helpers.buildApiConfig(doc)),
    form ? helpers.emitModalConfig(doc) : "",
    "// ===== 树形数据 =====",
    "const treeData = ref<any[]>([]);",
    "let currentNodeId: string | undefined;",
    "",
    "export async function loadTree() {",
    "  const res = await getAction(API_CONFIG.tree);",
    "  treeData.value = res.result || res.data || res;",
    "}",
    "",
    classBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    "data.ts": dataTs + "\n",
    "index.vue": emitTreeListVue(doc, form),
    "index.scss": emitTreeListScss(),
  };
}

function emitTreeListVue(doc, form) {
  const lines = [];
  lines.push("<template>");
  lines.push('  <div class="app-container app-page-container" style="height: 100%">');
  lines.push('    <jh-drag-col :leftWidth="220">');
  lines.push("      <template #left>");
  lines.push('        <C_Tree');
  lines.push('          :tree-data="treeData"');
  lines.push('          :show-search="true"');
  lines.push('          @node-click="handleNodeClick"');
  lines.push("        />");
  lines.push("      </template>");
  lines.push("      <template #right>");
  lines.push("        <BaseQuery");
  lines.push("          :form=\"queryParam\"");
  lines.push("          :items=\"queryItems\"");
  lines.push("          @select=\"select\"");
  lines.push("          @reset=\"select\"");
  lines.push("        />");
  lines.push('        <BaseToolbar size="small" :items="toolbars" />');
  lines.push(`        <div class="list-title">${doc.listTitle || doc.page}</div>`);
  lines.push("        <BaseTable");
  lines.push("          ref=\"tableRef\"");
  lines.push('          render-type="agGrid"');
  lines.push("          :cid=\"TABLE_CID\"");
  lines.push("          :data=\"list\"");
  lines.push("          :columns=\"columns\"");
  lines.push("          showToolbar");
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
  lines.push("    </jh-drag-col>");
  if (form) {
    lines.push('  <c_formModal ref="editModalRef" v-bind="modalConfig" @ok="select" />');
  }
  lines.push("  </div>");
  lines.push("</template>");
  lines.push("");
  lines.push('<script setup lang="ts">');
  if (form) {
    lines.push('import c_formModal from "@/components/local/c_formModal/index.vue";');
    lines.push('import { createPage, loadTree, TABLE_CID, modalConfig } from "./data";');
    lines.push("");
    lines.push("// 表单弹窗引用");
    lines.push("const editModalRef = ref<InstanceType<typeof c_formModal>>();");
    lines.push("");
    lines.push("const Page = createPage(editModalRef);");
  } else {
    lines.push('import { createPage, loadTree, TABLE_CID } from "./data";');
    lines.push("");
    lines.push("const Page = createPage();");
  }
  lines.push("const {");
  lines.push("  tableRef,");
  lines.push("  page,");
  lines.push("  queryParam,");
  lines.push("  list,");
  lines.push("  treeData,");
  lines.push("  queryItems,");
  lines.push("  columns,");
  lines.push("  toolbars,");
  lines.push("  select,");
  lines.push("  handleNodeClick,");
  lines.push("} = Page;");
  lines.push("");
  lines.push("onMounted(() => {");
  lines.push("  loadTree();");
  lines.push("  select();");
  lines.push("});");
  lines.push("</script>");
  lines.push("");
  lines.push('<style scoped lang="scss">');
  lines.push('@import "./index.scss";');
  lines.push("</style>");
  return lines.join("\n") + "\n";
}

function emitTreeListScss() {
  return [
    ".app-page-container {",
    "  // jh-drag-col 需要父容器撑满高度",
    "  height: 100%;",
    "}",
    "",
    ".list-page__pager {",
    "  display: flex;",
    "  justify-content: flex-end;",
    "  margin-top: 8px;",
    "}",
    "",
  ].join("\n");
}

// ─── record-form（TPL-RECORD-FORM.md 对齐） ───────────────────────────────

function emitRecordFormItems(doc) {
  const blocks = [];
  (doc.formSections || []).forEach((section, index) => {
    blocks.push([
      "  {",
      `    // @wl-scenario-section:${section.name}`,
      `    name: "divider${index + 1}",`,
      '    label: "",',
      '    labelWidth: "0px",',
      "    span: 4,",
      `    componentVNode: () => h(c_spliterTitle, { title: ${qs(section.label)} }),`,
      "  },",
    ].join("\n"));
    for (const field of section.fields || []) {
      const lines = ["  {"];
      lines.push(`    label: ${qs(field.label)},`);
      lines.push(`    name: ${qs(field.name)},`);
      lines.push(`    placeholder: ${qs(field.placeholder || `请输入${field.label}`)},`);
      if (field.type === "dict" && field.dictCode) {
        lines.push("    logicType: BusLogicDataType.dict,");
        lines.push(`    logicValue: ${qs(field.dictCode)},`);
      }
      if (field.required) lines.push("    required: true,");
      lines.push("  },");
      blocks.push(lines.join("\n"));
    }
  });
  return blocks.join("\n");
}

function emitBottomPlainColumns(columns, cidConst) {
  const blocks = ['  { type: "index", label: "序号", width: 60, align: "center" }'];
  for (const item of columns || []) {
    blocks.push(
      [
        "  {",
        `    label: ${qs(item.label)},`,
        `    name: ${qs(item.name)},`,
        `    cid: \`\${${cidConst}}-${item.name}\`,`,
        `    minWidth: ${item.minWidth || 100},`,
        "    sortable: true,",
        "    filterable: true,",
        "  },",
      ].join("\n"),
    );
  }
  return blocks.join("\n");
}

function emitRecordForm(doc, ctx) {
  const mapping = (doc.features && doc.features.responseMapping) || {};
  const sub = (doc.subTables || [])[0] || { name: "detail", label: "明细", columns: [] };
  const queryItems = (doc.query || [])
    .map((item) =>
      [
        "  {",
        `    name: ${qs(item.name)},`,
        `    label: ${qs(item.label)},`,
        `    placeholder: ${qs(item.placeholder || `请输入${item.label}`)},`,
        "  },",
      ].join("\n"),
    )
    .join("\n");
  const dataTs = [
    "import {",
    "  BaseQueryItemDesc,",
    "  ActionButtonDesc,",
    "  TableColumnDesc,",
    "  BusLogicDataType,",
    '} from "@/types/page";',
    'import type { BaseFormItemDesc } from "@jhlc/common-core/src/components/form/common/type";',
    'import c_spliterTitle from "@/components/local/c_spliterTitle/index.vue";',
    'import { getAction, postAction } from "@jhlc/common-core/src/api/action";',
    'import { ElMessage, ElMessageBox } from "element-plus";',
    'import { debounce } from "lodash-es";',
    'import { defineColumns } from "@agile-team/wl-skills-ui/runtime";',
    `export const BOTTOM_TABLE_CID = ${qs(ctx.tableCid)};`,
    "",
    "export const API_CONFIG = {",
    `  getByKey: ${qs(doc.apiConfig.getByKey)},`,
    `  saveOrUpdate: ${qs(doc.apiConfig.saveOrUpdate)},`,
    "} as const;",
    "",
    "// ─────────────── 查询区 ───────────────",
    "/** 查询参数（主键字段） */",
    "export const queryParam = ref<any>({});",
    "",
    "/** 查询项配置 */",
    "export const queryItems: BaseQueryItemDesc<any>[] = [",
    queryItems,
    "];",
    "",
    "/** 查询 → 加载主记录到表单 */",
    "export const select = async () => {",
    "  const res = await getAction(API_CONFIG.getByKey, queryParam.value);",
    "  form.value = {",
    "    ...queryParam.value,",
    `    ...(res.data?.${mapping.main} || {}),`,
    "  };",
    `  bottomTableData.value = res.data?.${mapping.details} || [];`,
    "};",
    "",
    "/** 重置 */",
    "export const reset = (formRef: any) => {",
    "  queryParam.value = {};",
    "  resetForm();",
    "  formRef?.resetFields();",
    "};",
    "",
    "// ─────────────── 表单区 ───────────────",
    "/** 表单数据 */",
    "export const form = ref<any>({});",
    "",
    "/** 重置表单到默认值 */",
    "export const resetForm = () => {",
    "  form.value = {};",
    "};",
    "",
    "/** 表单项配置（c_spliterTitle 分区） */",
    "export const formItems: BaseFormItemDesc<any>[] = [",
    emitRecordFormItems(doc),
    "];",
    "",
    "/** 工具栏（需传入 formRef 以触发校验） */",
    "export const toolbars = (formRef: any): ActionButtonDesc[] => [",
    "  {",
    '    label: "保存",',
    '    type: "primary",',
    '    icon: "Save",',
    "    onClick: debounce(() => {",
    "      formRef?.validate((valid: boolean) => {",
    '        if (!valid) return ElMessage.error("请完善表单信息");',
    '        ElMessageBox.confirm("确定保存吗？", "提示", {',
    '          confirmButtonText: "确定",',
    '          cancelButtonText: "取消",',
    '          type: "warning",',
    "        }).then(async () => {",
    "          const res = await postAction(API_CONFIG.saveOrUpdate, {",
    "            ...form.value,",
    "          });",
    '          ElMessage.success(res?.message || "保存成功");',
    "        });",
    "      });",
    "    }, 600),",
    "  },",
    "  {",
    '    label: "重置",',
    '    icon: "Refresh",',
    '    type: "default",',
    "    onClick: () => {",
    "      resetForm();",
    "      formRef?.resetFields();",
    "    },",
    "  },",
    "];",
    "",
    "// ─────────────── 明细表格区 ───────────────",
    "/** 明细表格数据（全量，无分页） */",
    "export const bottomTableData = ref<any[]>([]);",
    "",
    "/** 明细表格列配置 */",
    `/** @wl-scenario-subtable:${JSON.stringify({ name: sub.name, label: sub.label })} */`,
    "export const bottomTableColumns: TableColumnDesc<any>[] = defineColumns([",
    emitBottomPlainColumns(sub.columns, "BOTTOM_TABLE_CID"),
    "] as any) as TableColumnDesc<any>[];",
  ].join("\n");
  return {
    "data.ts": dataTs + "\n",
    "index.vue": emitRecordFormVue(),
    "index.scss": emitRecordFormScss(),
  };
}

function emitRecordFormVue() {
  return [
    "<template>",
    '  <div class="app-container app-page-container">',
    "    <!-- 查询区（选择主记录） -->",
    "    <BaseQuery",
    '      :form="queryParam"',
    '      :items="queryItems"',
    '      :columns="3"',
    '      :auto-select="false"',
    '      @select="select"',
    '      @reset="reset(formRef)"',
    "    />",
    '    <div class="form-table-content">',
    "      <!-- 工具栏（传入 formRef 用于校验） -->",
    '      <BaseToolbar size="small" :items="toolbars(formRef)" />',
    "      <!-- 表单区（可编辑字段） -->",
    "      <BaseForm",
    '        ref="formRef"',
    '        :form="form"',
    '        :items="formItems"',
    '        :columns="4"',
    '        :label-width="\'110px\'"',
    "      />",
    "      <!-- 明细表格（无分页） -->",
    "      <BaseTable",
    '        render-type="agGrid"',
    '        :cid="BOTTOM_TABLE_CID"',
    '        :data="bottomTableData"',
    '        :columns="bottomTableColumns"',
    '        :height="300"',
    "      />",
    "    </div>",
    "  </div>",
    "</template>",
    "",
    '<script setup lang="ts">',
    "import {",
    "  toolbars,",
    "  form,",
    "  formItems,",
    "  queryParam,",
    "  queryItems,",
    "  select,",
    "  reset,",
    "  bottomTableData,",
    "  bottomTableColumns,",
    "  BOTTOM_TABLE_CID,",
    "  resetForm,",
    '} from "./data";',
    "",
    "const formRef = ref<any>(null);",
    "",
    "onMounted(() => {",
    "  resetForm();",
    "});",
    "</script>",
    "",
    '<style scoped lang="scss">',
    '@import "./index.scss";',
    "</style>",
    "",
  ].join("\n");
}

function emitRecordFormScss() {
  return [
    ".app-page-container {",
    "  overflow-y: auto;",
    "",
    "  .form-table-content {",
    "    display: flex;",
    "    flex-direction: column;",
    "    gap: 8px;",
    "    margin-top: 8px;",
    "  }",
    "",
    "  // 统一表单控件宽度",
    "  :deep(.jh-select),",
    "  :deep(.jh-date),",
    "  :deep(.el-input-number) {",
    "    width: 100%;",
    "  }",
    "}",
    "",
  ].join("\n");
}

// ─── form-route（TPL-FORM-ROUTE.md Template C 平铺变体） ─────────────────

function needsRequiredToggle(doc) {
  const fields = (doc.formSections || []).flatMap((s) => s.fields || []);
  return fields.length >= 10 && fields.some((f) => f.required) && fields.some((f) => !f.required);
}

function emitFormRoute(doc, ctx, helpers) {
  const pageName = pascal(doc.resourceName || doc.pageAbbr || "Page");
  const toggle = needsRequiredToggle(doc);
  const dataTs = [
    'import { getAction, postAction, putAction } from "@jhlc/common-core/src/api/action";',
    'import { ElMessage } from "element-plus";',
    'import { useRouter } from "vue-router"; // ✅ 仅用于 router.back()',
    'import type { BaseFormItemDesc } from "@jhlc/common-core/src/components/form/common/type";',
    'import { BusLogicDataType } from "@/types/page";',
    'import c_spliterTitle from "@/components/local/c_spliterTitle/index.vue";',
    helpers.markerBlock("", "// ", "", "customImports", helpers.extensionCode(doc, "customImports")),
    `export const FORM_TABLE_CID = ${qs(ctx.tableCid)};`,
    "",
    "export const API_CONFIG = {",
    `  getById: ${qs(helpers.buildApiConfig(doc).getById)},`,
    `  save: ${qs(helpers.buildApiConfig(doc).save)},`,
    `  update: ${qs(helpers.buildApiConfig(doc).update)},`,
    "} as const;",
    "const resolveApiPath = (template: string, id: string) =>",
    '  template.replace("{id}", encodeURIComponent(id));',
    "",
    "/** 表单数据 */",
    "export const form = ref<any>({});",
    "",
    "/** 表单项配置（c_spliterTitle 分区平铺） */",
    "export const formItems: BaseFormItemDesc<any>[] = [",
    emitRecordFormItems(doc),
    "];",
    "",
    `export function use${pageName}Form(formRef: any) {`,
    "  const router = useRouter();",
    "  const loading = ref(false);",
    "  const isEdit = ref(false);",
    "  const currentId = ref<string>(\"\");",
    "",
    "  async function loadDetail(id: string) {",
    "    loading.value = true;",
    "    isEdit.value = true;",
    "    currentId.value = id;",
    "    try {",
    "      const res = await getAction(resolveApiPath(API_CONFIG.getById, id), {});",
    "      if (res?.data) form.value = res.data;",
    "    } finally {",
    "      loading.value = false;",
    "    }",
    "  }",
    "",
    "  async function handleSave() {",
    "    const valid = await formRef.value?.validate();",
    '    if (!valid) { ElMessage.warning("请完善必填项"); return; }',
    "    loading.value = true;",
    "    try {",
    "      const payload = isEdit.value ? { ...form.value, id: currentId.value } : { ...form.value };",
    "      const res = isEdit.value",
    "        ? await putAction(API_CONFIG.update, payload)",
    "        : await postAction(API_CONFIG.save, payload);",
    '      ElMessage.success("保存成功");',
    "      const savedId = typeof res === \"string\" ? res : res?.id;",
    "      if (!isEdit.value && savedId) {",
    "        currentId.value = savedId;",
    "        isEdit.value = true;",
    "      }",
    "    } finally {",
    "      loading.value = false;",
    "    }",
    "  }",
    "",
    "  function handleCancel() {",
    "    router.back(); // ✅ back() 允许，不影响菜单激活",
    "  }",
    "",
    "  return { loading, isEdit, loadDetail, handleSave, handleCancel };",
    "}",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    "data.ts": dataTs + "\n",
    "index.vue": emitFormRouteVue(doc, pageName, toggle),
    "index.scss": emitFormRouteScss(toggle),
  };
}

function emitFormRouteVue(doc, pageName, toggle) {
  const lines = [];
  lines.push("<template>");
  lines.push('  <div class="app-container app-page-container" v-loading="loading">');
  lines.push('    <div class="page-header">');
  lines.push(`      <span class="page-title">${doc.page}</span>`);
  lines.push('      <span class="page-tag page-tag--add">新增</span>');
  if (toggle) {
    lines.push('      <el-checkbox v-model="showRequiredOnly" class="only-required-check"');
    lines.push("        >只看必填项</el-checkbox");
    lines.push("      >");
  }
  lines.push("    </div>");
  lines.push('    <div class="page-toolbar">');
  lines.push('      <el-button type="primary" size="small" @click="handleSave">保存</el-button>');
  lines.push('      <el-button size="small" @click="handleCancel">取消</el-button>');
  lines.push("    </div>");
  lines.push('    <div class="form-body">');
  lines.push("      <BaseForm");
  lines.push('        ref="formRef"');
  lines.push('        :form="form"');
  lines.push('        :items="visibleItems"');
  lines.push('        :columns="4"');
  lines.push('        :label-width="\'110px\'"');
  lines.push("      />");
  lines.push("    </div>");
  lines.push("  </div>");
  lines.push("</template>");
  lines.push("");
  lines.push('<script setup lang="ts">');
  lines.push('import { useRoute } from "vue-router";');
  lines.push(`import { use${pageName}Form, form, formItems } from "./data";`);
  if (toggle) {
    lines.push('import { useFormRequiredOnly } from "@/hooks/useFormRequiredOnly";');
  }
  lines.push("");
  lines.push("const formRef = ref();");
  lines.push("const route = useRoute();");
  if (toggle) {
    lines.push("const showRequiredOnly = ref(false);");
    lines.push(
      "const { visibleItems } = useFormRequiredOnly(formItems, formRef, { requiredOnly: showRequiredOnly });",
    );
  }
  lines.push(`const { loading, loadDetail, handleSave, handleCancel } = use${pageName}Form(formRef);`);
  lines.push("");
  lines.push("onMounted(() => {");
  lines.push("  const id = route.query.id as string;");
  lines.push("  if (id) loadDetail(id);");
  lines.push("});");
  lines.push("</script>");
  lines.push("");
  lines.push('<style scoped lang="scss">');
  lines.push('@import "./index.scss";');
  lines.push("</style>");
  return lines.join("\n") + "\n";
}

function emitFormRouteScss(toggle) {
  const lines = [
    ".app-page-container {",
    "  .page-header {",
    "    display: flex;",
    "    align-items: center;",
    "    gap: 8px;",
    "    margin-bottom: 8px;",
    "",
    "    .page-title {",
    "      font-size: 16px;",
    "      font-weight: 600;",
    "    }",
    "",
    '    .page-tag {',
    "      padding: 2px 8px;",
    "      border-radius: 3px;",
    "      font-size: 12px;",
    "",
    "      &--add {",
    "        color: #409eff;",
    "        background: #ecf5ff;",
    "      }",
    "    }",
    "  }",
    "",
    "  .page-toolbar {",
    "    margin-bottom: 8px;",
    "  }",
    "",
    "  .form-body {",
    "    background: #fff;",
    "    padding: 12px;",
    "  }",
    "}",
  ];
  if (toggle) {
    lines.push(
      "",
      ".only-required-check {",
      "  margin-left: auto;",
      "}",
    );
  }
  return lines.join("\n") + "\n";
}

// ─── change-history（TPL-CHANGE-HISTORY.md 对齐） ─────────────────────────

function emitChangeHistory(doc) {
  const explicit = doc.apiConfig || {};
  const base = `/${doc.serviceShort}/${doc.resourceName}/changeHistory`;
  const tabsComponent = (doc.requires && doc.requires.components && doc.requires.components[0]) || "c_Tabs";
  const dataTs = [
    'import { getAction } from "@jhlc/common-core/src/api/action";',
    'import { useRouter } from "vue-router";',
    "",
    "export const API_CONFIG = {",
    `  changeHistoryList: ${qs(explicit.changeHistoryList || `${base}/queryPage`)},`,
    `  getById: ${qs(explicit.getById || `${base}/getById/{id}`)},`,
    `  getDiffById: ${qs(explicit.getDiffById || `${base}/getDiffById/{id}`)},`,
    "} as const;",
    "const resolveApiPath = (template: string, id: string) =>",
    '  template.replace("{id}", encodeURIComponent(id));',
    "",
    "export interface HistoryRecord {",
    "  id: string;",
    "  changeType: string;",
    "  changeTime: string;",
    "  changePerson: string;",
    "}",
    "",
    "export function useChangeHistory(tabsRef: any) {",
    "  const router = useRouter();",
    "  const loading = ref(false);",
    "  const historyLoading = ref(false);",
    "  const historyList = ref<HistoryRecord[]>([]);",
    '  const selectedId = ref<string>("");',
    "",
    "  async function loadHistoryList(applyId: string) {",
    "    historyLoading.value = true;",
    "    try {",
    "      const res = await getAction(API_CONFIG.changeHistoryList, { applyId });",
    "      historyList.value = res?.records || res?.data?.records || [];",
    "    } finally {",
    "      historyLoading.value = false;",
    "      if (historyList.value.length > 0) {",
    "        await loadHistoryDetail(historyList.value[0].id);",
    "      }",
    "    }",
    "  }",
    "",
    "  async function loadHistoryDetail(id: string) {",
    "    selectedId.value = id;",
    "    loading.value = true;",
    "    try {",
    '      const res = await getAction(resolveApiPath(API_CONFIG.getById, id), {});',
    "      tabsRef.value?.loadData(res?.data || res);",
    '      const diffRes = await getAction(resolveApiPath(API_CONFIG.getDiffById, id), {});',
    "      if (diffRes?.data || diffRes) {",
    "        tabsRef.value?.loadDiffData(diffRes?.data || diffRes);",
    "      } else {",
    "        tabsRef.value?.clearDiffData();",
    "      }",
    "    } finally {",
    "      loading.value = false;",
    "    }",
    "  }",
    "",
    "  function handleSelectHistory(item: HistoryRecord) {",
    "    if (item.id === selectedId.value) return;",
    "    loadHistoryDetail(item.id);",
    "  }",
    "",
    "  function handleCancel() {",
    "    router.back();",
    "  }",
    "",
    "  return {",
    "    loading,",
    "    historyLoading,",
    "    historyList,",
    "    selectedId,",
    "    loadHistoryList,",
    "    handleSelectHistory,",
    "    handleCancel,",
    "  };",
    "}",
  ].join("\n");
  return {
    "data.ts": dataTs + "\n",
    "index.vue": emitChangeHistoryVue(doc, tabsComponent),
    "index.scss": emitChangeHistoryScss(),
  };
}

function emitChangeHistoryVue(doc, tabsComponent) {
  const title = doc.listTitle || `${doc.page}变更详情`;
  return [
    "<template>",
    `  <div class="app-container ${doc.pageAbbr || "change-history"}-page">`,
    "    <!-- 左侧：变更历史记录面板 -->",
    '    <div class="history-panel" v-loading="historyLoading">',
    '      <div class="history-panel__header">变更记录</div>',
    '      <div class="history-panel__list">',
    '        <div v-for="item in historyList" :key="item.id" class="history-card"',
    '          :class="{ \'is-active\': item.id === selectedId }" @click="handleSelectHistory(item)">',
    '          <span class="history-card__dot"',
    "            :class=\"item.changeType.includes('新增') ? 'is-add' : 'is-change'\"></span>",
    '          <div class="history-card__content">',
    '            <div class="history-card__type">{{ item.changeType }}</div>',
    '            <div class="history-card__date">{{ item.changeTime }}</div>',
    '            <div class="history-card__person">{{ item.changePerson }}</div>',
    "          </div>",
    "        </div>",
    '        <div v-if="!historyList.length && !historyLoading" class="history-empty">暂无变更记录</div>',
    "      </div>",
    "    </div>",
    "    <!-- 右侧：变更详情面板 -->",
    '    <div class="detail-panel" v-loading="loading">',
    '      <div class="page-header">',
    '        <span class="page-title">' + title + "</span>",
    '        <span class="page-tag page-tag--change">变更</span>',
    "      </div>",
    '      <div class="page-toolbar">',
    '        <el-button size="small" @click="handleCancel">取消</el-button>',
    "      </div>",
    '      <div class="detail-panel__body">',
    `        <${tabsComponent} ref="tabsRef" mode="view" />`,
    "      </div>",
    "    </div>",
    "  </div>",
    "</template>",
    "",
    '<script setup lang="ts">',
    'import { useRoute } from "vue-router";',
    'import { ElMessage } from "element-plus";',
    'import { useChangeHistory } from "./data";',
    `import ${tabsComponent} from "@/components/local/${tabsComponent}/index.vue";`,
    "",
    "const tabsRef = ref();",
    "const route = useRoute();",
    "const {",
    "  loading,",
    "  historyLoading,",
    "  historyList,",
    "  selectedId,",
    "  loadHistoryList,",
    "  handleSelectHistory,",
    "  handleCancel,",
    "} = useChangeHistory(tabsRef);",
    "",
    "onMounted(() => {",
    "  const id = route.query.id as string;",
    "  if (id) {",
    "    loadHistoryList(id);",
    "  } else {",
    '    ElMessage.warning("缺少业务主键，无法查询变更历史");',
    "  }",
    "});",
    "</script>",
    "",
    '<style scoped lang="scss">',
    '@import "./index.scss";',
    "</style>",
    "",
  ].join("\n");
}

function emitChangeHistoryScss() {
  return [
    ".app-container {",
    "  display: flex;",
    "  gap: 12px;",
    "  height: 100%;",
    "}",
    "",
    ".history-panel {",
    "  width: 280px;",
    "  flex-shrink: 0;",
    "  background: #fff;",
    "  display: flex;",
    "  flex-direction: column;",
    "",
    "  &__header {",
    "    padding: 10px 12px;",
    "    font-weight: 600;",
    "    border-bottom: 1px solid #ebeef5;",
    "  }",
    "",
    "  &__list {",
    "    flex: 1;",
    "    overflow-y: auto;",
    "    padding: 8px;",
    "  }",
    "}",
    "",
    ".history-card {",
    "  display: flex;",
    "  gap: 8px;",
    "  padding: 8px;",
    "  border-radius: 4px;",
    "  cursor: pointer;",
    "",
    "  &:hover,",
    "  &.is-active {",
    "    background: #ecf5ff;",
    "  }",
    "",
    "  &__dot {",
    "    width: 8px;",
    "    height: 8px;",
    "    border-radius: 50%;",
    "    margin-top: 5px;",
    "    flex-shrink: 0;",
    "",
    "    &.is-add {",
    "      background: #67c23a;",
    "    }",
    "",
    "    &.is-change {",
    "      background: #e6a23c;",
    "    }",
    "  }",
    "",
    "  &__content {",
    "    font-size: 12px;",
    "    color: #606266;",
    "    line-height: 1.6;",
    "  }",
    "",
    "  &__type {",
    "    color: #303133;",
    "    font-weight: 500;",
    "  }",
    "}",
    "",
    ".history-empty {",
    "  text-align: center;",
    "  color: #c0c4cc;",
    "  padding: 24px 0;",
    "  font-size: 13px;",
    "}",
    "",
    ".detail-panel {",
    "  flex: 1;",
    "  min-width: 0;",
    "  background: #fff;",
    "  display: flex;",
    "  flex-direction: column;",
    "",
    "  .page-header {",
    "    display: flex;",
    "    align-items: center;",
    "    gap: 8px;",
    "    padding: 10px 12px;",
    "    border-bottom: 1px solid #ebeef5;",
    "",
    "    .page-title {",
    "      font-size: 16px;",
    "      font-weight: 600;",
    "    }",
    "",
    "    .page-tag--change {",
    "      color: #e6a23c;",
    "      background: #fdf6ec;",
    "      padding: 2px 8px;",
    "      border-radius: 3px;",
    "      font-size: 12px;",
    "    }",
    "  }",
    "",
    "  &__body {",
    "    flex: 1;",
    "    overflow-y: auto;",
    "    padding: 12px;",
    "  }",
    "}",
    "",
  ].join("\n");
}

module.exports = {
  emitTreeList,
  emitRecordForm,
  emitFormRoute,
  emitChangeHistory,
  needsRequiredToggle,
  pascal,
};
