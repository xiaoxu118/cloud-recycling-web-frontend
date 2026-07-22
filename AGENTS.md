# Repository Guidelines

## 项目结构与模块组织

生产代码位于 `src/`。`src/main.tsx` 负责挂载 React 应用和 Hash Router，`src/App.tsx` 包含主要后台业务流程。CloudBase 接口及本地预览数据分别放在 `src/api/cloud.ts` 和 `src/api/mock.ts`，共享领域类型统一定义在 `src/types.ts`。全局样式分布于 `src/login.css`、`src/styles.css` 和 `src/figma/styles/`。

`public/config.js` 是运行时环境配置，构建时会原样复制。`figma-ui-export/` 和 `docs/design/` 下的设计截图仅作为设计参考，不应作为生产代码修改。其中 `docs/design/source/` 保存 Figma 原始参考，`docs/design/implementation/` 保存实现及验收截图。`dist/` 为构建产物，请勿手动编辑。

## 构建、测试与开发命令

- `npm install`：根据 `package-lock.json` 安装锁定版本的依赖。
- `npm run dev`：启动 Vite 开发服务器。无需连接 CloudBase 时，可访问 `http://localhost:5173/?mock=1#/orders`。
- `npm run build`：先执行严格 TypeScript 类型检查，再将生产文件输出到 `dist/`。
- `npm run preview`：在本地预览已完成的生产构建。

提交代码前必须运行 `npm run build`，这是当前主要的自动化校验步骤。

## 编码风格与命名规范

使用 TypeScript 和 React 函数组件。遵循现有代码风格：两个空格缩进、双引号、分号，以及多行结构中的尾随逗号。组件和接口使用 PascalCase，如 `FigmaAdminApp`、`AuthState`；函数和变量使用 camelCase，如 `formatMoney`；常量使用大写蛇形命名，如 `STATUS_TEXT`。

API 逻辑应保留在 `src/api/`，业务数据结构优先复用 `src/types.ts`，避免重复定义。项目暂未配置格式化或 lint 工具，因此修改时应严格匹配周边代码风格并保持导入清晰有序。

## 测试规范

当前未配置测试框架或覆盖率要求。每次修改后运行 `npm run build`，并在 Mock 模式下手动验证受影响的路由。至少检查加载、空数据、成功和错误状态。视觉改动应与 `docs/design/implementation/` 中对应的 `implementation-*.png` 截图比对。

若新增自动化测试，测试文件与源码就近放置，并命名为 `*.test.ts` 或 `*.test.tsx`，同时在 `package.json` 中添加对应测试脚本。

## 提交与 Pull Request 规范

当前工作区不包含可用的 Git 历史，无法提取既有提交约定。请使用简短、祈使语气的提交标题，可采用 Conventional Commits 前缀，例如 `fix: preserve order filters`。每个提交只处理一个明确主题。

Pull Request 应说明用户可见的变化、列出验证步骤并关联相关 Issue。UI 改动需附修改前后截图。涉及 `public/config.js`、身份认证或 CloudBase 行为时必须特别说明；禁止提交真实环境凭据或会话令牌。
