# 设计说明

## 设计来源

后台界面基于 Figma「废品回收后台管理系统」设计稿实现。原始设计地址：

<https://www.figma.com/design/HuhRXYYWhknyphP6n3nL6E/%E5%BA%9F%E5%93%81%E5%9B%9E%E6%94%B6%E5%90%8E%E5%8F%B0%E7%AE%A1%E7%90%86%E7%B3%BB%E7%BB%9Fv1.0>

Figma 导出文件和视觉对比截图仅作为本地开发参考，不纳入版本控制。生产界面实现在 `src/figma/FigmaAdmin.tsx`，相关样式位于 `src/figma/styles/`。

## 设计范围

已实现订单管理、订单详情、人员管理、品类管理、数据分析、系统设置，以及 Excel 导入弹窗。登录页沿用云回收现有设计，与后台 Figma 样式隔离。

界面以 1440 × 720 桌面视口作为主要视觉基准，保持设计稿中的布局、间距、字体层级、颜色、边框、圆角、阴影、图标及交互状态。业务数据来自 CloudBase 或本地 Mock，数据内容不同不视为视觉偏差。

## 实现约束

- 生产功能必须使用真实接口数据，不得保留 Figma 示例数据作为业务结果。
- 没有后端接口的原型控件应明确提示暂不可用，不应伪造保存成功。
- 登录样式必须保持独立，避免后台全局样式影响扫码登录页面。
- UI 调整后需在 Mock 模式下检查导航、表格、抽屉、弹窗、表单及空状态。
- 提交前运行 `npm run build`，确保 TypeScript 检查和生产构建通过。

## 数据对应关系

- 订单：`adminListOrders`、`adminGetOrderDetail`、`adminUpdateOrder`
- 品类：`adminListCategories`、`adminSaveCategory`
- 系统设置：`adminGetSettings`、`adminSaveSettings`
- 数据分析：根据当前订单记录计算
- 人员：当前从订单中的回收员信息汇总，后端暂无独立人员接口
