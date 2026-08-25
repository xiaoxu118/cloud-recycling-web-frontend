/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUDBASE_ENV?: string;
  readonly VITE_FUNCTION_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /**
   * 部署时由 public/config.js 注入。可只填个别字段以覆盖构建时变量，
   * 留空字段将回退到 .env.* 与 src/config/admin.ts 的默认。
   */
  ADMIN_CONFIG?: {
    env?: string;
    functionName?: string;
  };
}

type CloudFunctionResult<T> =
  | { success: true; data: T }
  | { success: false; errMsg: string; data?: unknown };
