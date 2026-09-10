# 设计说明

## 设计来源

后台界面基于 Figma「废品回收后台管理系统」设计稿实现。原始设计地址：

<https://www.figma.com/design/HuhRXYYWhknyphP6n3nL6E/%E5%BA%9F%E5%93%81%E5%9B%9E%E6%94%B6%E5%90%8E%E5%8F%B0%E7%AE%A1%E7%90%86%E7%B3%BB%E7%BB%9Fv1.0>

Figma 导出文件和视觉对比截图仅作为本地开发参考，不纳入版本控制。生产界面实现在 `src/figma/FigmaAdmin.tsx`，相关样式位于 `src/figma/styles/`。

## 设计范围

已实现订单管理（列表 + 详情编辑）、人员管理（用户、成员、角色、评估员招募）、品类管理、积分管理（流水、积分商城、兑换单）、数据分析、投诉建议、系统设置。登录页沿用云回收现有设计，与后台 Figma 样式隔离。

> 早期版本的 Excel 批量导入弹窗（`ImportModal`）代码仍在仓库中但已无 UI 入口，属于死代码，详见 [AGENTS.md](./AGENTS.md)「死代码清单」。

界面以 1440 × 720 桌面视口作为主要视觉基准，保持设计稿中的布局、间距、字体层级、颜色、边框、圆角、阴影、图标及交互状态；同时兼容窄宽度下的卡片化呈现。业务数据来自 CloudBase 或本地 Mock，数据内容不同不视为视觉偏差。

## 实现约束

- 生产功能必须使用真实接口数据，不得保留 Figma 示例数据作为业务结果。
- 没有后端接口的原型控件应明确提示暂不可用，不应伪造保存成功。
- 登录样式必须保持独立，避免后台全局样式影响扫码登录页面。
- UI 调整后需在 Mock 模式下检查导航、表格、抽屉、弹窗、表单及空状态；注意 Mock 未覆盖成员/角色/积分/招募/投诉等页面，这些只能连真实环境验证。
- 提交前运行 `npm run build`，确保 TypeScript 检查和生产构建通过。

## 数据对应关系

- 订单：`adminListOrders`、`adminGetOrderDetail`、`adminUpdateOrder`、`adminAssignOrderRecycler`、`adminDeleteOrder`
- 品类：`adminListCategories`、`adminSaveCategory`、`adminDeleteCategory`
- 成员与角色：`adminListMembers`、`adminGetMemberDetail`、`adminSaveMember`、`adminToggleMemberStatus`、`adminListRoles`、`adminSaveRole`、`adminDeleteRole`、`adminGetAuthInfo`
- 用户：`adminListUsers`、`adminUserDetail`、`adminGetUserPoints`、`adminAdjustUserPoints`
- 评估员招募：`adminListStaffRecruits`、`adminUpdateStaffRecruit`、`adminDeleteStaffRecruit`
- 积分：`adminListPointsRecords`、`adminRegrantOrderPoints`
- 积分商城：`adminListPointsGoods`、`adminSavePointsGoods`、`adminTogglePointsGoods`、`adminListExchanges`、`adminVerifyExchange`、`adminShipExchange`
- 投诉建议：`adminListFeedbacks`（`adminUpdateFeedbackStatus` 后端已就绪，前端未接线）
- 系统设置：`adminListSystemSettings`、`adminSaveSystemSetting`、`adminDeleteSystemSetting`（旧 `adminGetSettings` / `adminSaveSettings` 仅死代码与 mock 引用）
- 数据分析：根据当前订单记录计算
