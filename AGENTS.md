# AGENTS.md

This file provides guidance to AI coding agents working in this repository.
**Language note**: respond in Chinese; technical terms in English.

## 项目概述

这是**来卖吧**管理后台（运营端）的 Web 项目。配合同级目录 `cloud-recycling/`（用户端小程序 + 后端云函数）使用，**共享同一个 CloudBase 数据库**，不另起后端。

技术栈：

| 层 | 选型 | 备注 |
|---|---|---|
| 框架 | React 18.3 + react-router-dom 7 | 函数组件 + Hooks |
| 构建 | Vite 6.4 | 类型检查前置 `tsc --noEmit` |
| 组件库 | `@mui/material` 9 + `@emotion/*` | 表格、弹窗、表单主力，与 Tailwind 混用 |
| 样式 | Tailwind 4 + 自写 `login.css` / `styles.css` / `figma/styles/*` | 登录页样式与后台隔离 |
| UI 规范 | `lucide-react` 图标 + Figma 设计稿 `https://www.figma.com/design/HuhRXYYWhknyphP6n3nL6E` | 生产界面 `src/figma/FigmaAdmin.tsx` |
| 云调用 | `@cloudbase/js-sdk` 3.6 | 不传 `accessKey`，无匿名登录（详见「鉴权」） |
| 数据导入 | `exceljs` 4.4 | 品类批量导入弹窗（`ImportModal`，当前入口不可达，见「死代码」） |
| 图表 | `recharts` 2.15 | **已启用**，`AnalyticsPage` 在用（导航 `analytics`） |
| Node | typescript 5.9 | 严格模式 |

其它未在上表体现的依赖：`tw-animate-css` 1.3.8、`overrides: { uuid: 11.1.1 }`。

## 开发与构建

```bash
npm install                 # 注意是 install 而非 ci，lockfile 不强制
npm run dev                 # vite --host 0.0.0.0，http://localhost:5173
npm run build               # tsc --noEmit && vite build，提交前**必须**通过
npm run preview             # vite preview --host 0.0.0.0
```

### 关键运行模式

- **本地预览（无云开发）**：`http://localhost:5173/?mock=1#/orders`
  - `isDevPreview()` 要求 **`import.meta.env.DEV` 与 `?mock=1` 同时成立**（mock.ts:93-94），生产构建下 `?mock=1` 无效
  - 数据来自 `src/api/mock.ts`（177 行），含 `adminPhoneLogin` 本地直发 session
  - mock 未实现的 type 会抛 `本地预览未实现接口：${type}`。**mock 只覆盖订单 / 品类 / 设置 / 用户列表 / 管理员 / staff 保存 / 邀请管理（空数据桩）这几组**，明确未实现的有：`adminUserDetail`、`adminListFeedbacks`、`adminDeleteOrder`，以及**全部 members / roles / points / pointsMall / recruits 相关 type**。因此 Mock 模式下用户详情、投诉建议、成员管理、角色管理、积分管理、评估员招募页必然报错，只能在真实环境验证；邀请管理页在 Mock 下可打开但只有空列表
- **真实环境**：删除 `?mock=1` 即可
- **临时切环境/函数**：`?env=xxx&fn=yyy`（优先级最高），无需改配置

### 部署（CloudBase 静态托管）

```bash
npm run build               # 输出 dist/
# 通过 MCP manageHosting action=upload 上传，详见 README
# 访问：https://bangbang-d2gy4wqj264b5483c-1311277159.tcloudbaseapp.com/
```

部署后记得用 `?_<hash>.js` 命中做 cache-buster；dev 上线强刷（Cmd+Shift+R）。

## 仓库结构

