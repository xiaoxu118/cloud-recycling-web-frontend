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
  - `isDevPreview()` 要求 **`import.meta.env.DEV` 与 `?mock=1` 同时成立**（mock.ts:95-96），生产构建下 `?mock=1` 无效
  - 数据来自 `src/api/mock.ts`，含 `adminPhoneLogin` 本地直发 session
  - mock 未实现的 type 会抛 `本地预览未实现接口：${type}`；已知 `adminUserDetail`、`adminListFeedbacks`、`adminDeleteOrder` 未实现，故 Mock 模式下用户详情页、投诉建议页必然报错
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
│   ├── App.tsx                 # /login 页面 + 路由分发 /* → FigmaAdminApp（583 行，含大段死代码）
│   ├── login.css               # 登录页样式（唯一被 import 的顶层 css）
│   ├── styles.css              # ⚠️ 491 行死文件，无任何 import
│   ├── config/admin.ts         # 4 级级联的配置解析：URL > window > import.meta.env > 默认
│   ├── api/
│   │   ├── cloud.ts            # callCloud / initCloud / getCloudBaseApp / uploadTransferProof /
│   │   │                       # uploadSystemImage / cloudUrlToHttps / cloudUrlsToHttps / CloudError
│   │   └── mock.ts             # 本地预览数据，导出 isDevPreview() 与 mockCall()
│   ├── types.ts                # 跨页面共享的领域类型（Order / Category / RecycleSettings / FeedbackRecord ...）
│   ├── figma/
│   │   ├── FigmaAdmin.tsx      # 生产界面大文件，3279 行
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

**所有业务页面（订单 / 品类 / 系统配置 / 投诉建议 / 详情）都在 `FigmaAdminApp` 内部**用状态机 + `useNavigate()` 实现，不再走 react-router 的 `<Route>`。App.tsx 的 `<Routes>` 真实只挂两条：`/login → LoginPage`、`/* → FigmaAdminApp`。FigmaAdmin 自己解析 `/orders`、`/orders/:id`、`/categories`、`/settings`、`/staff`、`/users/:id`、`/analytics`、`/feedback` 等路径做权限切换和 history 兼容（`/cats`、`/system` 已重定向到现名）。

### 死代码清单（改前必看）

两个文件都残留了被 `FigmaAdminApp` 取代后未清理的组件，**全部无 JSX 引用**。改 UI 前先确认自己改的不是死的那一份：

`App.tsx`（孤儿块 307–572）：

| 组件 | 行 | 说明 |
|---|---|---|
| `AdminLayout` | 307 | 与 FigmaAdmin 的 `MainLayout` 重名概念，已废 |
| `OrdersPage` | 347 | |
| `OrderDrawer` | 448 | 仅被死的 `OrdersPage` 引用 |
| `OrderDetail` | 553 | 仅被死的 `OrderDrawer` 引用 |
| `CategoriesPage` | 558 | |
| `CategoryModal` | 567 | 仅被死的 `CategoriesPage` 引用 |

> App.tsx 573 行之后的 `StatusBadge` / `DetailSection` / `Detail` / `LoadingRows` / `EmptyState` / `FullscreenLoading` / `SystemError` / `Modal` 是**混合状态**：`SystemError`（157）与 `FullscreenLoading`（158）在活代码里用着，其余只被上表的死组件引用。删之前逐个 grep。

`FigmaAdmin.tsx`：

| 组件 | 行 | 说明 |
|---|---|---|
| `OrderDetailPanel` | 700 | 被 `AdminOrderDetailPage` 取代 |
| `OrderEditModal` | 656 | 仅被死的 `OrderDetailPanel` 链路引用 |
| `CategoryGroupModal` / `CategoryEditorModal` | 1345 / 1370 | 仅被死的 `RecycleCatsPage` 引用 |
| `ImportModal` | 1474 | exceljs 批量导入，**从 UI 无法到达** |
| `RecycleCatsPage` | 1625 | 被 `CategoryTreePage` 取代 |
| `LoginPage` | 2313 | 内含硬编码 `admin/admin123` 校验 |

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

**没有独立账号密码体系**。所有管理员白名单在 CloudBase `admins` 集合（phone 为主键）由云函数校验。

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

- 云函数 `ADMIN_SESSION_TTL` 为 **7 天**（`recycle/admin.js:10`）
- `recycle/admin.js:14` 还有 `DEV_BYPASS_ADMIN_AUTH = false` 开关，排查鉴权问题时留意
- 存量 session 在改 TTL 后**不会复活**，到期后强制重登
- web 端**不**自行校验 expiresAt，过期由云函数 `ADMIN_SESSION_EXPIRED` 触发 `logout()`
- 启动时用 `adminGetSettings` 探活本地 token（App.tsx:112-125），失败即清理登录态

