import type { Category, Order, RecycleSettings, StaffRecord, SystemSetting, UserRecord } from "../types";

let orders: Order[] = [
  {
    _id: "mock-order-1",
    orderNo: "20260716001842",
    source: "category",
    summary: "纸箱 约12kg 等2类",
    status: "submitted",
    addressSnapshot: { contactName: "王女士", phone: "138****4821", region: "上海市 浦东新区", detail: "张江路 88 号" },
    appointDate: "2026-07-17",
    appointSlot: "09:00-12:00",
    items: [{ categoryName: "纸箱", unit: "kg", estWeight: 12 }],
    remark: "到了请先电话联系",
    createTime: Date.now() - 35 * 60 * 1000,
    updateTime: Date.now() - 35 * 60 * 1000,
  },
  {
    _id: "mock-order-2",
    orderNo: "20260715009631",
    source: "photo",
    summary: "拍照提交 3张",
    status: "processing",
    addressSnapshot: { contactName: "李先生", phone: "186****2310", region: "上海市 闵行区", detail: "虹桥路 1200 号" },
    appointDate: "2026-07-16",
    appointSlot: "12:00-18:00",
    estimatePrice: 86,
    recyclerName: "陈师傅",
    recyclerPhone: "13900001234",
    adminRemark: "用户希望下午三点后上门",
    createTime: Date.now() - 24 * 60 * 60 * 1000,
    updateTime: Date.now() - 2 * 60 * 60 * 1000,
  },
  {
    _id: "mock-order-3",
    orderNo: "20260714005208",
    source: "category",
    summary: "旧家电 2件",
    status: "completed",
    addressSnapshot: { contactName: "周女士", phone: "137****9206", region: "上海市 静安区", detail: "江宁路 306 号" },
    appointDate: "2026-07-15",
    appointSlot: "09:00-12:00",
    finalCount: 2,
    finalPrice: 160,
    recyclerName: "张师傅",
    recyclerPhone: "13800001000",
    createTime: Date.now() - 2 * 24 * 60 * 60 * 1000,
    updateTime: Date.now() - 24 * 60 * 60 * 1000,
    completedAt: Date.now() - 24 * 60 * 60 * 1000,
  },
];

let categories: Category[] = [
  { _id: "paper", parentId: null, name: "纸类", unit: "kg", priceRef: "", fieldEstimate: false, sortOrder: 1, enabled: true },
  { _id: "c1", parentId: "paper", name: "纸箱", unit: "kg", priceRef: "0.8-1.0 元/kg", fieldEstimate: false, sortOrder: 1, enabled: true },
  { _id: "plastic", parentId: null, name: "塑料", unit: "kg", priceRef: "", fieldEstimate: false, sortOrder: 2, enabled: true },
  { _id: "c2", parentId: "plastic", name: "塑料瓶", unit: "kg", priceRef: "1.2-1.5 元/kg", fieldEstimate: false, sortOrder: 1, enabled: true },
  { _id: "appliance", parentId: null, name: "家电", unit: "件", priceRef: "", fieldEstimate: false, sortOrder: 3, enabled: true },
  { _id: "c3", parentId: "appliance", name: "旧家电", unit: "件", priceRef: "现场估价", fieldEstimate: true, sortOrder: 1, enabled: false },
];

let settings: RecycleSettings = {
  key: "recycle_rules",
  photoOrderCheckMinQuantity: false,
  updateTime: Date.now() - 3 * 24 * 60 * 60 * 1000,
};

let systemSettings: SystemSetting[] = [
  { key: "service_phone", label: "客服电话", type: "text", value: "400-800-1234", description: "小程序首页展示及拨打的客服电话" },
  { key: "user_agreement", label: "用户协议", type: "longtext", value: "", description: "小程序登录页展示，用户点击《用户协议》弹窗内容" },
  { key: "privacy_policy", label: "隐私政策", type: "longtext", value: "", description: "小程序登录页展示，用户点击《隐私政策》弹窗内容" },
  { key: "terms_of_service", label: "服务条款", type: "longtext", value: "", description: "小程序下单页展示，用户点击《来卖吧上门服务条款》弹窗内容" },
];

// Mock 仅用于显式的 ?mock=1 本地预览；生产环境始终调用云函数。
const staff: StaffRecord[] = [];
const users: UserRecord[] = [];

export const isDevPreview = () =>
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("mock") === "1";