```
cloud-recycling-web-frontend/
├── public/
│   └── config.js               # 部署时注入 window.ADMIN_CONFIG，留空走 .env
├── src/
│   ├── main.tsx                # React 挂载，HashRouter；只 import login.css + figma/styles/index.css
│   ├── App.tsx                 # /login 页面 + 路由分发 /* → FigmaAdminApp（605 行，含大段死代码）
│   ├── login.css               # 登录页样式（唯一被 import 的顶层 css）
│   ├── styles.css              # ⚠️ 491 行死文件，无任何 import
│   ├── config/admin.ts         # 4 级级联的配置解析：URL > window > import.meta.env > 默认
│   ├── api/
│   │   ├── cloud.ts            # callCloud / initCloud / getCloudBaseApp / uploadTransferProof /
│   │   │                       # uploadSystemImage / cloudUrlToHttps / cloudUrlsToHttps / CloudError
│   │   └── mock.ts             # 本地预览数据，导出 isDevPreview() 与 mockCall()
│   ├── types.ts                # 跨页面共享的领域类型（413 行：Order / Category / RecycleSettings /
│   │                           # FeedbackRecord / MemberRecord / RoleRecord / PointsRecord /
│   │                           # PointsGoods / PointsExchange / StaffRecruitRecord / InviteRecord ...）
│   ├── figma/
│   │   ├── FigmaAdmin.tsx      # 生产界面大文件，4498 行
│   │   └── styles/             # index.css 只 @import fonts/tailwind/theme；globals.css 为空且未引用
│   └── vite-env.d.ts
├── .env.example
├── DESIGN.md                   # 设计原则、Figma 链接、视觉基准
├── README.md
├── index.html
├── tsconfig.json               # 严格 TypeScript
├── vite.config.ts
└── package.json
```

### src/App.tsx 与 src/figma/FigmaAdmin.tsx 的边界

`App.tsx` 只负责：
1. 调 `initCloud()` → 拿到 CloudBase SDK app
2. 路由 `/login` → `LoginPage`，其余 `/*` 全部交给 `FigmaAdminApp`
3. 全局 toast / fatal error 兜底

**所有业务页面（订单 / 用户 / 成员 / 角色 / 评估员招募 / 品类 / 分析 / 投诉建议 / 积分 / 系统配置 / 各详情页）都在 `FigmaAdminApp` 内部**用状态机 + `useNavigate()` 实现，不再走 react-router 的 `<Route>`。App.tsx 的 `<Routes>` 真实只挂两条：`/login → LoginPage`、`/* → FigmaAdminApp`。FigmaAdmin 自己用 `pageFromPath()` 解析 `/orders`、`/orders/:id`、`/users`、`/users/:id`、`/members`、`/roles`、`/recruits`、`/categories`、`/analytics`、`/feedback`、`/points`、`/settings` 做权限切换和 history 兼容（`/cats`、`/system`、`/staff` 是旧路径，会重定向到现名）。

### 权限模型（useAuth）

`FigmaAdmin.tsx:142` 的 `AuthContext` 保存当前登录者的权限点，来自 `adminGetAuthInfo`（FigmaAdmin.tsx:4349）。组件里用 `useAuth().has("order:write")` 判断。**注意 `ready === false` 时 `has()` 一律放行** —— 权限信息还没拉回来（或后端尚未部署 members 链路）时不挡 UI，属于有意的向后兼容。导航项的 `permission` 字段与 `roles.js` 的 `PERMISSION_CATALOG` 一一对应，改权限点需两端同步。

### 死代码清单（改前必看）

两个文件都残留了被 `FigmaAdminApp` 取代后未清理的组件，**全部无 JSX 引用**。改 UI 前先确认自己改的不是死的那一份：

`App.tsx`（孤儿块 329–594）：

| 组件 | 行 | 说明 |
|---|---|---|
| `AdminLayout` | 329 | 与 FigmaAdmin 的 `MainLayout` 重名概念，已废 |
| `OrdersPage` | 369 | |
| `OrderDrawer` | 470 | 仅被死的 `OrdersPage` 引用 |
| `OrderDetail` | 575 | 仅被死的 `OrderDrawer` 引用 |
| `CategoriesPage` | 580 | |
| `CategoryModal` | 589 | 仅被死的 `CategoriesPage` 引用 |

> App.tsx 596 行之后的 `StatusBadge` / `DetailSection` / `Detail` / `LoadingRows` / `EmptyState` / `FullscreenLoading` / `SystemError` / `Modal` 是**混合状态**：`SystemError`（602）与 `FullscreenLoading`（601）在活代码里用着，其余只被上表的死组件引用。删之前逐个 grep。

`FigmaAdmin.tsx`：

| 组件 | 行 | 说明 |
|---|---|---|
| `OrderDetailPanel` | 758 | 被 `AdminOrderDetailPage` 取代 |
| `OrderEditModal` | 718 | 仅被死的 `OrderDetailPanel` 链路引用 |
| `CategoryGroupModal` / `CategoryEditorModal` | 1992 / 2016 | 仅被死的 `RecycleCatsPage` 引用 |
| `ImportModal` | 2107 | exceljs 批量导入，**从 UI 无法到达** |
| `RecycleCatsPage` | 2258 | 被 `CategoryTreePage` 取代 |
| `LoginPage` | 2910 | 内含硬编码 `admin/admin123` 校验 |

