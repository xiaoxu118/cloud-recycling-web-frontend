// 管理后台运行配置集中入口。
// 解析顺序（高 → 低优先级）：
//   1. URL 查询参数  ?env=xxx &fn=xxx   仅用于本地调试与紧急切换
//   2. public/config.js 注入的 window.ADMIN_CONFIG   部署时临时覆盖
//   3. Vite 构建时变量  VITE_CLOUDBASE_ENV / VITE_FUNCTION_NAME
//   4. 写在源码里的默认值（兜底，便于新 clone 仓库的人 npm run dev 即可跑通）
//
// 任何地方要使用 env / functionName 一律从 adminConfig 取，
// 不再直接读 window.ADMIN_CONFIG，避免散在多处的隐式耦合。

export interface AdminConfig {
  /** CloudBase / 微信云开发 环境 ID */
  env: string;
  /** 云函数名 */
  functionName: string;
}

const RUNTIME_CONFIG: Partial<AdminConfig> | undefined =
  typeof window !== "undefined" ? window.ADMIN_CONFIG : undefined;

const trimOrUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const resolveConfig = (): AdminConfig => {
  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();

  const env =
    trimOrUndefined(params.get("env") ?? undefined) ??
    trimOrUndefined(RUNTIME_CONFIG?.env) ??
    trimOrUndefined(import.meta.env.VITE_CLOUDBASE_ENV) ??
    "bangbang-d2gy4wqj264b5483c";

  const functionName =
    trimOrUndefined(params.get("fn") ?? undefined) ??
    trimOrUndefined(RUNTIME_CONFIG?.functionName) ??
    trimOrUndefined(import.meta.env.VITE_FUNCTION_NAME) ??
    "quickstartFunctions";

  return { env, functionName };
};

export const adminConfig: AdminConfig = resolveConfig();

if (import.meta.env.DEV) {
  // 开发环境在控制台显式打印当前生效的配置，方便排查「登录码指向错环境」类问题。
  // eslint-disable-next-line no-console
  console.info("[admin] config resolved:", adminConfig);
}
