# 云回收管理后台

这是云回收 Web 管理后台静态站点，部署到 CloudBase 静态网站托管后，通过 `quickstartFunctions` 读取真实云数据库数据。

## 登录方案

当前采用“小程序扫码确认登录”：

1. Web 后台调用 `adminCreateLoginTicket` 创建一次性登录票据和小程序码。
2. 管理员用微信扫码打开小程序隐藏页 `pages/admin-login/index`。
3. 小程序调用 `adminConfirmLoginTicket`，云函数用当前 `OPENID` 查询 `admins` 集合。
4. 通过白名单后，Web 携带 `ticket + webNonce` 轮询 `adminCheckLoginTicket` 获取短期 `sessionToken`。
5. 管理接口必须携带 `sessionToken`，云函数校验通过才会返回真实数据。

## 首次配置

1. 在 `CloudRecycling` 仓库部署 `cloudfunctions/quickstartFunctions`，并确保 `config.json` 包含 `wxacode.getUnlimited` 权限。
2. 调用一次 `initAdminCollections`，或首次打开后台时由登录接口自动创建管理相关集合。
3. 用非管理员微信扫码一次，确认页会提示“无权限”并展示当前 `OpenID`。
4. 在云开发数据库 `admins` 集合中新增管理员：

```json
{
  "openid": "扫码页展示的 OpenID",
  "name": "运营管理员",
  "role": "admin",
  "enabled": true
}
```

5. 在 CloudBase 控制台开启 Web 端可用的身份能力。当前页面会尝试匿名登录后调用云函数，若环境未开启匿名登录，需要在控制台启用匿名登录或改成正式 Web OAuth 登录。

## 与小程序共用数据

Web 管理端不维护独立业务数据，生产环境通过 `quickstartFunctions` 与小程序共用同一 CloudBase 环境：

- 订单来自 `orders` 集合，后台更新状态、金额和回收人员后，小程序订单详情会读取同一条记录；
- 品类来自 `categories` 集合，后台新增、上下架后会影响小程序首页和下单页；
- 客服电话及起收规则来自 `settings` 集合，后台保存后由小程序首页和下单校验直接读取；
- `?mock=1` 只用于 Vite 本地预览，生产构建不会启用 Mock 数据。

系统配置采用 Key-Value 字典管理。数据库中的 `value` 始终保存为字符串，`type` 仅用于后台输入和展示提示；Key 只能由小写字母、数字和下划线组成，并以字母开头。内置默认项可以编辑覆盖，不能直接删除。

人员管理分为两类真实数据：小程序用户登录或修改头像昵称后同步到 `users` 集合；工作人员由后台维护在 `staff` 集合，派单时订单会同时保存工作人员记录 ID、姓名和电话。新部署此版本后，历史用户需要再次打开并登录小程序，才会出现在用户列表中。

修改云函数接口后，需要重新上传并部署 `CloudRecycling/cloudfunctions/quickstartFunctions`，仅重新构建 Web 项目不会更新云端接口。

## 部署

本项目使用 Vite + React + TypeScript 开发，构建结果是可部署到 CloudBase 静态网站托管的纯静态文件。

```bash
npm install
npm run dev
npm run build
```

如需在不调用云环境、不扫码的情况下验证管理页面，开发服务可访问 `http://localhost:5173/?mock=1#/orders`。本地预览只在 Vite 开发模式下生效，生产构建不会启用登录绕过。

开发模式的登录页也会显示“账号密码”选项，本地测试账号为 `admin`，密码为 `admin123`。该入口连接 `public/config.js` 指定的真实 CloudBase 环境，仅在云函数临时开启开发鉴权绕过时可用，且不会在生产模式显示。

开发服务默认使用 Vite 端口，生产构建输出到 `dist/`。部署时上传 `dist/` 目录内容。若云开发环境 ID 变化，修改 `public/config.js`；该文件会在构建时复制到 `dist/config.js`。

正式使用建议绑定自定义域名，并只把后台域名发给运营人员。真正的权限边界仍在云函数的管理员白名单和 session 校验。