## 配置与运行时环境

配置由 `src/config/admin.ts` 的 `resolveConfig()` 解析，**优先级（高 → 低）**：

| 层级 | 来源 | 用途 |
|---|---|---|
| 1 | URL 查询 `?env=xxx&fn=xxx` | 本地调试 / 紧急切换 |
| 2 | `window.ADMIN_CONFIG`（来自 `public/config.js`） | 部署时覆盖构建变量 |
| 3 | `import.meta.env.VITE_CLOUDBASE_ENV` / `VITE_FUNCTION_NAME` | Vite 构建时变量 |
| 4 | 代码内默认值 | 新 clone 仓库 `npm run dev` 即可跑通 |

**所有用到 env / functionName 的地方**只能 `import { adminConfig } from "./config/admin"`，**不要**直接读 `window.ADMIN_CONFIG` 或 env var，避免隐式耦合（见 admin.ts:8）。开发环境下 `console.info("[admin] config resolved:", adminConfig)` 会在控制台打印当前值。

当前默认值（cloud-recycling-web-frontend/src/config/admin.ts:36, 42）：

```
env          = "bangbang-d2gy4wqj264b5483c"
functionName = "quickstartFunctions"
```

## 鉴权流程

**没有独立账号密码体系**。登录身份由云函数校验：优先匹配 CloudBase `members` 集合（phone 为主键）并按 `roleKeys` 展开权限点；members 未命中或集合未建时回退旧 `admins` 白名单（phone 为主键，旧链路等同全权限）。成员状态为 `active` / `resting` / `resigned`（UI 文案 在职 / 休息 / 离职），后台保存成员时云函数双写 `staff` / `admins` 保持兼容。

### 登录方式

1. **手机号 + 验证码**（当前主要入口，`/login` 路由）
   - `app.auth.signInWithOtp({ phone: "+86 xxx" })` 发验证码，**60s** 倒计时
   - 用户输入 → `data.verifyOtp({ token: code })` 拿到 CloudBase `uid`
   - 调云函数 `adminPhoneLogin { phone, cloudbaseUid: uid }` 换 admin `sessionToken`
   - 写 `localStorage.admin_session_token` / `admin_name`

2. **小程序扫码**（后端能力就绪，**web 端未接线**）
   - 后端 `adminCreateLoginTicket` / `adminConfirmLoginTicket` / `adminCheckLoginTicket` 均已实现（`recycle/admin.js`）
   - 但 web 代码里**没有任何调用点**，要启用需自行补前端流程

### Session TTL

- 云函数 `ADMIN_SESSION_TTL` 为 **7 天**（`recycle/admin.js:11`）
- `recycle/admin.js:15` 还有 `DEV_BYPASS_ADMIN_AUTH = false` 开关，排查鉴权问题时留意
- 存量 session 在改 TTL 后**不会复活**，到期后强制重登
- web 端**不**自行校验 expiresAt，过期由云函数 `ADMIN_SESSION_EXPIRED` 触发 `logout()`
- 启动时用 `adminGetSettings` 探活本地 token（App.tsx:127-152），失败即清理登录态

### LocalStorage 键

| Key | 用途 |
|---|---|
| `admin_session_token` | Web 管理的 sessionToken（App.tsx:115/146/161/193） |
| `admin_name` | 显示名（App.tsx:116/147/162/194） |

> 早前的 `system-config-column-widths-v1`（系统配置表格列宽记忆）已随 `SystemPage` 改成 MUI Table 一并移除，代码里不再有任何列宽持久化。

## 接口契约（callCloud）

所有云调用走 `src/api/cloud.ts` 的 `callCloud<T>(type, data)`：

```js
const result = await callCloud<OrderListResult>("adminListOrders", {
  sessionToken: token,
  status: query.status,
  keyword: query.keyword,
});
```

云函数端 `event.type` 字符串与"动作"一一对应，详见 `cloud-recycling/AGENTS.md`「云函数 type 清单」。**新增动作**时：

