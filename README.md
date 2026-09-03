# 来卖吧管理后台

这是来卖吧 Web 管理后台静态站点，部署到 CloudBase 静态网站托管后，通过 `quickstartFunctions` 读取真实云数据库数据。

## 登录方案

当前主链路是**手机号 + CloudBase 短信验证码**（`/login` 路由，实现在 `src/App.tsx` 的 `LoginPage`）：

1. 输入 11 位手机号 → `app.auth.signInWithOtp({ phone: "+86 xxx" })` 发送验证码，前端 60s 倒计时（同号 30s 内只能发 1 次，SDK 侧也会拒）。
2. 输入验证码 → `verifyOtp({ token: code })` 拿到 CloudBase `uid`。
3. 携带 `{ phone, cloudbaseUid }` 调云函数 `adminPhoneLogin`，云函数比对 `admins` 集合白名单后签发 `sessionToken`。
4. `sessionToken` 与显示名写入 `localStorage`（`admin_session_token` / `admin_name`），此后所有管理接口都必须携带它，云函数校验通过才返回真实数据。
5. Session TTL 为 **7 天**（云函数 `ADMIN_SESSION_TTL`）。过期由云函数返回 `ADMIN_SESSION_EXPIRED`，前端自动清理登录态并回到登录页。

**小程序扫码登录**：后端 `adminCreateLoginTicket` / `adminConfirmLoginTicket` / `adminCheckLoginTicket` 与小程序隐藏页 `pages/admin-login/index` 均已就绪，但 **Web 端目前没有任何调用点**，要启用需自行补前端流程。

## 首次配置

1. 在 `cloud-recycling` 仓库部署 `cloudfunctions/quickstartFunctions`，并确保 `config.json` 的 openapi 权限包含 `wxacode.getUnlimited`（扫码登录用）与 `phonenumber.getPhoneNumber`。
2. 调用一次 `initAdminCollections`，创建 `admins` / `admin_login_tickets` / `admin_sessions` / `settings` / `users` / `staff` / `feedbacks` 等管理相关集合（另需调 `initRecycleDB` 建 `categories` / `addresses` / `orders`）。
3. 在云开发数据库 `admins` 集合中新增第一位超级管理员（**手机号即主键**）：

```json
{
  "phone": "13800001234",
  "name": "运营管理员",
  "role": "super_admin",
  "enabled": true
}
```

4. 在 CloudBase 控制台开启**短信验证码登录**（手机号 OTP）能力，否则 `signInWithOtp` 会直接报错。
5. Web 端 SDK **有意不传 `accessKey`**，避免自动开匿名会话污染 `signInWithOtp()` 拿到的真实 uid，因此**不需要**开启匿名登录。
6. 若走扫码链路，超级管理员首次扫码确认后云函数会自动回填 `openid` 与 `wechatBound`，后续必须用同一微信扫码（防止手机号被他人扫码使用）。

## 与小程序共用数据

Web 管理端不维护独立业务数据，生产环境通过 `quickstartFunctions` 与小程序共用同一 CloudBase 环境：

- 订单来自 `orders` 集合，后台更新状态、金额、派单人员或删单后，小程序订单详情会读取同一条记录；
- 品类来自 `categories` 集合（统一父子节点模型，支持任意层级），后台新增、上下架、调整 `minVisitKg` 后会影响小程序首页和下单页；
- 客服电话、起收规则、首页 banner 等来自 `settings` 集合，后台保存后由小程序首页和下单校验直接读取；
- 投诉建议来自 `feedbacks` 集合，小程序「投诉建议」页提交，后台「投诉建议」页**只读展示**（状态流转接口 `adminUpdateFeedbackStatus` 后端已实现但未接线）；
- `?mock=1` 只用于 Vite 本地预览，生产构建不会启用 Mock 数据。

系统配置采用 Key-Value 字典管理。数据库中的 `value` 始终保存为字符串，`type` 仅用于后台输入和展示提示；Key 只能由小写字母、数字和下划线组成，并以字母开头。内置默认项可以编辑覆盖，不能直接删除。

