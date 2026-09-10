# 来卖吧管理后台

这是来卖吧 Web 管理后台静态站点，部署到 CloudBase 静态网站托管后，通过 `quickstartFunctions` 读取真实云数据库数据。

## 功能概览

- **订单管理**：分页列表、状态筛选、关键词搜索、排序；订单详情与编辑合一；派单给回收员、删除订单；状态文案与小程序统一为 待上门 / 进行中 / 已完成 / 已取消
- **人员管理**：小程序用户列表与详情（含积分调整）；成员管理（统一管理员/店长/回收员/客服档案，角色多选、门店、状态）；角色与权限点管理；评估员招募报名跟进
- **品类管理**：品类树增删改、上下架、最低上门重量、自定义图标
- **积分管理**：积分流水、人工增减（必填备注）、订单积分补发；积分商城商品维护；兑换单核销与发货
- **分析统计**：基于订单数据的 recharts 图表
- **投诉建议**：只读列表（状态流转接口后端已就绪，暂未接线）
- **系统配置**：Key/Value 字典（Banner 槽位、客服电话、协议文本、积分规则、订阅消息模板等）

界面基于 Figma 设计稿实现，生产代码集中在 `src/figma/FigmaAdmin.tsx`，详见 [DESIGN.md](./DESIGN.md) 与 [AGENTS.md](./AGENTS.md)。

## 登录方案

当前主链路是**手机号 + CloudBase 短信验证码**（`/login` 路由，实现在 `src/App.tsx` 的 `LoginPage`）：

1. 输入 11 位手机号 → `app.auth.signInWithOtp({ phone: "+86 xxx" })` 发送验证码，前端 60s 倒计时（同号 30s 内只能发 1 次，SDK 侧也会拒）。
2. 输入验证码 → `verifyOtp({ token: code })` 拿到 CloudBase `uid`。
3. 携带 `{ phone, cloudbaseUid }` 调云函数 `adminPhoneLogin`，云函数优先匹配 `members` 成员档案（按角色展开权限），未命中回退 `admins` 白名单，通过后签发 `sessionToken`。
4. `sessionToken` 与显示名写入 `localStorage`（`admin_session_token` / `admin_name`），此后所有管理接口都必须携带它，云函数校验通过才返回真实数据。
5. Session TTL 为 **7 天**（云函数 `ADMIN_SESSION_TTL`）。过期由云函数返回 `ADMIN_SESSION_EXPIRED`，前端自动清理登录态并回到登录页。

**小程序扫码登录**：后端 `adminCreateLoginTicket` / `adminConfirmLoginTicket` / `adminCheckLoginTicket` 与小程序隐藏页 `pages/admin-login/index` 均已就绪，但 **Web 端目前没有任何调用点**，要启用需自行补前端流程。

## 首次配置

1. 在 `cloud-recycling` 仓库部署 `cloudfunctions/quickstartFunctions`，并确保 `config.json` 的 openapi 权限包含 `wxacode.getUnlimited`（扫码登录用）与 `phonenumber.getPhoneNumber`。
2. 调用初始化动作建齐集合（均可重复调用）：
   - `initRecycleDB` — 建 `categories` / `addresses` / `orders` 并写入示例品类；
   - `initAdminCollections` — 建 `admins` / `admin_login_tickets` / `admin_sessions` / `settings` / `users` / `staff` / `feedbacks` / `members` / `roles` / `points_records` / `points_goods` / `points_exchanges`（后台首次登录时也会自动执行）；
   - `initMemberCollections` — 确保 `members` / `roles` 并幂等写入内置角色（管理员/店长/回收员/客服）；
   - `migrateMembersFromLegacy` — 把旧 `staff` / `admins` 档案合并进 `members`（仅超管可执行，幂等）。
3. 新建第一位管理员，二选一：
   - **新链路（推荐）**：在 `members` 集合建成员，`roleKeys` 含 `admin` 即拥有全部权限（也可先按下方旧链路建 `admins`，再跑 `migrateMembersFromLegacy`）；
   - **旧链路**：在 `admins` 集合中新增白名单记录（**手机号即主键**）：

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

- 订单来自 `orders` 集合，后台更新状态、金额、派单人员或删单后，小程序与回收员端读取的是同一条记录；订单状态文案四端统一为 待上门 / 进行中 / 已完成 / 已取消；
- 品类来自 `categories` 集合（统一父子节点模型，支持任意层级），后台新增、上下架、调整 `minVisitKg` 后会影响小程序首页和下单页；
- 客服电话、起收规则、首页 banner、积分规则、订阅消息模板等来自 `settings` 集合，后台保存后由小程序首页、下单校验和云函数通知直接读取；
- 成员与角色来自 `members` / `roles` 集合：成员是管理员、店长、回收员、客服的统一档案，角色聚合权限点；回收员身份在小程序端靠 `members.phone`（或旧 `staff.phone`）与 `users.phone` 匹配判定；
- 积分数据来自 `points_records`（流水）/ `points_goods`（商品）/ `points_exchanges`（兑换单），订单完成时由云函数按成交金额自动发分，取消订单自动冲正；
- 评估员招募报名来自 `staff_recruits` 集合，小程序招募页写入，后台「评估员招募」页跟进状态；
- 投诉建议来自 `feedbacks` 集合，小程序「投诉建议」页提交，后台「投诉建议」页**只读展示**（状态流转接口 `adminUpdateFeedbackStatus` 后端已实现但未接线）；
- `?mock=1` 只用于 Vite 本地预览，生产构建不会启用 Mock 数据。

系统配置采用 Key-Value 字典管理。数据库中的 `value` 始终保存为字符串，`type` 仅用于后台输入和展示提示；Key 只能由小写字母、数字和下划线组成，并以字母开头。内置默认项可以编辑覆盖，不能直接删除。

**通知相关配置也在 `settings` 集合**。系统已移除全部企业微信群机器人通知，只保留微信订阅消息（通知用户与回收员），改这里会直接影响线上推送行为：

- `wx_subscribe_tmpl_staff_new_order`（回收员新订单/超时催单模板）已在系统配置默认项中，带默认模板 ID；
- `wx_subscribe_tmpl_assigned`（师傅接单通知）/ `wx_subscribe_tmpl_completed`（订单完成通知）/ `wx_mini_appid`（目标小程序 APPID，**必填**）这 3 项**不在默认列表里**，后台不会自动出现占位行，需手动往 `settings` 集合加记录后才能生效；留空的模板项等于关闭对应通知。

人员管理的真实数据：小程序用户登录或修改头像昵称后同步到 `users` 集合；成员（含回收员）由后台维护在 `members` 集合（旧 `staff` 集合在迁移期继续兼容）。派单或抢单时订单会保存回收员的 ID、姓名和电话快照，并触发微信订阅消息。新部署此版本后，历史用户需要再次打开并登录小程序，才会出现在用户列表中。

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
