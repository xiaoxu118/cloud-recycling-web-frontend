import { Fragment, useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from "react";
import {
  Package, Settings, Tags, LogOut, Eye, EyeOff, X, Search,
  ChevronRight, RefreshCw, Plus, Phone, MapPin, User, ImageIcon,
  XCircle, Loader, Edit2, Trash2, ToggleLeft, ToggleRight,
  Bell, Database, Save, Users, GripVertical, ChevronDown, Check,
  AlarmClock, Lock, SlidersHorizontal, Store, ChevronUp, Columns3,
  Upload, FileSpreadsheet, Download, AlertCircle, Navigation,
  BarChart2, TrendingUp, CheckCircle2, Coins, ArrowUpRight, Shield, RotateCcw,
  Menu, Filter, MessageSquare, type LucideIcon,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { useLocation, useNavigate } from "react-router-dom";
import { callCloud, uploadSystemImage, cloudUrlToHttps, cloudUrlsToHttps } from "../api/cloud";
import type {
  AdminRecord,
  Category as CloudCategory,
  FeedbackListResult,
  FeedbackRecord,
  Order as CloudOrder,
  OrderListResult,
  OrderStatus as CloudOrderStatus,
  RecycleSettings,
  StaffRecord,
  SystemSetting,
  UserRecord,
} from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────
type Page = "orders" | "staff" | "cats" | "analytics" | "feedback" | "system";
type OrderStatus = "待上门" | "进行中" | "已完成" | "已取消";
type StaffStatus = "online" | "resting" | "resigned";
type BusinessOrderType = "recycle" | "furniture_demolition" | "shop_demolition";

interface Staff {
  id: string; name: string; phone: string; docId?: string; wechatBound?: boolean;
  status: StaffStatus; joinDate: string; area: string; store: string;
}
interface RecycleItem {
  id: string; name: string; unit: string;
  price: string; stationPrice: string;
  fieldEstimate?: boolean; enabled: boolean;
  categoryId?: string; parentId?: string | null; sortOrder?: number; priceRef?: string; showOnHome?: boolean;
  minVisitKg?: number;
}
interface CategoryNode extends RecycleItem {
  parentId: string | null;
  children: CategoryNode[];
}
interface RecycleGroup {
  id: string; name: string; desc: string;
  allowFieldEstimate?: boolean;
  items: RecycleItem[]; enabled: boolean; sortOrder?: number;
}
interface CategoryRootDraft {
  _id?: string; name: string; description?: string;
  sortOrder: number; enabled: boolean; allowFieldEstimate?: boolean;
}
interface Order {
  id: string; status: OrderStatus;
  userName: string; phone: string; address: string; description: string;
  appointmentTime: string; images: string[];
  recyclers: string[]; category: string; categoryNames?: string[]; weight: string;
  orderType?: BusinessOrderType;
  createdAt: string; completedAt?: string; lastModified: string; amount?: number;
  docId?: string;
  estimatePrice?: number | null; finalWeight?: number | null; finalCount?: number | null;
  recyclerPhone?: string; adminRemark?: string; cancelReason?: string;
}
interface ColDef { id: string; label: string; width: number; minWidth: number; fixed?: boolean; alwaysVisible?: boolean; }

export interface FigmaAdminProps {
  token: string;
  adminName: string;
  onLogout: () => void;
  onError: (error: unknown) => void;
  notify: (message: { kind: "success" | "error"; text: string }) => void;
}

const CLOUD_TO_FIGMA_STATUS: Record<CloudOrderStatus, OrderStatus> = {
  submitted: "待上门",
  processing: "进行中",
  completed: "已完成",
  canceled: "已取消",
};

const FIGMA_TO_CLOUD_STATUS: Record<OrderStatus, CloudOrderStatus> = {
  待上门: "submitted",
  进行中: "processing",
  已完成: "completed",
  已取消: "canceled",
};

const formatCloudTime = (value?: number | null) => {
  if (!value) return "—";
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

type LegacyRecycleSettings = RecycleSettings & {
  bannerImageFileId?: string;
  bannerImageUrl?: string;
};

const legacySettingsToSystemSettings = (settings: LegacyRecycleSettings): SystemSetting[] => [
  { _id:"virtual:home_banner", key:"home_banner", label:"首页 Banner", type:"image", value:settings.bannerImageFileId||"", imageUrl:settings.bannerImageUrl||"", description:"小程序首页顶部背景图", updateTime:settings.updateTime },
  { _id:"virtual:service_phone", key:"service_phone", label:"客服电话", type:"text", value:"400-800-1234", description:"首页展示及拨打的客服电话" },
  { _id:"virtual:map_key", key:"map_key", label:"腾讯地图 Key", type:"text", value:"", description:"腾讯位置服务 WebService Key" },
  { _id:"virtual:recycle_min_weight_kg", key:"recycle_min_weight_kg", label:"最低起收重量", type:"number", value:String(settings.minWeightKg??5), description:"单位：斤", updateTime:settings.updateTime },
  { _id:"virtual:recycle_min_count", key:"recycle_min_count", label:"最低起收件数", type:"number", value:String(settings.minCount??0), description:"设置为 0 表示不限制件数", updateTime:settings.updateTime },
  { _id:"virtual:photo_order_check_min_quantity", key:"photo_order_check_min_quantity", label:"拍照订单校验起收量", type:"boolean", value:String(settings.photoOrderCheckMinQuantity===true), description:"true 开启，false 关闭", updateTime:settings.updateTime },
  { _id:"virtual:user_agreement", key:"user_agreement", label:"用户协议", type:"longtext" as const, value:"", description:"小程序登录页展示，用户点击《用户协议》弹窗内容" },
  { _id:"virtual:privacy_policy", key:"privacy_policy", label:"隐私政策", type:"longtext" as const, value:"", description:"小程序登录页展示，用户点击《隐私政策》弹窗内容" },
  { _id:"virtual:terms_of_service", key:"terms_of_service", label:"服务条款", type:"longtext" as const, value:"", description:"小程序下单页展示，用户点击《帮帮回收上门服务条款》弹窗内容" },
];

const resolveBusinessOrderType = (order: Pick<CloudOrder,"source"|"orderType"|"demolition">): BusinessOrderType => {
  if(order.orderType)return order.orderType;
  if(order.source!=="demolition")return "recycle";
  return order.demolition?.scene==="business"?"shop_demolition":"furniture_demolition";
};

const ORDER_TYPE_LABEL: Record<BusinessOrderType,string> = {
  recycle:"上门回收",
  furniture_demolition:"家具拆除",
  shop_demolition:"商铺拆除",
};

function OrderTypeBadge({type}:{type?:BusinessOrderType}){
  const resolved=type||"recycle";
  const tone=resolved==="recycle"?"bg-green-50 text-green-700":resolved==="furniture_demolition"?"bg-amber-50 text-amber-700":"bg-blue-50 text-blue-700";
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${tone}`}>{ORDER_TYPE_LABEL[resolved]}</span>;
}

const cloudOrderToFigma = (order: CloudOrder): Order => {
  const address = order.addressSnapshot || {};
  const itemNames = order.source==="demolition"
    ? order.demolition?.items||[]
    : (order.items || []).map((item) => item.categoryName).filter(Boolean) as string[];
  const quantity = order.finalWeight
    ? `${order.finalWeight}kg`
    : order.finalCount
      ? `${order.finalCount}件`
      : order.items?.find((item) => item.estWeight)?.estWeight
        ? `约${order.items.find((item) => item.estWeight)?.estWeight}kg`
        : order.items?.find((item) => item.estCount)?.estCount
          ? `约${order.items.find((item) => item.estCount)?.estCount}件`
          : "—";
  return {
    id: order.orderNo,
    docId: order._id,
    status: CLOUD_TO_FIGMA_STATUS[order.status] || "待上门",
    orderType: resolveBusinessOrderType(order),
    userName: address.contactName || "未填写",
    phone: address.phone || "",
    address: [address.region, address.detail].filter(Boolean).join(" ") || "未填写地址",
    description: order.summary || order.remark || "暂无物品描述",
    appointmentTime: [order.appointDate, order.appointSlot].filter(Boolean).join(" ") || "待确认",
    images: cloudUrlsToHttps(order.photoUrls || []),
    recyclers: order.recyclerName ? [order.recyclerName] : [],
    category: itemNames.join("、") || (order.source === "photo" ? "拍照提交" : "其他"),
    categoryNames: itemNames.length ? itemNames : [order.source === "photo" ? "拍照提交" : "其他"],
    weight: quantity,
    createdAt: formatCloudTime(order.createTime),
    completedAt: order.completedAt ? formatCloudTime(order.completedAt) : undefined,
    lastModified: formatCloudTime(order.updateTime || order.createTime),
    amount: order.finalPrice == null ? undefined : Number(order.finalPrice),
    estimatePrice: order.estimatePrice,
    finalWeight: order.finalWeight,
    finalCount: order.finalCount,
    recyclerPhone: order.recyclerPhone,
    adminRemark: order.adminRemark,
    cancelReason: order.cancelReason,
  };
};

const priceFromReference = (value?: string) => {
  const match = String(value || "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]).toFixed(2) : "—";
};

// 展示层过滤：去掉数据库里可能存在的末尾『起』字（如「1.5 元/斤起」→「1.5 元/斤」）。
// 与 miniprogram/pages/category/index.js 中的处理一致，让两边看到同样的参考价格。
const stripTrailingQi = (s?: string) => String(s || "").replace(/起$/, "");

const categoryToItem = (item: CloudCategory): RecycleItem => {
  const priceRef = stripTrailingQi(item.priceRef);
  const price = priceFromReference(priceRef);
  return {
    id: item._id || item.name,
    categoryId: item._id,
    parentId: item.parentId || null,
    name: item.name,
    unit: item.unit,
    price,
    stationPrice: "—",
    priceRef,
    sortOrder: item.sortOrder,
    fieldEstimate: price === "—",
    enabled: item.enabled,
    showOnHome: !item.parentId && item.showOnHome !== false,
    minVisitKg: item.minVisitKg,
  };
};

const compareCategoryNodes = (a: CategoryNode, b: CategoryNode) =>
  (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, "zh-CN");

const categoriesToTree = (categories: CloudCategory[]): CategoryNode[] => {
  const nodes = new Map<string, CategoryNode>();
  categories.forEach((category) => {
    const item = categoryToItem(category);
    nodes.set(item.id, { ...item, parentId: item.parentId || null, children: [] });
  });

  const roots: CategoryNode[] = [];
  nodes.forEach((node) => {
    if (!node.parentId || node.parentId === node.id || !nodes.has(node.parentId)) {
      roots.push(node);
      return;
    }
    const visited = new Set([node.id]);
    let parentId: string | null = node.parentId;
    let cyclic = false;
    while (parentId) {
      if (visited.has(parentId)) {
        cyclic = true;
        break;
      }
      visited.add(parentId);
      parentId = nodes.get(parentId)?.parentId || null;
    }
    if (cyclic) roots.push(node);
    else nodes.get(node.parentId)?.children.push(node);
  });

  const sortTree = (items: CategoryNode[]) => {
    items.sort(compareCategoryNodes);
    items.forEach((item) => sortTree(item.children));
  };
  sortTree(roots);
  return roots;
};

const flattenCategoryTree = (nodes: CategoryNode[]): CategoryNode[] =>
  nodes.flatMap((node) => [node, ...flattenCategoryTree(node.children)]);

const categoryTreeToOrderGroups = (nodes: CategoryNode[]): RecycleGroup[] => nodes.map((node) => {
  const descendants = flattenCategoryTree(node.children);
  const items = descendants.length ? descendants : [node];
  return {
    id: node.id,
    name: node.name,
    desc: "主页展示品类",
    enabled: node.enabled,
    sortOrder: node.sortOrder,
    items,
  };
});

const categoriesToGroups = (categories: CloudCategory[]): RecycleGroup[] =>
  categoryTreeToOrderGroups(categoriesToTree(categories));

const filterCategoryTree = (nodes: CategoryNode[], keyword: string): CategoryNode[] => {
  const query = keyword.trim().toLowerCase();
  if (!query) return nodes;
  return nodes.flatMap((node) => {
    const children = filterCategoryTree(node.children, query);
    return node.name.toLowerCase().includes(query) || children.length
      ? [{ ...node, children }]
      : [];
  });
};

const staffFromCloud = (staff: StaffRecord[]): Staff[] => staff.map((item) => ({
  id: item.employeeNo,
  docId: item._id,
  wechatBound: item.wechatBound,
  name: item.name,
  phone: item.phone,
  status: item.status,
  joinDate: item.joinDate || "—",
  area: item.area || "—",
  store: item.store || "—",
}));

// ─── Initial Data ─────────────────────────────────────────────────────────────
const INIT_STAFF: Staff[] = [
  { id: "S001", name: "王建国", phone: "13901234567", status: "online",   joinDate: "2022-03-15", area: "朝阳区",   store: "朝阳旗舰店" },
  { id: "S002", name: "赵志远", phone: "15812345678", status: "online",   joinDate: "2022-06-01", area: "海淀区",   store: "海淀区店"   },
  { id: "S003", name: "刘铁柱", phone: "18623456789", status: "resting",  joinDate: "2021-11-20", area: "浦东新区", store: "浦东分店"   },
  { id: "S004", name: "孙大伟", phone: "13734567890", status: "online",   joinDate: "2023-01-10", area: "天河区",   store: "天河区店"   },
  { id: "S005", name: "张磊",   phone: "15645678901", status: "resigned", joinDate: "2022-08-05", area: "南山区",   store: "南山区店"   },
  { id: "S006", name: "李明",   phone: "17756789012", status: "online",   joinDate: "2023-04-22", area: "武侯区",   store: "武侯区店"   },
];

// Column widths shared across all category group tables for alignment
const CAT_COL_WIDTHS = [190, 60, 96, 96, 80, 100, 84];
const CAT_COL_HEADERS = ["二级品类","单位","收购单价","打包站价","差价","差价/收购价","状态"];

const INIT_GROUPS: RecycleGroup[] = [
  {
    id: "G1", name: "常见金属", desc: "各类废旧金属回收", enabled: true, allowFieldEstimate: false,
    items: [
      { id:"G1-1", name:"铜",     unit:"斤",  price:"48.00", stationPrice:"52.00", enabled:true  },
      { id:"G1-2", name:"铁",     unit:"斤",  price:"2.00",  stationPrice:"2.30",  enabled:true  },
      { id:"G1-3", name:"钢",     unit:"斤",  price:"2.50",  stationPrice:"2.80",  enabled:true  },
      { id:"G1-4", name:"铝",     unit:"斤",  price:"12.00", stationPrice:"13.50", enabled:true  },
      { id:"G1-5", name:"不锈钢", unit:"斤",  price:"6.00",  stationPrice:"6.80",  enabled:false },
    ],
  },
  {
    id: "G2", name: "纸制品", desc: "各类废纸回收", enabled: true, allowFieldEstimate: false,
    items: [
      { id:"G2-1", name:"书本",   unit:"kg", price:"0.60", stationPrice:"0.70", enabled:true },
      { id:"G2-2", name:"纸壳箱", unit:"kg", price:"0.80", stationPrice:"0.95", enabled:true },
      { id:"G2-3", name:"报纸",   unit:"kg", price:"0.70", stationPrice:"0.80", enabled:true },
      { id:"G2-4", name:"包装纸", unit:"kg", price:"0.50", stationPrice:"0.60", enabled:true },
    ],
  },
  {
    id: "G3", name: "塑料", desc: "各类废旧塑料回收", enabled: true, allowFieldEstimate: false,
    items: [
      { id:"G3-1", name:"矿泉水瓶", unit:"kg", price:"1.50", stationPrice:"1.80", enabled:true  },
      { id:"G3-2", name:"塑料桶",   unit:"kg", price:"1.20", stationPrice:"1.50", enabled:true  },
      { id:"G3-3", name:"PVC管材",  unit:"kg", price:"0.80", stationPrice:"1.00", enabled:true  },
      { id:"G3-4", name:"塑料薄膜", unit:"kg", price:"0.60", stationPrice:"0.75", enabled:false },
    ],
  },
  {
    id: "G4", name: "衣物", desc: "旧衣物纺织品回收", enabled: true, allowFieldEstimate: false,
    items: [
      { id:"G4-1", name:"旧衣服",   unit:"kg", price:"0.50", stationPrice:"0.60", enabled:true },
      { id:"G4-2", name:"床单被套", unit:"kg", price:"0.40", stationPrice:"0.50", enabled:true },
      { id:"G4-3", name:"鞋子",     unit:"双", price:"1.00", stationPrice:"1.20", enabled:true },
    ],
  },
  {
    id: "G5", name: "电子废品", desc: "废旧电子设备（现场估价）", enabled: true, allowFieldEstimate: true,
    items: [
      { id:"G5-1", name:"手机/平板",  unit:"台", price:"—",    stationPrice:"—",    fieldEstimate:true,  enabled:true },
      { id:"G5-2", name:"电脑主机",   unit:"台", price:"—",    stationPrice:"—",    fieldEstimate:true,  enabled:true },
      { id:"G5-3", name:"家用电器",   unit:"台", price:"—",    stationPrice:"—",    fieldEstimate:true,  enabled:true },
      { id:"G5-4", name:"电线电缆",   unit:"斤", price:"8.00", stationPrice:"9.50", fieldEstimate:false, enabled:true },
    ],
  },
  {
    id: "G6", name: "玻璃", desc: "废旧玻璃制品回收", enabled: false, allowFieldEstimate: false,
    items: [
      { id:"G6-1", name:"玻璃瓶", unit:"斤", price:"0.30", stationPrice:"0.35", enabled:false },
      { id:"G6-2", name:"玻璃板", unit:"斤", price:"0.20", stationPrice:"0.25", enabled:false },
    ],
  },
  {
    id: "G7", name: "其他", desc: "其他可回收废品", enabled: true, allowFieldEstimate: false,
    items: [],
  },
];

const INIT_ORDERS: Order[] = [
  { id:"202401150001", status:"待上门",  userName:"张明辉", phone:"13800123456", address:"北京市朝阳区望京街道望京SOHO T1楼 2301室",    description:"家里翻新，有废旧铁管和铝合金型材，另有铜线若干，约15公斤。", appointmentTime:"2024-01-15 09:00–11:00", images:["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=280&fit=crop","https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=400&h=280&fit=crop"], recyclers:["王建国"], category:"常见金属", weight:"约15斤", createdAt:"2024-01-14 16:32", lastModified:"2024-01-14 16:32" },
  { id:"202401150002", status:"进行中",  userName:"李秀英", phone:"15898765432", address:"上海市浦东新区陆家嘴金融贸易区世纪大道1501号", description:"清理仓库，大量纸箱和书本，约30公斤，方便取走报纸。",           appointmentTime:"2024-01-15 14:00–16:00", images:["https://images.unsplash.com/photo-1604187351574-c75ca79f5807?w=400&h=280&fit=crop"], recyclers:["赵志远","刘铁柱"], category:"纸制品",   weight:"约30斤", createdAt:"2024-01-15 08:10", lastModified:"2024-01-15 09:00" },
  { id:"202401150003", status:"进行中",  userName:"陈建平", phone:"18600234567", address:"广州市天河区珠江新城花城大道88号",             description:"旧电脑主机2台、显示器1台、键鼠若干，还有一部旧手机。",        appointmentTime:"2024-01-15 10:00–12:00", images:["https://images.unsplash.com/photo-1591193686104-fddba9b544a1?w=400&h=280&fit=crop","https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=400&h=280&fit=crop","https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=400&h=280&fit=crop"], recyclers:["刘铁柱"], category:"电子废品", weight:"约8斤",  createdAt:"2024-01-15 09:05", lastModified:"2024-01-15 10:30" },
  { id:"202401140021", status:"已完成",  userName:"王芳",   phone:"13955667788", address:"深圳市南山区科技园科苑路10号",                 description:"家里旧衣物一大袋，还有几箱矿泉水瓶，一起回收。",             appointmentTime:"2024-01-14 15:00–17:00", images:["https://images.unsplash.com/photo-1562077772-3bd90403f7f0?w=400&h=280&fit=crop"], recyclers:["孙大伟"], category:"塑料",     weight:"约22斤", createdAt:"2024-01-14 11:20", completedAt:"2024-01-14 17:10", lastModified:"2024-01-14 17:10", amount:26.40 },
  { id:"202401130018", status:"已完成",  userName:"周建军", phone:"13612349876", address:"北京市海淀区中关村大街1号",                   description:"废旧铜线一批，电脑主机一台，估计铜线有10公斤。",             appointmentTime:"2024-01-13 10:00–12:00", images:["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=280&fit=crop"], recyclers:["王建国","李明"], category:"常见金属", weight:"约10斤", createdAt:"2024-01-12 20:15", completedAt:"2024-01-13 11:45", lastModified:"2024-01-13 11:45", amount:530.00 },
  { id:"202401140019", status:"已取消",  userName:"刘洋",   phone:"17711223344", address:"成都市武侯区天府大道666号",                   description:"玻璃瓶若干，大约两箱，因搬家需尽快处理。",                   appointmentTime:"2024-01-14 09:00–11:00", images:[], recyclers:[], category:"玻璃",     weight:"—",     createdAt:"2024-01-13 20:44", lastModified:"2024-01-13 20:44" },
  { id:"202401160004", status:"待上门",  userName:"赵雪梅", phone:"13544332211", address:"杭州市西湖区文三路477号",                     description:"搬家整理出来的旧书和纸箱，约三四十公斤，请尽快上门。",       appointmentTime:"2024-01-16 13:00–15:00", images:["https://images.unsplash.com/photo-1567360425618-1594206637d2?w=400&h=280&fit=crop"], recyclers:[], category:"纸制品",   weight:"约40斤", createdAt:"2024-01-15 21:03", lastModified:"2024-01-15 21:03" },
  { id:"202401120010", status:"已完成",  userName:"吴晓峰", phone:"13011112222", address:"上海市静安区南京西路1788号",                   description:"旧家电：洗衣机1台、微波炉1台，另有废铁若干。",               appointmentTime:"2024-01-12 14:00–16:00", images:["https://images.unsplash.com/photo-1604187351574-c75ca79f5807?w=400&h=280&fit=crop"], recyclers:["赵志远"], category:"电子废品", weight:"约35斤", createdAt:"2024-01-11 18:30", completedAt:"2024-01-12 15:40", lastModified:"2024-01-12 15:40", amount:90.00 },
];

const INIT_COLS: ColDef[] = [
  { id:"id",              label:"订单号",   width:140, minWidth:120, alwaysVisible:true },
  { id:"status",          label:"状态",     width:100, minWidth:96  },
  { id:"orderType",       label:"订单类型", width:100, minWidth:92  },
  { id:"contact",         label:"联系人",   width:155, minWidth:130 },
  { id:"address",         label:"地址",     width:175, minWidth:120 },
  { id:"appointmentTime", label:"预约时间", width:165, minWidth:145 },
  { id:"images",          label:"图片",     width:118, minWidth:90  },
  { id:"summary",         label:"回收品类", width:230, minWidth:190 },
  { id:"recyclers",       label:"回收人员", width:168, minWidth:120 },
  { id:"lastModified",    label:"最后修改", width:118, minWidth:100 },

];

// ─── Shared row action buttons (unified size, page-adaptive layout) ────────────
type RowActionTone = "green" | "blue" | "red" | "gray";

const ROW_ACTION_ICON_SIZE = 11;
const ROW_ACTION_TONE_CLASS: Record<RowActionTone, string> = {
  green: "text-green-700 bg-green-50 border-green-200 hover:bg-green-100",
  blue: "text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100",
  red: "text-red-600 bg-red-50 border-red-200 hover:bg-red-100",
  gray: "text-gray-500 bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300",
};

/** Canonical size for table row actions across orders / staff / categories. */
const ROW_ACTION_SIZE_CLASS =
  "inline-flex items-center justify-center gap-1 rounded-md border font-medium transition-colors whitespace-nowrap " +
  "px-1.5 py-0.5 text-[10px] sm:px-2 sm:py-1 sm:text-xs";

function RowActionButton({
  tone,
  icon: Icon,
  children,
  onClick,
}: {
  tone: RowActionTone;
  icon: LucideIcon;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${ROW_ACTION_SIZE_CLASS} ${ROW_ACTION_TONE_CLASS[tone]}`}
    >
      <Icon size={ROW_ACTION_ICON_SIZE} className="shrink-0" />
      {children}
    </button>
  );
}

/** stack = fill narrow action columns; inline = wrap in wider cells. */
function RowActions({
  layout = "stack",
  children,
}: {
  layout?: "stack" | "inline";
  children: ReactNode;
}) {
  if (layout === "inline") {
    return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
  }
  return <div className="flex w-full min-w-0 flex-col gap-1 [&_button]:w-full">{children}</div>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// 四态状态色板：与小程序端 app.wxss 的 --status-* token 保持同一套色值
const STATUS_CFG: Record<OrderStatus, { color:string; bg:string; dot:string }> = {
  待上门: { color:"text-[#B25B00]", bg:"bg-[#FEF0E1] border border-[#F7D9B5]", dot:"bg-[#F59E0B]" },
  进行中: { color:"text-[#1D4ED8]", bg:"bg-[#E3EDFF] border border-[#BFD4FF]", dot:"bg-[#3B82F6]" },
  已完成: { color:"text-[#166534]", bg:"bg-[#E3F4E8] border border-[#BEE3C8]", dot:"bg-[#22C55E]" },
  已取消: { color:"text-[#5B6770]", bg:"bg-[#EEF1F4] border border-[#D8DEE4]", dot:"bg-[#9CA3AF]" },
};
const STAFF_CFG: Record<StaffStatus,{ label:string; color:string; bg:string; dot:string; next:StaffStatus }> = {
  online:   { label:"在线", color:"text-green-700", bg:"bg-green-50 border border-green-200",  dot:"bg-green-500", next:"resting"  },
  resting:  { label:"休息", color:"text-amber-700", bg:"bg-amber-50 border border-amber-200",  dot:"bg-amber-400", next:"resigned" },
  resigned: { label:"离职", color:"text-gray-500",  bg:"bg-gray-50 border border-gray-200",    dot:"bg-gray-400",  next:"online"   },
};

function maskPhone(p: string) {
  const d = p.replace(/\D/g,""); return d.length < 7 ? d : d.slice(0,3)+"****"+d.slice(-4);
}
function maskName(n: string) {
  if (n.length <= 1) return n;
  if (n.length === 2) return n[0]+"*";
  return n[0]+"*".repeat(n.length-2)+n[n.length-1];
}
function nowStr() {
  const d=new Date(), p=(n:number)=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function genOrderId(orders: Order[]) {
  const n=new Date(), p=(x:number)=>String(x).padStart(2,"0");
  const prefix=`${n.getFullYear()}${p(n.getMonth()+1)}${p(n.getDate())}`;
  const cnt=orders.filter(o=>o.id.startsWith(prefix)).length;
  return `${prefix}${String(cnt+1).padStart(4,"0")}`;
}
function parseDate(s?:string){ return s ? new Date(s.slice(0,10)) : null; }
function spread(buy:string, station:string) {
  const b=parseFloat(buy), s=parseFloat(station);
  if (isNaN(b)||isNaN(s)) return null;
  return (s-b).toFixed(2);
}

// ─── Status Badges ────────────────────────────────────────────────────────────
function StatusBadge({ status }:{ status:OrderStatus }) {
  const c=STATUS_CFG[status];
  return <span className={`inline-flex whitespace-nowrap items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.color} ${c.bg}`}><span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`}/>{status}</span>;
}
function StaffBadge({ status }:{ status:StaffStatus }) {
  const c=STAFF_CFG[status];
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.color} ${c.bg}`}><span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`}/>{c.label}</span>;
}

// ─── Image thumb with hover zoom ──────────────────────────────────────────────
function ImageThumb({ src, onClick }:{ src:string; onClick:()=>void }) {
  const [hovered,setHovered]=useState(false);
  return (
    <div className="relative" onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}>
      <button onClick={onClick} className="w-8 h-8 rounded-lg overflow-hidden border-2 border-white bg-gray-100 block"><img src={src} alt="" className="w-full h-full object-cover"/></button>
      {hovered && <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 h-32 rounded-xl overflow-hidden shadow-2xl border-2 border-white pointer-events-none"><img src={src} alt="" className="w-full h-full object-cover"/></div>}
    </div>
  );
}

// ─── Recycler pills + select ──────────────────────────────────────────────────
const PILL_COLORS=["bg-green-100 text-green-800 border-green-200","bg-blue-100 text-blue-800 border-blue-200","bg-violet-100 text-violet-800 border-violet-200","bg-amber-100 text-amber-800 border-amber-200","bg-pink-100 text-pink-800 border-pink-200","bg-cyan-100 text-cyan-800 border-cyan-200"];
function pillColor(name:string,staff:Staff[]){ const i=staff.findIndex(s=>s.name===name); return PILL_COLORS[(i<0?0:i)%PILL_COLORS.length]; }
function RecyclerPills({ recyclers,staff }:{ recyclers:string[];staff:Staff[] }) {
  if (!recyclers.length) return <span className="text-xs text-gray-300">未分配</span>;
  return <div className="flex flex-wrap gap-1">{recyclers.map(n=><span key={n} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${pillColor(n,staff)}`}>{n}</span>)}</div>;
}
function RecyclerSelect({ value,onChange,staff }:{ value:string[];onChange:(v:string[])=>void;staff:Staff[] }) {
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false);};
    document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h);
  },[]);
  const toggle=(name:string)=>onChange(value.includes(name)?value.filter(n=>n!==name):[...value,name]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={()=>setOpen(v=>!v)} className="min-w-[160px] flex items-center gap-1.5 flex-wrap px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm hover:border-green-400 transition-all text-left">
        {value.length===0?<span className="text-gray-400 text-sm">选择回收人员</span>:value.map(n=><span key={n} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${pillColor(n,staff)}`}>{n}</span>)}
        <ChevronDown size={12} className="ml-auto text-gray-400 flex-shrink-0"/>
      </button>
      {open && <div className="absolute z-50 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-1 max-h-52 overflow-y-auto">
        {staff.filter(s=>s.status==="online").map(s=>{
          const checked=value.includes(s.name);
          return <button key={s.id} type="button" onClick={()=>toggle(s.name)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm text-left transition-colors">
            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked?"bg-green-600 border-green-600":"border-gray-300"}`}>{checked&&<Check size={10} className="text-white"/>}</div>
            <span className="text-gray-700">{s.name}</span><span className="text-xs text-gray-400 ml-auto">{s.store}</span>
          </button>;
        })}
        {staff.filter(s=>s.status==="online").length===0&&<p className="text-xs text-gray-400 px-3 py-4 text-center">暂无在线人员</p>}
      </div>}
    </div>
  );
}

