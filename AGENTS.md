# AGENTS.md

This file provides guidance to AI coding agents working in this repository.
**Language note**: respond in Chinese; technical terms in English.

## 项目概述

这是**帮帮回收**管理后台（运营端）的 Web 项目。配合同级目录 `cloud-recycling/`（用户端小程序 + 后端云函数）使用，**共享同一个 CloudBase 数据库**，不另起后端。

技术栈：

| 层 | 选型 | 备注 |
|---|---|---|
| 框架 | React 18.3 + react-router-dom 7 | 函数组件 + Hooks |
| 构建 | Vite 6.4 | 类型检查前置 `tsc --noEmit` |
| 样式 | Tailwind 4 + 自写 `login.css` / `styles.css` / `figma/styles/*` | 登录页样式与后台隔离 |
| UI 规范 | `lucide-react` 图标 + Figma 设计稿 `https://www.figma.com/design/HuhRXYYWhknyphP6n3nL6E` | 生产界面 `src/figma/FigmaAdmin.tsx` |
| 云调用 | `@cloudbase/js-sdk` 3.6 | 不传 `accessKey`，无匿名登录（详见「鉴权」） |
| 数据导入 | `exceljs` 4.4 | 品类批量导入弹窗 |
| 图表 | `recharts` 2.15 | 已就位但目前分析页未启用 |
| Node | typescript 5.9 | 严格模式 |

## 开发与构建

```bash
npm install                 # 锁定版本安装
npm run dev                 # Vite dev server，http://localhost:5173
npm run build               # tsc --noEmit && vite build，提交前**必须**通过
npm run preview             # 预览 dist/
```

### 关键运行模式