### LocalStorage 键

| Key | 用途 |
|---|---|
| `admin_session_token` | Web 管理的 sessionToken（App.tsx:89/120/135/167） |
| `admin_name` | 显示名 |
| `system-config-column-widths-v1` | 系统配置表格列宽记忆（`SYS_CFG_COL_KEY`，FigmaAdmin.tsx:1949） |

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
3. 类型：响应结构加到 `src/types.ts`（如 `FeedbackRecord:137` / `FeedbackListResult:153`）
4. 错误码（如需要）：加到 `App.tsx:31` 的 `ERROR_TEXT` 字典

调用失败统一抛 `CloudError(code, data?)`（不是 `Error`），code 取云函数返回的 `errMsg`。Mock 模式由 `src/api/mock.ts` 单独实现。

### 已使用的 action 清单（web 端）

- 登录：`adminPhoneLogin`
- 订单：`adminListOrders` / `adminGetOrderDetail` / `adminUpdateOrder` / `adminAssignOrderRecycler` / `adminDeleteOrder`
- 品类：`adminListCategories` / `adminSaveCategory` / `adminDeleteCategory`
- 设置：`adminGetSettings` / `adminListSystemSettings` / `adminSaveSystemSetting` / `adminDeleteSystemSetting`
- 人员：`adminListUsers` / `adminUserDetail` / `adminListAdmins` / `adminSaveAdmin` / `adminToggleAdmin` / `adminListStaff` / `adminSaveStaff`
- 投诉建议：`adminListFeedbacks`（FigmaAdmin.tsx:3005，只读列表）
- 上传：`uploadSystemImage`（`src/api/cloud.ts` 内部的 `app.uploadFile` 包装）/ `uploadTransferProof`（FigmaAdmin.tsx:2727 在用）

**后端有但 web 完全无调用点的 action**（动它们不影响线上）：

- `adminSaveSettings` —— 原调用方 App.tsx 的 `SettingsPage` 已删除，现仅 mock.ts:146 保留桩实现
- `adminUpdateFeedbackStatus` —— 后端 `feedback.js` 已实现，投诉建议页当前只读，未接线
- `adminCreateLoginTicket` / `adminConfirmLoginTicket` / `adminCheckLoginTicket` —— 扫码登录，见「鉴权」

## 错误处理

`App.tsx:31-56` 的 `ERROR_TEXT` 集中映射云函数 errMsg 到人类可读消息，当前 **24 个键**：

- 鉴权类 → 触发 `logout()` 并 toast：`ADMIN_SESSION_REQUIRED` / `ADMIN_SESSION_EXPIRED` / `NO_PERMISSION`
- 登录页专用：`PHONE_NOT_IN_WHITELIST` / `PHONE_BOUND_TO_OTHER_ACCOUNT` / `LOGIN_TICKET_EXPIRED`
- 订单业务：`ORDER_STATUS_INVALID` / `ORDER_NOT_FOUND` / `ORDER_STATUS_NOT_ASSIGNABLE` / `TRANSFER_PROOF_REQUIRED` / `FINAL_PRICE_REQUIRED` / `ACTUAL_QUANTITY_REQUIRED` / `CANCEL_REASON_REQUIRED`
- 派单：`STAFF_NOT_ONLINE` / `STAFF_NOT_FOUND`
- 品类分组：`CATEGORY_GROUP_REQUIRED` / `CATEGORY_GROUP_NOT_FOUND` / `CATEGORY_GROUP_NOT_EMPTY`
- 投诉建议：`FEEDBACK_NOT_FOUND`
- 通用/致命：`PARAM_INVALID` / `DB_ERROR` / `EMPTY_RESPONSE` / `CLOUDBASE_SDK_MISSING` / `CLOUDBASE_CONFIG_MISSING`

**已知映射缺口**（代码会抛但字典没有，会把裸 code 直接显示给用户）：

- `CLOUDBASE_NOT_READY`（cloud.ts:38/50/62）、`CALL_FAILED`（cloud.ts:45 兜底 code）
- mock 专属：`CATEGORY_NAME_DUPLICATE` / `PHONE_ALREADY_EXISTS` / `LAST_ADMIN_PROTECTED`

修改云函数错误码后，**一定同步更新** `ERROR_TEXT`，否则前端只显示原始 `result.errMsg`。

## FigmaAdmin.tsx 内部

3279 行，是真正的生产页面实现。导航 / 数据 / 详情页全在这里（行号会随改动漂移，以组件名为准）：