function AssignRecyclerModal({order,staff,onAssign,onClose}:{order:Order;staff:Staff[];onAssign:(staff:Staff)=>Promise<void>;onClose:()=>void}) {
  const [savingId,setSavingId]=useState("");
  const onlineStaff=staff.filter((item)=>item.status==="online");
  const assign=async(item:Staff)=>{
    setSavingId(item.id);
    try{
      await onAssign(item);
      onClose();
    }finally{
      setSavingId("");
    }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center"><button className="absolute inset-0 bg-black/40" onClick={onClose}/><div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden"><div className="flex items-center justify-between px-6 py-4 border-b border-gray-100"><div><h2 className="font-semibold text-gray-900">分配回收人员</h2><p className="text-xs text-gray-400 mt-1">订单 {order.id} · 仅显示在线工作人员</p></div><button onClick={onClose}><X size={18} className="text-gray-400"/></button></div><div className="p-4 max-h-[55vh] overflow-y-auto space-y-2">{onlineStaff.map((item)=><button key={item.id} disabled={Boolean(savingId)} onClick={()=>void assign(item)} className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 text-left hover:border-green-300 hover:bg-green-50/50 transition-all disabled:opacity-50"><div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold" style={{background:"linear-gradient(135deg,#1a7a3c,#27ae60)"}}>{item.name[0]}</div><div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-800">{item.name}</p><p className="text-xs text-gray-400 mt-0.5">{item.store} · {item.area}</p></div><span className="text-xs font-mono text-gray-500">{item.phone}</span>{savingId===item.id?<Loader size={15} className="animate-spin text-green-600"/>:<ChevronRight size={15} className="text-gray-300"/>}</button>)}{onlineStaff.length===0&&<div className="py-10 text-center"><Users size={30} className="mx-auto text-gray-200 mb-2"/><p className="text-sm text-gray-400">暂无在线工作人员</p></div>}</div><div className="px-6 py-3 border-t border-gray-100 bg-gray-50 text-right"><button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">取消</button></div></div></div>;
}

// ─── Image Preview Modal ──────────────────────────────────────────────────────
function ImagePreviewModal({ images,initialIndex,onClose }:{ images:string[];initialIndex:number;onClose:()=>void }) {
  const [idx,setIdx]=useState(initialIndex);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm"/>
      <div className="relative z-10 max-w-3xl w-full mx-4" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-white text-sm font-medium">图片预览 {idx+1}/{images.length}</span>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X size={22}/></button>
        </div>
        <div className="bg-gray-900 rounded-xl overflow-hidden"><img src={images[idx]} alt="" className="w-full max-h-[70vh] object-contain"/></div>
        {images.length>1&&<div className="flex gap-2 mt-3 justify-center">{images.map((img,i)=>(<button key={i} onClick={()=>setIdx(i)} className={`w-14 h-10 rounded-lg overflow-hidden border-2 transition-all ${i===idx?"border-green-400":"border-transparent opacity-50 hover:opacity-80"}`}><img src={img} alt="" className="w-full h-full object-cover"/></button>))}</div>}
      </div>
    </div>
  );
}

// ─── New Order Modal ──────────────────────────────────────────────────────────
function NewOrderModal({ onSave,onClose,staff,groups,orders }:{ onSave:(o:Order)=>void;onClose:()=>void;staff:Staff[];groups:RecycleGroup[];orders:Order[] }) {
  const [form,setForm]=useState({ userName:"",phone:"",address:"",description:"",category:"",weight:"",appointmentDate:"",appointmentSlot:"09:00–11:00",recyclers:[] as string[] });
  const [errors,setErrors]=useState<Record<string,string>>({});
  const set=(k:string,v:string|string[])=>setForm(f=>({...f,[k]:v}));
  const slots=["09:00–11:00","11:00–13:00","13:00–15:00","15:00–17:00","17:00–19:00"];
  function validate() {
    const e:Record<string,string>={};
    if(!form.userName.trim()) e.userName="请填写用户名";
    if(!form.phone.trim()||form.phone.length<11) e.phone="请填写正确的手机号";
    if(!form.address.trim()) e.address="请填写地址";
    if(!form.category) e.category="请选择品类";
    if(!form.appointmentDate) e.appointmentDate="请选择预约日期";
    setErrors(e); return Object.keys(e).length===0;
  }
  function handleSave() {
    if(!validate()) return;
    const now=nowStr();
    onSave({
      id: genOrderId(orders), status:"待上门",
      userName:form.userName, phone:form.phone, address:form.address,
      description:form.description, category:form.category, weight:form.weight||"待确认",
      appointmentTime:`${form.appointmentDate} ${form.appointmentSlot}`,
      images:[], recyclers:form.recyclers,
      createdAt:now, lastModified:now,
    });
  }
  const inp="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-50 transition-all";
  const err=(k:string)=>errors[k]?<p className="text-xs text-red-500 mt-1">{errors[k]}</p>:null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"/>
      <div className="relative z-10 w-full max-w-xl mx-4 bg-white rounded-2xl shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">新建订单</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[72vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-gray-500 mb-1.5">用户名 <span className="text-red-400">*</span></label>
              <input value={form.userName} onChange={e=>set("userName",e.target.value)} placeholder="请输入用户名" className={`${inp} ${errors.userName?"border-red-300":"border-gray-200"}`}/>{err("userName")}</div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1.5">联系电话 <span className="text-red-400">*</span></label>
              <input value={form.phone} onChange={e=>set("phone",e.target.value.replace(/\D/g,""))} maxLength={11} placeholder="11位手机号" className={`${inp} font-mono ${errors.phone?"border-red-300":"border-gray-200"}`}/>{err("phone")}</div>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1.5">回收地址 <span className="text-red-400">*</span></label>
            <textarea value={form.address} onChange={e=>set("address",e.target.value)} rows={2} placeholder="省市区街道门牌号" className={`${inp} resize-none ${errors.address?"border-red-300":"border-gray-200"}`}/>{err("address")}</div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1.5">物品摘要</label>
            <textarea value={form.description} onChange={e=>set("description",e.target.value)} rows={2} placeholder="描述需要回收的物品（选填）" className={`${inp} resize-none border-gray-200`}/></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-gray-500 mb-1.5">品类 <span className="text-red-400">*</span></label>
              <select value={form.category} onChange={e=>set("category",e.target.value)} className={`${inp} bg-white ${errors.category?"border-red-300":"border-gray-200"}`}>
                <option value="">选择品类</option>
                {groups.filter(g=>g.enabled).map(g=>(
                  <optgroup key={g.id} label={g.name}>
                    {g.items.filter(i=>i.enabled).map(item=>(<option key={item.id} value={`${g.name}·${item.name}`}>{item.name}</option>))}
                  </optgroup>
                ))}
              </select>{err("category")}</div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1.5">预估重量</label>
              <input value={form.weight} onChange={e=>set("weight",e.target.value)} placeholder="如：约20kg" className={`${inp} border-gray-200`}/></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-gray-500 mb-1.5">预约日期 <span className="text-red-400">*</span></label>
              <input type="date" value={form.appointmentDate} onChange={e=>set("appointmentDate",e.target.value)} className={`${inp} ${errors.appointmentDate?"border-red-300":"border-gray-200"}`}/>{err("appointmentDate")}</div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1.5">时间段</label>
              <select value={form.appointmentSlot} onChange={e=>set("appointmentSlot",e.target.value)} className={`${inp} bg-white border-gray-200`}>
                {slots.map(s=><option key={s}>{s}</option>)}
              </select></div>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1.5">指定回收人员（选填）</label>
            <RecyclerSelect value={form.recyclers} onChange={v=>set("recyclers",v as any)} staff={staff}/></div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-all">取消</button>
          <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{background:"linear-gradient(135deg,#1a7a3c,#27ae60)"}}>
            <Plus size={14}/>创建订单
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Order Edit Modal ─────────────────────────────────────────────────────────
function OrderEditModal({ order,onSave,onClose }:{ order:Order;onSave:(o:Order)=>void;onClose:()=>void }) {
  const [form,setForm]=useState({...order});
  const statuses:OrderStatus[]=["待上门","进行中","已完成","已取消"];
  const set=<K extends keyof Order>(k:K,v:Order[K])=>setForm(f=>({...f,[k]:v}));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"/>
      <div className="relative z-10 w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div><h2 className="font-semibold text-gray-900">编辑订单</h2><p className="text-xs text-gray-400 font-mono mt-0.5">{order.id}</p></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[68vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-gray-500 mb-1.5">用户名</label>
              <input value={form.userName} onChange={e=>set("userName",e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-50 transition-all"/></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1.5">联系电话</label>
              <input value={form.phone} onChange={e=>set("phone",e.target.value.replace(/\D/g,""))} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono outline-none focus:border-green-400 focus:ring-2 focus:ring-green-50 transition-all"/></div>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1.5">地址</label>
            <textarea value={form.address} onChange={e=>set("address",e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-50 transition-all resize-none"/></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1.5">物品摘要</label>
            <textarea value={form.description} onChange={e=>set("description",e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-50 transition-all resize-none"/></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-gray-500 mb-1.5">预约时间</label>
              <input value={form.appointmentTime} onChange={e=>set("appointmentTime",e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-50 transition-all"/></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1.5">状态</label>
              <select value={form.status} onChange={e=>set("status",e.target.value as OrderStatus)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-400 bg-white transition-all">
                {statuses.map(s=><option key={s}>{s}</option>)}
              </select></div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-all">取消</button>
          <button onClick={()=>onSave({...form,lastModified:nowStr()})} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{background:"linear-gradient(135deg,#1a7a3c,#27ae60)"}}>
            <Save size={14}/>保存修改
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Order Detail Panel ───────────────────────────────────────────────────────
function OrderDetailPanel({ order,staff,onClose }:{ order:Order;staff:Staff[];onClose:()=>void }) {
  const [previewIdx,setPreviewIdx]=useState<number|null>(null);
  const [showContact,setShowContact]=useState(false);
  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20"/>
      <div className="relative w-full max-w-[460px] bg-white h-full shadow-2xl overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div><h2 className="text-base font-semibold text-gray-900">订单详情</h2><p className="text-xs text-gray-400 font-mono mt-0.5">{order.id}</p></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="flex items-center gap-3"><StatusBadge status={order.status}/><span className="text-xs text-gray-400">创建于 {order.createdAt}</span></div>
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">联系人信息</h3>
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0"><User size={14} className="text-green-700"/></div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400">用户名 / 联系电话</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{showContact?order.userName:maskName(order.userName)}</p>
                      <p className="text-xs font-mono text-gray-500">{showContact?order.phone:maskPhone(order.phone)}</p>
                    </div>
                    <button onClick={()=>setShowContact(v=>!v)} className="text-gray-400 hover:text-green-600 transition-colors ml-1">{showContact?<EyeOff size={14}/>:<Eye size={14}/>}</button>
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5"><MapPin size={14} className="text-orange-700"/></div>
                <div><p className="text-xs text-gray-400">回收地址</p><p className="text-sm font-medium text-gray-800 leading-relaxed">{order.address}</p></div>
              </div>
            </div>
          </section>
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">物品摘要</h3>
            <div className="bg-gray-50 rounded-xl p-4"><p className="text-sm text-gray-700 leading-relaxed">{order.description||"暂无描述"}</p></div>
          </section>
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">订单信息</h3>
            <div className="grid grid-cols-2 gap-3">
              {[["预约时间",order.appointmentTime],["废品品类",order.category],["预估重量",order.weight],["最后修改",order.lastModified]].map(([l,v])=>(
                <div key={l} className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400 mb-1">{l}</p><p className="text-sm font-medium text-gray-800">{v}</p></div>
              ))}
            </div>
            <div className="bg-gray-50 rounded-xl p-3 mt-3"><p className="text-xs text-gray-400 mb-2">回收人员</p><RecyclerPills recyclers={order.recyclers} staff={staff}/></div>
          </section>
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">用户上传图片</h3>
            {order.images.length===0?<div className="bg-gray-50 rounded-xl py-8 flex flex-col items-center gap-2 text-gray-300"><ImageIcon size={32}/><p className="text-sm">暂无图片</p></div>
            :<div className="grid grid-cols-3 gap-2">{order.images.map((img,i)=>(<button key={i} onClick={()=>setPreviewIdx(i)} className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100"><img src={img} alt="" className="w-full h-full object-cover"/><div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"><Eye size={18} className="text-white"/></div></button>))}</div>}
          </section>
        </div>
      </div>
      {previewIdx!==null&&<ImagePreviewModal images={order.images} initialIndex={previewIdx} onClose={()=>setPreviewIdx(null)}/>}
    </div>
  );
}

// ─── Auto-accept Modal ────────────────────────────────────────────────────────
function AutoAcceptModal({ enabled,minutes,onSave,onClose }:{ enabled:boolean;minutes:number;onSave:(en:boolean,min:number)=>void;onClose:()=>void }) {
  const [en,setEn]=useState(enabled); const [min,setMin]=useState(minutes);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm"/>
      <div className="relative z-10 w-full max-w-sm mx-4 bg-white rounded-2xl shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2"><AlarmClock size={18} className="text-green-600"/><h2 className="font-semibold text-gray-900">超时自动接单</h2></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-gray-500 leading-relaxed">开启后，系统将自动把超时未处理的「待上门」订单变更为「进行中」状态。</p>
          <div className="flex items-center justify-between py-2 border border-gray-100 rounded-xl px-4">
            <div><p className="text-sm font-medium text-gray-800">启用自动接单</p><p className="text-xs text-gray-400 mt-0.5">{en?"当前已开启":"当前已关闭"}</p></div>
            <button onClick={()=>setEn(v=>!v)}>{en?<ToggleRight size={28} className="text-green-500"/>:<ToggleLeft size={28} className="text-gray-300"/>}</button>
          </div>
          <div className={`space-y-2 transition-opacity ${en?"opacity-100":"opacity-40 pointer-events-none"}`}>
            <label className="block text-xs font-medium text-gray-500">超时时长（分钟）</label>
            <div className="flex items-center gap-3"><input type="range" min={5} max={120} step={5} value={min} onChange={e=>setMin(+e.target.value)} className="flex-1 accent-green-600"/>
              <span className="text-sm font-mono font-bold text-green-700 w-16 text-right">{min} 分钟</span></div>
            <div className="flex gap-2">{[10,20,30,60].map(v=>(<button key={v} onClick={()=>setMin(v)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${min===v?"bg-green-600 text-white border-green-600":"border-gray-200 text-gray-500 hover:border-green-400"}`}>{v}分</button>))}</div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">取消</button>
          <button onClick={()=>{onSave(en,min);onClose();}} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{background:"linear-gradient(135deg,#1a7a3c,#27ae60)"}}><Save size={14}/>保存设置</button>
        </div>
      </div>
    </div>
  );
}

// ─── Column Visibility Dropdown ───────────────────────────────────────────────
function ColVisibilityMenu({ cols,hidden,onToggle }:{ cols:ColDef[];hidden:Set<string>;onToggle:(id:string)=>void }) {
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false);};
    document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h);
  },[]);
  const toggleable=cols.filter(c=>!c.alwaysVisible);
  return (
    <div ref={ref} className="relative">
      <button onClick={()=>setOpen(v=>!v)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-all ${open?"border-green-400 text-green-700 bg-green-50":"border-gray-200 text-gray-600 hover:border-gray-300"}`}>
        <Columns3 size={14}/> 列设置 {hidden.size>0&&<span className="text-xs bg-green-600 text-white rounded-full px-1.5 py-0.5 leading-none">{hidden.size}</span>}
      </button>
      {open&&<div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-40">
        <p className="text-[10px] font-semibold text-gray-400 uppercase px-3 pb-1">显示字段</p>
        {toggleable.map(col=>{
          const visible=!hidden.has(col.id);
          return <button key={col.id} onClick={()=>onToggle(col.id)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm transition-colors">
            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${visible?"bg-green-600 border-green-600":"border-gray-300"}`}>{visible&&<Check size={10} className="text-white"/>}</div>
            <span className="text-gray-700">{col.label}</span>
          </button>;
        })}
      </div>}
    </div>
  );
}

// ─── Orders Page ──────────────────────────────────────────────────────────────
function OrdersPage({ staff,groups,orders,onSaveOrder,onAssignRecycler,onUnsupported,onViewOrder }:{ staff:Staff[];groups:RecycleGroup[];orders:Order[];onSaveOrder:(order:Order)=>Promise<void>;onAssignRecycler:(order:Order,staff:Staff)=>Promise<void>;onUnsupported:(feature:string)=>void;onViewOrder:(id:string)=>void }) {
  const [cols,setCols]=useState<ColDef[]>(INIT_COLS);
  const [hiddenCols,setHiddenCols]=useState<Set<string>>(new Set());
  const [search,setSearch]=useState("");
  const [filterStatus,setFilterStatus]=useState<OrderStatus|"全部">("全部");
  const [editOrder,setEditOrder]=useState<Order|null>(null);
  const [assigningOrder,setAssigningOrder]=useState<Order|null>(null);
  const [showNew,setShowNew]=useState(false);
  const [previewInfo,setPreviewInfo]=useState<{images:string[];idx:number}|null>(null);
  const [showAutoModal,setShowAutoModal]=useState(false);
  const [autoEnabled,setAutoEnabled]=useState(false);
  const [autoMinutes,setAutoMinutes]=useState(30);
  const [dateFilterType,setDateFilterType]=useState<"appointment"|"completed">("appointment");
  const [dateFrom,setDateFrom]=useState(""); const [dateTo,setDateTo]=useState("");
  const [mobileFilterOpen,setMobileFilterOpen]=useState(false);
  const [currentPage,setCurrentPage]=useState(1);
  const PAGE_SIZE=20;
  const toggleHiddenCol=(id:string)=>setHiddenCols(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s;});

  // Column resize
  const resizing=useRef<{colId:string;startX:number;startW:number}|null>(null);
  function startResize(e:React.MouseEvent,colId:string){
    e.preventDefault();e.stopPropagation();
    const col=cols.find(c=>c.id===colId)!;
    resizing.current={colId,startX:e.clientX,startW:col.width};
    const onMove=(ev:MouseEvent)=>{if(!resizing.current)return;const delta=ev.clientX-resizing.current.startX;const col2=cols.find(c=>c.id===resizing.current!.colId)!;setCols(prev=>prev.map(c=>c.id===resizing.current!.colId?{...c,width:Math.max(col2.minWidth,resizing.current!.startW+delta)}:c));};
    const onUp=()=>{resizing.current=null;document.removeEventListener("mousemove",onMove);document.removeEventListener("mouseup",onUp);};
    document.addEventListener("mousemove",onMove);document.addEventListener("mouseup",onUp);
  }
  // Column drag reorder
  const dragCol=useRef<string|null>(null);
  const onDragStart=(e:React.DragEvent,colId:string)=>{dragCol.current=colId;e.dataTransfer.effectAllowed="move";};
  const onDrop=(e:React.DragEvent,targetId:string)=>{
    e.preventDefault();if(!dragCol.current||dragCol.current===targetId)return;
    setCols(prev=>{const arr=[...prev];const fi=arr.findIndex(c=>c.id===dragCol.current);const ti=arr.findIndex(c=>c.id===targetId);if(fi<0||ti<0)return prev;const[item]=arr.splice(fi,1);arr.splice(ti,0,item);return arr;});
    dragCol.current=null;
  };

  const statuses:( OrderStatus|"全部")[]=["全部","待上门","进行中","已完成","已取消"];
  const visibleCols=cols.filter(c=>!hiddenCols.has(c.id));
  const filtered=orders.filter(o=>{
    if(filterStatus!=="全部"&&o.status!==filterStatus)return false;
    const q=search.toLowerCase();
    if(q&&!o.id.includes(q)&&!o.userName.includes(q)&&!o.phone.includes(q)&&!o.description.includes(q)&&!o.category.includes(q))return false;
    if(dateFrom||dateTo){
      const ds=dateFilterType==="appointment"?o.createdAt:o.completedAt;
      if(!ds)return false;
      const d=parseDate(ds);
      if(dateFrom&&d&&d<new Date(dateFrom))return false;
      if(dateTo&&d&&d>new Date(dateTo))return false;
    }
    return true;
  });
  const totalAmount=filtered.filter(o=>o.status==="已完成").reduce((s,o)=>s+(o.amount??0),0);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const safePage=Math.min(currentPage,totalPages);
  const pagedOrders=filtered.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);
  // Reset to page 1 when filters change
  const prevFilterKey=useRef("");
  const filterKey=`${filterStatus}|${search}|${dateFrom}|${dateTo}|${dateFilterType}`;
  if(filterKey!==prevFilterKey.current){prevFilterKey.current=filterKey;if(currentPage!==1)setCurrentPage(1);}
  // Build page items: numbers + "..." placeholders
  function buildPageItems(total:number,cur:number):(number|"...")[]{
    if(total<=7)return Array.from({length:total},(_,i)=>i+1);
    const items=new Set<number>([1,total,cur-1,cur,cur+1].filter(p=>p>=1&&p<=total));
    const sorted=[...items].sort((a,b)=>a-b);
    const result:(number|"...")[]=[];
    sorted.forEach((p,i)=>{if(i>0&&p-sorted[i-1]>1)result.push("...");result.push(p);});
    return result;
  }
  const pageItems=buildPageItems(totalPages,safePage);

  function renderCell(col:ColDef,order:Order){
    switch(col.id){
      case "id": return <span className="font-mono text-xs text-gray-600 tracking-wide">{order.id}</span>;
      case "status": return <StatusBadge status={order.status}/>;
      case "orderType": return <OrderTypeBadge type={order.orderType}/>;
      case "contact":{
        return(
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0"><span className="text-xs font-semibold text-green-700">{order.userName[0]}</span></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 leading-tight">{order.userName}</p>
              <p className="text-xs font-mono text-gray-500 leading-tight">{order.phone||"—"}</p>
            </div>
          </div>
        );
      }
      case "address": return (
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs text-gray-600 truncate flex-1" title={order.address}>{order.address}</span>
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 p-1 rounded-md text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="查看路线" onClick={e=>e.stopPropagation()}>
            <Navigation size={12}/>
          </a>
        </div>
      );
      case "summary":{
        const categoryNames=(order.categoryNames?.length
          ? order.categoryNames
          : order.category.split(/[、,，]/).map((item)=>item.trim()).filter(Boolean));
        const visibleCategoryNames=categoryNames.slice(0,3);
        return (
          <div className="flex items-center gap-1.5 min-w-0" title={categoryNames.join("、")}>
            {visibleCategoryNames.map((name,index)=>(
              <span key={`${name}-${index}`} className="inline-block max-w-[68px] truncate rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                {name}
              </span>
            ))}
            {categoryNames.length>3&&<span className="flex-shrink-0 text-xs font-medium text-gray-400">+{categoryNames.length-3}</span>}
            {categoryNames.length===0&&<span className="text-xs text-gray-300">—</span>}
          </div>
        );
      }
      case "appointmentTime": return <span className="text-xs text-gray-600 whitespace-nowrap">{order.appointmentTime}</span>;
      case "images": return order.images.length===0?<span className="text-xs text-gray-300">暂无</span>:(
        <div className="flex -space-x-1">
          {order.images.slice(0,3).map((img,i)=>(<ImageThumb key={i} src={img} onClick={()=>setPreviewInfo({images:order.images,idx:i})}/>))}
          {order.images.length>3&&<div className="w-8 h-8 rounded-lg bg-gray-100 border-2 border-white flex items-center justify-center flex-shrink-0"><span className="text-[10px] font-bold text-gray-500">+{order.images.length-3}</span></div>}
        </div>
      );
      case "recyclers": return order.recyclers.length
        ? <RecyclerPills recyclers={order.recyclers} staff={staff}/>
        : <button type="button" onClick={()=>setAssigningOrder(order)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-green-200 bg-green-50 text-xs font-medium text-green-700 hover:bg-green-100"><User size={11}/>分配人员</button>;
      case "lastModified": return <span className="text-xs text-gray-400 font-mono">{order.lastModified}</span>;
      default: return null;
    }
  }

  const totalW=visibleCols.reduce((s,c)=>s+c.width,0);

  return(
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-xl font-semibold text-gray-900">订单管理</h1><p className="text-xs text-gray-400 mt-0.5">拖动列标题调整顺序 · 拖动右边框调整宽度</p></div>
        <div className="flex items-center gap-2 flex-wrap">
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["待上门","进行中","已完成","已取消"] as OrderStatus[]).map(s=>{
          const cnt=filtered.filter(o=>o.status===s).length;
          const cfg=STATUS_CFG[s];
          return(<button key={s} onClick={()=>setFilterStatus(filterStatus===s?"全部":s)} className={`bg-white rounded-xl p-3.5 text-left border transition-all ${filterStatus===s?"border-green-400 shadow-sm":"border-transparent hover:border-gray-200"}`}>
            <p className={`text-xl font-bold font-mono ${cfg.color}`}>{cnt}</p><p className="text-xs text-gray-400 mt-1">{s}</p>
          </button>);
        })}
        <div className="bg-white rounded-xl p-3.5 border border-green-100">
          <p className="text-xl font-bold font-mono text-green-700">¥{totalAmount.toFixed(2)}</p><p className="text-xs text-gray-400 mt-1">已回收金额</p>
        </div>
      </div>

      {/* Filters */}
      <div className="hidden md:block bg-white rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索订单号、用户名、电话、物品摘要…" className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-50 transition-all"/>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {statuses.map(s=>(<button key={s} onClick={()=>setFilterStatus(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterStatus===s?"bg-green-600 text-white":"bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{s}</button>))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-50">
          <span className="text-xs font-medium text-gray-500 whitespace-nowrap">日期筛选：</span>
          <div className="flex gap-1.5">
            {([{v:"appointment" as const,l:"按预约时间"},{v:"completed" as const,l:"按完成时间"}]).map(opt=>(<button key={opt.v} onClick={()=>setDateFilterType(opt.v)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${dateFilterType===opt.v?"bg-green-600 text-white":"bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{opt.l}</button>))}
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs outline-none focus:border-green-400 transition-all"/>
            <span className="text-xs text-gray-400">至</span>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs outline-none focus:border-green-400 transition-all"/>
            {(dateFrom||dateTo)&&<button onClick={()=>{setDateFrom("");setDateTo("");}} className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50"><X size={13}/></button>}
          </div>
          <div className="ml-auto"><ColVisibilityMenu cols={cols} hidden={hiddenCols} onToggle={toggleHiddenCol}/></div>
        </div>
      </div>

      {/* Mobile Filter Toggle */}
      <div className="md:hidden">
        <button onClick={()=>setMobileFilterOpen(v=>!v)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${mobileFilterOpen||search||filterStatus!=="全部"||dateFrom||dateTo?"border-green-400 text-green-700 bg-green-50":"border-gray-200 text-gray-600 bg-white"}`}>
          <Filter size={14}/>
          <span>筛选</span>
          {(search||filterStatus!=="全部"||dateFrom||dateTo)&&<span className="ml-auto flex items-center justify-center w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-bold">!</span>}
        </button>
        {mobileFilterOpen&&(
          <div className="mt-2 bg-white rounded-xl p-4 space-y-3 border border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索订单号、用户名、电话…" className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-400 transition-all"/>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {statuses.map(s=>(<button key={s} onClick={()=>setFilterStatus(s)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${filterStatus===s?"bg-green-600 text-white":"bg-gray-100 text-gray-500"}`}>{s}</button>))}
            </div>
            <div className="pt-2 border-t border-gray-50 space-y-2">
              <div className="flex gap-1.5">
                {([{v:"appointment" as const,l:"预约时间"},{v:"completed" as const,l:"完成时间"}]).map(opt=>(<button key={opt.v} onClick={()=>setDateFilterType(opt.v)} className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${dateFilterType===opt.v?"bg-green-600 text-white":"bg-gray-100 text-gray-500"}`}>{opt.l}</button>))}
              </div>
              <div className="flex items-center gap-2">
                <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:border-green-400 transition-all"/>
                <span className="text-xs text-gray-400">至</span>
                <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:border-green-400 transition-all"/>
              </div>
              {(dateFrom||dateTo)&&<button onClick={()=>{setDateFrom("");setDateTo("");}} className="w-full text-center text-xs text-red-500 py-1.5 rounded-lg bg-red-50">清除日期筛选</button>}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden space-y-3">
        {pagedOrders.length===0?<div className="bg-white rounded-xl p-8 text-center text-sm text-gray-400 border border-gray-100">暂无符合条件的订单</div>:pagedOrders.map(order=>{
          const cfg=STATUS_CFG[order.status];
          return(<button key={order.id} onClick={()=>order.docId&&onViewOrder(order.docId)} className="w-full bg-white rounded-xl p-4 border border-gray-100 text-left active:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-gray-400 mr-2 break-all">{order.id}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>{order.status}</span>
            </div>
            <p className="text-sm font-medium text-gray-800 truncate mb-1">{order.userName||"用户"} · {order.phone||"—"}</p>
            <p className="text-xs text-gray-500 truncate mb-2">{order.description||order.category||"无描述"}</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">{order.appointmentTime||"未预约"}</span>
              {order.amount!=null&&<span className="font-semibold text-green-700">¥{Number(order.amount).toFixed(2)}</span>}
            </div>
          </button>);
        })}
        <div className="flex items-center justify-between py-2">
          <span className="text-xs text-gray-400">{filtered.length} 条</span>
          <div className="flex items-center gap-1">
            <button disabled={safePage<=1} onClick={()=>setCurrentPage(p=>Math.max(1,p-1))} className="w-7 h-7 rounded-lg text-xs font-medium flex items-center justify-center border border-gray-200 text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">‹</button>
            {pageItems.map((item,idx)=>item==="..."?<span key={`e${idx}`} className="w-5 text-center text-xs text-gray-400">…</span>:<button key={item} onClick={()=>setCurrentPage(item as number)} className={`w-7 h-7 rounded-lg text-xs font-medium transition-all ${item===safePage?"bg-green-600 text-white":"text-gray-500 hover:bg-gray-100"}`}>{item}</button>)}
            <button disabled={safePage>=totalPages} onClick={()=>setCurrentPage(p=>Math.min(totalPages,p+1))} className="w-7 h-7 rounded-lg text-xs font-medium flex items-center justify-center border border-gray-200 text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">›</button>
          </div>
          <span className="text-xs text-gray-400">{safePage}/{totalPages}</span>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-xl overflow-hidden border border-gray-100">
        <div className="overflow-x-auto">
          <table style={{tableLayout:"fixed",width:totalW,minWidth:"100%"}}>
            <colgroup>{visibleCols.map(c=><col key={c.id} style={{width:c.width}}/>)}</colgroup>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {visibleCols.map((col,ci)=>(
                  <th key={col.id} draggable={!col.fixed}
                    onDragStart={e=>!col.fixed&&onDragStart(e,col.id)}
                    onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";}}
                    onDrop={e=>!col.fixed&&onDrop(e,col.id)}
                    className={`text-left px-4 py-3 text-xs font-semibold text-gray-500 relative select-none whitespace-nowrap group ${ci<visibleCols.length-1?"border-r border-gray-200":""}`}
                    style={{width:col.width}}>
                    <div className="flex items-center gap-1">
                      {!col.fixed&&<GripVertical size={11} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 cursor-grab"/>}
                      {col.label}
                    </div>
                    <div onMouseDown={e=>startResize(e,col.id)} className="absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <div className="w-0.5 h-4 bg-green-400 rounded-full"/>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedOrders.map((order,i)=>(
                <tr key={order.id} tabIndex={0} onClick={()=>order.docId&&onViewOrder(order.docId)} onKeyDown={event=>{if((event.key==="Enter"||event.key===" ")&&order.docId){event.preventDefault();onViewOrder(order.docId);}}} className={`border-b border-gray-50 hover:bg-green-50/40 transition-colors cursor-pointer focus:outline-none focus:bg-green-50/60 ${i%2===1?"bg-gray-50/20":""}`}>
                  {visibleCols.map((col)=>(
                    <td key={col.id} onClick={col.id==="images"||col.id==="recyclers"?event=>event.stopPropagation():undefined} className={`py-3 ${col.id==="summary"?"pl-6 pr-4 border-l border-gray-100":"px-4"}`} style={{width:col.width,maxWidth:col.width,overflow:"hidden"}}>
                      {renderCell(col,order)}
                    </td>
                  ))}
                </tr>
              ))}
              {pagedOrders.length===0&&<tr><td colSpan={visibleCols.length} className="px-4 py-12 text-center text-gray-300 text-sm">暂无符合条件的订单</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-400">显示 {pagedOrders.length} / {filtered.length} 条</span>
          <div className="flex items-center gap-1">
            <button disabled={safePage<=1} onClick={()=>setCurrentPage(p=>Math.max(1,p-1))} className="w-7 h-7 rounded-lg text-xs font-medium flex items-center justify-center border border-gray-200 text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">‹</button>
            {pageItems.map((item,idx)=>item==="..."?<span key={`de${idx}`} className="w-5 text-center text-xs text-gray-400">…</span>:<button key={item} onClick={()=>setCurrentPage(item as number)} className={`w-7 h-7 rounded-lg text-xs font-medium transition-all ${item===safePage?"bg-green-600 text-white":"text-gray-500 hover:bg-gray-100"}`}>{item}</button>)}
            <button disabled={safePage>=totalPages} onClick={()=>setCurrentPage(p=>Math.min(totalPages,p+1))} className="w-7 h-7 rounded-lg text-xs font-medium flex items-center justify-center border border-gray-200 text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">›</button>
          </div>
        </div>
      </div>

      {editOrder&&<OrderEditModal order={editOrder} onSave={o=>{void onSaveOrder(o).then(()=>setEditOrder(null)).catch(()=>undefined);}} onClose={()=>setEditOrder(null)}/>}
      {assigningOrder&&<AssignRecyclerModal order={assigningOrder} staff={staff} onAssign={async(person)=>onAssignRecycler(assigningOrder,person)} onClose={()=>setAssigningOrder(null)}/>}
      {showNew&&<NewOrderModal onSave={()=>{setShowNew(false);onUnsupported("后台新建订单");}} onClose={()=>setShowNew(false)} staff={staff} groups={groups} orders={orders}/>} 
      {previewInfo&&<ImagePreviewModal images={previewInfo.images} initialIndex={previewInfo.idx} onClose={()=>setPreviewInfo(null)}/>} 
      {showAutoModal&&<AutoAcceptModal enabled={autoEnabled} minutes={autoMinutes} onSave={(en,min)=>{setAutoEnabled(false);setAutoMinutes(min);setShowAutoModal(false);onUnsupported(en?"超时自动接单":"超时自动接单配置");}} onClose={()=>setShowAutoModal(false)}/>} 
    </div>
  );
}

// ─── Staff Page ───────────────────────────────────────────────────────────────
function StaffPage({ staff,users,admins,onSaveStaff,onSaveAdmin,onToggleAdmin,onViewUser }:{ staff:Staff[];users:UserRecord[];admins:AdminRecord[];onSaveStaff:(staff:Staff)=>Promise<void>;onSaveAdmin:(admin:AdminRecord)=>Promise<void>;onToggleAdmin:(admin:AdminRecord,enabled:boolean)=>Promise<void>;onViewUser?:(id:string)=>void }) {
  const [tab,setTab]=useState<"users"|"staff"|"admins">("users");
  const [editing,setEditing]=useState<Staff|null|undefined>(undefined);
  const adminAddRef=useRef<()=>void>(null);
  const counts={online:staff.filter(s=>s.status==="online").length,resting:staff.filter(s=>s.status==="resting").length,resigned:staff.filter(s=>s.status==="resigned").length};
  return(
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-semibold text-gray-900">人员管理</h1></div>
        {tab==="staff"&&<button onClick={()=>setEditing(null)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-all" style={{background:"linear-gradient(135deg,#1a7a3c,#27ae60)"}}><Plus size={14}/>添加工作人员</button>}
        {tab==="admins"&&<button onClick={()=>adminAddRef.current?.()} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-all" style={{background:"linear-gradient(135deg,#1a7a3c,#27ae60)"}}><Plus size={14}/>添加管理员</button>}
      </div>
      <div className="flex gap-2 border-b border-gray-200"><button onClick={()=>setTab("users")} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab==="users"?"border-green-600 text-green-700":"border-transparent text-gray-400"}`}>用户（{users.length}）</button><button onClick={()=>setTab("staff")} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab==="staff"?"border-green-600 text-green-700":"border-transparent text-gray-400"}`}>工作人员（{staff.length}）</button><button onClick={()=>setTab("admins")} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab==="admins"?"border-green-600 text-green-700":"border-transparent text-gray-400"}`}>管理员（{admins.length}）</button></div>
      {tab==="staff"&&<div className="grid grid-cols-3 gap-3">
        {[{label:"在线（可接单）",val:counts.online,color:"text-green-600"},{label:"休息（暂停接单）",val:counts.resting,color:"text-amber-600"},{label:"离职",val:counts.resigned,color:"text-gray-400"}].map(item=>(
          <div key={item.label} className="bg-white rounded-xl p-4 border border-transparent">
            <p className={`text-2xl font-bold font-mono ${item.color}`}>{item.val}</p><p className="text-xs text-gray-400 mt-1">{item.label}</p>
          </div>
        ))}
      </div>}
      {tab==="users"?<>
        {/* Mobile User Cards */}
        <div className="md:hidden space-y-3">
          {users.length===0?<div className="bg-white rounded-xl p-8 text-center text-sm text-gray-400 border border-gray-100">暂无已同步的小程序用户</div>:users.map(user=>(
            <div key={user._id} onClick={()=>onViewUser?.(user._id)} className="bg-white rounded-xl p-4 border border-gray-100 cursor-pointer hover:border-green-200 active:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                {user.avatarUrl?<img src={cloudUrlToHttps(user.avatarUrl)} className="w-10 h-10 rounded-full"/>:<div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center"><User size={16}/></div>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{user.nickName||"微信用户"}</p>
                  <p className="text-xs font-mono text-gray-500">{user.phone||"未绑定手机"}</p>
                </div>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${user.wechatBound?"bg-green-50 text-green-700":"bg-gray-100 text-gray-500"}`}>{user.wechatBound?"已绑定":"未绑定"}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-50">
                <span>订单 {user.orderCount}</span>
                <span>地址 {user.addressCount}</span>
                <span>{formatCloudTime(user.lastLoginTime||user.updateTime)}</span>
              </div>
            </div>
          ))}
        </div>
        {/* Desktop User Table */}
        <div className="hidden md:block bg-white rounded-xl overflow-hidden border border-gray-100"><table className="w-full"><thead><tr className="bg-gray-50 border-b border-gray-100">{["用户","联系电话","微信状态","订单数","地址数","最近活跃"].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500">{h}</th>)}</tr></thead><tbody>{users.map(user=><tr key={user._id} onClick={()=>onViewUser?.(user._id)} className="border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors"><td className="px-4 py-3"><div className="flex items-center gap-2">{user.avatarUrl?<img src={cloudUrlToHttps(user.avatarUrl)} className="w-8 h-8 rounded-full"/>:<div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center"><User size={14}/></div>}<span className="text-sm font-medium">{user.nickName||"微信用户"}</span></div></td><td className="px-4 py-3 text-xs font-mono">{user.phone||"—"}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs ${user.wechatBound?"bg-green-50 text-green-700":"bg-gray-100 text-gray-500"}`}>{user.wechatBound?"已绑定":"未绑定"}</span></td><td className="px-4 py-3 text-sm">{user.orderCount}</td><td className="px-4 py-3 text-sm">{user.addressCount}</td><td className="px-4 py-3 text-xs text-gray-500">{formatCloudTime(user.lastLoginTime||user.updateTime)}</td></tr>)}{users.length===0&&<tr><td colSpan={6} className="px-6 py-16 text-center text-sm text-gray-400">暂无已同步的小程序用户</td></tr>}</tbody></table></div>
      </>:tab==="staff"?<>
        {/* Mobile Staff Cards */}
        <div className="md:hidden space-y-3">
          {staff.length===0?<div className="bg-white rounded-xl p-8 text-center text-sm text-gray-400 border border-gray-100">暂无工作人员数据</div>:staff.map(s=>(
            <div key={s.id} className="bg-white rounded-xl p-4 border border-gray-100">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold ${s.status==="online"?"":"opacity-40"}`} style={{background:"linear-gradient(135deg,#1a7a3c,#27ae60)"}}>{s.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{s.name}</p>
                  <p className="text-xs font-mono text-gray-500">{s.phone||"—"}</p>
                </div>
                <button onClick={()=>void onSaveStaff({...s,status:STAFF_CFG[s.status].next})}><StaffBadge status={s.status}/></button>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                <Store size={12} className="text-gray-400"/><span>{s.store}</span>
                <span className="text-gray-300">·</span>
                <span>{s.area}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                <span className="text-xs text-gray-400">入职 {s.joinDate}</span>
                <div className="flex gap-2">
                  <button onClick={()=>setEditing(s)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 bg-blue-50">编辑</button>
                  <button onClick={()=>void onSaveStaff({...s,status:"resigned"})} className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 bg-red-50">停用</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Desktop Staff Table */}
        <div className="hidden md:block bg-white rounded-xl overflow-hidden border border-gray-100">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {["工号","姓名","联系电话","门店","服务区域","入职日期","状态","权限管理","操作"].map(h=>(
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 border-r border-gray-200 last:border-0">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((s,i)=>(
              <tr key={s.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${i%2===1?"bg-gray-50/20":""}`}>
                <td className="px-4 py-3 border-r border-gray-50"><span className="font-mono text-xs text-gray-400">{s.id}</span></td>
                <td className="px-4 py-3 border-r border-gray-50">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold ${s.status==="online"?"":"opacity-40"}`} style={{background:"linear-gradient(135deg,#1a7a3c,#27ae60)"}}>
                      {s.name[0]}
                    </div>
                    <span className="text-sm font-medium text-gray-800">{s.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 border-r border-gray-50">
                  <span className="font-mono text-xs text-gray-700">{s.phone||"—"}</span>
                </td>
                <td className="px-4 py-3 border-r border-gray-50">
                  <div className="flex items-center gap-1"><Store size={12} className="text-gray-400 flex-shrink-0"/><span className="text-xs text-gray-600">{s.store}</span></div>
                </td>
                <td className="px-4 py-3 border-r border-gray-50"><span className="text-sm text-gray-600">{s.area}</span></td>
                <td className="px-4 py-3 border-r border-gray-50"><span className="text-xs font-mono text-gray-500">{s.joinDate}</span></td>
                <td className="px-4 py-3 border-r border-gray-50"><button onClick={()=>void onSaveStaff({...s,status:STAFF_CFG[s.status].next})} title="点击切换状态"><StaffBadge status={s.status}/></button></td>
                <td className="px-4 py-3 border-r border-gray-50">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs ${s.wechatBound?"bg-green-50 text-green-700":"bg-gray-100 text-gray-500"}`}>{s.wechatBound?"微信已绑定":"微信未绑定"}</span>
                </td>
                <td className="px-4 py-3">
                  <RowActions layout="stack">
                    <RowActionButton tone="blue" icon={Edit2} onClick={()=>setEditing(s)}>编辑</RowActionButton>
                    <RowActionButton tone="red" icon={Trash2} onClick={()=>void onSaveStaff({...s,status:"resigned"})}>停用</RowActionButton>
                  </RowActions>
                </td>
              </tr>
            ))}
            {staff.length===0&&<tr><td colSpan={9} className="px-6 py-16 text-center"><Users size={32} className="mx-auto text-gray-200 mb-3"/><p className="text-sm text-gray-400">暂无工作人员数据</p></td></tr>}
          </tbody>
        </table>
      </div>
      </>:<AdminListView admins={admins} onSaveAdmin={onSaveAdmin} onToggleAdmin={onToggleAdmin} addRef={adminAddRef}/>}
      {editing!==undefined&&<StaffEditor initial={editing} onClose={()=>setEditing(undefined)} onSave={async(value)=>{await onSaveStaff(value);setEditing(undefined);}}/>}
    </div>
  );
}

function StaffEditor({initial,onClose,onSave}:{initial:Staff|null;onClose:()=>void;onSave:(staff:Staff)=>Promise<void>}){
  const [form,setForm]=useState<Staff>(initial||{id:"",name:"",phone:"",status:"resting",joinDate:"",area:"",store:""});
  const [saving,setSaving]=useState(false);
  const save=async()=>{if(!form.name.trim()||!form.phone.trim())return;setSaving(true);try{await onSave(form);}finally{setSaving(false);}};
  return <div className="fixed inset-0 z-50 flex items-center justify-center"><button className="absolute inset-0 bg-black/40" onClick={onClose}/><div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4"><div className="flex justify-between"><h2 className="font-semibold">{initial?"编辑工作人员":"添加工作人员"}</h2><button onClick={onClose}><X size={18}/></button></div><div className="grid grid-cols-2 gap-3">{[{k:"name",l:"姓名 *"},{k:"phone",l:"联系电话 *"},{k:"id",l:"工号"},{k:"area",l:"服务区域"},{k:"store",l:"所属门店"},{k:"joinDate",l:"入职日期"}].map(item=><label key={item.k}><span className="text-xs text-gray-500">{item.l}</span><input value={String(form[item.k as keyof Staff]||"")} onChange={e=>setForm({...form,[item.k]:e.target.value})} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"/></label>)}</div><label><span className="text-xs text-gray-500">状态</span><select value={form.status} onChange={e=>setForm({...form,status:e.target.value as StaffStatus})} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"><option value="online">在线</option><option value="resting">休息</option><option value="resigned">离职</option></select></label><div className="flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 text-sm">取消</button><button disabled={saving||!form.name.trim()||!form.phone.trim()} onClick={()=>void save()} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm disabled:opacity-40">{saving?"保存中…":"保存"}</button></div></div></div>;
}

// “管理员” tab 下的列表 + 编辑/新增/启用停用。
// - 行点击：进入编辑模式（手机号不允许修改）。
// - 启用状态列：点击切换（停用时由云函数做 “最后一个启用的管理员” 保护）。
// - 顶部按钮：新增（手机号为唯一必填项）。
function AdminListView({ admins,onSaveAdmin,onToggleAdmin,addRef }:{ admins:AdminRecord[];onSaveAdmin:(admin:AdminRecord)=>Promise<void>;onToggleAdmin:(admin:AdminRecord,enabled:boolean)=>Promise<void>;addRef?:React.MutableRefObject<(()=>void)|null> }) {
  const [editing,setEditing]=useState<AdminRecord|null|undefined>(undefined);
  useEffect(()=>{if(addRef)addRef.current=()=>setEditing(null);},[addRef]);
  return (
    <>
      {/* Mobile Admin Cards */}
      <div className="md:hidden space-y-3">
        {admins.length===0?<div className="bg-white rounded-xl p-8 text-center border border-gray-100"><Shield size={32} className="mx-auto text-gray-200 mb-3"/><p className="text-sm text-gray-400">还没有管理员</p></div>:admins.map(a=>(
          <div key={a._id} onClick={()=>setEditing(a)} className="bg-white rounded-xl p-4 border border-gray-100 active:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center flex-shrink-0 text-sm font-bold">{(a.name||a.phone).slice(0,1)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{a.name||"未命名"}</p>
                <p className="text-xs font-mono text-gray-500">{a.phone}</p>
              </div>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${a.enabled?"bg-green-50 text-green-700":"bg-gray-100 text-gray-500"}`}>{a.enabled?"已启用":"已停用"}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-50">
              <span className="inline-flex rounded-full px-2 py-0.5 bg-gray-100 text-gray-600">{a.role}</span>
              <span>{a.loginMethod==="phone"?"手机绑定":a.loginMethod==="wechat"?"微信绑定":"未登录"}</span>
              <span>{formatCloudTime(a.updateTime)}</span>
            </div>
          </div>
        ))}
      </div>
      {/* Desktop Admin Table */}
      <div className="hidden md:block bg-white rounded-xl overflow-hidden border border-gray-100">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-xs text-gray-500">点击行可编辑，手机号是唯一标识且不可修改</p>
        <button onClick={()=>setEditing(null)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-90 transition-all" style={{background:"linear-gradient(135deg,#1a7a3c,#27ae60)"}}><Plus size={12}/>添加管理员</button>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            {["手机号","姓名","角色","登录方式","启用状态","创建时间","更新时间"].map((h) => (
              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 border-r border-gray-200 last:border-0">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {admins.map((a, i) => (
            <tr key={a._id} onClick={()=>setEditing(a)} className={`border-b border-gray-50 hover:bg-green-50/30 cursor-pointer transition-colors ${i % 2 === 1 ? "bg-gray-50/20" : ""}`}>
              <td className="px-4 py-3 border-r border-gray-50"><span className="font-mono text-xs text-gray-700">{a.phone}</span></td>
              <td className="px-4 py-3 border-r border-gray-50"><span className="text-sm font-medium text-gray-800">{a.name || "—"}</span></td>
              <td className="px-4 py-3 border-r border-gray-50"><span className="inline-flex rounded-full px-2 py-1 text-xs bg-gray-100 text-gray-600">{a.role}</span></td>
              <td className="px-4 py-3 border-r border-gray-50">
                {a.loginMethod === "phone" ? <span className="inline-flex rounded-full px-2 py-1 text-xs bg-green-50 text-green-700">手机号已绑定</span>
                  : a.loginMethod === "wechat" ? <span className="inline-flex rounded-full px-2 py-1 text-xs bg-green-50 text-green-700">微信已绑定</span>
                  : <span className="inline-flex rounded-full px-2 py-1 text-xs bg-gray-100 text-gray-500">未登录</span>}
              </td>
              <td className="px-4 py-3 border-r border-gray-50" onClick={(e)=>{e.stopPropagation();void onToggleAdmin(a,!a.enabled);}}>
                <span className={`inline-flex rounded-full px-2 py-1 text-xs cursor-pointer ${a.enabled ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>{a.enabled ? "已启用" : "已停用"}</span>
              </td>
              <td className="px-4 py-3 border-r border-gray-50"><span className="text-xs font-mono text-gray-500">{formatCloudTime(a.createTime)}</span></td>
              <td className="px-4 py-3"><span className="text-xs font-mono text-gray-500">{formatCloudTime(a.updateTime)}</span></td>
            </tr>
          ))}
          {admins.length === 0 && (
            <tr>
              <td colSpan={7} className="px-6 py-16 text-center">
                <Shield size={32} className="mx-auto text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">还没有管理员，点击右上角"添加管理员"开始配置</p>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      {editing!==undefined&&<AdminEditorModal initial={editing} onClose={()=>setEditing(undefined)} onSave={async(value)=>{await onSaveAdmin(value);setEditing(undefined);}}/>}
    </>
  );
}

function AdminEditorModal({initial,onClose,onSave}:{initial:AdminRecord|null;onClose:()=>void;onSave:(admin:AdminRecord)=>Promise<void>}){
  const isEdit=Boolean(initial&&initial._id);
  const [form,setForm]=useState<AdminRecord>(initial||{_id:"",phone:"",name:"",role:"admin",enabled:true});
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const phoneValid=/^1[3-9]\d{9}$/.test(form.phone);
  const canSave=phoneValid&&form.name.trim().length>0;
  const save=async()=>{
    if(!canSave)return;
    setError("");
    setSaving(true);
    try{
      await onSave({...form,phone:form.phone.replace(/\D/g,""),name:form.name.trim()});
    }catch(e:unknown){
      const msg=(e&&typeof e==="object"&&"code" in e)?String((e as {code:string}).code):(e instanceof Error?e.message:String(e));
      setError(msg||"保存失败");
      throw e;
    }finally{
      setSaving(false);
    }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center"><button className="absolute inset-0 bg-black/40" onClick={onClose}/><div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"><div className="flex justify-between items-center"><h2 className="font-semibold">{isEdit?"编辑管理员":"添加管理员"}</h2><button onClick={onClose}><X size={18}/></button></div><label className="block"><span className="text-xs text-gray-500">手机号 *</span><input value={form.phone} disabled={isEdit} onChange={e=>setForm({...form,phone:e.target.value.trim()})} placeholder="11 位手机号" className="mt-1 w-full px-3 py-2 border rounded-lg text-sm font-mono disabled:bg-gray-50 disabled:text-gray-500"/></label>{isEdit&&<p className="text-[11px] text-gray-400 -mt-2">手机号不允许修改；如需变更手机号请停用后重新添加。</p>}<label className="block"><span className="text-xs text-gray-500">姓名 *</span><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="可选，默认留空" className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})} className="rounded"/><span className="text-gray-700">启用该管理员</span></label>{!phoneValid&&form.phone.length>0&&<p className="text-xs text-red-500">手机号格式不正确，需为 11 位数字且以 1[3-9] 开头</p>}{error&&<p className="text-xs text-red-500">{error}</p>}<div className="flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 text-sm">取消</button><button disabled={saving||!canSave} onClick={()=>void save()} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm disabled:opacity-40">{saving?"保存中…":"保存"}</button></div></div></div>;
}

function CategoryGroupModal({index,initial,onSave,onClose}:{index:number;initial?:RecycleGroup;onSave:(group:CategoryRootDraft)=>Promise<void>;onClose:()=>void}) {
  const [form,setForm]=useState<CategoryRootDraft>(initial?{
    _id:initial.id,
    name:initial.name,
    description:initial.desc,
    sortOrder:initial.sortOrder ?? index,
    enabled:initial.enabled,
    allowFieldEstimate:initial.allowFieldEstimate,
  }:{name:"",description:"",sortOrder:index,enabled:true,allowFieldEstimate:false});
  const [saving,setSaving]=useState(false);
  const save=async()=>{
    if(!form.name.trim())return;
    setSaving(true);
    try{
      await onSave({...form,name:form.name.trim(),description:form.description?.trim()});
      onClose();
    }finally{
      setSaving(false);
    }
  };
  const inputClass="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-50";
  return <div className="fixed inset-0 z-50 flex items-center justify-center"><button className="absolute inset-0 bg-black/40" onClick={onClose}/><div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-gray-900">{initial?"编辑一级分类":"添加一级分类"}</h2><p className="text-xs text-gray-400 mt-1">一级分类用于归纳二级回收品类，本身不设置价格</p></div><button onClick={onClose}><X size={18}/></button></div><label className="block"><span className="text-xs text-gray-500">一级分类名称 *</span><input autoFocus value={form.name} onChange={event=>setForm({...form,name:event.target.value})} placeholder="例如：金属" className={inputClass}/></label><label className="block"><span className="text-xs text-gray-500">分类说明</span><textarea rows={3} value={form.description||""} onChange={event=>setForm({...form,description:event.target.value})} placeholder="例如：铁、不锈钢、铝合金、铜等金属制品" className={`${inputClass} resize-none`}/></label><label className="block"><span className="text-xs text-gray-500">显示顺序</span><input type="number" value={form.sortOrder} onChange={event=>setForm({...form,sortOrder:Number(event.target.value)||0})} className={inputClass}/></label><div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl"><div><p className="text-sm font-medium text-gray-700">允许现场估价</p><p className="text-xs text-gray-400">该分类下的二级品类可不设置固定单价</p></div><button onClick={()=>setForm({...form,allowFieldEstimate:!form.allowFieldEstimate})}>{form.allowFieldEstimate?<ToggleRight size={26} className="text-green-500"/>:<ToggleLeft size={26} className="text-gray-300"/>}</button></div><div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl"><div><p className="text-sm font-medium text-gray-700">一级分类启用</p><p className="text-xs text-gray-400">停用后该分类下的品类不在小程序展示</p></div><button onClick={()=>setForm({...form,enabled:!form.enabled})}>{form.enabled?<ToggleRight size={26} className="text-green-500"/>:<ToggleLeft size={26} className="text-gray-300"/>}</button></div><div className="flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">取消</button><button disabled={saving||!form.name.trim()} onClick={()=>void save()} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm disabled:opacity-40">{saving?"保存中…":initial?"保存修改":"创建一级分类"}</button></div></div></div>;
}

// ─── Category Editor Modal ────────────────────────────────────────────────────
function CategoryEditorModal({ groups,initial,preferredGroupId,onSave,onClose }:{ groups:RecycleGroup[];initial?:RecycleItem;preferredGroupId?:string;onSave:(gid:string,item:RecycleItem)=>Promise<void>;onClose:()=>void }) {
  const selectableGroups=groups.filter((group)=>group.id!=="cloud-categories");
  const initialParentId=groups.find((group)=>group.items.some((item)=>item.id===initial?.id))?.id||preferredGroupId||selectableGroups[0]?.id||"";
  const [form,setForm]=useState({
    name:initial?.name||"",
    unit:initial?.unit||"kg",
    price:initial?.price==="—"?"":initial?.price||"",
    stationPrice:initial?.stationPrice==="—"?"":initial?.stationPrice||"",
    parentId:initialParentId,
    fieldEstimate:initial?.fieldEstimate||false,
    enabled:initial?.enabled??true,
    showOnHome:initial?.showOnHome??true,
  });
  const [err,setErr]=useState<Record<string,string>>({});
  const [saving,setSaving]=useState(false);
  const set=(k:string,v:string|boolean)=>setForm(f=>({...f,[k]:v}));
  const selGroup=groups.find(g=>g.id===form.parentId);
  function validate(){
    const e:Record<string,string>={};
    if(!form.parentId||form.parentId==="cloud-categories") e.parentId="请选择一级分类";
    if(!form.name.trim()) e.name="请填写品类名称";
    if(!form.fieldEstimate&&!form.price.trim()) e.price="请填写收购单价";
    setErr(e); return Object.keys(e).length===0;
  }
  async function handleSave(){
    if(!validate()) return;
    const newItem:RecycleItem={
      ...initial,
      id:initial?.id||`${form.parentId}-${Date.now()}`,name:form.name.trim(),unit:form.unit,
      parentId:form.parentId,
      price:form.fieldEstimate?"—":form.price, stationPrice:form.fieldEstimate?"—":form.stationPrice||"—",
      priceRef:form.fieldEstimate?"现场估价":`${form.price}元/${form.unit}起`,
      fieldEstimate:form.fieldEstimate, enabled:form.enabled,
    };
    setSaving(true);
    try{
      await onSave(form.parentId,newItem);
      onClose();
    }finally{
      setSaving(false);
    }
  }
  const inp="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-50 transition-all";
  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"/>
      <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">{initial?"编辑二级品类":"添加二级品类"}</h2>
            <p className="text-xs text-gray-400 mt-0.5">价格和计量单位设置在二级品类上</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">所属一级分类 <span className="text-red-400">*</span></label>
            <select value={form.parentId} onChange={e=>set("parentId",e.target.value)} className={`${inp} bg-white ${err.parentId?"border-red-300":"border-gray-200"}`}>
              <option value="">请选择一级分类</option>
              {selectableGroups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            {err.parentId&&<p className="text-xs text-red-500 mt-1">{err.parentId}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-gray-500 mb-1.5">二级品类名称 <span className="text-red-400">*</span></label>
              <input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="如：铁、不锈钢、铜" className={`${inp} ${err.name?"border-red-300":"border-gray-200"}`}/>
              {err.name&&<p className="text-xs text-red-500 mt-1">{err.name}</p>}
            </div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1.5">计量单位</label>
              <select value={form.unit} onChange={e=>set("unit",e.target.value)} className={`${inp} bg-white border-gray-200`}>
                {["kg","斤","台","件","双","袋","箱"].map(u=><option key={u}>{u}</option>)}
              </select>
            </div>
          </div>
          {selGroup?.allowFieldEstimate&&(
            <div className="flex items-center justify-between py-2 px-3 bg-amber-50 border border-amber-100 rounded-xl">
              <div><p className="text-sm font-medium text-amber-800">现场估价</p><p className="text-xs text-amber-600 mt-0.5">开启后该品类将在上门时估价，不设固定单价</p></div>
              <button onClick={()=>set("fieldEstimate",!form.fieldEstimate)}>{form.fieldEstimate?<ToggleRight size={26} className="text-amber-500"/>:<ToggleLeft size={26} className="text-gray-300"/>}</button>
            </div>
          )}
          {!form.fieldEstimate&&(
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1.5">收购单价（元） <span className="text-red-400">*</span></label>
                <input value={form.price} onChange={e=>set("price",e.target.value)} placeholder="0.00" className={`${inp} font-mono ${err.price?"border-red-300":"border-gray-200"}`}/>
                {err.price&&<p className="text-xs text-red-500 mt-1">{err.price}</p>}
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1.5">打包站价格（元）</label>
                <input value={form.stationPrice} onChange={e=>set("stationPrice",e.target.value)} placeholder="0.00" className={`${inp} font-mono border-gray-200`}/>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between py-2 px-3 bg-gray-50 border border-gray-100 rounded-xl">
            <div><p className="text-sm font-medium text-gray-700">品类上架</p><p className="text-xs text-gray-400 mt-0.5">下架后小程序不再展示，历史订单不受影响</p></div>
            <button type="button" onClick={()=>set("enabled",!form.enabled)}>{form.enabled?<ToggleRight size={26} className="text-green-500"/>:<ToggleLeft size={26} className="text-gray-300"/>}</button>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">取消</button>
          <button disabled={saving} onClick={()=>void handleSave()} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-50" style={{background:"linear-gradient(135deg,#1a7a3c,#27ae60)"}}>{initial?<Save size={14}/>:<Plus size={14}/>} {saving?"保存中…":initial?"保存修改":"添加二级品类"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Import Excel Modal ───────────────────────────────────────────────────────
interface ImportRow { name:string; unit:string; price:string; stationPrice:string; }
function ImportModal({groups,onImport,onClose}:{groups:RecycleGroup[];onImport:(gid:string,items:RecycleItem[])=>void;onClose:()=>void}) {
  const [rows,setRows]=useState<ImportRow[]>([]);
  const [error,setError]=useState("");
  const [dragging,setDragging]=useState(false);
  const [gid,setGid]=useState(groups[0]?.id||"");
  const [fileName,setFileName]=useState("");
  const inputRef=useRef<HTMLInputElement>(null);

  function parseCSV(text:string):ImportRow[] {
    const lines=text.split(/\r?\n/).filter(l=>l.trim());
    if(lines.length<2) return [];
    return lines.slice(1).map(line=>{
      const cols=line.split(",").map(c=>c.replace(/^"|"$/g,"").trim());
      return {name:cols[0]||"",unit:cols[1]||"个",price:cols[2]||"0",stationPrice:cols[3]||cols[2]||"0"};
    }).filter(r=>r.name);
  }

  async function parseXLSX(file:File):Promise<ImportRow[]> {
    const {Workbook}=await import("exceljs");
    const workbook=new Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const worksheet=workbook.worksheets[0];
    if(!worksheet) return [];
    const result:ImportRow[]=[];
    worksheet.eachRow((row,rowNumber)=>{
      if(rowNumber===1) return;
      const values=[1,2,3,4].map(index=>String(row.getCell(index).text||"").trim());
      if(values[0]) result.push({name:values[0],unit:values[1]||"个",price:values[2]||"0",stationPrice:values[3]||values[2]||"0"});
    });
    return result;
  }

  async function handleFile(file:File) {
    setError(""); setRows([]);
    setFileName(file.name);
    const isCSV=file.name.toLowerCase().endsWith(".csv");
    const isXLSX=/\.xlsx?$/.test(file.name.toLowerCase());
    if(!isCSV&&!isXLSX){setError("仅支持 .xlsx 或 .csv 格式文件");return;}
    try{
      const parsed=isCSV?parseCSV(await file.text()):await parseXLSX(file);
      if(!parsed.length){setError("未找到有效数据行，请检查格式");return;}
      setRows(parsed);
    }catch{ setError("解析失败，请检查文件格式"); }
  }

  async function downloadTemplate() {
    const {Workbook}=await import("exceljs");
    const workbook=new Workbook();
    const worksheet=workbook.addWorksheet("品类模板");
    worksheet.addRows([["品类名称","单位","收购单价(元)","打包站价格(元)"],["铜线","公斤","35.00","38.00"],["铁","公斤","1.20","1.50"]]);
    const buffer=await workbook.xlsx.writeBuffer();
    const url=URL.createObjectURL(new Blob([new Uint8Array(buffer)],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    const link=document.createElement("a");link.href=url;link.download="品类导入模板.xlsx";link.click();URL.revokeObjectURL(url);
  }

  function handleImport() {
    if(!rows.length){setError("请先选择文件并解析数据");return;}
    const items:RecycleItem[]=rows.map((r,i)=>({id:`import_${Date.now()}_${i}`,name:r.name,unit:r.unit,price:r.price,stationPrice:r.stationPrice,enabled:true}));
    onImport(gid,items);
  }

  return(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center"><FileSpreadsheet size={16} className="text-green-600"/></div>
            <div><p className="font-semibold text-gray-900 text-sm">Excel 批量导入品类</p><p className="text-xs text-gray-400 mt-0.5">支持 .xlsx / .xls / .csv 格式</p></div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><X size={16}/></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {/* Template + Group selector */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">导入到分组：</span>
              <select value={gid} onChange={e=>setGid(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-50 transition-all bg-white">
                {groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <button onClick={()=>void downloadTemplate()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 border border-blue-100 hover:bg-blue-100 transition-colors"><Download size={12}/>下载模板</button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e=>{e.preventDefault();setDragging(true);}}
            onDragLeave={()=>setDragging(false)}
            onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f)void handleFile(f);}}
            onClick={()=>inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl py-10 flex flex-col items-center gap-3 cursor-pointer transition-all ${dragging?"border-green-400 bg-green-50":"border-gray-200 hover:border-green-300 hover:bg-gray-50"}`}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${dragging?"bg-green-100":"bg-gray-100"}`}><Upload size={22} className={dragging?"text-green-600":"text-gray-400"}/></div>
            {fileName
              ?<div className="text-center"><p className="text-sm font-medium text-green-700">{fileName}</p><p className="text-xs text-gray-400 mt-0.5">点击重新选择文件</p></div>
              :<div className="text-center"><p className="text-sm font-medium text-gray-600">拖拽文件到此处，或点击选择</p><p className="text-xs text-gray-400 mt-0.5">支持 .xlsx、.xls、.csv 格式</p></div>
            }
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void handleFile(f);e.target.value="";}}/>
          </div>

          {/* Error */}
          {error&&<div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600"><AlertCircle size={14} className="flex-shrink-0"/>{error}</div>}

          {/* Preview */}
          {rows.length>0&&(
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">预览（共 {rows.length} 条）</p>
                <button onClick={()=>{setRows([]);setFileName("");setError("");}} className="text-xs text-gray-400 hover:text-red-500 transition-colors">清除</button>
              </div>
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead><tr className="bg-gray-50 border-b border-gray-100">
                    {["品类名称","单位","收购单价","打包站价"].map(h=><th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-400">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {rows.slice(0,10).map((r,i)=>(
                      <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-4 py-2 text-sm font-medium text-gray-800">{r.name}</td>
                        <td className="px-4 py-2 text-sm text-gray-500 font-mono">{r.unit}</td>
                        <td className="px-4 py-2 text-sm font-bold text-gray-800 font-mono">¥{r.price}</td>
                        <td className="px-4 py-2 text-sm font-bold text-blue-700 font-mono">¥{r.stationPrice}</td>
                      </tr>
                    ))}
                    {rows.length>10&&<tr><td colSpan={4} className="px-4 py-2 text-xs text-gray-400 text-center">… 还有 {rows.length-10} 条</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">取消</button>
          <button
            onClick={handleImport}
            disabled={rows.length===0}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{background:"linear-gradient(135deg,#1a7a3c,#27ae60)"}}
          >
            <FileSpreadsheet size={14}/>导入 {rows.length>0?`${rows.length} 条品类`:""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Recycle Cats Page ────────────────────────────────────────────────────────
function RecycleCatsPage({ groups,onSaveCategory,onSaveGroup,onDeleteCategory,onDeleteGroup,onUnsupported }:{ groups:RecycleGroup[];onSaveCategory:(item:RecycleItem,parentId:string)=>Promise<void>;onSaveGroup:(group:CategoryRootDraft)=>Promise<void>;onDeleteCategory:(item:RecycleItem)=>Promise<void>;onDeleteGroup:(group:RecycleGroup)=>Promise<void>;onUnsupported:(feature:string)=>void }) {
  const [expanded,setExpanded]=useState<Set<string>>(new Set(groups.map((group)=>group.id)));
  const [search,setSearch]=useState("");
  const [showAddCategory,setShowAddCategory]=useState(false);
  const [editingGroup,setEditingGroup]=useState<RecycleGroup>();
  const [editingItem,setEditingItem]=useState<RecycleItem>();

  useEffect(()=>{setExpanded(prev=>new Set([...prev,...groups.map((group)=>group.id)]));},[groups]);
  const toggleGroup=(group:RecycleGroup)=>{
    if(group.id==="cloud-categories"){onUnsupported("未分组品类启停");return;}
    void onSaveGroup({
      _id:group.id,
      name:group.name,
      description:group.desc,
      sortOrder:group.sortOrder ?? 0,
      enabled:!group.enabled,
      allowFieldEstimate:group.allowFieldEstimate,
    });
  };
  const toggleItem=(gid:string,iid:string)=>{
    const item=groups.find((group)=>group.id===gid)?.items.find((entry)=>entry.id===iid);
    if(item) void onSaveCategory({...item,enabled:!item.enabled},gid);
  };
  const toggleExpand=(id:string)=>setExpanded(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s;});
  async function saveItem(gid:string,item:RecycleItem){ await onSaveCategory(item,gid); }

  const filteredGroups=groups.map(g=>{
    const q=search.toLowerCase();
    if(!q) return g;
    const groupMatch=g.name.toLowerCase().includes(q);
    const matchedItems=g.items.filter(i=>i.name.toLowerCase().includes(q));
    if(!groupMatch&&matchedItems.length===0) return null;
    return {...g,items:groupMatch?g.items:matchedItems};
  }).filter(Boolean) as RecycleGroup[];

  return(
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><div className="flex items-center gap-2"><h1 className="text-xl font-semibold text-gray-900">品类管理</h1><span className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-100">根节点：回收品类</span></div><p className="text-sm text-gray-400 mt-0.5">一级分类展示在首页，二级品类维护真实回收单价</p></div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setShowAddCategory(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-all" style={{background:"linear-gradient(135deg,#1a7a3c,#27ae60)"}}><Plus size={14}/>添加品类</button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索一级分类或二级品类名称…" className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-50 transition-all bg-white"/>
        {search&&<button onClick={()=>setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14}/></button>}
      </div>

      {filteredGroups.length===0&&<div className="bg-white rounded-xl py-12 flex flex-col items-center gap-2 text-gray-300 border border-gray-100"><Search size={32}/><p>未找到匹配的品类</p></div>}

      <div className="space-y-3">
        {filteredGroups.map(group=>(
          <div key={group.id} className={`bg-white rounded-xl border overflow-hidden ${group.enabled?"border-gray-100":"border-gray-100 opacity-60"}`}>
            {/* Group header */}
            <div className="flex items-center gap-3 px-5 py-3.5 bg-gray-50 border-b border-gray-100">
              <button onClick={()=>toggleExpand(group.id)} className="text-gray-400 hover:text-gray-600 transition-colors">
                {expanded.has(group.id)?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
              </button>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{background:"linear-gradient(135deg,#e8f5ed,#d4edda)"}}>
                <Package size={15} className="text-green-700"/>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 text-sm">{group.name}</p>
                  <span className="text-[10px] font-semibold bg-green-50 text-green-700 border border-green-100 px-1.5 py-0.5 rounded-full">{group.id==="cloud-categories"?"待归类":"一级分类"}</span>
                  {group.allowFieldEstimate&&<span className="text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">现场估价</span>}
                </div>
                <p className="text-xs text-gray-400">{group.desc} · {group.items.filter(i=>i.enabled).length}/{group.items.length} 个二级品类启用</p>
              </div>
              {group.id!=="cloud-categories"&&<>
                <button onClick={()=>setEditingGroup(group)} className="p-1.5 text-gray-400 hover:text-blue-600" title="编辑一级分类"><Edit2 size={15}/></button>
              </>}
              {group.id!=="cloud-categories"&&<button onClick={()=>toggleGroup(group)} title={group.enabled?"停用一级分类":"启用一级分类"}>{group.enabled?<ToggleRight size={22} className="text-green-500"/>:<ToggleLeft size={22} className="text-gray-300"/>}</button>}
            </div>

            {/* Items — desktop table */}
            {expanded.has(group.id)&&(
              group.items.length===0
              ?<div className="py-8 flex flex-col items-center gap-1 text-gray-300"><p className="text-sm">暂无子品类</p><p className="text-xs">使用右上角"添加品类"创建二级品类</p></div>
              :<>
              {/* Mobile item cards */}
              <div className="md:hidden divide-y divide-gray-50">
                {group.items.map((item)=>{
                  const sp=spread(item.price,item.stationPrice);
                  return(
                    <button key={item.id} onClick={()=>setEditingItem(item)} className={`w-full px-4 py-3 text-left active:bg-gray-50 transition-colors ${!item.enabled?"opacity-50":""}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.enabled?"bg-green-400":"bg-gray-300"}`}/>
                          <span className="text-sm font-medium text-gray-800">{item.name}</span>
                          {item.fieldEstimate&&<span className="text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full">估价</span>}
                        </div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${item.enabled?"bg-green-100 text-green-700":"bg-red-100 text-red-600"}`}>{item.enabled?"上架":"下架"}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 pl-3.5">
                        <span className="font-mono">{item.unit}</span>
                        <span className="text-gray-300">·</span>
                        {item.fieldEstimate?<span className="text-amber-600 italic">面议</span>:<span className="font-bold text-gray-800 font-mono">¥{item.price}</span>}
                        {sp!==null&&<><span className="text-gray-300">·</span><span className={`font-bold font-mono ${parseFloat(sp)>0?"text-green-600":"text-red-500"}`}>{parseFloat(sp)>0?"+":""}{sp}</span></>}
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* Desktop table */}
              <table className="hidden md:table w-full" style={{tableLayout:"fixed"}}>
                <colgroup>{CAT_COL_WIDTHS.map((w,i)=><col key={i} style={{width:w}}/>)}</colgroup>
                <thead>
                  <tr className="border-b border-gray-100">
                    {CAT_COL_HEADERS.map(h=>(
                      <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item,i)=>{
                    const sp=spread(item.price,item.stationPrice);
                    const pct=sp!==null&&parseFloat(item.price)>0?((parseFloat(sp)/parseFloat(item.price))*100).toFixed(1):null;
                    return(
                      <tr key={item.id} tabIndex={0} onClick={()=>setEditingItem(item)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setEditingItem(item);}}} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/40 transition-colors cursor-pointer focus:outline-none focus:bg-green-50/50 ${!item.enabled?"opacity-50":""} ${i%2===1?"bg-gray-50/20":""}`}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.enabled?"bg-green-400":"bg-gray-300"}`}/>
                            <span className="text-sm font-medium text-gray-800">{item.name}</span>
                            {item.fieldEstimate&&<span className="text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full">现场估价</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2.5"><span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded font-mono">{item.unit}</span></td>
                        <td className="px-4 py-2.5">
                          {item.fieldEstimate?<span className="text-xs text-amber-600 italic">面议</span>:<span className="text-sm font-bold text-gray-800 font-mono">¥{item.price}</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {item.fieldEstimate?<span className="text-xs text-amber-600 italic">面议</span>:item.stationPrice!=="—"?<span className="text-sm font-bold text-blue-700 font-mono">¥{item.stationPrice}</span>:<span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {sp!==null?<span className={`text-sm font-bold font-mono ${parseFloat(sp)>0?"text-green-600":"text-red-500"}`}>{parseFloat(sp)>0?"+":""}{sp}</span>:<span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {pct!==null?<span className={`text-xs font-semibold font-mono px-1.5 py-0.5 rounded ${parseFloat(pct)>0?"bg-green-50 text-green-700":"bg-red-50 text-red-600"}`}>{parseFloat(pct)>0?"+":""}{pct}%</span>:<span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                          <button onClick={event=>{event.stopPropagation();toggleItem(group.id,item.id);}}>
                            {item.enabled
                              ?<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">已上架</span>
                              :<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600 border border-red-200">已下架</span>
                            }
                          </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </>
            )}
          </div>
        ))}
      </div>
      {editingItem&&<CategoryEditorModal groups={groups} initial={editingItem} onSave={saveItem} onClose={()=>setEditingItem(undefined)}/>}
      {editingGroup&&<CategoryGroupModal index={editingGroup.sortOrder??groups.length} initial={editingGroup} onSave={onSaveGroup} onClose={()=>setEditingGroup(undefined)}/>}
    </div>
  );
}

function findCategoryPath(nodes:CategoryNode[],id:string):string[] {
  for(const node of nodes){
    if(node.id===id)return [node.id];
    const childPath=findCategoryPath(node.children,id);
    if(childPath.length)return [node.id,...childPath];
  }
  return [];
}

function CategoryParentCascader({nodes,value,excluded,onChange}:{nodes:CategoryNode[];value:string;excluded:Set<string>;onChange:(id:string)=>void}) {
  const [path,setPath]=useState<string[]>(value?findCategoryPath(nodes,value):[]);
  useEffect(()=>setPath(value?findCategoryPath(nodes,value):[]),[nodes,value]);
  const levels:CategoryNode[][]=[];
  let options=nodes.filter((item)=>!excluded.has(item.id));
  levels.push(options);
  path.forEach((id)=>{
    const selected=options.find((item)=>item.id===id);
    if(selected?.children.length){
      options=selected.children.filter((item)=>!excluded.has(item.id));
      levels.push(options);
    }
  });
  const selectAt=(level:number,id:string)=>{
    const next=id?[...path.slice(0,level),id]:path.slice(0,level);
    setPath(next);
    onChange(next[next.length-1]||"");
  };
  return <div><span className="block text-xs font-medium text-gray-500 mb-1.5">父级节点</span><div className="grid grid-cols-2 gap-2">{levels.map((items,index)=><select key={index} value={path[index]||""} onChange={(event)=>selectAt(index,event.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white outline-none focus:border-green-400"><option value="">{index===0?"无父级（根节点）":"停在上一级"}</option>{items.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select>)}</div>{path.length>0&&<p className="text-xs text-green-700 mt-2">当前父级：{path.map((id)=>flattenCategoryTree(nodes).find((item)=>item.id===id)?.name).filter(Boolean).join(" / ")}</p>}</div>;
}

function CategoryNodeModal({nodes,initial,onSave,onClose,onDelete}:{nodes:CategoryNode[];initial?:CategoryNode;onSave:(item:RecycleItem)=>Promise<void>;onClose:()=>void;onDelete?:(item:RecycleItem)=>Promise<void>}) {
  const allNodes=flattenCategoryTree(nodes);
  const descendantIds=new Set(initial?flattenCategoryTree(initial.children).map((item)=>item.id):[]);
  const excludedIds=new Set([initial?.id,...descendantIds].filter(Boolean) as string[]);
  const [form,setForm]=useState({
    name:initial?.name||"",
    parentId:initial?.parentId||"",
    unit:initial?.unit||"kg",
    price:initial?.price==="—"?"":initial?.price||"",
    sortOrder:initial?.sortOrder||0,
    fieldEstimate:initial?.fieldEstimate||false,
    enabled:initial?.enabled??true,
    showOnHome:initial?.showOnHome??true,
    minVisitKg: typeof initial?.minVisitKg==="number" ? String(initial.minVisitKg) : "",
  });
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [confirmingDelete,setConfirmingDelete]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const save=async()=>{
    if(!form.name.trim()){setError("请填写品类名称");return;}
    if(allNodes.some((item)=>item.id!==initial?.id&&item.name.trim().toLowerCase()===form.name.trim().toLowerCase())){setError("品类名称不能重复");return;}
    setSaving(true);
    try{
      await onSave({
        ...initial,
        id:initial?.id||`category-${Date.now()}`,
        categoryId:initial?.categoryId,
        parentId:form.parentId||null,
        name:form.name.trim(),
        unit:form.unit,
        price:form.fieldEstimate?"—":form.price||"—",
        stationPrice:initial?.stationPrice||"—",
        priceRef:form.fieldEstimate?"现场估价":form.price?`${form.price}元/${form.unit}起`:"",
        sortOrder:form.sortOrder,
        fieldEstimate:form.fieldEstimate,
        enabled:form.enabled,
        showOnHome:form.parentId?false:form.showOnHome,
        minVisitKg: form.minVisitKg.trim()==="" ? undefined : Number(form.minVisitKg),
      });
      onClose();
    }finally{setSaving(false);}
  };
  const inputClass="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-50";
  // 二次确认 3 秒内不点 → 自动复原
  useEffect(()=>{
    if(!confirmingDelete)return;
    const timer=setTimeout(()=>setConfirmingDelete(false),3000);
    return()=>clearTimeout(timer);
  },[confirmingDelete]);
  const handleDeleteClick=async()=>{
    if(!initial||!onDelete)return;
    if(!confirmingDelete){setConfirmingDelete(true);return;}
    setDeleting(true);
    try{
      await onDelete(initial as RecycleItem);
    }finally{
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };
  const descendantCount=initial?flattenCategoryTree(initial.children).length:0;
  return <div className="fixed inset-0 z-50 flex items-center justify-center">
    <button className="absolute inset-0 bg-black/40" onClick={onClose}/>
    <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div><h2 className="font-semibold text-gray-900">{initial?"编辑品类节点":"添加品类"}</h2><p className="text-xs text-gray-400 mt-1">不选择父级即为一级类别，可选择任意节点作为父级</p></div>
        <button onClick={onClose}><X size={19} className="text-gray-400"/></button>
      </div>
      <div className="px-8 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
        <CategoryParentCascader nodes={nodes} value={form.parentId} excluded={excludedIds} onChange={(parentId)=>setForm({...form,parentId,showOnHome:parentId?false:form.showOnHome})}/>
        <div className="grid grid-cols-2 gap-4">
          <label><span className="block text-xs font-medium text-gray-500 mb-1.5">品类名称 *</span><input autoFocus value={form.name} onChange={(event)=>{setForm({...form,name:event.target.value});setError("");}} placeholder="请输入品类名称" className={`${inputClass} ${error?"border-red-300":""}`}/>{error&&<p className="text-xs text-red-500 mt-1">{error}</p>}</label>
          <label><span className="block text-xs font-medium text-gray-500 mb-1.5">显示顺序</span><input type="number" value={form.sortOrder} onChange={(event)=>setForm({...form,sortOrder:Number(event.target.value)||0})} className={inputClass}/></label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label><span className="block text-xs font-medium text-gray-500 mb-1.5">计量单位</span><select value={form.unit} onChange={(event)=>setForm({...form,unit:event.target.value})} className={`${inputClass} bg-white`}>{["kg","斤","台","件","双","袋","箱"].map((unit)=><option key={unit}>{unit}</option>)}</select></label>
          <label><span className="block text-xs font-medium text-gray-500 mb-1.5">参考价格（元）</span><input disabled={form.fieldEstimate} value={form.price} onChange={(event)=>setForm({...form,price:event.target.value})} placeholder={form.fieldEstimate?"现场估价":"可留空"} className={`${inputClass} disabled:bg-gray-100`}/></label><label><span className="block text-xs font-medium text-gray-500 mb-1.5">最低上门重量（斤）<span className="text-gray-300 font-normal"> · 留空沿用全局</span></span><input type="number" min={0} step={0.1} value={form.minVisitKg} onChange={(event)=>setForm({...form,minVisitKg:event.target.value})} placeholder="例如：10（不填则沿用全局设置）" className={`${inputClass} font-mono`}/></label>
        </div>
        <div className="flex items-center justify-between px-3 py-2 bg-amber-50 rounded-xl"><div><p className="text-sm font-medium text-amber-800">现场估价</p><p className="text-xs text-amber-600">该节点不设置固定参考价格</p></div><button onClick={()=>setForm({...form,fieldEstimate:!form.fieldEstimate})}>{form.fieldEstimate?<ToggleRight size={26} className="text-amber-500"/>:<ToggleLeft size={26} className="text-gray-300"/>}</button></div>
        {!form.parentId&&<div className="flex items-center justify-between px-3 py-2 bg-green-50 rounded-xl"><div><p className="text-sm font-medium text-green-800">首页展示</p><p className="text-xs text-green-600">首页最多展示排序靠前的 4 个一级类别</p></div><button onClick={()=>setForm({...form,showOnHome:!form.showOnHome})}>{form.showOnHome?<ToggleRight size={26} className="text-green-500"/>:<ToggleLeft size={26} className="text-gray-300"/>}</button></div>}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-xl"><div><p className="text-sm font-medium text-gray-700">启用节点</p><p className="text-xs text-gray-400">停用后该节点不在小程序展示</p></div><button onClick={()=>setForm({...form,enabled:!form.enabled})}>{form.enabled?<ToggleRight size={26} className="text-green-500"/>:<ToggleLeft size={26} className="text-gray-300"/>}</button></div>
      </div>
      <div className="flex items-center gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
        {initial&&onDelete&&(
          <button type="button" onClick={()=>void handleDeleteClick()} disabled={deleting} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 mr-auto ${confirmingDelete?"bg-red-600 text-white hover:bg-red-700":"text-red-500 hover:bg-red-50"}`}>
            <Trash2 size={14}/>
            {deleting?"删除中…":confirmingDelete?(descendantCount?`确认删除（含 ${descendantCount} 个子节点）？`:"确认删除？"):"删除"}
          </button>
        )}
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">取消</button>
        <button disabled={saving} onClick={()=>void save()} className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-40">{saving?"保存中…":initial?"保存修改":"添加品类"}</button>
      </div>
    </div>
  </div>;
}

function getCategoryDepth(nodes:CategoryNode[],id:string,depth=0):number {
  for(const node of nodes){
    if(node.id===id)return depth;
    const found=getCategoryDepth(node.children,id,depth+1);
    if(found>=0)return found;
  }
  return -1;
}

function CategoryTreePage({nodes,onSave,onDelete}:{nodes:CategoryNode[];onSave:(item:RecycleItem)=>Promise<void>;onDelete:(item:RecycleItem)=>Promise<void>}) {
  const [search,setSearch]=useState("");
  const [expanded,setExpanded]=useState<Set<string>>(new Set(flattenCategoryTree(nodes).map((item)=>item.id)));
  const [editing,setEditing]=useState<CategoryNode>();
  const [adding,setAdding]=useState(false);
  useEffect(()=>setExpanded((current)=>new Set([...current,...flattenCategoryTree(nodes).map((item)=>item.id)])),[nodes]);
  const visible=filterCategoryTree(nodes,search);
  const toggle=(id:string)=>setExpanded((current)=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next;});
  const renderRows=(items:CategoryNode[],depth=0):ReactNode=>items.map((item)=><Fragment key={item.id}><tr tabIndex={0} onClick={()=>setEditing(item)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setEditing(item);}}} className={`border-b border-gray-50 hover:bg-green-50/40 cursor-pointer ${!item.enabled?"opacity-50":""}`}><td className="px-4 py-3"><div className="flex items-center gap-2" style={{paddingLeft:depth*28}}>{item.children.length>0?<button onClick={(event)=>{event.stopPropagation();toggle(item.id);}} className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:bg-gray-100">{expanded.has(item.id)?<ChevronDown size={15}/>:<ChevronRight size={15}/>}</button>:<span className="w-6 flex justify-center"><span className="w-1.5 h-1.5 rounded-full bg-gray-300"/></span>}<div className={`w-7 h-7 rounded-lg flex items-center justify-center ${depth===0?"bg-green-100 text-green-700":"bg-gray-100 text-gray-500"}`}>{depth===0?<Package size={14}/>:<Tags size={13}/>}</div><div><p className="text-sm font-medium text-gray-800">{item.name}</p><p className="text-[10px] text-gray-400">{depth===0?"根节点":`第 ${depth+1} 层节点`} · {item.children.length} 个直接子节点</p></div></div></td><td className="px-4 py-3 text-xs text-gray-500 font-mono">{item.unit||"—"}</td><td className="px-4 py-3 text-sm font-mono">{item.fieldEstimate?<span className="text-amber-600">现场估价</span>:item.price&&item.price!=="—"?`¥${item.price}`:"—"}</td><td className="px-4 py-3 text-xs text-gray-500 font-mono">{typeof item.minVisitKg==="number"?`≥ ${item.minVisitKg} kg`:<span className="text-gray-300">— 全局</span>}</td><td className="px-4 py-3 text-xs text-gray-500">{item.sortOrder??0}</td><td className="px-4 py-3" onClick={(event)=>event.stopPropagation()}><button onClick={()=>void onSave({...item,enabled:!item.enabled})}>{item.enabled?<span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 border border-green-200">已启用</span>:<span className="px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-600 border border-red-200">已停用</span>}</button></td></tr>{item.children.length>0&&expanded.has(item.id)&&renderRows(item.children,depth+1)}</Fragment>);
  return <div className="p-6 space-y-5"><div className="flex items-center justify-between"><div><h1 className="text-xl font-semibold text-gray-900">品类管理</h1><p className="text-sm text-gray-400 mt-0.5">统一父子节点模型，支持任意层级嵌套</p></div><button onClick={()=>setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700"><Plus size={14}/>添加品类</button></div><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="搜索品类节点…" className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white outline-none focus:border-green-400"/></div><div className="bg-white rounded-xl border border-gray-100 overflow-hidden"><table className="w-full"><thead><tr className="bg-gray-50 border-b border-gray-100">{["品类树","单位","参考价格","上门门槛","排序","状态"].map((title)=><th key={title} className="text-left px-4 py-3 text-xs font-semibold text-gray-500">{title}</th>)}</tr></thead><tbody>{renderRows(visible)}{visible.length===0&&<tr><td colSpan={6} className="px-6 py-16 text-center text-sm text-gray-400">暂无品类节点</td></tr>}</tbody></table></div>{adding&&<CategoryNodeModal key="new" nodes={nodes} onSave={onSave} onClose={()=>setAdding(false)}/>} {editing&&<CategoryNodeModal key={editing.id} nodes={nodes} initial={editing} onSave={onSave} onClose={()=>setEditing(undefined)} onDelete={async(item)=>{await onDelete(item);setEditing(undefined);}}/>}</div>;
}

// ─── System Page ──────────────────────────────────────────────────────────────
const SYS_CFG_COL_KEY = "system-config-column-widths-v1";
const SYS_CFG_DEFAULT_WIDTHS = ["40%", "auto", "6rem", "10rem", "11rem"];
const SYS_CFG_MIN_WIDTHS = ["14rem", "10rem", "5rem", "8rem", "9rem"];

// ─── 投诉建议：小程序端提交，后台只读 ─────────────────────────────────────────
// 投诉建议页目前只做查看：状态徽章与筛选保留，不提供「标记已处理」入口
function FeedbackPage({items,loading,onRefresh}:{items:FeedbackRecord[];loading:boolean;onRefresh:()=>Promise<void>}){
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState<"all"|"pending"|"handled">("all");
  const [currentPage,setCurrentPage]=useState(1);
  const PAGE_SIZE=20;

  const filtered=items.filter((item)=>{
    if(statusFilter!=="all"&&item.status!==statusFilter)return false;
    if(!search.trim())return true;
    const keyword=search.trim().toLowerCase();
    return [item.content,item.contact,item.userSnapshot?.nickName,item.userSnapshot?.phone,(item.tags||[]).join(" ")]
      .some((value)=>String(value||"").toLowerCase().includes(keyword));
  });
  const pendingCount=items.filter((item)=>item.status==="pending").length;
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const safePage=Math.min(currentPage,totalPages);
  const paged=filtered.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);

  const contactOf=(item:FeedbackRecord)=>item.contact||item.userSnapshot?.phone||"";
  const nameOf=(item:FeedbackRecord)=>item.userSnapshot?.nickName||"匿名用户";

  const statusBadge=(item:FeedbackRecord)=>item.status==="handled"
    ?<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-green-100 text-green-700 border-green-200"><CheckCircle2 size={11}/>已处理</span>
    :<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-amber-50 text-amber-700 border-amber-200"><AlertCircle size={11}/>待处理</span>;

  const tagChips=(item:FeedbackRecord)=>(item.tags||[]).length===0
    ?<span className="text-xs text-gray-300">未选标签</span>
    :<div className="flex flex-wrap gap-1">{(item.tags||[]).map((tag)=>
        <span key={tag} className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs whitespace-nowrap">{tag}</span>)}</div>;

  return <div className="p-4 md:p-6 space-y-4 md:space-y-5">
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div>
        <h1 className="text-lg md:text-xl font-semibold text-gray-900">投诉建议</h1>
        <p className="text-xs md:text-sm text-gray-400 mt-0.5">小程序「我的 - 投诉和建议」提交的内容，共 {items.length} 条，待处理 {pendingCount} 条</p>
      </div>
      <button onClick={()=>void onRefresh()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-gray-500 border border-gray-200 hover:bg-gray-50"><RefreshCw size={12} className={loading?"animate-spin":""}/>刷新</button>
    </div>

    <div className="flex flex-col sm:flex-row gap-2">
      <div className="relative flex-1">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
        <input value={search} onChange={(event)=>{setSearch(event.target.value);setCurrentPage(1);}} placeholder="搜索内容、标签、昵称或手机号…" className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white outline-none focus:border-green-400"/>
      </div>
      <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 p-1">
        {([["all","全部"],["pending","待处理"],["handled","已处理"]] as const).map(([value,label])=>
          <button key={value} onClick={()=>{setStatusFilter(value);setCurrentPage(1);}} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter===value?"bg-green-50 text-green-700":"text-gray-500 hover:bg-gray-50"}`}>{label}</button>)}
      </div>
    </div>

    {/* Mobile Card List */}
    <div className="md:hidden space-y-3">
      {paged.length===0?<div className="bg-white rounded-xl p-8 text-center text-sm text-gray-400 border border-gray-100">暂无反馈</div>:paged.map((item)=>
        <div key={item._id} className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-800">{nameOf(item)}</p>
            {statusBadge(item)}
          </div>
          <div className="mb-2">{tagChips(item)}</div>
          {item.content&&<p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words mb-2">{item.content}</p>}
          <div className="pt-2 border-t border-gray-50">
            <div className="text-xs text-gray-400 font-mono">{contactOf(item)||"无联系方式"} · {formatCloudTime(item.createTime)}</div>
          </div>
        </div>
      )}
      <div className="text-center text-xs text-gray-400 py-2">{filtered.length} / {items.length} 条反馈</div>
    </div>

    {/* Desktop Table */}
    <div className="hidden md:block bg-white rounded-xl border border-gray-100 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            {["提交人","问题标签","反馈内容","提交时间","状态"].map((title)=>
              <th key={title} className="text-left px-5 py-3 text-xs font-medium text-gray-500 tracking-wide">{title}</th>)}
          </tr>
        </thead>
        <tbody>
          {paged.map((item)=>
            <tr key={item._id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 align-top">
              <td className="px-5 py-4">
                <p className="text-sm font-medium text-gray-800 whitespace-nowrap">{nameOf(item)}</p>
                <p className="text-xs text-gray-400 font-mono mt-0.5 whitespace-nowrap">{contactOf(item)||"—"}</p>
              </td>
              <td className="px-5 py-4">{tagChips(item)}</td>
              <td className="px-5 py-4 max-w-md">
                {item.content
                  ?<p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{item.content}</p>
                  :<span className="text-xs text-gray-300">未填写描述</span>}
              </td>
              <td className="px-5 py-4 text-xs text-gray-400 font-mono whitespace-nowrap">{formatCloudTime(item.createTime)}</td>
              <td className="px-5 py-4">
                {statusBadge(item)}
                {item.status==="handled"&&item.handledBy&&<p className="text-xs text-gray-400 mt-1 whitespace-nowrap">{item.handledBy}</p>}
              </td>
            </tr>
          )}
          {paged.length===0&&<tr><td colSpan={5} className="px-6 py-16 text-center text-sm text-gray-400">{loading?"正在加载…":"暂无反馈"}</td></tr>}
        </tbody>
      </table>
      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-400">显示 {paged.length} / {filtered.length} 条</span>
        <div className="flex items-center gap-1">
          <button disabled={safePage<=1} onClick={()=>setCurrentPage((page)=>Math.max(1,page-1))} className="w-7 h-7 rounded-lg text-xs flex items-center justify-center border border-gray-200 text-gray-500 disabled:opacity-30">‹</button>
          <span className="px-2 text-xs text-gray-500">{safePage}/{totalPages}</span>
          <button disabled={safePage>=totalPages} onClick={()=>setCurrentPage((page)=>Math.min(totalPages,page+1))} className="w-7 h-7 rounded-lg text-xs flex items-center justify-center border border-gray-200 text-gray-500 disabled:opacity-30">›</button>
        </div>
      </div>
    </div>
  </div>;
}

function SystemPage({items,onSave,onDelete}:{items:SystemSetting[];onSave:(item:SystemSetting)=>Promise<void>;onDelete:(item:SystemSetting)=>Promise<void>}){
  const [search,setSearch]=useState("");
  const [editing,setEditing]=useState<SystemSetting|null|undefined>(undefined);

  // 列宽拖拽：拖拽期间直接改 DOM，mouseup 才同步 state 到 React + localStorage
  const sysTableRef=useRef<HTMLTableElement>(null);
  const sysDragRef=useRef<{index:number;startX:number;startWidth:number}|null>(null);
  const [colWidths,setColWidths]=useState<string[]>(()=>{
    if(typeof window==="undefined")return SYS_CFG_DEFAULT_WIDTHS;
    try{
      const saved=window.localStorage.getItem(SYS_CFG_COL_KEY);
      if(saved){
        const parsed=JSON.parse(saved);
        if(Array.isArray(parsed)&&parsed.length===SYS_CFG_DEFAULT_WIDTHS.length)return parsed;
      }
    }catch{}
    return SYS_CFG_DEFAULT_WIDTHS;
  });
  useEffect(()=>{
    if(typeof window==="undefined")return;
    try{window.localStorage.setItem(SYS_CFG_COL_KEY,JSON.stringify(colWidths));}catch{}
  },[colWidths]);
  const onColMouseMove=useCallback((event:MouseEvent)=>{
    const drag=sysDragRef.current;
    if(!drag||!sysTableRef.current)return;
    const colEl=sysTableRef.current.querySelectorAll("col")[drag.index] as HTMLElement|undefined;
    if(!colEl)return;
    const minPx=parseInt(SYS_CFG_MIN_WIDTHS[drag.index],10);
    const newPx=Math.max(minPx,drag.startWidth+(event.clientX-drag.startX));
    const tableWidth=sysTableRef.current.getBoundingClientRect().width;
    const newPct=Math.min(95,Math.max(2,(newPx/tableWidth)*100));
    colEl.style.width=`${newPct.toFixed(2)}%`;
  },[]);
  const onColMouseUp=useCallback(()=>{
    const drag=sysDragRef.current;
    if(drag&&sysTableRef.current){
      const colEl=sysTableRef.current.querySelectorAll("col")[drag.index] as HTMLElement|undefined;
      if(colEl&&colEl.style.width){
        const final=colEl.style.width;
        setColWidths((prev)=>{const next=[...prev];next[drag.index]=final;return next;});
      }
    }
    sysDragRef.current=null;
    document.body.style.userSelect="";
    document.body.style.cursor="";
    window.removeEventListener("mousemove",onColMouseMove);
    window.removeEventListener("mouseup",onColMouseUp);
  },[onColMouseMove]);
  const startColDrag=(index:number)=>(event:React.MouseEvent)=>{
    event.preventDefault();
    event.stopPropagation();
    if(!sysTableRef.current)return;
    const colEl=sysTableRef.current.querySelectorAll("col")[index] as HTMLElement|undefined;
    if(!colEl)return;
    sysDragRef.current={index,startX:event.clientX,startWidth:colEl.getBoundingClientRect().width};
    document.body.style.userSelect="none";
    document.body.style.cursor="col-resize";
    window.addEventListener("mousemove",onColMouseMove);
    window.addEventListener("mouseup",onColMouseUp);
  };
  const resetColWidths=()=>{setColWidths(SYS_CFG_DEFAULT_WIDTHS);};
  const filtered=items.filter((item)=>[item.key,item.label,item.value,item.description].some((value)=>String(value||"").toLowerCase().includes(search.toLowerCase())));
  const typeText:Record<SystemSetting["type"],string>={text:"文本",number:"数字",boolean:"布尔",image:"图片",longtext:"长文本"};
  return <div className="p-4 md:p-6 space-y-4 md:space-y-5">
    <div className="flex items-center justify-between flex-wrap gap-2"><div><h1 className="text-lg md:text-xl font-semibold text-gray-900">系统配置字典</h1><p className="text-xs md:text-sm text-gray-400 mt-0.5">所有 value 统一按字符串保存，小程序和管理端共用</p></div><div className="flex items-center gap-2"><button onClick={resetColWidths} className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-gray-500 border border-gray-200 hover:bg-gray-50"><RotateCcw size={12}/>重置列宽</button><button onClick={()=>setEditing(null)} className="flex items-center gap-2 px-3 py-2 md:px-4 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700"><Plus size={14}/>新增配置</button></div></div>
    <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="搜索 Key、名称、Value 或说明…" className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white outline-none focus:border-green-400"/></div>
    {/* Mobile Card List */}
    <div className="md:hidden space-y-3">
      {filtered.length===0?<div className="bg-white rounded-xl p-8 text-center text-sm text-gray-400 border border-gray-100">暂无匹配的配置项</div>:filtered.map((item)=>(
        <div key={item.key} className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <code className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded font-mono">{item.key}</code>
            <span className="inline-flex text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{typeText[item.type]}</span>
          </div>
          <p className="text-sm font-medium text-gray-800 mb-1">{item.label||item.key}</p>
          {item.description&&<p className="text-xs text-gray-500 mb-2 leading-relaxed">{item.description}</p>}
          <div className="mt-2 pt-2 border-t border-gray-50">
            {item.type==="image"?(
              item.imageUrl?<div className="flex items-center gap-2"><img src={cloudUrlToHttps(item.imageUrl)} alt={item.label} className="w-16 h-10 object-cover rounded border border-gray-200 flex-shrink-0"/><span className="text-xs text-gray-400 font-mono truncate">已上传图片</span></div>:<span className="text-xs text-gray-400">未上传图片</span>
            ):(
              <span className={`text-xs font-mono text-gray-600 break-all ${item.type==="longtext"?"line-clamp-2":"whitespace-pre-wrap line-clamp-2"}`}>{item.value||<span className="text-gray-300">空字符串</span>}</span>
            )}
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={()=>setEditing(item)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100"><Edit2 size={12}/>编辑</button>
          </div>
        </div>
      ))}
      <div className="text-center text-xs text-gray-400 py-2">{filtered.length} / {items.length} 项配置</div>
    </div>

    {/* Desktop Table */}
    <div className="hidden md:block bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table ref={sysTableRef} className="w-full table-fixed">
            <colgroup>
              {colWidths.map((width,i)=>(<col key={i} style={{width,minWidth:SYS_CFG_MIN_WIDTHS[i]}} />))}
            </colgroup>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {["Key & 标签","Value","类型","更新时间","操作"].map((title,i)=>
                  <th key={title} style={{minWidth:SYS_CFG_MIN_WIDTHS[i]}} className="relative text-left px-5 py-3 text-xs font-medium text-gray-500 tracking-wide select-none">
                    {title}
                    <div onMouseDown={startColDrag(i)} className="absolute top-0 right-0 h-full w-2 -mr-1 cursor-col-resize hover:bg-green-400/60 active:bg-green-500/70 z-10" title="拖动以调整列宽"/>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item)=>
                <tr key={item.key} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 align-top">
                  <td className="px-5 py-4">
                    <code className="inline-block text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded font-mono">{item.key}</code>
                    <p className="text-sm font-medium text-gray-800 mt-2">{item.label||item.key}</p>
                    {item.description&&<p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.description}</p>}
                  </td>
                  <td className="px-5 py-4">
                    {item.type==="image"?(
                      item.imageUrl?
                        <div className="flex items-center gap-3">
                          <img src={cloudUrlToHttps(item.imageUrl)} alt={item.label} className="w-24 h-14 object-cover rounded border border-gray-200 flex-shrink-0"/>
                          <span className="text-xs text-gray-500 font-mono break-all line-clamp-2">{item.value}</span>
                        </div>
                        :<span className="text-xs text-gray-400">未上传图片</span>
                    ):(
                      <span className={`text-sm font-mono text-gray-700 break-all ${item.type==="longtext"?"line-clamp-3":"whitespace-pre-wrap"}`}>{item.value||<span className="text-gray-300">空字符串</span>}</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{typeText[item.type]}</span>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-400 font-mono whitespace-nowrap">{formatCloudTime(item.updateTime)}</td>
                  <td className="px-5 py-4">
                    <RowActions layout="inline">
                      <RowActionButton tone="blue" icon={Edit2} onClick={()=>setEditing(item)}>编辑</RowActionButton>
                    </RowActions>
                  </td>
                </tr>
              )}
              {filtered.length===0&&<tr><td colSpan={5} className="px-6 py-16 text-center text-sm text-gray-400">暂无匹配的配置项</td></tr>}
            </tbody>
          </table>
          <div className="px-5 py-3 border-t text-xs text-gray-400">共 {filtered.length} / {items.length} 项配置</div>
        </div>
    {editing!==undefined&&<SystemSettingEditor key={(editing&&editing._id)||"new"} initial={editing} onClose={()=>setEditing(undefined)} onSave={async(item)=>{await onSave(item);setEditing(undefined);}} onDelete={async(item)=>{await onDelete(item);setEditing(undefined);}}/>}
  </div>;
}

function SystemSettingEditor({initial,onClose,onSave,onDelete}:{initial:SystemSetting|null;onClose:()=>void;onSave:(item:SystemSetting)=>Promise<void>;onDelete?:(item:SystemSetting)=>Promise<void>}){
  const [form,setForm]=useState<SystemSetting>(initial?{...initial}:{key:"",value:"",type:"text",label:"",description:""});
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [uploadError,setUploadError]=useState("");
  const [confirmingDelete,setConfirmingDelete]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const fileInputRef=useRef<HTMLInputElement>(null);
  const keyLocked=Boolean(initial);
  const validKey=/^[a-z][a-z0-9_]{1,63}$/.test(form.key);
  const isBanner=/^home_banner(?:_\d+)?$/.test(form.key);
  const submit=async()=>{
    if(!validKey||uploading||(form.type==="image"&&!form.value))return;
    setSaving(true);
    try{
      await onSave({...form,key:form.key.trim(),label:form.label.trim(),description:form.description?.trim()});
    }finally{
      setSaving(false);
    }
  };
  const uploadImage=async(file?:File)=>{
    if(!file)return;
    setUploadError("");
    if(!validKey){setUploadError("请先填写有效的配置 Key");return;}
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)){setUploadError("仅支持 JPG、PNG、WebP 图片");return;}
    if(file.size>10*1024*1024){setUploadError("图片不能超过 10MB");return;}
    setUploading(true);
    try{
      const fileID=await uploadSystemImage(form.key,file);
      setForm((current)=>({...current,value:fileID,imageUrl:URL.createObjectURL(file)}));
    }catch{
      setUploadError("上传失败，请检查云存储权限后重试");
    }finally{
      setUploading(false);
      if(fileInputRef.current)fileInputRef.current.value="";
    }
  };
  // 二次确认 3 秒内不点 → 自动复原
  useEffect(()=>{
    if(!confirmingDelete)return;
    const timer=setTimeout(()=>setConfirmingDelete(false),3000);
    return()=>clearTimeout(timer);
  },[confirmingDelete]);
  const handleDeleteClick=async()=>{
    if(!initial||!onDelete)return;
    if(!confirmingDelete){setConfirmingDelete(true);return;}
    setDeleting(true);
    try{
      await onDelete(initial);
    }finally{
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center">
    <button className="absolute inset-0 bg-black/40" onClick={onClose}/>
    <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
      <div className="flex justify-between">
        <div><h2 className="font-semibold text-gray-900">{initial?"编辑配置":"新增配置"}</h2><p className="text-xs text-gray-400 mt-1">图片类型会自动上传至云存储并保存 FileID</p></div>
        <button onClick={onClose}><X size={18}/></button>
      </div>
      <label className="block">
        <span className="text-xs text-gray-500">Key *</span>
        <input disabled={keyLocked} value={form.key} onChange={(event)=>setForm({...form,key:event.target.value})} placeholder="例如 home_banner_2" className="mt-1 w-full px-3 py-2 border rounded-lg text-sm font-mono disabled:bg-gray-100"/>
        {!validKey&&form.key&&<p className="text-xs text-red-500 mt-1">只能使用小写字母、数字和下划线，并以字母开头</p>}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label><span className="text-xs text-gray-500">名称</span><input value={form.label} onChange={(event)=>setForm({...form,label:event.target.value})} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"/></label>
        <label><span className="text-xs text-gray-500">类型</span><select value={form.type} onChange={(event)=>setForm({...form,type:event.target.value as SystemSetting["type"]})} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-white"><option value="text">文本</option><option value="number">数字</option><option value="boolean">布尔</option><option value="image">图片上传</option><option value="longtext">长文本</option></select></label>
      </div>
      {form.type==="image"?<div>
        <span className="text-xs text-gray-500">图片文件 *</span>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event)=>void uploadImage(event.target.files?.[0])}/>
        <button type="button" onClick={()=>fileInputRef.current?.click()} disabled={uploading} className="mt-1 w-full min-h-40 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 hover:border-green-300 overflow-hidden disabled:opacity-60">
          {form.imageUrl?<div className="relative"><img src={form.imageUrl} alt="配置图片预览" className="w-full h-40 object-cover"/><span className="absolute right-2 bottom-2 px-2 py-1 rounded bg-black/60 text-white text-xs">{uploading?"上传中…":"点击更换"}</span></div>:<div className="h-40 flex flex-col items-center justify-center gap-2 text-gray-400"><Upload size={24}/><span className="text-sm">{uploading?"正在上传…":"点击选择图片"}</span><span className="text-xs">JPG / PNG / WebP，最大 10MB</span></div>}
        </button>
        {isBanner&&<p className="text-xs text-gray-400 mt-2">首页 Banner 建议使用 5:3 横图；轮播图 Key 依次使用 home_banner、home_banner_2、home_banner_3。</p>}
        {form.value&&<p className="mt-2 text-[11px] text-gray-400 font-mono truncate" title={form.value}>{form.value}</p>}
        {uploadError&&<p className="text-xs text-red-500 mt-2">{uploadError}</p>}
      </div>:<label className="block">
        <span className="text-xs text-gray-500">Value</span>
        {form.type==="boolean"?<select value={form.value} onChange={(event)=>setForm({...form,value:event.target.value})} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-white"><option value="true">true</option><option value="false">false</option></select>:<textarea rows={form.type==="longtext"?14:4} value={form.value} onChange={(event)=>setForm({...form,value:event.target.value})} className={`mt-1 w-full px-3 py-2 border rounded-lg text-sm ${form.type==="longtext"?"font-sans":"font-mono"} resize-y`} placeholder={form.type==="longtext"?"请输入完整条款内容，支持换行…":"配置值"}/>}
      </label>}
      <label className="block"><span className="text-xs text-gray-500">说明</span><textarea rows={2} value={form.description||""} onChange={(event)=>setForm({...form,description:event.target.value})} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm resize-none"/></label>
      <div className="flex items-center gap-2">
        {initial&&onDelete&&(
          <button type="button" onClick={()=>void handleDeleteClick()} disabled={deleting} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 mr-auto ${confirmingDelete?"bg-red-600 text-white hover:bg-red-700":"text-red-500 hover:bg-red-50"}`}>
            <Trash2 size={14}/>
            {deleting?"删除中…":confirmingDelete?"确认删除？":(initial._id?.startsWith("virtual:")?"移除默认":"删除")}
          </button>
        )}
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">取消</button>
        <button disabled={saving||uploading||!validKey||(form.type==="image"&&!form.value)} onClick={()=>void submit()} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm disabled:opacity-40">{uploading?"上传中…":saving?"保存中…":"保存"}</button>
      </div>
    </div>
  </div>;
}

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }:{ onLogin:()=>void }) {
  const [username,setUsername]=useState(""); const [password,setPassword]=useState("");
  const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
  const handleSubmit=(e:React.FormEvent)=>{
    e.preventDefault();
    if(!username||!password){setError("请输入用户名和密码");return;}
    setLoading(true);setError("");
    setTimeout(()=>{username==="admin"&&password==="admin123"?onLogin():(setError("用户名或密码错误"),setLoading(false));},700);
  };
  return(
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{background:"linear-gradient(135deg,#1e2d1e 0%,#2a4a2a 40%,#1a7a3c 100%)"}}>
      <div className="absolute top-[-80px] left-[-80px] w-80 h-80 rounded-full opacity-10" style={{background:"#2ecc71"}}/>
      <div className="absolute bottom-[-60px] right-[-60px] w-64 h-64 rounded-full opacity-10" style={{background:"#27ae60"}}/>
      <div className="relative z-10 w-full max-w-[400px] mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{background:"rgba(46,204,113,0.2)",border:"1px solid rgba(46,204,113,0.3)"}}><RefreshCw size={30} className="text-green-400"/></div>
          <h1 className="text-2xl font-bold text-white tracking-wide">帮帮回收</h1>
          <p className="text-green-300 text-sm mt-1 opacity-80">后台管理系统</p>
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-gray-800 mb-6">登录账号</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-600 mb-1.5">用户名</label>
              <div className="relative"><User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input type="text" value={username} onChange={e=>setUsername(e.target.value)} placeholder="请输入用户名" className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all"/>
              </div>
            </div>
            <div><label className="block text-sm font-medium text-gray-600 mb-1.5">密码</label>
              <div className="relative"><Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="请输入密码" className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all"/>
              </div>
            </div>
            {error&&<div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg"><XCircle size={14}/>{error}</div>}
            <button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg font-medium text-sm text-white mt-2 flex items-center justify-center gap-2 disabled:opacity-70 hover:opacity-90 transition-all" style={{background:"linear-gradient(135deg,#1a7a3c,#27ae60)"}}>
              {loading&&<Loader size={14} className="animate-spin"/>}{loading?"登录中…":"登 录"}
            </button>
          </form>
          <p className="text-center text-xs text-gray-400 mt-5">演示账号: admin / admin123</p>
        </div>
      </div>
    </div>
  );
}

// ─── Analytics Page ───────────────────────────────────────────────────────────
// 图表用的四态点色，与 STATUS_CFG 的 dot 色保持一致
const STATUS_COLORS: Record<string,string> = {
  "待上门":"#f59e0b","进行中":"#3b82f6","已完成":"#22c55e","已取消":"#9ca3af",
};
const CAT_PALETTE = ["#1a7a3c","#27ae60","#3b82f6","#8b5cf6","#f59e0b","#ef4444","#14b8a6","#ec4899"];

function AnalyticsPage({ orders }:{ orders:Order[] }) {
  type Range = "7"|"30"|"90"|"all";
  const [range,setRange]=useState<Range>("all");
  const RANGES:{label:string;value:Range}[]=[
    {label:"近7天",value:"7"},{label:"近30天",value:"30"},{label:"近90天",value:"90"},{label:"全部",value:"all"},
  ];

  const filtered=useMemo(()=>{
    if(range==="all") return orders;
    const days=parseInt(range);
    const cutoff=Date.now()-days*86400_000;
    return orders.filter(o=>new Date(o.createdAt.replace(" ","T")).getTime()>=cutoff);
  },[orders,range]);

  // KPIs
  const total=filtered.length;
  const completedOrders=filtered.filter(o=>o.status==="已完成");
  const cancelledCount=filtered.filter(o=>o.status==="已取消").length;
  const completionRate=total?(completedOrders.length/total*100).toFixed(1):"0";
  const totalAmount=completedOrders.reduce((s,o)=>s+(o.amount||0),0);
  const avgAmount=completedOrders.length?(totalAmount/completedOrders.length).toFixed(0):"0";

  // Status pie data
  const statusData=useMemo(()=>
    (["待上门","进行中","已完成","已取消"] as OrderStatus[])
      .map(s=>({name:s,value:filtered.filter(o=>o.status===s).length,color:STATUS_COLORS[s]}))
      .filter(d=>d.value>0),
  [filtered]);

  // Date trend data
  const trendData=useMemo(()=>{
    const map:Record<string,{count:number;amount:number}>={};
    filtered.forEach(o=>{
      const d=o.createdAt.split(" ")[0];
      if(!map[d]) map[d]={count:0,amount:0};
      map[d].count++;
      if(o.amount) map[d].amount+=o.amount;
    });
    return Object.entries(map)
      .sort(([a],[b])=>a.localeCompare(b))
      .map(([date,{count,amount}])=>({日期:date.slice(5),订单量:count,回收金额:parseFloat(amount.toFixed(2))}));
  },[filtered]);

  // Category data
  const catData=useMemo(()=>{
    const map:Record<string,{count:number;amount:number}>={};
    filtered.forEach(o=>{
      if(!map[o.category]) map[o.category]={count:0,amount:0};
      map[o.category].count++;
      if(o.amount) map[o.category].amount+=o.amount;
    });
    return Object.entries(map)
      .map(([name,{count,amount}])=>({name,订单数:count,回收金额:parseFloat(amount.toFixed(0))}))
      .sort((a,b)=>b.订单数-a.订单数);
  },[filtered]);

  // Recycler performance
  const recyclerData=useMemo(()=>{
    const map:Record<string,{total:number;completed:number;amount:number}>={};
    filtered.forEach(o=>{
      o.recyclers.forEach(r=>{
        if(!map[r]) map[r]={total:0,completed:0,amount:0};
        map[r].total++;
        if(o.status==="已完成"){map[r].completed++;map[r].amount+=(o.amount||0);}
      });
    });
    return Object.entries(map)
      .map(([name,{total,completed,amount}])=>({name,接单量:total,完成量:completed,回收金额:parseFloat(amount.toFixed(0))}))
      .sort((a,b)=>b.接单量-a.接单量)
      .slice(0,8);
  },[filtered]);

  function handleExport(){
    const quote=(value:unknown)=>`"${String(value??"").replace(/"/g,'""')}"`;
    const rows=[
      ["订单号","状态","用户名","电话","地址","品类","重量","预约时间","回收人员","创建时间","完成时间","回收金额"],
      ...filtered.map(o=>[o.id,o.status,o.userName,o.phone,o.address,o.category,o.weight,o.appointmentTime,o.recyclers.join("、"),o.createdAt,o.completedAt||"",o.amount||""]),
    ];
    const content="\uFEFF"+rows.map(row=>row.map(quote).join(",")).join("\n");
    const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download=`废品回收分析报表_${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(url);
  }

  const kpis=[
    {label:"总订单",value:String(total),sub:`取消 ${cancelledCount} 单`,icon:Package,color:"#1a7a3c",bg:"#e8f5ed"},
    {label:"完成率",value:`${completionRate}%`,sub:`完成 ${completedOrders.length} 单`,icon:CheckCircle2,color:"#3b82f6",bg:"#eff6ff"},
    {label:"总回收金额",value:`¥${totalAmount.toFixed(2)}`,sub:`${completedOrders.length} 笔已结算`,icon:Coins,color:"#f59e0b",bg:"#fffbeb"},
    {label:"平均每单",value:`¥${avgAmount}`,sub:"已完成订单均值",icon:TrendingUp,color:"#8b5cf6",bg:"#f5f3ff"},
  ];

  const CustomPieLabel=({cx,cy,midAngle,innerRadius,outerRadius,name,value,percent}:any)=>{
    if(percent<0.06) return null;
    const RADIAN=Math.PI/180;
    const r=outerRadius+18;
    const x=cx+r*Math.cos(-midAngle*RADIAN);
    const y=cy+r*Math.sin(-midAngle*RADIAN);
    return <text x={x} y={y} fill="#6b7280" textAnchor={x>cx?"start":"end"} dominantBaseline="central" style={{fontSize:11}}>{name} {value}</text>;
  };

  return(
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">分析统计</h1>
          <p className="text-sm text-gray-400 mt-0.5">多维度订单数据分析与导出</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Range filter */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
            {RANGES.map(r=>(
              <button key={r.value} onClick={()=>setRange(r.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${range===r.value?"bg-white shadow-sm text-gray-800":"text-gray-500 hover:text-gray-700"}`}
              >{r.label}</button>
            ))}
          </div>
          <button onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-all"
            style={{background:"linear-gradient(135deg,#1a7a3c,#27ae60)"}}
          ><Download size={14}/>导出报表</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-3 md:gap-4">
        {kpis.map(({label,value,sub,icon:Icon,color,bg})=>(
          <div key={label} className="bg-white rounded-xl p-5 border border-gray-100 flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400 mb-1">{label}</p>
              <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
              <p className="text-xs text-gray-400 mt-1.5">{sub}</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:bg}}>
              <Icon size={18} style={{color}}/>
            </div>
          </div>
        ))}
      </div>

      {/* Trend + Status Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        {/* Order Trend */}
        <div className="col-span-1 md:col-span-3 bg-white rounded-xl p-3 md:p-5 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">订单趋势</p>
              <p className="text-xs text-gray-400 mt-0.5">按创建日期统计</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 inline-block rounded-full bg-green-600"/><span>订单量</span></span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 inline-block rounded-full bg-blue-500"/><span>回收金额</span></span>
            </div>
          </div>
          {trendData.length===0
            ?<div className="h-48 flex items-center justify-center text-gray-300 text-sm">暂无数据</div>
            :<ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={trendData} margin={{top:4,right:16,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false}/>
                <XAxis dataKey="日期" tick={{fontSize:11,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
                <YAxis yAxisId="left" tick={{fontSize:11,fill:"#9ca3af"}} axisLine={false} tickLine={false} width={28}/>
                <YAxis yAxisId="right" orientation="right" tick={{fontSize:11,fill:"#9ca3af"}} axisLine={false} tickLine={false} width={40}/>
                <Tooltip contentStyle={{borderRadius:10,border:"1px solid #e5e7eb",boxShadow:"0 4px 12px rgba(0,0,0,0.08)",fontSize:12}}/>
                <Bar yAxisId="left" dataKey="订单量" fill="#e8f5ed" radius={[4,4,0,0]}/>
                <Line yAxisId="left" type="monotone" dataKey="订单量" stroke="#1a7a3c" strokeWidth={2.5} dot={{fill:"#1a7a3c",r:4,strokeWidth:0}} activeDot={{r:5}}/>
                <Line yAxisId="right" type="monotone" dataKey="回收金额" stroke="#3b82f6" strokeWidth={2} dot={{fill:"#3b82f6",r:3,strokeWidth:0}} strokeDasharray="5 3" activeDot={{r:5}}/>
              </ComposedChart>
            </ResponsiveContainer>
          }
        </div>

        {/* Status Pie */}
        <div className="col-span-1 md:col-span-2 bg-white rounded-xl p-3 md:p-5 border border-gray-100">
          <p className="text-sm font-semibold text-gray-800 mb-1">订单状态分布</p>
          <p className="text-xs text-gray-400 mb-3">各状态占比</p>
          {statusData.length===0
            ?<div className="h-48 flex items-center justify-center text-gray-300 text-sm">暂无数据</div>
            :<>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={3} labelLine={false} label={({name,percent})=>(percent??0)>0.08?`${((percent??0)*100).toFixed(0)}%`:""} style={{fontSize:11,fill:"#fff",fontWeight:600}}>
                    {statusData.map((entry,i)=><Cell key={i} fill={entry.color}/>)}
                  </Pie>
                  <Tooltip contentStyle={{borderRadius:10,border:"1px solid #e5e7eb",fontSize:12}}/>
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1.5">
                {statusData.map(d=>(
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:d.color}}/>
                      <span className="text-xs text-gray-600">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-800">{d.value}</span>
                      <span className="text-xs text-gray-400">{total?(d.value/total*100).toFixed(0):0}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          }
        </div>
      </div>

      {/* Category + Recycler Row */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-3 md:gap-4">
        {/* Category Bar */}
        <div className="bg-white rounded-xl p-3 md:p-5 border border-gray-100">
          <p className="text-sm font-semibold text-gray-800 mb-0.5">品类订单分布</p>
          <p className="text-xs text-gray-400 mb-4">各品类订单数量</p>
          {catData.length===0
            ?<div className="h-44 flex items-center justify-center text-gray-300 text-sm">暂无数据</div>
            :<ResponsiveContainer width="100%" height={180}>
              <BarChart data={catData} layout="vertical" margin={{top:0,right:40,left:4,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false}/>
                <XAxis type="number" tick={{fontSize:11,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="name" tick={{fontSize:11,fill:"#4b5563"}} axisLine={false} tickLine={false} width={58}/>
                <Tooltip contentStyle={{borderRadius:10,border:"1px solid #e5e7eb",fontSize:12}}/>
                <Bar dataKey="订单数" radius={[0,4,4,0]} barSize={14}>
                  {catData.map((_,i)=><Cell key={i} fill={CAT_PALETTE[i%CAT_PALETTE.length]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          }
        </div>

        {/* Recycler Bar */}
        <div className="bg-white rounded-xl p-3 md:p-5 border border-gray-100">
          <p className="text-sm font-semibold text-gray-800 mb-0.5">回收员业绩</p>
          <p className="text-xs text-gray-400 mb-4">接单量 vs 完成量</p>
          {recyclerData.length===0
            ?<div className="h-44 flex items-center justify-center text-gray-300 text-sm">暂无数据</div>
            :<ResponsiveContainer width="100%" height={180}>
              <BarChart data={recyclerData} margin={{top:0,right:8,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false}/>
                <XAxis dataKey="name" tick={{fontSize:11,fill:"#4b5563"}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:11,fill:"#9ca3af"}} axisLine={false} tickLine={false} width={24} allowDecimals={false}/>
                <Tooltip contentStyle={{borderRadius:10,border:"1px solid #e5e7eb",fontSize:12}}/>
                <Legend iconSize={8} wrapperStyle={{fontSize:11,paddingTop:8}}/>
                <Bar dataKey="接单量" fill="#d1fae5" stroke="#1a7a3c" strokeWidth={0} radius={[4,4,0,0]} barSize={14}/>
                <Bar dataKey="完成量" fill="#1a7a3c" radius={[4,4,0,0]} barSize={14}/>
              </BarChart>
            </ResponsiveContainer>
          }
        </div>
      </div>

      {/* Completed Orders - Mobile Cards */}
      <div className="md:hidden">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">已完成订单明细</p>
            <p className="text-xs text-gray-400 mt-0.5">有回收金额的已结算订单</p>
          </div>
          <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full font-medium">{completedOrders.filter(o=>o.amount).length} 笔</span>
        </div>
        <div className="space-y-2">
          {completedOrders.filter(o=>o.amount).length===0
            ?<div className="bg-white rounded-xl p-8 text-center text-sm text-gray-400 border border-gray-100">当前筛选范围内无已结算订单</div>
            :completedOrders.filter(o=>o.amount).sort((a,b)=>(b.amount||0)-(a.amount||0)).map(o=>(
              <div key={o.id} className="bg-white rounded-xl p-4 border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-gray-500">{o.id.slice(0,12)}…</span>
                  <span className="text-sm font-bold text-green-700">¥{(o.amount||0).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600 mb-1.5">
                  <span>{o.userName}</span>
                  <span className="text-gray-300">·</span>
                  <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100 font-medium">{o.category}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-50">
                  <div className="flex flex-wrap gap-1">{o.recyclers.map(r=><span key={r} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{r}</span>)}</div>
                  <span>{o.completedAt||"—"}</span>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* Completed Orders Table - Desktop */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-semibold text-gray-800">已完成订单明细</p>
            <p className="text-xs text-gray-400 mt-0.5">有回收金额的已结算订单</p>
          </div>
          <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full font-medium">{completedOrders.filter(o=>o.amount).length} 笔</span>
        </div>
        <table className="w-full">
          <thead><tr className="border-b border-gray-100 bg-gray-50/60">
            {["订单号","用户","品类","回收人员","完成时间","回收金额"].map(h=>(
              <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {completedOrders.filter(o=>o.amount).length===0
              ?<tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-300">当前筛选范围内无已结算订单</td></tr>
              :completedOrders.filter(o=>o.amount).sort((a,b)=>(b.amount||0)-(a.amount||0)).map(o=>(
                <tr key={o.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40 transition-colors">
                  <td className="px-5 py-3"><span className="text-xs font-mono text-gray-500">{o.id}</span></td>
                  <td className="px-5 py-3"><span className="text-sm text-gray-800">{o.userName}</span></td>
                  <td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100 font-medium">{o.category}</span></td>
                  <td className="px-5 py-3"><div className="flex flex-wrap gap-1">{o.recyclers.map(r=><span key={r} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{r}</span>)}</div></td>
                  <td className="px-5 py-3"><span className="text-xs text-gray-500">{o.completedAt||"—"}</span></td>
                  <td className="px-5 py-3"><span className="text-sm font-bold text-green-700">¥{(o.amount||0).toFixed(2)}</span></td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────────────
function AdminOrderDetailPage({id,token,onSaveOrder,onBack,onError}:{id:string;token:string;onSaveOrder:(order:Order)=>Promise<void>;onBack:()=>void;onError:(error:unknown)=>void}){
  const [editing,setEditing]=useState(false);
  const [order,setOrder]=useState<CloudOrder|null>(null);
  const [loading,setLoading]=useState(true);
  const [finalPriceText,setFinalPriceText]=useState("");
  const [adminRemarkText,setAdminRemarkText]=useState("");
  const [savingResult,setSavingResult]=useState(false);
  const reload=useCallback(async()=>{
    setLoading(true);
    try{
      const data=await callCloud<CloudOrder>("adminGetOrderDetail",{sessionToken:token,id});
      setOrder(data);
    }catch(error){onError(error);}
    finally{setLoading(false);}
  },[id,token,onError]);
  useEffect(()=>{void reload();},[reload]);
  useEffect(()=>{
    if(!order)return;
    setFinalPriceText(order.finalPrice==null?"":String(order.finalPrice));
    setAdminRemarkText(order.adminRemark||"");
  },[order]);
  const saveResult=async()=>{
    if(!order)return;
    setSavingResult(true);
    try{
      await onSaveOrder({...cloudOrderToFigma(order),amount:finalPriceText===""?undefined:Number(finalPriceText),adminRemark:adminRemarkText});
      // 保存成功后直接回写本地状态，避免 reload 让页面重新进入 loading
      setOrder({...order,finalPrice:finalPriceText===""?null:Number(finalPriceText),adminRemark:adminRemarkText,updateTime:Date.now()});
    }catch{/* saveOrder 内部已统一提示错误 */}
    finally{setSavingResult(false);}
  };
  if(loading)return <div className="min-h-[520px] flex items-center justify-center gap-3 text-gray-400"><Loader size={22} className="animate-spin text-green-600"/><span className="text-sm">正在读取订单详情…</span></div>;
  if(!order)return <div className="p-6"><button onClick={onBack} className="text-sm text-green-700">← 返回订单列表</button><div className="mt-8 bg-white rounded-xl p-12 text-center text-gray-400">订单不存在或加载失败</div></div>;
  const address=order.addressSnapshot||{};
  const status=CLOUD_TO_FIGMA_STATUS[order.status]||"待上门";
  const businessOrderType=resolveBusinessOrderType(order);
  const detailItems=order.source==="demolition"
    ? (order.demolition?.items||[]).map((name)=>({categoryName:name,demolition:true,estWeight:undefined,estCount:undefined}))
    : (order.items||[]).map((item)=>({...item,demolition:false}));
  return <div className="p-4 md:p-6 space-y-4 md:space-y-5 max-w-6xl mx-auto">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><button onClick={onBack} className="text-sm text-green-700 hover:text-green-900 mb-2">← 返回订单列表</button><div className="flex items-center gap-2 flex-wrap"><h1 className="text-lg md:text-xl font-semibold text-gray-900">订单详情</h1><OrderTypeBadge type={businessOrderType}/><StatusBadge status={status}/></div><p className="text-xs text-gray-400 font-mono mt-1">{order.orderNo}</p></div><div className="flex items-center justify-between gap-3"><button onClick={()=>setEditing(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{background:"linear-gradient(135deg,#1a7a3c,#27ae60)"}}><Edit2 size={14}/>编辑</button><div className="text-right text-xs text-gray-400"><p>创建时间</p><p className="font-mono mt-1">{formatCloudTime(order.createTime)}</p></div></div></div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
      <section className="bg-white rounded-xl border border-gray-100 p-4 md:p-5 space-y-3 md:space-y-4"><h2 className="font-semibold text-gray-800">联系人与预约</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 text-sm"><DetailField label="联系人" value={address.contactName}/><DetailField label="联系电话" value={address.phone}/><DetailField label="预约日期" value={order.appointDate}/><DetailField label="预约时段" value={order.appointSlot}/><div className="md:col-span-2"><DetailField label="上门地址" value={[address.region,address.detail].filter(Boolean).join(" ")}/></div></div></section>
      <section className="bg-white rounded-xl border border-gray-100 p-4 md:p-5 space-y-3 md:space-y-4"><h2 className="font-semibold text-gray-800">订单信息</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 text-sm"><DetailField label="订单类型" value={ORDER_TYPE_LABEL[businessOrderType]}/><DetailField label="最后修改" value={formatCloudTime(order.updateTime)}/><div className="md:col-span-2"><DetailField label="物品摘要" value={order.summary}/></div><div className="md:col-span-2"><DetailField label="用户备注" value={order.remark}/></div></div></section>
      <section className="bg-white rounded-xl border border-gray-100 p-4 md:p-5 space-y-3 md:space-y-4"><h2 className="font-semibold text-gray-800">物品明细</h2>{detailItems.length>0?<div className="divide-y divide-gray-100">{detailItems.map((item,index)=><div key={`${item.categoryName}-${index}`} className="py-3 flex justify-between text-sm"><span className="font-medium text-gray-700">{item.categoryName||"未命名项目"}</span><span className="text-gray-500">{item.demolition?"拆除评估":item.estWeight?`约 ${item.estWeight} kg`:item.estCount?`约 ${item.estCount} 件`:"待现场确认"}</span></div>)}</div>:<p className="text-sm text-gray-400">暂无结构化物品明细</p>}</section>
      <section className="bg-white rounded-xl border border-gray-100 p-4 md:p-5 space-y-3 md:space-y-4"><div className="flex items-center justify-between"><h2 className="font-semibold text-gray-800">处理结果</h2><button onClick={saveResult} disabled={savingResult} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-90 disabled:opacity-50" style={{background:"linear-gradient(135deg,#1a7a3c,#27ae60)"}}><Save size={13}/>{savingResult?"保存中…":"保存"}</button></div><div className="space-y-3"><div><label className="block text-xs font-medium text-gray-500 mb-1.5">最终金额（元）</label><input type="number" step="0.01" value={finalPriceText} onChange={e=>setFinalPriceText(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-50 transition-all"/></div><div><label className="block text-xs font-medium text-gray-500 mb-1.5">备注</label><textarea value={adminRemarkText} onChange={e=>setAdminRemarkText(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-50 transition-all resize-none"/></div>{order.cancelReason&&<DetailField label="取消原因" value={order.cancelReason}/>}</div></section>
    </div>
    <section className="bg-white rounded-xl border border-gray-100 p-4 md:p-5 space-y-3 md:space-y-4"><h2 className="font-semibold text-gray-800">物品照片</h2>{order.photoUrls&&order.photoUrls.length>0?<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">{order.photoUrls.map((url,index)=><a key={url} href={cloudUrlToHttps(url)} target="_blank" rel="noreferrer"><img src={cloudUrlToHttps(url)} alt={`物品照片 ${index+1}`} className="w-full aspect-square object-cover rounded-lg border border-gray-100"/></a>)}</div>:<p className="text-sm text-gray-400">暂无物品照片</p>}</section>
    {order.transferProofUrls&&order.transferProofUrls.length>0&&<section className="bg-white rounded-xl border border-gray-100 p-4 md:p-5 space-y-3 md:space-y-4"><h2 className="font-semibold text-gray-800">打款凭证</h2><div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">{order.transferProofUrls.map((url,index)=><a key={url} href={cloudUrlToHttps(url)} target="_blank" rel="noreferrer"><img src={cloudUrlToHttps(url)} alt={`打款凭证 ${index+1}`} className="w-full aspect-square object-cover rounded-lg border border-gray-100"/></a>)}</div></section>}
    {editing&&<OrderEditModal order={cloudOrderToFigma(order)} onSave={async(o)=>{try{await onSaveOrder(o);setEditing(false);await reload();}catch{setEditing(false);}}} onClose={()=>setEditing(false)}/>}
  </div>;
}

// ─── User Detail Page ─────────────────────────────────────────────────────────
function UserDetailPage({userId,token,onBack,onViewOrder,onError}:{userId:string;token:string;onBack:()=>void;onViewOrder:(id:string)=>void;onError:(error:unknown)=>void}){
  const [data,setData]=useState<{user:UserRecord&{openid?:string};addresses:Array<{_id:string;contactName?:string;phone?:string;region?:string;detail?:string;isDefault?:boolean;createTime?:number}>;orders:Array<{_id:string;orderNo?:string;status:string;estimatePrice?:number;finalPrice?:number;appointDate?:string;appointSlot?:string;summary?:string;createTime?:number}>}|null>(null);
  const [loading,setLoading]=useState(true);
  const reload=useCallback(async()=>{
    setLoading(true);
    try{
      const result=await callCloud<typeof data>("adminUserDetail",{sessionToken:token,userId});
      setData(result||null);
    }catch(error){onError(error);}
    finally{setLoading(false);}
  },[userId,token,onError]);
  useEffect(()=>{void reload();},[reload]);
  if(loading)return <div className="min-h-[520px] flex items-center justify-center gap-3 text-gray-400"><Loader size={22} className="animate-spin text-green-600"/><span className="text-sm">正在读取用户详情…</span></div>;
  if(!data||!data.user)return <div className="p-6"><button onClick={onBack} className="text-sm text-green-700">← 返回人员管理</button><div className="mt-8 bg-white rounded-xl p-12 text-center text-gray-400">用户不存在或加载失败</div></div>;
  const {user,addresses,orders}=data;
  return <div className="p-4 md:p-6 space-y-4 md:space-y-5 max-w-6xl mx-auto">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <button onClick={onBack} className="text-sm text-green-700 hover:text-green-900 mb-2">← 返回人员管理</button>
        <div className="flex items-center gap-3 flex-wrap">
          {user.avatarUrl?<img src={cloudUrlToHttps(user.avatarUrl)} className="w-10 h-10 rounded-full"/>:<div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center"><User size={18}/></div>}
          <div><h1 className="text-lg md:text-xl font-semibold text-gray-900">{user.nickName||"微信用户"}</h1>
          <p className="text-xs text-gray-400 font-mono">{user.phone||"未绑定手机"}</p></div>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${user.wechatBound?"bg-green-50 text-green-700":"bg-gray-100 text-gray-500"}`}>{user.wechatBound?"已绑定":"未绑定"}</span>
        </div>
      </div>
      <div className="text-right text-xs text-gray-400"><p>注册时间</p><p className="font-mono mt-1">{formatCloudTime(user.createTime)}</p></div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
      <section className="bg-white rounded-xl border border-gray-100 p-4 md:p-5 space-y-3 md:space-y-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2"><MapPin size={16} className="text-green-600"/>收货地址（{addresses.length}）</h2>
        {addresses.length===0?<p className="text-sm text-gray-400">暂无地址</p>:
        <div className="space-y-3">{addresses.map(a=>(
          <div key={a._id} className="bg-gray-50 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2"><span className="text-sm font-medium text-gray-700">{a.contactName||"未填写"}</span><span className="text-xs font-mono text-gray-500">{a.phone||""}</span>{a.isDefault&&<span className="inline-flex rounded-full px-1.5 py-0.5 text-xs bg-green-50 text-green-700">默认</span>}</div>
            <p className="text-xs text-gray-500">{[a.region,a.detail].filter(Boolean).join(" ")||"无详细地址"}</p>
            <p className="text-xs text-gray-400">{formatCloudTime(a.createTime)}</p>
          </div>
        ))}</div>}
      </section>
      <section className="bg-white rounded-xl border border-gray-100 p-4 md:p-5 space-y-3 md:space-y-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Package size={16} className="text-green-600"/>订单记录（{orders.length}）</h2>
        {orders.length===0?<p className="text-sm text-gray-400">暂无订单</p>:
        <div className="space-y-2">{orders.map(o=>{
          const fStatus=CLOUD_TO_FIGMA_STATUS[o.status as CloudOrderStatus]||"待上门";
          return <div key={o._id} onClick={()=>onViewOrder(o._id)} className="bg-gray-50 rounded-lg p-3 cursor-pointer hover:bg-gray-100 transition-colors">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono text-gray-500 truncate">{o.orderNo||o._id}</span>
              <StatusBadge status={fStatus}/>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{o.appointDate||"未预约"} {o.appointSlot||""}</span>
              <span className="font-medium text-gray-700">{o.finalPrice!=null?`¥${Number(o.finalPrice).toFixed(2)}`:o.estimatePrice!=null?`估 ¥${Number(o.estimatePrice).toFixed(2)}`:"待估价"}</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">{o.summary||"无摘要"}</p>
            <p className="text-xs text-gray-400">{formatCloudTime(o.createTime)}</p>
          </div>;
        })}</div>}
      </section>
    </div>
  </div>;
}

function DetailField({label,value}:{label:string;value?:string|null}){return <div><p className="text-xs text-gray-400 mb-1">{label}</p><p className="text-sm text-gray-700 break-words">{value||"—"}</p></div>;}

const NAV=[
  {id:"orders"    as Page, path:"/orders",     label:"订单管理", icon:Package  },
  {id:"staff"     as Page, path:"/staff",      label:"人员管理", icon:Users    },
  {id:"cats"      as Page, path:"/categories", label:"品类管理", icon:Tags     },
  {id:"analytics" as Page, path:"/analytics",  label:"分析统计", icon:BarChart2},
  {id:"feedback"  as Page, path:"/feedback",   label:"投诉建议", icon:MessageSquare},
  {id:"system"    as Page, path:"/settings",   label:"系统配置", icon:Settings },
];

const pageFromPath=(pathname:string):Page|null=>{
  if(pathname==="/orders"||pathname.startsWith("/orders/"))return "orders";
  if(pathname==="/staff"||pathname.startsWith("/users/"))return "staff";
  if(pathname==="/categories"||pathname==="/cats")return "cats";
  if(pathname==="/analytics")return "analytics";
  if(pathname==="/feedback")return "feedback";
  if(pathname==="/settings"||pathname==="/system")return "system";
  return null;
};

function MainLayout({ token,adminName,onLogout,onError,notify }:FigmaAdminProps) {
  const navigate=useNavigate();
  const location=useLocation();
  const detailMatch=location.pathname.match(/^\/orders\/([^/]+)$/);
  const detailId=detailMatch?decodeURIComponent(detailMatch[1]):"";
  const userDetailMatch=location.pathname.match(/^\/users\/([^/]+)$/);
  const userDetailId=userDetailMatch?decodeURIComponent(userDetailMatch[1]):"";
  const [page,setPage]=useState<Page>(()=>pageFromPath(location.pathname)||"orders");
  const [orders,setOrders]=useState<Order[]>([]);
  const [users,setUsers]=useState<UserRecord[]>([]);
  const [staff,setStaff]=useState<Staff[]>([]);
  const [admins,setAdmins]=useState<AdminRecord[]>([]);
  const [groups,setGroups]=useState<RecycleGroup[]>([]);
  const [categoryTree,setCategoryTree]=useState<CategoryNode[]>([]);
  const [systemSettings,setSystemSettings]=useState<SystemSetting[]>([]);
  const [feedbacks,setFeedbacks]=useState<FeedbackRecord[]>([]);
  const [loading,setLoading]=useState(true);
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);

  useEffect(()=>{
    const routedPage=pageFromPath(location.pathname);
    if(routedPage){
      setPage(routedPage);
      if(location.pathname==="/cats")navigate("/categories",{replace:true});
      if(location.pathname==="/system")navigate("/settings",{replace:true});
      return;
    }
    navigate("/orders",{replace:true});
  },[location.pathname,navigate]);

  const loadSystemSettings=async()=>{
    try{
      return await callCloud<SystemSetting[]>("adminListSystemSettings",{sessionToken:token});
    }catch{
      const legacy=await callCloud<LegacyRecycleSettings>("adminGetSettings",{sessionToken:token});
      return legacySettingsToSystemSettings(legacy);
    }
  };

  const loadCategories=async()=>{
    return callCloud<CloudCategory[]>("adminListCategories",{sessionToken:token});
  };

  // 投诉建议：云端按 createTime 倒序分页，这里一次拉满 pageSize 上限后在页面内做筛选
  const loadFeedbacks=async()=>{
    const result=await callCloud<FeedbackListResult>("adminListFeedbacks",{sessionToken:token,page:1,pageSize:50});
    return result?.list||[];
  };

  const refresh=async()=>{
    setLoading(true);
    try {
      // 订单是管理端的核心数据，独立加载，避免某个辅助接口尚未部署时整页变成空数据。
      try {
        const firstOrderPage=await callCloud<OrderListResult>("adminListOrders",{sessionToken:token,page:1,pageSize:50,status:"",keyword:""});
      const orderPages=[...(firstOrderPage.list||[])];
      const pageCount=Math.ceil(firstOrderPage.total/50);
      if(pageCount>1){
        const rest=await Promise.all(Array.from({length:pageCount-1},(_,index)=>
          callCloud<OrderListResult>("adminListOrders",{sessionToken:token,page:index+2,pageSize:50,status:"",keyword:""}),
        ));
        rest.forEach((result)=>orderPages.push(...(result.list||[])));
      }
      const details=await Promise.all(orderPages.map(async(order)=>{
        try{return await callCloud<CloudOrder>("adminGetOrderDetail",{sessionToken:token,id:order._id});}
        catch{return order;}
      }));
      setOrders(details.map(cloudOrderToFigma));
      } catch(error) {
        setOrders([]);
        onError(error);
      }

      const [categoriesResult,settingsResult,usersResult,staffResult,adminsResult,feedbacksResult]=await Promise.allSettled([
        loadCategories(),
        loadSystemSettings(),
        callCloud<UserRecord[]>("adminListUsers",{sessionToken:token}),
        callCloud<StaffRecord[]>("adminListStaff",{sessionToken:token}),
        callCloud<AdminRecord[]>("adminListAdmins",{sessionToken:token}),
        loadFeedbacks(),
      ]);
      if(categoriesResult.status==="fulfilled"){
        const categories=categoriesResult.value||[];
        setGroups(categoriesToGroups(categories));
        setCategoryTree(categoriesToTree(categories));
      }
      if(settingsResult.status==="fulfilled")setSystemSettings(settingsResult.value||[]);
      if(usersResult.status==="fulfilled")setUsers(usersResult.value||[]);
      if(staffResult.status==="fulfilled")setStaff(staffFromCloud(staffResult.value||[]));
      if(adminsResult.status==="fulfilled")setAdmins(adminsResult.value||[]);
      if(feedbacksResult.status==="fulfilled")setFeedbacks(feedbacksResult.value||[]);

      const failedAuxiliary=[categoriesResult,settingsResult,usersResult,staffResult]
        .find((result)=>result.status==="rejected");
      if(failedAuxiliary?.status==="rejected")onError(failedAuxiliary.reason);
    }finally{setLoading(false);}
  };

  useEffect(()=>{void refresh();},[token]);

  const unsupported=(feature:string)=>notify({kind:"error",text:`${feature}尚未接入后端，当前未保存任何演示数据`});

  const saveStaff=async(item:Staff)=>{
    try{
      await callCloud("adminSaveStaff",{sessionToken:token,staff:{
        _id:item.docId,employeeNo:item.id,name:item.name,phone:item.phone,
        status:item.status,joinDate:item.joinDate==="—"?"":item.joinDate,area:item.area==="—"?"":item.area,store:item.store==="—"?"":item.store,
      }});
      const list=await callCloud<StaffRecord[]>("adminListStaff",{sessionToken:token});
      setStaff(staffFromCloud(list||[]));
      notify({kind:"success",text:"工作人员已保存"});
    }catch(error){onError(error);throw error;}
  };

  const reloadAdmins=async()=>{
    const list=await callCloud<AdminRecord[]>("adminListAdmins",{sessionToken:token});
    setAdmins(list||[]);
  };

  const saveAdmin=async(item:AdminRecord)=>{
    try{
      await callCloud("adminSaveAdmin",{sessionToken:token,
        id:item._id,
        phone:item.phone,
        name:item.name,
        enabled:item.enabled,
      });
      await reloadAdmins();
      notify({kind:"success",text:item._id?"管理员已更新":"管理员已添加"});
    }catch(error){onError(error);throw error;}
  };

  const toggleAdmin=async(item:AdminRecord,enabled:boolean)=>{
    try{
      await callCloud("adminToggleAdmin",{sessionToken:token,id:item._id,enabled});
      await reloadAdmins();
      notify({kind:"success",text:enabled?"已启用":"已停用"});
    }catch(error){onError(error);throw error;}
  };

  const saveOrder=async(order:Order)=>{
    if(!order.docId){unsupported("订单更新");return;}
    try{
      await callCloud("adminUpdateOrder",{
        sessionToken:token,
        id:order.docId,
        status:FIGMA_TO_CLOUD_STATUS[order.status],
        finalPrice:order.amount ?? "",
        adminRemark:order.adminRemark || "",
        cancelReason:order.cancelReason || (order.status==="已取消"?"管理员取消":""),
      });
      notify({kind:"success",text:"订单已更新"});
      await refresh();
    }catch(error){onError(error);throw error;}
  };

  const assignOrderRecycler=async(order:Order,person:Staff)=>{
    if(!order.docId||!person.docId){
      const error=new Error("订单或工作人员缺少数据库 ID，请刷新页面后重试");
      onError(error);
      throw error;
    }
    try{
      await callCloud("adminAssignOrderRecycler",{sessionToken:token,orderId:order.docId,staffId:person.docId});
      setOrders((current)=>current.map((item)=>item.docId===order.docId?{
        ...item,
        // 派单后落到「进行中」：云端写的是 processing，前端必须映射到同一个 label，
        // 否则列表与详情页会显示两个不同状态
        status:item.status==="待上门"?"进行中":item.status,
        recyclers:[person.name],
        recyclerPhone:person.phone,
        lastModified:nowStr(),
      }:item));
      notify({kind:"success",text:`已将订单分配给 ${person.name}`});
    }catch(error){
      onError(error);
      throw error;
    }
  };

  const reloadCategories=async()=>{
    const categories=await loadCategories();
    setGroups(categoriesToGroups(categories||[]));
    setCategoryTree(categoriesToTree(categories||[]));
  };

  const saveCategoryNode=async(item:RecycleItem)=>{
    const allowedUnits:CloudCategory["unit"][]=["kg","斤","台","件","双","袋","箱"];
    const unit=allowedUnits.includes(item.unit as CloudCategory["unit"])?item.unit as CloudCategory["unit"]:"kg";
    const category:CloudCategory={
      _id:item.categoryId,
      parentId:item.parentId||null,
      name:item.name,
      unit,
      priceRef:item.fieldEstimate?"现场估价":item.priceRef||"",
      sortOrder:item.sortOrder??0,
      enabled:item.enabled,
      showOnHome:item.parentId?false:item.showOnHome!==false,
      minVisitKg: typeof item.minVisitKg==="number"?item.minVisitKg:undefined,
    };
    try{
      await callCloud("adminSaveCategory",{sessionToken:token,category});
      notify({kind:"success",text:"品类节点已保存"});
      await reloadCategories();
    }catch(error){onError(error);throw error;}
  };

  const deleteCategory=async(item:RecycleItem)=>{
    if(!item.categoryId){
      onError(new Error("该品类缺少数据库 ID，请刷新后重试"));
      return;
    }
    try{
      await callCloud("adminDeleteCategory",{sessionToken:token,id:item.categoryId});
      notify({kind:"success",text:"品类节点已逻辑删除"});
      await reloadCategories();
    }catch(error){onError(error);throw error;}
  };

  const reloadSystemSettings=async()=>{
    const list=await loadSystemSettings();
    setSystemSettings(list||[]);
  };

  const saveSystemSetting=async(item:SystemSetting)=>{
    try{
      await callCloud<SystemSetting>("adminSaveSystemSetting",{sessionToken:token,setting:item});
      await reloadSystemSettings();
      notify({kind:"success",text:"配置已保存"});
    }catch(error){onError(error);throw error;}
  };

  const deleteSystemSetting=async(item:SystemSetting)=>{
    if(item._id?.startsWith("virtual:")){
      notify({kind:"error",text:"内置默认配置不能删除，可通过编辑覆盖默认值"});
      return;
    }
    if(!window.confirm(`确定删除配置 ${item.key} 吗？`))return;
    try{
      await callCloud("adminDeleteSystemSetting",{sessionToken:token,id:item._id,key:item.key});
      await reloadSystemSettings();
      notify({kind:"success",text:"配置已删除"});
    }catch(error){onError(error);throw error;}
  };

  const reloadFeedbacks=async()=>{
    try{
      setFeedbacks(await loadFeedbacks());
    }catch(error){onError(error);throw error;}
  };

  return(
    <div className="h-screen flex overflow-hidden" style={{fontFamily:"'Noto Sans SC',sans-serif"}}>
      {/* 移动端遮罩 */}
      {mobileMenuOpen&&<div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={()=>setMobileMenuOpen(false)}/>}
      {/* 侧边栏 */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-60 h-screen flex-shrink-0 flex flex-col bg-white border-r border-gray-100 transition-transform duration-200 md:relative md:translate-x-0 ${mobileMenuOpen?"translate-x-0":"-translate-x-full"}`}>
        <div className="px-5 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-green-50"><RefreshCw size={18} className="text-green-600"/></div>
            <div><p className="text-gray-900 font-semibold text-base leading-tight">帮帮回收</p><p className="text-gray-400 text-xs">管理后台 v1.0</p></div>
          </div>
          <button onClick={()=>setMobileMenuOpen(false)} className="md:hidden p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18}/></button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map(({id,path,label,icon:Icon})=>{
            const active=page===id;
            return(<button key={id} onClick={()=>{navigate(path);setMobileMenuOpen(false);}} className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-base font-medium transition-colors min-h-[44px] ${active?"bg-green-50 text-green-700":"text-gray-500 hover:bg-green-50 hover:text-green-700"}`}>
              <Icon size={18}/>{label}{active&&<ChevronRight size={14} className="ml-auto text-green-500"/>}
            </button>);
          })}
        </nav>
        <div className="px-4 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0"><span className="text-sm font-bold text-green-700">管</span></div>
            <div className="flex-1 min-w-0"><p className="text-base font-medium text-gray-700 truncate">{adminName||"管理员"}</p><p className="text-xs text-gray-400">超级管理员</p></div>
          </div>
          <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-green-700 hover:bg-green-50 transition-colors min-h-[44px]"><LogOut size={14}/>退出登录</button>
        </div>
      </aside>
      <main className="h-screen min-w-0 flex-1 overflow-y-auto bg-gray-50">
        <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-3.5 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <button onClick={()=>setMobileMenuOpen(true)} className="md:hidden p-2 -ml-2 rounded-lg text-gray-500 hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"><Menu size={20}/></button>
            <div className="hidden md:flex items-center gap-2 text-sm text-gray-400"><span>首页</span><ChevronRight size={12}/><span className="text-gray-700 font-medium">{NAV.find(n=>n.id===page)?.label}</span></div>
            <span className="md:hidden text-sm font-medium text-gray-700">{NAV.find(n=>n.id===page)?.label}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400"><div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/><span className="hidden sm:inline">系统运行正常</span></div>
        </div>
        {detailId?<AdminOrderDetailPage id={detailId} token={token} onSaveOrder={saveOrder} onBack={()=>navigate("/orders")} onError={onError}/>:userDetailId?<UserDetailPage userId={userDetailId} token={token} onBack={()=>navigate("/staff")} onViewOrder={(id)=>navigate(`/orders/${encodeURIComponent(id)}`)} onError={onError}/>:loading?<div className="min-h-[420px] flex flex-col items-center justify-center text-gray-400 gap-3"><Loader size={24} className="animate-spin text-green-600"/><p className="text-sm">正在加载真实业务数据…</p></div>:<>
          {page==="orders"    &&<OrdersPage staff={staff} groups={groups} orders={orders} onSaveOrder={saveOrder} onAssignRecycler={assignOrderRecycler} onUnsupported={unsupported} onViewOrder={(id)=>navigate(`/orders/${encodeURIComponent(id)}`)}/>}
          {page==="staff"     &&<StaffPage staff={staff} users={users} admins={admins} onSaveStaff={saveStaff} onSaveAdmin={saveAdmin} onToggleAdmin={toggleAdmin} onViewUser={(id)=>navigate(`/users/${encodeURIComponent(id)}`)}/>}
          {page==="cats"      &&<CategoryTreePage nodes={categoryTree} onSave={saveCategoryNode} onDelete={deleteCategory}/>}
          {page==="analytics" &&<AnalyticsPage orders={orders}/>} 
          {page==="feedback"  &&<FeedbackPage items={feedbacks} loading={loading} onRefresh={reloadFeedbacks}/>}
          {page==="system"    &&<SystemPage items={systemSettings} onSave={saveSystemSetting} onDelete={deleteSystemSetting}/>}
        </>}
      </main>
    </div>
  );
}

export default function FigmaAdminApp(props:FigmaAdminProps) {
  return <MainLayout {...props}/>;
}