1. 后端：在 `cloudfunctions/quickstartFunctions/recycle/*.js` 加 case（不要新建云函数）
2. 前端：在 `src/api/cloud.ts` 的 `callCloud` 之上薄包装（一般就够用）
3. 类型：响应结构加到 `src/types.ts`（如 `FeedbackRecord:231` / `FeedbackListResult:247`）
4. 错误码（如需要）：加到 `App.tsx:31` 的 `ERROR_TEXT` 字典

调用失败统一抛 `CloudError(code, data?)`（不是 `Error`），code 取云函数返回的 `errMsg`。Mock 模式由 `src/api/mock.ts` 单独实现。

### 已使用的 action 清单（web 端）

- 登录：`adminPhoneLogin`
- 订单：`adminListOrders` / `adminGetOrderDetail` / `adminUpdateOrder` / `adminAssignOrderRecycler` / `adminDeleteOrder`
- 品类：`adminListCategories` / `adminSaveCategory` / `adminDeleteCategory`
- 设置：`adminGetSettings` / `adminListSystemSettings` / `adminSaveSystemSetting` / `adminDeleteSystemSetting`
- 人员（旧链路，仍作为派单下拉与兼容用）：`adminListUsers` / `adminUserDetail` / `adminListStaff`
- 成员与角色（新链路）：`adminGetAuthInfo` / `adminListMembers` / `adminGetMemberDetail` / `adminSaveMember` / `adminToggleMemberStatus` / `adminListRoles` / `adminSaveRole` / `adminDeleteRole`
- 评估员招募：`adminListStaffRecruits` / `adminUpdateStaffRecruit` / `adminDeleteStaffRecruit`
- 积分：`adminListPointsRecords` / `adminGetUserPoints` / `adminAdjustUserPoints` / `adminRegrantOrderPoints`
- 拉新邀请：`adminListInvites` / `adminInviteStat` / `adminInvalidateInvite`
- 积分商城：`adminListPointsGoods` / `adminSavePointsGoods` / `adminTogglePointsGoods` / `adminListExchanges` / `adminVerifyExchange` / `adminShipExchange`
- 投诉建议：`adminListFeedbacks`（FigmaAdmin.tsx:4395，只读列表）
- 上传：`uploadSystemImage`（`src/api/cloud.ts` 内部的 `app.uploadFile` 包装，系统配置图与积分商品图都用它）/ `uploadTransferProof`（App.tsx:520 在用）

**后端有但 web 完全无调用点的 action**（动它们不影响线上）：

- `adminSaveSettings` —— 原调用方 App.tsx 的 `SettingsPage` 已删除，现仅 mock.ts:146 保留桩实现
- `adminUpdateFeedbackStatus` —— 后端 `feedback.js` 已实现，投诉建议页当前只读，未接线
- `adminListAdmins` / `adminSaveAdmin` / `adminToggleAdmin` / `adminSaveStaff` —— 旧的管理员/工作人员维护接口，已被 members 链路取代，**web 活代码里没有调用点**（只剩 mock.ts 里的桩）
- `initAdminCollections` / `initMemberCollections` / `migrateMembersFromLegacy` —— 初始化与迁移，需在小程序端或云开发控制台手动触发
- `adminCreateLoginTicket` / `adminConfirmLoginTicket` / `adminCheckLoginTicket` —— 扫码登录，见「鉴权」

## 错误处理

`App.tsx:26-60` 的 `ERROR_TEXT` 集中映射云函数 errMsg 到人类可读消息，当前 **45 个键**：