| 模块 | 行 | 用途 |
|---|---|---|
| `legacySettingsToSystemSettings` | 110 | 旧 settings → KV 字典的兜底转换 |
| `priceFromReference` | 183 | 价格字符串 → 数字提取 |
| `stripTrailingQi` | 190 | 去 DB 中末尾 `起`（与 miniprogram 对齐） |
| `categoryToItem` | 192 | CloudCategory → RecycleItem 投影（**唯一的归一化点**） |
| `AssignRecyclerModal` / `ImagePreviewModal` / `NewOrderModal` | 539 / 555 / 573 | 弹窗与预览 |
| `OrdersPage` | 822 | 订单列表、筛选、分页、汇总卡 |
| `StaffPage` | 1114 | 人员管理，内部 `tab==="users"` 切工作人员/用户列表 |
| `CategoryTreePage` | 1925 | **在用**的品类树渲染 / 模态编辑（`page==="cats"`） |
| `FeedbackPage` | 1955 | 投诉建议只读列表（`page==="feedback"`），数据来自 `adminListFeedbacks` |
| `SystemPage` | 2067 | 系统设置（KV 字典 + image 系统配置），编辑弹窗 `SystemSettingEditor` 在 2214 |
| `LoginPage`（死代码） | 2313 | 见「死代码清单」 |
| `AnalyticsPage` | 2364 | recharts 图表，导航 `analytics` |
| `AdminOrderDetailPage` | 2681 | 订单详情 + 编辑合一，URL `/orders/:id` |
| `UserDetailPage` | 2876 | 用户详情，URL `/users/:id` |
| `NAV` / `pageFromPath` | 2941 / 2950 | 6 项导航（订单 / 人员 / 品类 / 分析 / 投诉建议 / 系统配置）+ 路径映射 |
| `MainLayout` | 2960 | 侧栏 / 顶栏 / 标题（**不叫 AdminLayout**） |
| `FigmaAdminApp` | 3277 | 导出的根组件 |

### 关键约定

- **品类价格归一化**：所有进入 UI 的 `priceRef` 都通过 `stripTrailingQi`（FigmaAdmin.tsx:190）剥尾 `起`，与小程序 `miniprogram/pages/category/index.js` 行为对齐。
- **`minVisitKg`（最低上门重量）**：品类级可选字段，有值时在品类树的 meta 行拼成 `≥ N单位`（FigmaAdmin.tsx:1939，在 `CategoryTreePage` 的 `metaOf`）；留空则该段不展示。
- **类别 enable 切换**走 `adminSaveCategory` 全量保存；未提供 toggle 专用 action。
- **表格列宽记忆**：逻辑在 `SystemPage` 2072-2126（`onColMouseMove` 2089 / `onColMouseUp` 2100），拖拽时只改 DOM，写盘由 2085-2088 的 `useEffect` 触发。
- **投诉建议只读**：`FeedbackPage` 只调 `adminListFeedbacks`（page=1 / pageSize=50，无分页 UI），状态流转的 `adminUpdateFeedbackStatus` 后端已就绪但未接线。

## 注意事项

- **修改业务组件前先确认是否被引用**：`App.tsx` 与 `FigmaAdmin.tsx` 都有成片死代码，见上文「死代码清单」。
- **新增导航路径**：需要同时更新 FigmaAdmin.tsx 内的 **`NAV`** 数组（2941-2948）、**`pageFromPath`**（2950-2958）以及 `useEffect` redirect 兜底（2979-2988 处理 `/cats`、`/system` 旧路径）。还要给 `Page` 联合类型加成员，并在 `MainLayout` 的渲染分支里挂上对应页面。
- **`@cloudbase/js-sdk` 不传 `accessKey`**：`src/api/cloud.ts:30-32` 注释解释——避免 SDK 自动开匿名会话污染 `signInWithOtp()` 拿到的真实 uid。
- **build 前必跑 `npm run build`**：本项目目前唯一自动化校验入口。
- **本仓库 dist/ 不入库**，所有部署走 MCP `manageHosting action=upload`。
- **与 cloud-recycling 同步**：admin.js 改了接口/字段名/错误码，web 这边的 types.ts、ERROR_TEXT、AdminOrderDetailPage 等都需同步核对（参见另一仓库 AGENTS.md「相关项目」段）。
- **本仓库没有自动化测试**：UI 改动后请在 Mock 模式下手动走一遍加载 / 空 / 成功 / 错误四种状态（注意 `adminUserDetail`、`adminListFeedbacks` 在 mock 下未实现，用户详情页与投诉建议页会报错）。
