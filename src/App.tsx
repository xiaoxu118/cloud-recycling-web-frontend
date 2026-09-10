import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import TextField from "@mui/material/TextField";
import { callCloud, CloudError, getCloudBaseApp, initCloud } from "./api/cloud";
import { isDevPreview } from "./api/mock";
import FigmaAdminApp from "./figma/FigmaAdmin";
import type { OrderStatus } from "./types";


const ERROR_TEXT: Record<string, string> = {
  ADMIN_SESSION_REQUIRED: "请先登录",
  ADMIN_SESSION_EXPIRED: "登录已过期，请重新登录",
  NO_PERMISSION: "当前账号不在管理员白名单",
  PHONE_NOT_IN_WHITELIST: "当前手机号不在管理员白名单",
  PHONE_BOUND_TO_OTHER_ACCOUNT: "该手机号已绑定其他账号，请联系管理员解绑",
  LOGIN_TICKET_EXPIRED: "登录码已过期，请刷新",
  TRANSFER_PROOF_REQUIRED: "完成订单前请上传打款凭证",
  FINAL_PRICE_REQUIRED: "完成订单前请填写最终金额",
  ACTUAL_QUANTITY_REQUIRED: "完成订单前请填写实际重量或件数",
  CANCEL_REASON_REQUIRED: "取消订单前请填写取消原因",
  ORDER_STATUS_INVALID: "订单状态已变化，请刷新后重试",
  ORDER_NOT_FOUND: "订单不存在或已被删除",
  ORDER_STATUS_NOT_ASSIGNABLE: "订单已完成或已取消，无法分配",
  STAFF_NOT_ONLINE: "该工作人员当前不在线，无法分配",
  STAFF_NOT_FOUND: "工作人员不存在或已删除",
  PARAM_INVALID: "请检查填写内容",
  SETTING_KEY_INVALID: "配置 Key 格式有误，只能使用小写字母、数字和下划线",
  BANNER_SLOT_INVALID: "首页轮播最多 5 张，Key 只能是 home_banner、home_banner_2 ~ home_banner_5",
  SETTING_LINK_INVALID: "跳转路径格式有误，需以 / 开头，例如 /pages/category/index",
  CATEGORY_GROUP_REQUIRED: "请先选择一级分类",
  CATEGORY_GROUP_NOT_FOUND: "所选一级分类不存在，请刷新后重试",
  CATEGORY_GROUP_NOT_EMPTY: "该一级分类下还有二级品类，请先移出或删除子品类",
  FEEDBACK_NOT_FOUND: "该反馈不存在或已被删除",
  USER_NOT_FOUND: "用户不存在或已被删除",
  POINTS_TX_FAILED: "积分操作失败，请稍后重试",
  POINTS_EXCEED_LIMIT: "单次调整积分超出上限",
  REMARK_REQUIRED: "请填写调整原因",
  ORDER_NOT_COMPLETED: "订单未完成，无法补发积分",
  POINTS_ALREADY_GRANTED: "该订单积分已发放，无需补发",
  // 兑换商城
  GOODS_NOT_FOUND: "商品不存在或已下架",
  GOODS_OUT_OF_STOCK: "商品库存不足",
  POINTS_NOT_ENOUGH: "用户积分不足",
  POINTS_BALANCE_NEGATIVE: "用户积分余额为负，暂不可兑换",
  EXCHANGE_LIMIT_REACHED: "已达该商品兑换上限",
  ADDRESS_REQUIRED: "请先选择收货地址",
  ADDRESS_INVALID: "收货地址无效，请重新选择",
  EXCHANGE_NOT_FOUND: "兑换记录不存在",
  EXCHANGE_CANNOT_CANCEL: "当前状态不可取消",
  // 评估员招募
  MISSING_RECRUIT_ID: "报名记录不存在，请刷新后重试",
  STATUS_INVALID: "处理状态不合法",
  // 拉新邀请
  INVITE_NOT_FOUND: "邀请记录不存在或已被删除",
  INVITE_ALREADY_INVALID: "该邀请记录已作废，无需重复操作",
  DB_ERROR: "系统暂时不可用，请稍后重试",
  EMPTY_RESPONSE: "云函数未返回数据，请确认 quickstartFunctions 已部署最新版本",
  CLOUDBASE_SDK_MISSING: "CloudBase SDK 加载失败",
  CLOUDBASE_CONFIG_MISSING: "请先配置云开发环境",
};