- 鉴权类 → 触发 `logout()` 并 toast：`ADMIN_SESSION_REQUIRED` / `ADMIN_SESSION_EXPIRED` / `NO_PERMISSION`
- 登录页专用：`PHONE_NOT_IN_WHITELIST` / `PHONE_BOUND_TO_OTHER_ACCOUNT` / `LOGIN_TICKET_EXPIRED`
- 订单业务：`ORDER_STATUS_INVALID` / `ORDER_NOT_FOUND` / `ORDER_STATUS_NOT_ASSIGNABLE` / `TRANSFER_PROOF_REQUIRED` / `FINAL_PRICE_REQUIRED` / `ACTUAL_QUANTITY_REQUIRED` / `CANCEL_REASON_REQUIRED`
- 派单：`STAFF_NOT_ONLINE` / `STAFF_NOT_FOUND`
- 品类分组：`CATEGORY_GROUP_REQUIRED` / `CATEGORY_GROUP_NOT_FOUND` / `CATEGORY_GROUP_NOT_EMPTY`
- 系统配置：`SETTING_KEY_INVALID` / `BANNER_SLOT_INVALID`（首页轮播只允许 `home_banner`、`home_banner_2` ~ `home_banner_5` 五个槽位）
- 积分：`POINTS_TX_FAILED` / `POINTS_EXCEED_LIMIT` / `REMARK_REQUIRED` / `ORDER_NOT_COMPLETED` / `POINTS_ALREADY_GRANTED`
- 兑换商城：`GOODS_NOT_FOUND` / `GOODS_OUT_OF_STOCK` / `POINTS_NOT_ENOUGH` / `POINTS_BALANCE_NEGATIVE` / `EXCHANGE_LIMIT_REACHED` / `ADDRESS_REQUIRED` / `ADDRESS_INVALID` / `EXCHANGE_NOT_FOUND` / `EXCHANGE_CANNOT_CANCEL`
- 评估员招募：`MISSING_RECRUIT_ID` / `STATUS_INVALID`
- 拉新邀请：`INVITE_NOT_FOUND` / `INVITE_ALREADY_INVALID`（作废备注缺失复用 `REMARK_REQUIRED`）
- 投诉建议 / 用户：`FEEDBACK_NOT_FOUND` / `USER_NOT_FOUND`
- 通用/致命：`PARAM_INVALID` / `DB_ERROR` / `EMPTY_RESPONSE` / `CLOUDBASE_SDK_MISSING` / `CLOUDBASE_CONFIG_MISSING`

**已知映射缺口**（代码会抛但字典没有，会把裸 code 直接显示给用户）：

- `CLOUDBASE_NOT_READY`（cloud.ts:38/50/62）、`CALL_FAILED`（cloud.ts:45 兜底 code）
- mock 专属：`CATEGORY_NAME_DUPLICATE` / `PHONE_ALREADY_EXISTS` / `LAST_ADMIN_PROTECTED`

修改云函数错误码后，**一定同步更新** `ERROR_TEXT`，否则前端只显示原始 `result.errMsg`。

## FigmaAdmin.tsx 内部

4498 行，是真正的生产页面实现。导航 / 数据 / 详情页全在这里（行号会随改动漂移，以组件名为准）：

