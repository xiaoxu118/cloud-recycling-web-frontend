import type { Category, CategoryGroup, Order, RecycleSettings, StaffRecord, SystemSetting, UserRecord } from "../types";

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
  { _id: "c1", name: "纸箱", unit: "kg", priceRef: "0.8元/kg起", sortOrder: 1, enabled: true },
  { _id: "c2", name: "塑料瓶", unit: "kg", priceRef: "1.2元/kg起", sortOrder: 2, enabled: true },
  { _id: "c3", name: "旧家电", unit: "件", priceRef: "现场估价", sortOrder: 3, enabled: false },
];
let categoryGroups: CategoryGroup[] = [
  { _id: "default", name: "回收品类", description: "小程序当前展示的全部可回收品类", sortOrder: 0, enabled: true },
];

let settings: RecycleSettings = {
  key: "recycle_rules",
  minWeightKg: 5,
  minCount: 0,
  photoOrderCheckMinQuantity: false,
  updateTime: Date.now() - 3 * 24 * 60 * 60 * 1000,
};

let systemSettings: SystemSetting[] = [
  { key: "service_phone", label: "客服电话", type: "text", value: "400-800-1234", description: "小程序首页展示及拨打的客服电话" },
];

// Mock 仅用于显式的 ?mock=1 本地预览；生产环境始终调用云函数。
let staff: StaffRecord[] = [];
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
      recyclerOpenid: assignedStaff.openid,
      recyclerName: assignedStaff.name,
      recyclerPhone: assignedStaff.phone,
      assignedAt: Date.now(),
      updateTime: Date.now(),
    } : item);
    return orders.find((item) => item._id === data.orderId) as T;
  }
  if (type === "adminListCategories") return categories as T;
  if (type === "adminListCategoryGroups") return categoryGroups as T;
  if (type === "adminSaveCategoryGroup") {
    const group = data.group as CategoryGroup;
    if (group._id) categoryGroups = categoryGroups.map((item) => item._id === group._id ? group : item);
    else categoryGroups = [...categoryGroups, { ...group, _id: `g${Date.now()}` }];
    return group as T;
  }
  if (type === "adminSaveCategory") {
    const category = data.category as Category;
    if (category._id) categories = categories.map((item) => item._id === category._id ? category : item);
    else categories = [...categories, { ...category, _id: `c${Date.now()}` }];
    return undefined as T;
  }
  if (type === "adminGetSettings") return settings as T;
  if (type === "adminSaveSettings") {
    settings = { ...(data.settings as RecycleSettings), key: "recycle_rules", updateTime: Date.now() };
    return settings as T;
  }
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
  if (type === "adminListUsers") return users as T;
  if (type === "adminListStaff") return staff as T;
  if (type === "adminSaveStaff") {
    const item = data.staff as StaffRecord;
    if (item._id) staff = staff.map((current) => current._id === item._id ? item : current);
    else staff = [{ ...item, _id: `staff-${Date.now()}` }, ...staff];
    return item as T;
  }
  throw new Error(`本地预览未实现接口：${type}`);
}