export async function mockCall<T>(type: string, data: Record<string, unknown>): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  if (type === "adminListOrders") {
    const status = String(data.status || "");
    const keyword = String(data.keyword || "").toLowerCase();
    const filtered = orders.filter((item) => (!status || item.status === status) && (!keyword || item.orderNo.toLowerCase().includes(keyword)));
    return { list: filtered, total: filtered.length, hasMore: false } as T;
  }
  if (type === "adminGetOrderDetail") return orders.find((item) => item._id === data.id) as T;
  if (type === "adminUpdateOrder") {
    orders = orders.map((item) => item._id === data.id ? { ...item, ...data, status: data.status as Order["status"], updateTime: Date.now() } : item);
    return undefined as T;
  }
  if (type === "adminAssignOrderRecycler") {
    const assignedStaff = staff.find((item) => item._id === data.staffId && item.status === "online");
    if (!assignedStaff) throw new Error("STAFF_NOT_ONLINE");
    orders = orders.map((item) => item._id === data.orderId ? {
      ...item,
      status: item.status === "submitted" ? "processing" : item.status,
      recyclerId: assignedStaff._id,
      recyclerName: assignedStaff.name,
      recyclerPhone: assignedStaff.phone,
      assignedAt: Date.now(),
      updateTime: Date.now(),
    } : item);
    return orders.find((item) => item._id === data.orderId) as T;
  }
  if (type === "adminListCategories") return categories.filter((item)=>!item.deleted) as T;
  if (type === "adminDeleteCategory") {
    const pending=[String(data.id||"")];
    const deletedIds=new Set<string>();
    while(pending.length){
      const id=pending.shift()!;
      if(deletedIds.has(id))continue;
      deletedIds.add(id);
      categories.filter((item)=>item.parentId===id).forEach((item)=>item._id&&pending.push(item._id));
    }
    categories = categories.map((item)=>item._id&&deletedIds.has(item._id)?{...item,deleted:true,deletedAt:Date.now(),enabled:false}:item);
    return { id: data.id } as T;
  }
  if (type === "adminSaveCategory") {
    const input = data.category as Category;
    if (categories.some((item) => !item.deleted && item._id !== input._id && item.name.trim().toLowerCase() === input.name.trim().toLowerCase())) {
      throw new Error("CATEGORY_NAME_DUPLICATE");
    }
    // 与云函数 adminSaveCategory 保持一致：priceRef 是自由文本，只做去空白 + 截断；
    // fieldEstimate 为 true 时强制写「现场估价」。
    const fieldEstimate = input.fieldEstimate === true;
    const category: Category = {
      ...input,
      fieldEstimate,
      priceRef: fieldEstimate ? "现场估价" : String(input.priceRef || "").trim().slice(0, 40),
    };
    if (category._id) categories = categories.map((item) => item._id === category._id ? category : item);
    else categories = [...categories, { ...category, _id: `c${Date.now()}` }];
    return undefined as T;
  }
  if (type === "adminGetSettings") return settings as T;
  if (type === "adminListSystemSettings") return systemSettings as T;
  if (type === "adminSaveSystemSetting") {
    const setting = data.setting as SystemSetting;
    systemSettings = [...systemSettings.filter((item) => item.key !== setting.key), setting];
    return setting as T;
  }
  if (type === "adminDeleteSystemSetting") {
    systemSettings = systemSettings.filter((item) => item._id !== data.id);
    return undefined as T;
  }
  if (type === "adminListUsers") {
    const keyword = String(data.keyword || "").trim().toLowerCase();
    const page = Number(data.page) || 1;
    const pageSize = Number(data.pageSize) || 20;
    const matched = keyword
      ? users.filter((item) => [item.nickName, item.phone]
          .some((value) => String(value || "").toLowerCase().includes(keyword)))
      : users;
    const start = (page - 1) * pageSize;
    return {
      list: matched.slice(start, start + pageSize),
      total: matched.length,
      hasMore: start + pageSize < matched.length,
    } as T;
  }
  if (type === "adminListStaff") return staff as T;
  if (type === "adminPhoneLogin") {
    // 本地预览下直接放行，模拟 CloudBase SMS 已完成验证。
    return {
      sessionToken: `local-phone-${Date.now()}`,
      adminName: "本地管理员",
      role: "admin",
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    } as T;
  }
  if (type === "adminListInvites") {
    return { list: [], total: 0, hasMore: false } as T;
  }
  if (type === "adminInviteStat") {
    return { totalBound: 0, l1RewardedCount: 0, l2RewardedCount: 0, monthBound: 0, limitBlockedCount: 0, totalPoints: 0 } as T;
  }
  if (type === "adminInvalidateInvite") {
    return { revokedPoints: 0 } as T;
  }
  throw new Error(`本地预览未实现接口：${type}`);
}