| 模块 | 行 | 用途 |
|---|---|---|
| `AuthContext` / `useAuth` | 142 | 权限点上下文，`ready=false` 时全放行 |
| `OrderTypeBadge` | 199 | 订单来源（品类/拍照/拆除/综合）徽标 |
| `legacySettingsToSystemSettings` | 177 | 旧 settings → KV 字典的兜底转换 |
| `priceFromReference` / `stripTrailingQi` / `categoryToItem` | 251 / 258 / 260 | 价格提取 / 去末尾 `起` / CloudCategory → RecycleItem 投影（**唯一的归一化点**） |
| `RowActionButton` / `RowActions` | 488 / 512 | 表格行操作按钮与折叠菜单 |
| `AssignRecyclerModal` / `ImagePreviewModal` / `NewOrderModal` | 611 / 627 / 645 | 弹窗与预览 |
| `AutoAcceptModal` / `ColVisibilityMenu` | 819 / 852 | 自动接单设置 / 列显隐菜单 |
| `OrdersPage` | 880 | 订单列表、筛选、分页、汇总卡（`page==="orders"`） |
| `UsersPage` | 1172 | 用户列表（`page==="users"`，路径 `/users`） |
| `RoleChips` | 1241 | 角色标签渲染，配色来自 `ROLE_META` |
| `MembersPage` / `MemberEditor` / `MemberDetailModal` | 1253 / 1413 / 1506 | 成员管理（`page==="members"`，路径 `/members`，旧路径 `/staff` 重定向过来）：列表 + 编辑（角色多选/门店/状态）+ 详情弹窗 |
| `StaffRecruitsPage` / `StaffRecruitEditor` | 1595 / 1749 | 评估员招募报名（`page==="recruits"`，路径 `/recruits`）：状态统计卡 + 关键词/状态筛选 + 列表 + 跟进弹窗（改状态/备注，备注 200 字上限）+ 删除；数据来自 `adminListStaffRecruits` / `adminUpdateStaffRecruit` / `adminDeleteStaffRecruit`，权限点复用 `member:read` / `member:write`。**组件内自取数据**，请求失败时置 `needInit=true` 渲染「功能尚未就绪」占位，而不是弹全局错误 |
| `RolesPage` / `RoleEditor` | 1795 / 1875 | 角色与权限点勾选（`page==="roles"`，路径 `/roles`）；`superAdminKey` 角色不可改权限 |
| `CategoryParentCascader` / `CategoryNodeModal` | 2437 / 2458 | 品类父级级联选择 / 品类节点编辑弹窗 |
| `CategoryTreePage` | 2570 | **在用**的品类树渲染 / 模态编辑（`page==="cats"`，路径 `/categories`） |
| `FeedbackPage` | 2601 | 投诉建议只读列表（`page==="feedback"`），数据来自 `adminListFeedbacks` |
| `SystemSettingRow` / `SystemPage` / `SystemSettingEditor` | 2719 / 2751 / 2797 | 系统设置（KV 字典 + image 类型上传）；banner 槽位提示文案在 `SystemSettingEditor` |
| `LoginPage`（死代码） | 2910 | 见「死代码清单」 |
| `AnalyticsPage` | 2959 | recharts 图表（`page==="analytics"`） |
| `AdminOrderDetailPage` | 3276 | 订单详情 + 编辑合一，URL `/orders/:id`，含 `adminRegrantOrderPoints` 补发积分 |
| `PointsTypeBadge` | 3484 | 积分流水类型徽标 |
| `PointsPage` | 3497 | 积分管理容器（`page==="points"`，路径 `/points`），三个 Tab |
| `PointsRecordsTab` | 3517 | 积分流水（`adminListPointsRecords`），可跳订单详情 |
| `PointsGoodsTab` | 3657 | 商城商品维护（`adminListPointsGoods` / `adminSavePointsGoods` / `adminTogglePointsGoods`），图片走 `uploadSystemImage("points-goods", file)` |
| `PointsExchangesTab` | 3887 | 兑换单（`adminListExchanges` / `adminVerifyExchange` 核销 / `adminShipExchange` 发货） |
| `UserDetailPage` | 4080 | 用户详情 + 积分调整，URL `/users/:id` |
| `DetailField` | 3741 | 详情页 label/value 行 |
| `INVITE_STATUS_META` | 3744 | 邀请记录状态配色（bound / l1rewarded / l2rewarded / l2revoked / invalid） |
| `InvitesPage` | 3752 | 拉新邀请管理（`page==="invites"`，路径 `/invites`）：6 张统计卡（`adminInviteStat`）+ 邀请人手机号/状态筛选 + 列表（`adminListInvites`，pageSize 20）+ 作废。权限点复用 `points:read` / `points:write`。**组件内自取数据**，失败置 `needInit=true` 渲染「功能尚未就绪」占位而非弹全局错误（同 `StaffRecruitsPage`） |
| `InviteInvalidateDialog` | 3947 | 作废弹窗（`adminInvalidateInvite`）：备注必填 200 字上限，提交前按「已发 L1 + 未冲正 L2」预览扣回积分，口径与后端一致 |
| `NAV` | 4015 | **8 组导航共 11 个页面**：订单管理 / 人员管理（用户管理·成员管理·角色管理·评估员招募 4 个子项）/ 品类管理 / 分析统计 / 投诉建议 / 积分管理 / 邀请管理 / 系统配置。每项带 `permission` 权限点 |
| `ROLE_META` / `MEMBER_STATUS_META` / `PAGE_LABEL` | 4032 / 4039 / 4046 | 角色配色 / 成员状态配色 / 页面标题字典 |
| `pageFromPath` / `flatNav` | 4051 / 4068 | 路径 → `Page` 映射（含 `/staff`→members、`/cats`→cats、`/system`→system 旧路径兼容）/ 导航打平用于按权限找首个可访问页 |
| `MainLayout` | 4074 | 侧栏 / 顶栏 / 标题 + 全部数据加载与页面渲染分支（**不叫 AdminLayout**） |
| `FigmaAdminApp` | 4496 | 导出的根组件 |

### 关键约定

