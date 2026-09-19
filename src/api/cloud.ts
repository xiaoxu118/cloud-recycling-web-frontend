import cloudbase from "@cloudbase/js-sdk";
import { isDevPreview, mockCall } from "./mock";
import { adminConfig } from "../config/admin";

let app: ReturnType<typeof cloudbase.init> | null = null;

// 暴露当前已初始化的 SDK app，供登录页等需要在 init 后使用 auth.signInWithOtp() 的组件复用。
export function getCloudBaseApp() {
  return app;
}

export class CloudError extends Error {
  code: string;
  data?: unknown;

  constructor(code: string, data?: unknown) {
    super(code);
    this.code = code;
    this.data = data;
  }
}

export async function initCloud() {
  if (isDevPreview()) return;
  if (!adminConfig.env) {
    throw new CloudError("CLOUDBASE_CONFIG_MISSING", {
      hint: "请在 .env.* / public/config.js 中配置 VITE_CLOUDBASE_ENV，或访问 ?env=xxx 临时指定",
    });
  }
  // 不传 accessKey、不做匿名登录。
  // 原因：accessKey 会触发 SDK 自动创建匿名会话、并且 signInWithOtp() 会升级当前匿名用户，
  // 导致获取到的 uid 不是真实手机号用户的。手机号验证码登录是真实身份验证，不需要匿名先行。
  app = cloudbase.init({ env: adminConfig.env });
}

export async function callCloud<T>(type: string, data: Record<string, unknown> = {}) {
  if (isDevPreview()) return mockCall<T>(type, data);
  if (!app) throw new CloudError("CLOUDBASE_NOT_READY");
  const response = await app.callFunction({
    name: adminConfig.functionName || "quickstartFunctions",
    data: { type, ...data },
  });
  const result = response.result as CloudFunctionResult<T> | undefined;
  if (!result) throw new CloudError("EMPTY_RESPONSE");
  if (!result.success) throw new CloudError(result.errMsg || "CALL_FAILED", result.data);
  return result.data;
}

export async function uploadTransferProof(orderNo: string, file: File) {
  if (!app) throw new CloudError("CLOUDBASE_NOT_READY");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const cloudPath = `transfer-proofs/${orderNo}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}-${safeName}`;
  // CloudBase Web 运行时接受 File，SDK 的兼容类型仍将 filePath 声明为 string。
  const result = await app.uploadFile({ cloudPath, filePath: file } as never);
  return result.fileID;
}

export async function uploadSystemImage(key: string, file: File) {
  if (isDevPreview()) return `mock://system-settings/${key}/${Date.now()}-${file.name}`;
  if (!app) throw new CloudError("CLOUDBASE_NOT_READY");
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_") || "image";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const cloudPath = `system-settings/${safeKey}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}-${safeName}`;
  const result = await app.uploadFile({ cloudPath, filePath: file } as never);
  return result.fileID;
}

/**
 * 将 cloud:// 文件 ID 转为浏览器可访问的 https:// URL。
 * cloud:// 是微信云开发 SDK 专用协议，普通浏览器无法识别。
 */
const STORAGE_CDN = "6261-bangbang-d2gy4wqj264b5483c-1311277159.tcb.qcloud.la";

export function cloudUrlToHttps(url: string): string {
  if (!url || !url.startsWith("cloud://")) return url;
  // cloud://envId.bucketName/path/to/file → 提取 path
  const stripped = url.slice("cloud://".length);
  const slashIndex = stripped.indexOf("/");
  if (slashIndex === -1) return url;
  const path = stripped.slice(slashIndex + 1);
  return `https://${STORAGE_CDN}/${path}`;
}

/** 批量转换数组中的 cloud URL */
export function cloudUrlsToHttps(urls: string[]): string[] {
  return urls.map(cloudUrlToHttps);
}