const formatTime = (value?: number | null) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
};

const formatMoney = (value?: number | null) =>
  value == null ? "—" : `¥${Number(value).toFixed(2)}`;

const getErrorText = (error: unknown) => {
  if (error instanceof CloudError) return ERROR_TEXT[error.code] || error.message || "操作失败";
  if (error instanceof Error) return error.message;
  return "操作失败，请稍后重试";
};

interface AuthState {
  token: string;
  adminName: string;
}

interface ToastState {
  kind: "success" | "error";
  text: string;
}

function App() {
  const [ready, setReady] = useState(false);
  const [fatalError, setFatalError] = useState("");
  const [auth, setAuth] = useState<AuthState>(() => ({
    token: isDevPreview() ? "__local_preview__" : localStorage.getItem("admin_session_token") || "",
    adminName: isDevPreview() ? "admin" : localStorage.getItem("admin_name") || "",
  }));
  const [toast, setToast] = useState<ToastState | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    initCloud()
      .then(() => setReady(true))
      .catch((error) => setFatalError(getErrorText(error)));
  }, []);

  // 启动时校验 localStorage 里的 token 是否仍然有效，避免旧 token 导致卡在错误状态
  useEffect(() => {
    if (!ready || isDevPreview()) {
      setCheckingAuth(false);
      return;
    }
    if (!auth.token) {
      setCheckingAuth(false);
      return;
    }
    // 用一个轻量接口探测 token 是否过期
    callCloud("adminGetSettings", { sessionToken: auth.token })
      .then(() => setCheckingAuth(false))
      .catch((error) => {
        if (
          error instanceof CloudError &&
          ["ADMIN_SESSION_REQUIRED", "ADMIN_SESSION_EXPIRED"].includes(error.code)
        ) {
          // token 已失效，清掉跳登录页
          localStorage.removeItem("admin_session_token");
          localStorage.removeItem("admin_name");
          setAuth({ token: "", adminName: "" });
        }
        setCheckingAuth(false);
      });
  }, [ready, auth.token]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const logout = useCallback(() => {
    localStorage.removeItem("admin_session_token");
    localStorage.removeItem("admin_name");
    setAuth({ token: "", adminName: "" });
  }, []);

  const onAdminError = useCallback(
    (error: unknown) => {
      if (
        error instanceof CloudError &&
        ["ADMIN_SESSION_REQUIRED", "ADMIN_SESSION_EXPIRED", "NO_PERMISSION"].includes(error.code)
      ) {
        logout();
      }
      setToast({ kind: "error", text: getErrorText(error) });
    },
    [logout],
  );

  if (fatalError) return <SystemError text={fatalError} />;
  if (!ready || checkingAuth) return <FullscreenLoading text="正在连接来卖吧服务…" />;

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={
            auth.token ? (
              <Navigate to="/orders" replace />
            ) : (
              <LoginPage
                onSuccess={(next) => {
                  localStorage.setItem("admin_session_token", next.token);
                  localStorage.setItem("admin_name", next.adminName);
                  setAuth(next);
                }}
              />
            )
          }
        />
        <Route
          path="/*"
          element={
            auth.token ? (
              <FigmaAdminApp token={auth.token} adminName={auth.adminName} onLogout={logout} onError={onAdminError} notify={setToast} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
      {toast && <div className={`toast ${toast.kind}`} role="status">{toast.text}</div>}
    </>
  );
}

function LoginPage({ onSuccess }: { onSuccess: (auth: AuthState) => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [phoneError, setPhoneError] = useState("");
  const verifyOtpRef = useRef<((args: { token: string }) => Promise<unknown>) | null>(null);

  // 60s 倒计时，同号 30s 内只能发 1 次（SDK 也会拒）。
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((value) => (value > 0 ? value - 1 : 0)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const isPhoneValid = /^1[3-9]\d{9}$/.test(phone);

  const sendCode = async () => {
    setPhoneError("");
    if (!isPhoneValid) {
      setPhoneError("请输入正确的 11 位手机号");
      return;
    }
    setSendingCode(true);
    try {
      // 复用 initCloud() 已经创建好的 SDK app，避免重复 init 触发新的匿名会话。
      const app = getCloudBaseApp();
      const auth = app && app.auth;
      if (!auth || !auth.signInWithOtp) {
        throw new Error("CloudBase SDK 未初始化，请刷新页面重试");
      }
      const { data, error } = await auth.signInWithOtp({ phone: `+86 ${phone}` });
      if (error) throw error;
      if (data && typeof data.verifyOtp === "function") {
        verifyOtpRef.current = (args) => data.verifyOtp(args);
      }
      setCountdown(60);
      setPhoneError("");
    } catch (error) {
      setPhoneError((error as Error).message || "验证码发送失败，请重试");
    } finally {
      setSendingCode(false);
    }
  };

  const verifyAndLogin = async (event: FormEvent) => {
    event.preventDefault();
    setPhoneError("");
    if (!isPhoneValid) {
      setPhoneError("请输入正确的 11 位手机号");
      return;
    }
    if (!/^\d{4,8}$/.test(code)) {
      setPhoneError("请输入正确的验证码");
      return;
    }
    if (!verifyOtpRef.current) {
      setPhoneError("请先点击「发送验证码」");
      return;
    }
    setVerifying(true);
    try {
      const verifyResult = (await verifyOtpRef.current({ token: code })) as { data?: { user?: { id?: string } }; error?: { message?: string } };
      if (verifyResult.error) throw new Error(verifyResult.error.message || "验证码错误");
      const uid = verifyResult.data?.user?.id;
      if (!uid) throw new Error("未取到登录用户标识");
      // 用 CloudBase 拿到的真实 uid 调云函数换 admin sessionToken。
      const result = await callCloud<{ sessionToken: string; adminName: string }>(
        "adminPhoneLogin",
        { phone, cloudbaseUid: uid },
      );
      onSuccess({ token: result.sessionToken, adminName: result.adminName || "管理员" });
    } catch (error) {
      if (error instanceof CloudError) {
        const data = error.data as { reason?: string } | undefined;
        const reason = data && data.reason;
        if (error.code === "NO_PERMISSION" && reason === "PHONE_NOT_IN_WHITELIST") {
          setPhoneError(ERROR_TEXT.PHONE_NOT_IN_WHITELIST);
        } else if (error.code === "NO_PERMISSION" && reason === "PHONE_BOUND_TO_OTHER_ACCOUNT") {
          setPhoneError(ERROR_TEXT.PHONE_BOUND_TO_OTHER_ACCOUNT);
        } else {
          setPhoneError(getErrorText(error));
        }
      } else {
        setPhoneError((error as Error).message || "登录失败，请重试");
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <span className="login-brand-mark">来</span>
          <span className="login-brand-name">来卖吧</span>
          <span className="login-brand-tag">管理后台</span>
        </div>
        <h1 className="login-title">管理员登录</h1>
        <form className="phone-login-form" onSubmit={verifyAndLogin}>
          <TextField label="手机号" fullWidth autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="请输入 11 位手机号" slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 11 } }} />
          <div className="phone-code-input"><TextField label="验证码" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="短信验证码" slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 6 } }} sx={{ flex: "1 1 160px", minWidth: 160 }} /><button type="button" className="button secondary phone-code-btn" disabled={sendingCode || countdown > 0 || !isPhoneValid} onClick={() => void sendCode()}>{sendingCode ? "发送中…" : countdown > 0 ? `${countdown}s 后重发` : "发送验证码"}</button></div>
          <div className="phone-error-slot" aria-live="polite">{phoneError && <p className="phone-error" role="alert">{phoneError}</p>}</div>
          <button className="button primary full" type="submit" disabled={verifying || sendingCode}>{verifying ? "验证中…" : "登录"}</button>
        </form>
      </section>
    </main>
  );
}
function FullscreenLoading({ text, compact = false }: { text: string; compact?: boolean }) { return <div className={`loading-screen ${compact ? "compact" : ""}`}><span className="spinner" /><p>{text}</p></div>; }
function SystemError({ text }: { text: string }) { return <main className="system-error"><section><h1>管理后台暂时无法启动</h1><p>{text}</p><button className="button primary" onClick={() => location.reload()}>重新加载</button></section></main>; }

export default App;