- **品类报价是自由文本**：落库的 `priceRef` 是完整文案（如「0.5-0.8 元/公斤」），但管理端「参考价格」输入框**只填价格部分**（如 `0.5-0.8`），「元/单位」由 `endAdornment` 跟随 `form.unit` 自动展示。保存时 `joinPriceRef` 拼接后缀，编辑回填时 `splitPriceRef` 反向剥离（两个 helper 在 FigmaAdmin.tsx:269 附近；输入值里已含「元」则原样保留，避免二次拼接）。云函数只做 trim + 40 字截断，不再由数字单价拼装；`price`（数字单价）已废弃，仅存量数据保留。现场估价改用显式布尔字段 `fieldEstimate`，开启时 `priceRef` 由云端强制写成「现场估价」，管理端输入框置灰。读 `fieldEstimate` 时对存量数据回退旧语义 `price == null`（见 `categoryToItem`）。
- **品类价格归一化**：所有进入 UI 的 `priceRef` 都通过 `stripTrailingQi`（FigmaAdmin.tsx:258）剥尾 `起`，与小程序 `miniprogram/pages/category/index.js` 行为对齐。
- **`minVisitKg`（最低上门重量）**：品类级可选字段，有值时在品类树的 meta 行拼成 `≥ N单位`（FigmaAdmin.tsx:2587，在 `CategoryTreePage` 的 `metaOf`）；留空则该段不展示，一级品类不写该字段。
- **类别 enable 切换**走 `adminSaveCategory` 全量保存；未提供 toggle 专用 action。
- **首页 Banner 只有 5 个槽位**：`SystemSettingEditor` 用 `/^home_banner(?:_\d+)?$/`（FigmaAdmin.tsx:2807）识别 banner 配置项并给出提示——Key 依次为 `home_banner`、`home_banner_2` ~ `home_banner_5`，建议 5:3 横图，**留空的槽位小程序端自动跳过（配几张展示几张）**。超出范围的 Key 会被云函数拒绝（`BANNER_SLOT_INVALID`）。
- **配置 Key 规则**：`/^[a-z][a-z0-9_]{1,63}$/`，且编辑已有项时 Key 锁定不可改（`keyLocked`）。
- **投诉建议只读**：`FeedbackPage` 只调 `adminListFeedbacks`（page=1 / pageSize=50，无分页 UI），状态流转的 `adminUpdateFeedbackStatus` 后端已就绪但未接线。
- **成员管理有降级路径**：`MembersPage` 等新链路页面在后端未部署 members 相关 type 时会拿到错误，组件内自行渲染占位/空态而非让整页崩掉；改这些页面时保留这个 try/catch 兜底。

## 注意事项

- **修改业务组件前先确认是否被引用**：`App.tsx` 与 `FigmaAdmin.tsx` 都有成片死代码，见上文「死代码清单」。
- **新增导航路径要同步改 5 处**（都在 FigmaAdmin.tsx 内）：
  1. `Page` 联合类型（:86）加成员
  2. `NAV` 数组（:4015）加导航项（带 `permission`）
  3. `PAGE_LABEL`（:4046）加面包屑文案
  4. `pageFromPath`（:4051）加路径映射
  5. `MainLayout`（:4074）的渲染分支里挂上对应页面
  漏任何一处都会表现为「点得进去但白屏」或「TS 报缺 key」。另外 `MainLayout` 里还有旧路径重定向的 `useEffect`（`/cats`、`/system`、`/staff`）。
  > ⚠️ 经验教训：对 `FigmaAdmin.tsx` 这种大文件**不要并发提交多处编辑**，曾出现批量 6 处 SearchReplace 后有 4 处被静默回滚。请逐处串行修改，改完用 `npx tsc --noEmit` + grep 复核。
- **`@cloudbase/js-sdk` 不传 `accessKey`**：`src/api/cloud.ts` 注释解释——避免 SDK 自动开匿名会话污染 `signInWithOtp()` 拿到的真实 uid。
- **build 前必跑 `npm run build`**：本项目目前唯一自动化校验入口。
- **本仓库 dist/ 不入库**，所有部署走 MCP `manageHosting action=upload`。
- **与 cloud-recycling 同步**：admin.js / members.js / points.js / pointsMall.js 改了接口、字段名或错误码，web 这边的 `types.ts`、`ERROR_TEXT`、对应页面组件都需同步核对（参见另一仓库 AGENTS.md「相关项目」段）。
- **本仓库没有自动化测试**：UI 改动后请在 Mock 模式下手动走一遍加载 / 空 / 成功 / 错误四种状态。注意 mock 覆盖面很窄（见「关键运行模式」），成员 / 角色 / 积分 / 招募 / 投诉建议 / 用户详情这些页面只能连真实环境验证。