**通知相关配置也在 `settings` 集合**，改这里会直接影响线上推送行为：

- 企业微信群机器人：`wecom_robot_webhook` / `wecom_notify_enabled`（默认**开**）/ `order_timeout_notify_enabled`（默认**关**）/ `order_timeout_minutes`，这 4 项已在后台系统配置页的默认列表中。
- 微信订阅消息：`wx_mini_appid` / `wx_subscribe_tmpl_assigned` / `wx_subscribe_tmpl_completed`，这 3 项**不在默认列表里**，后台不会自动出现占位行，需手动往 `settings` 集合加记录后才能生效。

人员管理分为两类真实数据：小程序用户登录或修改头像昵称后同步到 `users` 集合；工作人员由后台维护在 `staff` 集合，派单时订单会同时保存工作人员记录 ID、姓名和电话，并触发企微群通知与用户订阅消息。新部署此版本后，历史用户需要再次打开并登录小程序，才会出现在用户列表中。

修改云函数接口后，需要重新上传并部署 `cloud-recycling/cloudfunctions/quickstartFunctions`，仅重新构建 Web 项目不会更新云端接口。

## 部署

本项目使用 Vite + React + TypeScript 开发，构建结果是可部署到 CloudBase 静态网站托管的纯静态文件。

```bash
npm install
npm run dev
npm run build
```

如需在不调用云环境、不发短信的情况下验证管理页面，开发服务可访问 `http://localhost:5173/?mock=1#/orders`。本地预览只在 Vite 开发模式下生效，生产构建不会启用登录绕过。Mock 数据在 `src/api/mock.ts`，其中 `adminUserDetail`、`adminListFeedbacks`、`adminDeleteOrder` 未实现，对应页面在 Mock 模式下会报「本地预览未实现接口」。

排查鉴权问题时留意云函数 `recycle/admin.js` 的 `DEV_BYPASS_ADMIN_AUTH` 开关（默认 `false`），**开启后线上任何人都能读写后台数据，用完必须关掉**。

开发服务默认使用 Vite 端口，生产构建输出到 `dist/`。部署时上传 `dist/` 目录内容。若云开发环境 ID 变化，修改 `public/config.js`；该文件会在构建时复制到 `dist/config.js`。

正式使用建议绑定自定义域名，并只把后台域名发给运营人员。真正的权限边界仍在云函数的管理员白名单和 session 校验。

## 环境配置

CloudBase / 微信云开发 环境 ID 通过**四级优先级**解析，集中入口在 [`src/config/admin.ts`](src/config/admin.ts)。优先级从高到低：

1. **URL 查询参数**（仅调试）：`http://localhost:5173/?env=xxx` 或 `?fn=xxx`
2. **运行时注入**：[`public/config.js`](public/config.js) 里的 `window.ADMIN_CONFIG`。Vite 构建时原样拷贝到 `dist/config.js`，**适合部署时临时切环境**
3. **构建时变量**：`.env.development` / `.env.production` 里的 `VITE_CLOUDBASE_ENV` / `VITE_FUNCTION_NAME`
4. **代码内默认**：避免 `git clone` 后 `npm run dev` 跑不起来

**默认值是 `bangbang-d2gy4wqj264b5483c`（与 `miniprogram/app.js` 一致）**。如果换成新环境，**仅改一处即可**：

- 日常：改 `.env.production` 里的 `VITE_CLOUDBASE_ENV`，然后 `npm run build`
- 临时切环境：改 `public/config.js` 里的 `env`，再 `npm run build`
- 调试：浏览器加 `?env=xxx`，刷新即可，无需重 build

**务必让 `VITE_CLOUDBASE_ENV` 与 `miniprogram/app.js` 里的 `globalData.env` 保持一致**，否则 Web 端写入的 `admin_login_tickets` 与小程序扫码时查询的不是一个环境，扫码登录必然失败。

复制 [`.env.example`](.env.example) 为 `.env.production` 即可使用。

`import.meta.env.DEV` 模式下，控制台会打印 `[admin] config resolved: { env, functionName }`，方便验证是否生效。