- **本地预览（无云开发）**：`http://localhost:5173/?mock=1#/orders`
  - `isDevPreview()` 检测到 `?mock=1` 后短路 `callCloud` → `mockCall`
  - 数据来自 `src/api/mock.ts`，含 `adminPhoneLogin` 本地直发 session
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
│   ├── main.tsx                # React 挂载，HashRouter
│   ├── App.tsx                 # /login 页面 + 路由分发 /* → FigmaAdminApp
│   ├── styles.css / login.css  # 全局样式（登录与后台相互独立）
│   ├── config/admin.ts         # 4 级级联的配置解析：URL > window > import.meta.env > 默认
│   ├── api/
│   │   ├── cloud.ts            # callCloud 封装 / initCloud / uploadTransferProof / CloudError
│   │   └── mock.ts             # 本地预览数据，导出 isDevPreview() 与 mockCall()
│   ├── types.ts                # 跨页面共享的领域类型（Order / Category / RecycleSettings ...）
│   ├── figma/
│   │   ├── FigmaAdmin.tsx      # 生产界面大文件，2650+ 行
│   │   └── styles/             # 全局 CSS（tailwind.css / theme.css / fonts.css ...）
│   └── vite-env.d.ts
├── docs/design/                # 设计/实现记录
├── DESIGN.md                   # 设计原则、Figma 链接、视觉基准
├── tsconfig.json               # 严格 TypeScript
├── vite.config.ts
└── package.json
```

### src/App.tsx 与 src/figma/FigmaAdmin.tsx 的边界

`App.tsx` 只负责：
1. 调 `initCloud()` → 拿到 CloudBase SDK app
2. 路由 `/login` → `LoginPage`，其余 `/*` 全部交给 `FigmaAdminApp`
3. 全局 toast / fatal error 兜底

**所有业务页面（订单 / 品类 / 系统配置 / 详情）都在 `FigmaAdminApp` 内部**用状态机 + `useNavigate()` 实现，不再走 react-router 的 `<Route>`。FigmaAdmin 自己也定义 `/orders`、`/orders/:id`、`/categories`、`/settings`、`/staff` 等路径做权限切换和 history 兼容（`/cats`、`/system` 已重定向到现名）。

> ⚠️ **App.tsx 中的孤儿组件**（`OrdersPage` / `CategoriesPage` / `SettingsPage` / `OrderDrawer`，行 315–549）已不再被 `<Routes>` 引用，**是历史遗留的死代码**。`FigmaAdminApp` 替代后未清理。修改其 UI 前请在编辑器内 grep `<OrdersPage|<CategoriesPage|<SettingsPage|<OrderDrawer` 确认仍无引用后再删；目前可保留下次重构。

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

2. **小程序扫码**（备用入口，未挂 web 路由）
   - web 调 `adminCreateLoginTicket` 生成 5 分钟 ticket
   - 小程序扫码调 `adminConfirmLoginTicket` 用 openid 确认
   - web 轮询 `adminCheckLoginTicket` 拿到 `sessionToken`

### Session TTL

- 云函数 `admin_sessions.expiresAt` 当前为 **7 天**（`recycle/admin.js:9`）
- 存量 session 在改 TTL 后**不会复活**，到期后强制重登
- web 端**不**自行校验 expiresAt，过期由云函数 `ADMIN_SESSION_EXPIRED` 触发 `logout()`

### LocalStorage 键

| Key | 用途 |
|---|---|
| `admin_session_token` | Web 管理的 sessionToken |
| `admin_name` | 显示名 |
| `figma_admin_cols_widths` | FigmaAdmin 表格列宽记忆（FigmaAdmin.tsx:1775） |

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
3. 类型：响应结构加到 `src/types.ts`
4. 错误码（如需要）：加到 `App.tsx:31` 的 `ERROR_TEXT` 字典

调用失败统一抛 `CloudError(code, data?)`（不是 `Error`），code 取云函数返回的 `errMsg`。Mock 模式由 `src/api/mock.ts` 单独实现。

### 已使用的 action 清单（web 端）

- `adminPhoneLogin` / `adminCreateLoginTicket` / `adminConfirmLoginTicket` / `adminCheckLoginTicket`
- `adminListOrders` / `adminGetOrderDetail` / `adminUpdateOrder` / `adminAssignOrderRecycler`
- `adminListCategories` / `adminSaveCategory` / `adminDeleteCategory`
- `adminGetSettings` / `adminSaveSettings`
- `adminListSystemSettings` / `adminSaveSystemSetting` / `adminDeleteSystemSetting`
- `adminListUsers` / `adminListAdmins` / `adminSaveAdmin` / `adminToggleAdmin`
- `adminListStaff` / `adminSaveStaff`
- 上传：`uploadTransferProof` / `uploadSystemImage`（`src/api/cloud.ts` 内部的 `app.uploadFile` 包装）

## 错误处理

`App.tsx:31-52` 的 `ERROR_TEXT` 集中映射云函数 errMsg 到人类可读消息：

- `ADMIN_SESSION_REQUIRED` / `ADMIN_SESSION_EXPIRED` / `NO_PERMISSION` → 触发 `logout()` 并 toast
- `PHONE_NOT_IN_WHITELIST` / `PHONE_BOUND_TO_OTHER_ACCOUNT` → 登录页专用
- `ORDER_STATUS_INVALID` / `ORDER_NOT_FOUND` → 详情页业务校验
- `EMPTY_RESPONSE` / `CLOUDBASE_SDK_MISSING` / `CLOUDBASE_CONFIG_MISSING` → 启动期致命错

修改云函数错误码后，**一定同步更新** `ERROR_TEXT`，否则前端只显示原始 `result.errMsg`。

## FigmaAdmin.tsx 内部

2650+ 行，是真正的生产页面实现。导航 / 数据 / 详情页全在这里：

| 模块 | 行号（大致） | 用途 |
|---|---|---|
| `AdminLayout` | ~2300 | 侧栏 / 顶栏 / 标题 |
| `OrdersPage` | ~2400 | 订单列表、筛选、分页、汇总卡 |
| `AdminOrderDetailPage` | ~2500 | 详情 + 编辑合一，URL `/orders/:id` |
| `CategoryAdminPage` | ~1700 | 品类树渲染 / 模态编辑 |
| `priceFromReference` | ~177 | 价格字符串 → 数字提取 |
| `stripTrailingQi` | ~182 | 去 DB 中末尾 `起`（与 miniprogram 对齐） |
| `categoryToItem` | ~190 | CloudCategory → RecycleItem 投影（**唯一的归一化点**） |
| `SettingsPage` | ~110 | 系统设置（KV 字典 + image 系统配置） |
| `StaffPage` / `UsersPage` | 中段 | 人员管理 + 用户列表（已部分接入） |
| `AssignRecyclerModal` / `ImagePreviewModal` / `NewOrderModal` 等 | 散落 | 弹窗与预览 |

### 关键约定

- **品类价格归一化**：所有进入 UI 的 `priceRef` 都通过 `stripTrailingQi`（`FigmaAdmin.tsx:182`）剥尾 `起`，与小程序 `miniprogram/pages/category/index.js:49-50` 行为对齐。
- **`minVisitKg`（最低上门重量）**：品类级可选字段，留空/未设置时显示 `— 全局`（FigmaAdmin.tsx:1751）。
- **类别 enable 切换**走 `adminSaveCategory` 全量保存；未在提供 toggle 专用 action。
- **表格列宽记忆**：拖拽列后只更新 DOM，`mouseup` 才写 `localStorage`（行 1769 起）。

## 注意事项

- **修改 App.tsx 业务组件前先确认是否被引用**：上文「孤儿组件」列表项很可能仍被你 grep 误判成"活的"。
- **新增导航路径**：需要同时更新 FigmaAdmin.tsx 内的 `pages[]` 数组、`parsePageFromPath`、`useEffect` redirect 兜底。
- **`@cloudbase/js-sdk` 不传 `accessKey`**：`src/api/cloud.ts:30-33` 注释解释——避免 SDK 自动开匿名会话污染 `signInWithOtp()` 拿到的真实 uid。
- **build 前必跑 `npm run build`**：本项目目前唯一自动化校验入口。
- **本仓库 dist/ 不入库**，所有部署走 MCP `manageHosting action=upload`。
- **与 cloud-recycling 同步**：admin.js 改了接口/字段名/错误码，web 这边的 types.ts、ERROR_TEXT、AdminOrderDetailPage 等都需同步核对（参见另一仓库 AGENTS.md「相关项目」段）。
- **本仓库没有自动化测试**：UI 改动后请在 Mock 模式下手动走一遍加载 / 空 / 成功 / 错误四种状态。
