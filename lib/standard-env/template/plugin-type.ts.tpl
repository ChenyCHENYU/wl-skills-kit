export interface PluginOption {
  isBuild: boolean;
  // 历史兼容字段：isLocal 仅表示 public 是否在本地。
  isLocal: boolean;
  isPublicLocal: boolean;
  devMode: "remote" | "backend" | "public";
  baseApi: string;
  module: string;
  webUrl: string;
  webApi: string;
  env: "prd" | "pre" | "uat" | "sit" | "dev";
  frDir: string;
  version: string;
  // 存量项目插件可继续读取这些字段，标准环境层不再依赖它们。
  isMain?: boolean;
  isUnionMain?: boolean;
  isUnionSub?: boolean;
  isSa?: boolean;
  isViewer?: boolean;
  buildFullFlag?: string;
}
