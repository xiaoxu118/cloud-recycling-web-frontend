import { Fragment, useState, useRef, useEffect, useMemo, useCallback, createContext, useContext, type ReactNode } from "react";
import {
  Package, Settings, Tags, LogOut, Eye, EyeOff, X, Search,
  ChevronRight, RefreshCw, Plus, Phone, MapPin, User, UserPlus, ImageIcon,
  XCircle, Loader, Edit2, Trash2, ToggleLeft, ToggleRight,
  Bell, Database, Save, Users, GripVertical, ChevronDown, Check,
  AlarmClock, Lock, SlidersHorizontal, Store, ChevronUp, Columns3,
  Upload, FileSpreadsheet, Download, AlertCircle,
  BarChart2, TrendingUp, CheckCircle2, Coins, ArrowUpRight, Shield, RotateCcw,
  Menu, Filter, MessageSquare, Ban, type LucideIcon,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { useLocation, useNavigate } from "react-router-dom";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import InputAdornment from "@mui/material/InputAdornment";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Slider from "@mui/material/Slider";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import FormGroup from "@mui/material/FormGroup";
import FormLabel from "@mui/material/FormLabel";
import Divider from "@mui/material/Divider";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import MuiTooltip from "@mui/material/Tooltip";
import ListItemText from "@mui/material/ListItemText";
import { callCloud, uploadSystemImage, cloudUrlToHttps, cloudUrlsToHttps } from "../api/cloud";
import type {
  AuthInfo,
  Category as CloudCategory,
  FeedbackListResult,
  FeedbackRecord,
  InviteListResult,
  InviteRecord,
  InviteStat,
  InviteStatus,
  MemberDetailResult,
  MemberListResult,
  MemberRecord,
  MemberStatus,
  Order as CloudOrder,
  OrderListResult,
  OrderStatus as CloudOrderStatus,
  PointsExchange,
  PointsExchangeListResult,
  PointsExchangeStatus,
  PointsFulfillType,
  PointsGoods,
  PointsGoodsCategory,
  PointsGoodsListResult,
  PointsRecord,
  PointsRecordListResult,
  PointsRecordType,
  PermissionModule,
  RecycleSettings,
  RoleListResult,
  RoleRecord,
  StaffRecord,
  StaffRecruitListResult,
  StaffRecruitRecord,
  StaffRecruitStatus,
  SystemSetting,
  UserPointsDetail,
  UserRecord,
  UserListResult,
} from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────
type Page = "orders" | "users" | "members" | "roles" | "recruits" | "cats" | "analytics" | "feedback" | "points" | "invites" | "system";
type OrderStatus = "待上门" | "进行中" | "已完成" | "已取消";
type StaffStatus = "online" | "resting" | "resigned";
type BusinessOrderType = "recycle" | "furniture_demolition" | "shop_demolition";

interface Staff {
  id: string; name: string; phone: string; docId?: string; wechatBound?: boolean;
  status: StaffStatus; joinDate: string; area: string; store: string; createTime?: number;
}
interface RecycleItem {
  id: string; name: string; unit: string;
  fieldEstimate?: boolean; enabled: boolean;
  priceRef?: string;
  categoryId?: string; parentId?: string | null; sortOrder?: number; showOnHome?: boolean;
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
interface Order {
  id: string; status: OrderStatus;
  userName: string; phone: string; address: string; description: string;
  appointmentTime: string; images: string[];
  recyclers: string[]; category: string; categoryNames?: string[]; weight: string;
  orderType?: BusinessOrderType;
  createdAt: string; completedAt?: string; lastModified: string; amount?: number;
  docId?: string;
  estimatePrice?: number | null; finalWeight?: number | null; finalCount?: number | null;
  recyclerId?: string; recyclerPhone?: string; adminRemark?: string; cancelReason?: string;
  transferProofs?: string[];
}
interface ColDef { id: string; label: string; width: number; minWidth: number; fixed?: boolean; alwaysVisible?: boolean; }

export interface FigmaAdminProps {
  token: string;
  adminName: string;
  onLogout: () => void;
  onError: (error: unknown) => void;
  notify: (message: { kind: "success" | "error"; text: string }) => void;
}

// ─── 权限上下文 ────────────────────────────────────────────────────────────────
// adminGetAuthInfo 返回的权限点集合，用于菜单与操作按钮的显隐。
// ready=false 时（接口尚未部署或仍在加载）默认放行，避免旧环境整页不可用。
interface AuthState {
  ready: boolean;
  member: MemberRecord | null;
  permissions: Set<string>;
  has: (permission?: string) => boolean;
}

const AuthContext = createContext<AuthState>({
  ready: false,
  member: null,
  permissions: new Set(),
  has: () => true,
});

const useAuth = () => useContext(AuthContext);

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
  { _id:"virtual:photo_order_check_min_quantity", key:"photo_order_check_min_quantity", label:"拍照订单校验起收量", type:"boolean", value:String(settings.photoOrderCheckMinQuantity===true), description:"true 开启，false 关闭", updateTime:settings.updateTime },
  { _id:"virtual:user_agreement", key:"user_agreement", label:"用户协议", type:"longtext" as const, value:"", description:"小程序登录页展示，用户点击《用户协议》弹窗内容" },
  { _id:"virtual:privacy_policy", key:"privacy_policy", label:"隐私政策", type:"longtext" as const, value:"", description:"小程序登录页展示，用户点击《隐私政策》弹窗内容" },
  { _id:"virtual:terms_of_service", key:"terms_of_service", label:"服务条款", type:"longtext" as const, value:"", description:"小程序下单页展示，用户点击《来卖吧上门服务条款》弹窗内容" },
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
  const tone=resolved==="recycle"?"bg-emerald-50 text-emerald-700":resolved==="furniture_demolition"?"bg-amber-50 text-amber-700":"bg-blue-50 text-blue-700";
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${tone}`}>{ORDER_TYPE_LABEL[resolved]}</span>;
}

// 用户下单时选择的预估重量区间，单位固定为公斤（与小程序下单页、云函数保持一致）
const WEIGHT_RANGE_LABELS: Record<string, string> = {
  lt30: "10-30公斤",
  "30to100": "30-100公斤",
  gt100: "100公斤以上",
};

const cloudOrderToFigma = (order: CloudOrder): Order => {
  const address = order.addressSnapshot || {};
  const itemNames = order.source==="demolition"
    ? order.demolition?.items||[]
    : (order.items || []).map((item) => item.categoryName).filter(Boolean) as string[];
  // 重量单位优先取品类快照 unit（斤/kg），旧订单缺失时按项目主单位「斤」
  const weightUnit = order.items?.find((item) => item.estWeight)?.unit || "斤";
  // 重量类品类下单时只选预估区间（单位固定公斤），不再有具体数值
  const rangeItem = order.items?.find((item) => item.estWeightRange);
  const quantity = order.finalWeight
    ? `${order.finalWeight}斤`
    : order.finalCount
      ? `${order.finalCount}件`
      : rangeItem
        ? WEIGHT_RANGE_LABELS[rangeItem.estWeightRange as string] || "—"
        : order.items?.find((item) => item.estWeight)?.estWeight
          ? `约${order.items.find((item) => item.estWeight)?.estWeight}${weightUnit}`
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
    recyclerId: order.recyclerId || undefined,
    recyclerPhone: order.recyclerPhone,
    adminRemark: order.adminRemark,
    cancelReason: order.cancelReason,
    transferProofs: order.transferProofs,
  };
};

// 展示层过滤：去掉数据库里可能存在的末尾『起』字（如「1.5 元/斤起」→「1.5 元/斤」）。
// 与 miniprogram/pages/category/index.js 中的处理一致，让两边看到同样的参考价格。
const stripTrailingQi = (s?: string) => String(s || "").replace(/起$/, "");

// 管理端的「参考价格」输入框只填价格部分（如「0.5-0.8」），单位由后缀跟随计量单位展示。
// 落库时拼成完整文案「0.5-0.8 元/公斤」，编辑时再反向剥离后缀回填输入框。
const joinPriceRef = (value: string, unit?: string) => {
  const price = String(value || "").trim();
  if (!price) return "";
  // 存量数据里管理员可能已手写了「元」，原样保留避免二次拼接
  if (price.includes("元")) return price.slice(0, 40);
  return `${price} 元/${unit || ""}`.trim().slice(0, 40);
};

const splitPriceRef = (priceRef?: string) =>
  stripTrailingQi(priceRef)
    .replace(/\s*元\s*\/\s*\S*$/, "")
    .replace(/\s*元$/, "")
    .trim();

const categoryToItem = (item: CloudCategory): RecycleItem => {
  // 报价以自由文本 priceRef 为准（支持「0.5-0.8 元/公斤」这类区间）；
  // 现场估价读显式字段 fieldEstimate，存量数据回退旧语义 price == null。
  const fieldEstimate =
    typeof item.fieldEstimate === "boolean"
      ? item.fieldEstimate
      : item.price == null && (!item.priceRef || item.priceRef === "现场估价");
  return {
    id: item._id || item.name,
    categoryId: item._id,
    parentId: item.parentId || null,
    name: item.name,
    unit: item.unit,
    priceRef: fieldEstimate ? "" : stripTrailingQi(item.priceRef),
    sortOrder: item.sortOrder,
    fieldEstimate,
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
  createTime: item.createTime,
}));

// 订单上的 recyclerName / recyclerPhone 是派单那一刻写入的快照，评估员改名后不会回刷历史订单。
// 展示层统一按 recyclerId 去 staff 实时反查当前姓名，查不到（人员已删除）才回落到订单快照。
const withLiveRecycler = (orders: Order[], staff: Staff[]): Order[] => {
  if (!staff.length) return orders;
  const staffById = new Map(staff.filter((item) => item.docId).map((item) => [item.docId as string, item]));
  return orders.map((order) => {
    const person = order.recyclerId ? staffById.get(order.recyclerId) : undefined;
    if (!person) return order;
    return { ...order, recyclers: [person.name], recyclerPhone: person.phone };
  });
};

// ─── Initial Data ─────────────────────────────────────────────────────────────
const INIT_STAFF: Staff[] = [
  { id: "S001", name: "王建国", phone: "13901234567", status: "online",   joinDate: "2022-03-15", area: "朝阳区",   store: "朝阳旗舰店" },
  { id: "S002", name: "赵志远", phone: "15812345678", status: "online",   joinDate: "2022-06-01", area: "海淀区",   store: "海淀区店"   },
  { id: "S003", name: "刘铁柱", phone: "18623456789", status: "resting",  joinDate: "2021-11-20", area: "浦东新区", store: "浦东分店"   },
  { id: "S004", name: "孙大伟", phone: "13734567890", status: "online",   joinDate: "2023-01-10", area: "天河区",   store: "天河区店"   },
  { id: "S005", name: "张磊",   phone: "15645678901", status: "resigned", joinDate: "2022-08-05", area: "南山区",   store: "南山区店"   },
  { id: "S006", name: "李明",   phone: "17756789012", status: "online",   joinDate: "2023-04-22", area: "武侯区",   store: "武侯区店"   },
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
  green: "text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100",
  blue: "text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100",
  red: "text-red-600 bg-red-50 border-red-200 hover:bg-red-100",
  gray: "text-gray-500 bg-gray-50 border-[#E8E8EC] hover:bg-gray-100 hover:border-gray-300",
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

// ─── Image thumb with hover zoom ──────────────────────────────────────────────
function ImageThumb({ src, onClick }:{ src:string; onClick:()=>void }) {
  const [hovered,setHovered]=useState(false);
  return (
    <div className="relative" onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}>
      <button onClick={onClick} className="w-8 h-8 rounded-md overflow-hidden border-2 border-white bg-gray-100 block"><img src={src} alt="" className="w-full h-full object-cover"/></button>
      {hovered && <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 h-32 rounded-xl overflow-hidden shadow-2xl border-2 border-white pointer-events-none"><img src={src} alt="" className="w-full h-full object-cover"/></div>}
    </div>
  );
}

// ─── Recycler pills + select ──────────────────────────────────────────────────
const PILL_COLORS=["bg-indigo-100 text-indigo-800 border-indigo-200","bg-blue-100 text-blue-800 border-blue-200","bg-violet-100 text-violet-800 border-violet-200","bg-amber-100 text-amber-800 border-amber-200","bg-pink-100 text-pink-800 border-pink-200","bg-cyan-100 text-cyan-800 border-cyan-200"];
function pillColor(name:string,staff:Staff[]){ const i=staff.findIndex(s=>s.name===name); return PILL_COLORS[(i<0?0:i)%PILL_COLORS.length]; }
function RecyclerPills({ recyclers }:{ recyclers:string[];staff:Staff[] }) {
  if (!recyclers.length) return <span className="text-xs text-gray-300">未分配</span>;
  return <span className="text-sm text-gray-700 truncate" title={recyclers.join("、")}>{recyclers.join("、")}</span>;
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
      <button type="button" onClick={()=>setOpen(v=>!v)} className="min-w-[160px] flex items-center gap-1.5 flex-wrap px-3 py-2 rounded-md border border-[#E8E8EC] bg-white text-sm hover:border-indigo-400 transition-all text-left">
        {value.length===0?<span className="text-gray-400 text-sm">选择回收人员</span>:value.map(n=><span key={n} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${pillColor(n,staff)}`}>{n}</span>)}
        <ChevronDown size={12} className="ml-auto text-gray-400 flex-shrink-0"/>
      </button>
      {open && <div className="absolute z-50 mt-1 w-52 bg-white border border-[#E8E8EC] rounded-xl shadow-lg py-1 max-h-52 overflow-y-auto">
        {staff.filter(s=>s.status==="online").map(s=>{
          const checked=value.includes(s.name);
          return <button key={s.id} type="button" onClick={()=>toggle(s.name)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm text-left transition-colors">
            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked?"bg-indigo-600 border-indigo-600":"border-gray-300"}`}>{checked&&<Check size={10} className="text-white"/>}</div>
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
  return <div className="fixed inset-0 z-50 flex items-center justify-center"><button className="absolute inset-0 bg-black/40" onClick={onClose}/><div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden"><div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8EC]"><div><h2 className="font-semibold text-gray-900">分配回收人员</h2><p className="text-xs text-gray-400 mt-1">订单 {order.id} · 仅显示在线工作人员</p></div><button onClick={onClose}><X size={18} className="text-gray-400"/></button></div><div className="p-4 max-h-[55vh] overflow-y-auto space-y-2">{onlineStaff.map((item)=><button key={item.id} disabled={Boolean(savingId)} onClick={()=>void assign(item)} className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#E8E8EC] text-left hover:border-indigo-300 hover:bg-indigo-50/50 transition-all disabled:opacity-50"><div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold" style={{background:"var(--genesis-primary)"}}>{item.name[0]}</div><div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-800">{item.name}</p><p className="text-xs text-gray-400 mt-0.5">{item.store} · {item.area}</p></div><span className="text-xs font-mono text-gray-500">{item.phone}</span>{savingId===item.id?<Loader size={15} className="animate-spin text-indigo-600"/>:<ChevronRight size={15} className="text-gray-300"/>}</button>)}{onlineStaff.length===0&&<div className="py-10 text-center"><Users size={30} className="mx-auto text-gray-200 mb-2"/><p className="text-sm text-gray-400">暂无在线工作人员</p></div>}</div><div className="px-6 py-3 border-t border-[#E8E8EC] bg-gray-50 text-right"><button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">取消</button></div></div></div>;
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
        {images.length>1&&<div className="flex gap-2 mt-3 justify-center">{images.map((img,i)=>(<button key={i} onClick={()=>setIdx(i)} className={`w-14 h-10 rounded-md overflow-hidden border-2 transition-all ${i===idx?"border-indigo-400":"border-transparent opacity-50 hover:opacity-80"}`}><img src={img} alt="" className="w-full h-full object-cover"/></button>))}</div>}
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"/>
      <div className="relative z-10 w-full max-w-xl mx-4 bg-white rounded-2xl shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8EC]">
          <h2 className="font-semibold text-gray-900">新建订单</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[72vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <TextField label="用户名" required fullWidth value={form.userName} onChange={e=>set("userName",e.target.value)} placeholder="请输入用户名" error={!!errors.userName} helperText={errors.userName}/>
            <TextField label="联系电话" required fullWidth value={form.phone} onChange={e=>set("phone",e.target.value.replace(/\D/g,""))} slotProps={{htmlInput:{maxLength:11}}} placeholder="11位手机号" error={!!errors.phone} helperText={errors.phone}/>
          </div>
          <TextField label="回收地址" required fullWidth multiline rows={2} value={form.address} onChange={e=>set("address",e.target.value)} placeholder="省市区街道门牌号" error={!!errors.address} helperText={errors.address}/>
          <TextField label="物品摘要" fullWidth multiline rows={2} value={form.description} onChange={e=>set("description",e.target.value)} placeholder="描述需要回收的物品（选填）"/>
          <div className="grid grid-cols-2 gap-4">
            <TextField select label="品类" required fullWidth value={form.category} onChange={e=>set("category",e.target.value)} error={!!errors.category} helperText={errors.category}>
              <MenuItem value="">选择品类</MenuItem>
              {groups.filter(g=>g.enabled).flatMap(g=>
                g.items.filter(i=>i.enabled).map(item=>(
                  <MenuItem key={item.id} value={`${g.name}·${item.name}`}>{g.name} · {item.name}</MenuItem>
                ))
              )}
            </TextField>
            <TextField label="预估重量" fullWidth value={form.weight} onChange={e=>set("weight",e.target.value)} placeholder="如：约20kg"/>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextField label="预约日期" required type="date" fullWidth value={form.appointmentDate} onChange={e=>set("appointmentDate",e.target.value)} slotProps={{inputLabel:{shrink:true}}} error={!!errors.appointmentDate} helperText={errors.appointmentDate}/>
            <TextField select label="时间段" fullWidth value={form.appointmentSlot} onChange={e=>set("appointmentSlot",e.target.value)}>
              {slots.map(s=><MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1.5">指定回收人员（选填）</label>
            <RecyclerSelect value={form.recyclers} onChange={v=>set("recyclers",v as any)} staff={staff}/></div>
        </div>
        <div className="px-6 py-4 border-t border-[#E8E8EC] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-[#E8E8EC] text-sm text-gray-600 hover:bg-gray-50 transition-all">取消</button>
          <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white hover:opacity-90" style={{background:"var(--genesis-primary)"}}>
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
    <Dialog open fullWidth maxWidth="sm" onClose={onClose} slotProps={{paper:{sx:{borderRadius:3}}}}>
      <DialogTitle sx={{pb:1.5}}>
        <Stack direction="row" spacing={2} sx={{alignItems:"flex-start",justifyContent:"space-between"}}>
          <div>
            <Typography variant="subtitle1" sx={{fontWeight:600}}>编辑订单</Typography>
            <Typography variant="caption" color="text.secondary" sx={{fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace"}}>{order.id}</Typography>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{pt:1}}>
          <Stack direction="row" spacing={2}>
            <TextField label="用户名" fullWidth value={form.userName} onChange={e=>set("userName",e.target.value)}/>
            <TextField label="联系电话" fullWidth value={form.phone} onChange={e=>set("phone",e.target.value.replace(/\D/g,""))}/>
          </Stack>
          <TextField label="地址" fullWidth multiline rows={2} value={form.address} onChange={e=>set("address",e.target.value)}/>
          <TextField label="物品摘要" fullWidth multiline rows={2} value={form.description} onChange={e=>set("description",e.target.value)}/>
          <Stack direction="row" spacing={2}>
            <TextField label="预约时间" fullWidth value={form.appointmentTime} onChange={e=>set("appointmentTime",e.target.value)}/>
            <TextField select label="状态" fullWidth value={form.status} onChange={e=>set("status",e.target.value as OrderStatus)}>
              {statuses.map(s=><MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{px:3,py:2}}>
        <Button variant="outlined" onClick={onClose}>取消</Button>
        <Button variant="contained" startIcon={<Save size={14}/>} onClick={()=>onSave({...form,lastModified:nowStr()})}>保存修改</Button>
      </DialogActions>
    </Dialog>
  );
}


// ─── Auto-accept Modal ────────────────────────────────────────────────────────
function AutoAcceptModal({ enabled,minutes,onSave,onClose }:{ enabled:boolean;minutes:number;onSave:(en:boolean,min:number)=>void;onClose:()=>void }) {
  const [en,setEn]=useState(enabled); const [min,setMin]=useState(minutes);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm"/>
      <div className="relative z-10 w-full max-w-sm mx-4 bg-white rounded-2xl shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E8EC]">
          <div className="flex items-center gap-2"><AlarmClock size={18} className="text-indigo-600"/><h2 className="font-semibold text-gray-900">超时自动接单</h2></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-gray-500 leading-relaxed">开启后，系统将自动把超时未处理的「待上门」订单变更为「进行中」状态。</p>
          <div className="flex items-center justify-between py-2 border border-[#E8E8EC] rounded-xl px-4">
            <div><p className="text-sm font-medium text-gray-800">启用自动接单</p><p className="text-xs text-gray-400 mt-0.5">{en?"当前已开启":"当前已关闭"}</p></div>
            <button onClick={()=>setEn(v=>!v)}>{en?<ToggleRight size={28} className="text-indigo-500"/>:<ToggleLeft size={28} className="text-gray-300"/>}</button>
          </div>
          <div className={`space-y-2 transition-opacity ${en?"opacity-100":"opacity-40 pointer-events-none"}`}>
            <label className="block text-xs font-medium text-gray-500">超时时长（分钟）</label>
            <div className="flex items-center gap-3"><Slider size="small" min={5} max={120} step={5} value={min} onChange={(_,v)=>setMin(v as number)} className="flex-1"/>
              <span className="text-sm font-mono font-bold text-indigo-700 w-16 text-right">{min} 分钟</span></div>
            <div className="flex gap-2">{[10,20,30,60].map(v=>(<button key={v} onClick={()=>setMin(v)} className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-all ${min===v?"bg-indigo-600 text-white border-indigo-600":"border-[#E8E8EC] text-gray-500 hover:border-indigo-400"}`}>{v}分</button>))}</div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-[#E8E8EC] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-[#E8E8EC] text-sm text-gray-600 hover:bg-gray-50">取消</button>
          <button onClick={()=>{onSave(en,min);onClose();}} className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white hover:opacity-90" style={{background:"var(--genesis-primary)"}}><Save size={14}/>保存设置</button>
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
      <button onClick={()=>setOpen(v=>!v)} className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm border transition-all ${open?"border-indigo-400 text-indigo-700 bg-indigo-50":"border-[#E8E8EC] text-gray-600 hover:border-gray-300"}`}>
        <Columns3 size={14}/> 列设置 {hidden.size>0&&<span className="text-xs bg-indigo-600 text-white rounded-full px-1.5 py-0.5 leading-none">{hidden.size}</span>}
      </button>
      {open&&<div className="absolute right-0 mt-1 w-44 bg-white border border-[#E8E8EC] rounded-xl shadow-lg py-2 z-40">
        <p className="text-[10px] font-semibold text-gray-400 uppercase px-3 pb-1">显示字段</p>
        {toggleable.map(col=>{
          const visible=!hidden.has(col.id);
          return <button key={col.id} onClick={()=>onToggle(col.id)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm transition-colors">
            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${visible?"bg-indigo-600 border-indigo-600":"border-gray-300"}`}>{visible&&<Check size={10} className="text-white"/>}</div>
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
  const resizing=useRef<{colId:string;startX:number;startW:number;minW:number}|null>(null);
  const [isResizing,setIsResizing]=useState(false);
  function startResize(e:React.MouseEvent,colId:string){
    e.preventDefault();e.stopPropagation();
    const col=cols.find(c=>c.id===colId)!;
    resizing.current={colId,startX:e.clientX,startW:col.width,minW:col.minWidth};
    setIsResizing(true);
    document.body.style.cursor="col-resize";
    document.body.style.userSelect="none";
    const onMove=(ev:MouseEvent)=>{
      const r=resizing.current;if(!r)return;
      const next=Math.max(r.minW,r.startW+(ev.clientX-r.startX));
      setCols(prev=>prev.map(c=>c.id===r.colId?{...c,width:next}:c));
    };
    const onUp=()=>{
      resizing.current=null;setIsResizing(false);
      document.body.style.cursor="";document.body.style.userSelect="";
      document.removeEventListener("mousemove",onMove);document.removeEventListener("mouseup",onUp);
    };
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

  const visibleCols=cols.filter(c=>!hiddenCols.has(c.id));
  // 除状态外的筛选条件；统计卡基于它计算，避免选中某状态后其余状态数变 0
  const matchesNonStatus=(o:Order)=>{
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
  };
  const statsBase=orders.filter(matchesNonStatus);
  const filtered=statsBase.filter(o=>filterStatus==="全部"||o.status===filterStatus);
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
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 leading-tight truncate">{order.userName}</p>
            <p className="text-xs font-mono text-gray-500 leading-tight">{order.phone||"—"}</p>
          </div>
        );
      }
      case "address": return (
        <span className="block text-xs text-gray-600 truncate" title={order.address}>{order.address}</span>
      );
      case "summary":{
        const categoryNames=(order.categoryNames?.length
          ? order.categoryNames
          : order.category.split(/[、,，]/).map((item)=>item.trim()).filter(Boolean));
        const visibleCategoryNames=categoryNames.slice(0,3);
        return (
          <div className="flex items-center gap-1.5 min-w-0" title={categoryNames.join("、")}>
            {visibleCategoryNames.map((name,index)=>(
              <span key={`${name}-${index}`} className="inline-block max-w-[68px] truncate rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
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
          {order.images.length>3&&<div className="w-8 h-8 rounded-md bg-gray-100 border-2 border-white flex items-center justify-center flex-shrink-0"><span className="text-[10px] font-bold text-gray-500">+{order.images.length-3}</span></div>}
        </div>
      );
      case "recyclers": return order.recyclers.length
        ? <RecyclerPills recyclers={order.recyclers} staff={staff}/>
        : <button type="button" onClick={()=>setAssigningOrder(order)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-indigo-200 bg-indigo-50 text-xs font-medium text-indigo-700 hover:bg-indigo-100"><User size={11}/>分配人员</button>;
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
      <div className="grid grid-cols-4 gap-2 md:gap-3">
        {(["待上门","进行中","已完成","已取消"] as OrderStatus[]).map(s=>{
          const cnt=statsBase.filter(o=>o.status===s).length;
          const cfg=STATUS_CFG[s];
          return(<button key={s} onClick={()=>setFilterStatus(filterStatus===s?"全部":s)} className={`bg-white rounded-xl px-2 py-3 md:p-3.5 text-center md:text-left border transition-all ${filterStatus===s?"border-indigo-400 shadow-sm":"border-transparent hover:border-[#E8E8EC]"}`}>
            <p className={`text-lg md:text-xl font-bold font-mono ${cfg.color}`}>{cnt}</p><p className="text-[11px] md:text-xs text-gray-400 mt-1 whitespace-nowrap">{s}</p>
          </button>);
        })}
      </div>

      {/* Filters */}
      <div className="hidden md:block bg-white rounded-xl p-4">
        <div className="flex items-center gap-3">
          <TextField
            className="w-1/3 min-w-[180px]"
            value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="搜索订单号、用户名、电话、物品摘要…"
            slotProps={{input:{startAdornment:<InputAdornment position="start"><Search size={14} className="text-gray-400"/></InputAdornment>}}}
          />
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs font-medium text-gray-500 whitespace-nowrap">日期筛选：</span>
            <div className="flex gap-1.5">
              {([{v:"appointment" as const,l:"按预约时间"},{v:"completed" as const,l:"按完成时间"}]).map(opt=>(<button key={opt.v} onClick={()=>setDateFilterType(opt.v)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${dateFilterType===opt.v?"bg-indigo-600 text-white":"bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{opt.l}</button>))}
            </div>
            <div className="flex items-center gap-2">
              <TextField type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} sx={{width:150}}/>
              <span className="text-xs text-gray-400">至</span>
              <TextField type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} sx={{width:150}}/>
              {(dateFrom||dateTo)&&<button onClick={()=>{setDateFrom("");setDateTo("");}} className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-md hover:bg-red-50"><X size={13}/></button>}
            </div>
            <ColVisibilityMenu cols={cols} hidden={hiddenCols} onToggle={toggleHiddenCol}/>
          </div>
        </div>
      </div>

      {/* Mobile Filter Toggle */}
      <div className="md:hidden">
        <button onClick={()=>setMobileFilterOpen(v=>!v)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${mobileFilterOpen||search||dateFrom||dateTo?"border-indigo-400 text-indigo-700 bg-indigo-50":"border-[#E8E8EC] text-gray-600 bg-white"}`}>
          <Filter size={14}/>
          <span>筛选</span>
          {(search||dateFrom||dateTo)&&<span className="ml-auto flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">!</span>}
        </button>
        {mobileFilterOpen&&(
          <div className="mt-2 bg-white rounded-xl p-4 space-y-3 border border-[#E8E8EC]">
            <TextField fullWidth value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索订单号、用户名、电话…" slotProps={{input:{startAdornment:<InputAdornment position="start"><Search size={14} className="text-gray-400"/></InputAdornment>}}}/>
            <div className="pt-2 border-t border-gray-50 space-y-2">
              <div className="flex gap-1.5">
                {([{v:"appointment" as const,l:"预约时间"},{v:"completed" as const,l:"完成时间"}]).map(opt=>(<button key={opt.v} onClick={()=>setDateFilterType(opt.v)} className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all ${dateFilterType===opt.v?"bg-indigo-600 text-white":"bg-gray-100 text-gray-500"}`}>{opt.l}</button>))}
              </div>
              <div className="flex items-center gap-2">
                <TextField type="date" className="flex-1" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} slotProps={{inputLabel:{shrink:true}}}/>
                <span className="text-xs text-gray-400">至</span>
                <TextField type="date" className="flex-1" value={dateTo} onChange={e=>setDateTo(e.target.value)} slotProps={{inputLabel:{shrink:true}}}/>
              </div>
              {(dateFrom||dateTo)&&<button onClick={()=>{setDateFrom("");setDateTo("");}} className="w-full text-center text-xs text-red-500 py-1.5 rounded-md bg-red-50">清除日期筛选</button>}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden space-y-3">
        {pagedOrders.length===0?<div className="bg-white rounded-xl p-8 text-center text-sm text-gray-400 border border-[#E8E8EC]">暂无符合条件的订单</div>:pagedOrders.map(order=>{
          const cfg=STATUS_CFG[order.status];
          return(<button key={order.id} onClick={()=>order.docId&&onViewOrder(order.docId)} className="w-full bg-white rounded-xl p-4 border border-[#E8E8EC] text-left active:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-gray-400 mr-2 break-all">{order.id}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>{order.status}</span>
            </div>
            <p className="text-sm font-medium text-gray-800 truncate mb-1">{order.userName||"用户"} · {order.phone||"—"}</p>
            <p className="text-xs text-gray-500 truncate mb-2">{order.description||order.category||"无描述"}</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">{order.appointmentTime||"未预约"}</span>
              {order.amount!=null&&<span className="font-semibold text-gray-900">¥{Number(order.amount).toFixed(2)}</span>}
            </div>
          </button>);
        })}
        <div className="flex items-center justify-between py-2">
          <span className="text-xs text-gray-400">{filtered.length} 条</span>
          <div className="flex items-center gap-1">
            <button disabled={safePage<=1} onClick={()=>setCurrentPage(p=>Math.max(1,p-1))} className="w-7 h-7 rounded-md text-xs font-medium flex items-center justify-center border border-[#E8E8EC] text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">‹</button>
            {pageItems.map((item,idx)=>item==="..."?<span key={`e${idx}`} className="w-5 text-center text-xs text-gray-400">…</span>:<button key={item} onClick={()=>setCurrentPage(item as number)} className={`w-7 h-7 rounded-md text-xs font-medium transition-all ${item===safePage?"bg-indigo-600 text-white":"text-gray-500 hover:bg-gray-100"}`}>{item}</button>)}
            <button disabled={safePage>=totalPages} onClick={()=>setCurrentPage(p=>Math.min(totalPages,p+1))} className="w-7 h-7 rounded-md text-xs font-medium flex items-center justify-center border border-[#E8E8EC] text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">›</button>
          </div>
          <span className="text-xs text-gray-400">{safePage}/{totalPages}</span>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-xl overflow-hidden border border-[#E8E8EC]">
        <div className="overflow-x-auto">
          <table style={{tableLayout:"fixed",width:totalW,minWidth:"100%"}}>
            <colgroup>{visibleCols.map(c=><col key={c.id} style={{width:c.width}}/>)}</colgroup>
            <thead>
              <tr className="bg-gray-50 border-b border-[#E8E8EC]">
                {visibleCols.map((col)=>(
                  <th key={col.id} draggable={!col.fixed&&!isResizing}
                    onDragStart={e=>{if(col.fixed||isResizing){e.preventDefault();return;}onDragStart(e,col.id);}}
                    onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";}}
                    onDrop={e=>!col.fixed&&onDrop(e,col.id)}
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-500 relative select-none whitespace-nowrap group"
                    style={{width:col.width}}>
                    <div className="flex items-center gap-1">
                      {!col.fixed&&<GripVertical size={11} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 cursor-grab"/>}
                      {col.label}
                    </div>
                    <div onMouseDown={e=>startResize(e,col.id)} onClick={e=>e.stopPropagation()} className="absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <div className="w-0.5 h-4 bg-indigo-400 rounded-full"/>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedOrders.map((order,i)=>(
                <tr key={order.id} tabIndex={0} onClick={()=>order.docId&&onViewOrder(order.docId)} onKeyDown={event=>{if((event.key==="Enter"||event.key===" ")&&order.docId){event.preventDefault();onViewOrder(order.docId);}}} className={`border-b border-gray-50 hover:bg-indigo-50/40 transition-colors cursor-pointer focus:outline-none focus:bg-indigo-50/60 ${i%2===1?"bg-gray-50/20":""}`}>
                  {visibleCols.map((col)=>(
                    <td key={col.id} onClick={col.id==="images"||col.id==="recyclers"?event=>event.stopPropagation():undefined} className="py-3 px-4" style={{width:col.width,maxWidth:col.width,overflow:"hidden"}}>
                      {renderCell(col,order)}
                    </td>
                  ))}
                </tr>
              ))}
              {pagedOrders.length===0&&<tr><td colSpan={visibleCols.length} className="px-4 py-12 text-center text-gray-300 text-sm">暂无符合条件的订单</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-[#E8E8EC] flex items-center justify-between">
          <span className="text-xs text-gray-400">显示 {pagedOrders.length} / {filtered.length} 条</span>
          <div className="flex items-center gap-1">
            <button disabled={safePage<=1} onClick={()=>setCurrentPage(p=>Math.max(1,p-1))} className="w-7 h-7 rounded-md text-xs font-medium flex items-center justify-center border border-[#E8E8EC] text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">‹</button>
            {pageItems.map((item,idx)=>item==="..."?<span key={`de${idx}`} className="w-5 text-center text-xs text-gray-400">…</span>:<button key={item} onClick={()=>setCurrentPage(item as number)} className={`w-7 h-7 rounded-md text-xs font-medium transition-all ${item===safePage?"bg-indigo-600 text-white":"text-gray-500 hover:bg-gray-100"}`}>{item}</button>)}
            <button disabled={safePage>=totalPages} onClick={()=>setCurrentPage(p=>Math.min(totalPages,p+1))} className="w-7 h-7 rounded-md text-xs font-medium flex items-center justify-center border border-[#E8E8EC] text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">›</button>
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

// ─── 用户管理（C 端微信用户，只读） ─────────────────────────────────────────────
// 用户列表走服务端分页：users 集合会随注册量持续增长，一次性全量拉取会被云函数
// 的单次查询上限截断（历史上是 50 条），导致靠后的用户在管理端既看不到也搜不到。
function UsersPage({ token,onViewUser,onError }:{
  token:string;
  onViewUser?:(id:string)=>void;
  onError:(error:unknown)=>void;
}) {
  const PAGE_SIZE=20;
  const [users,setUsers]=useState<UserRecord[]>([]);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(true);
  const [currentPage,setCurrentPage]=useState(1);
  const [keyword,setKeyword]=useState("");
  // 输入框实时回显，实际查询用防抖后的值，避免每个字符都打一次云函数
  const [searchInput,setSearchInput]=useState("");

  useEffect(()=>{
    const timer=setTimeout(()=>{setKeyword(searchInput);setCurrentPage(1);},400);
    return ()=>clearTimeout(timer);
  },[searchInput]);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const result=await callCloud<UserListResult>("adminListUsers",{
        sessionToken:token,page:currentPage,pageSize:PAGE_SIZE,keyword,
      });
      setUsers(result?.list||[]);
      setTotal(result?.total||0);
    }catch(error){setUsers([]);setTotal(0);onError(error);}
    finally{setLoading(false);}
  },[token,currentPage,keyword,onError]);

  useEffect(()=>{void load();},[load]);

  const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  const safePage=Math.min(currentPage,totalPages);
  const pageItems=(():(number|"...")[]=>{
    if(totalPages<=7)return Array.from({length:totalPages},(_,i)=>i+1);
    const set=new Set<number>([1,totalPages,safePage-1,safePage,safePage+1].filter(p=>p>=1&&p<=totalPages));
    const sorted=[...set].sort((a,b)=>a-b);
    const out:(number|"...")[]=[];
    sorted.forEach((p,i)=>{if(i>0&&p-sorted[i-1]>1)out.push("...");out.push(p);});
    return out;
  })();
  return(
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">用户管理</h1>
        <p className="text-xs text-gray-400 mt-1">小程序端微信用户，共 {total} 人。仅统计完成手机号登录的用户，点击任意一行查看详情。</p>
      </div>
      <Paper variant="outlined" sx={{borderColor:"#E8E8EC",borderRadius:"12px",p:2}}>
        <Stack direction={{xs:"column",md:"row"}} spacing={2}>
          <TextField size="small" fullWidth placeholder="搜索昵称 / 手机号" value={searchInput} onChange={e=>setSearchInput(e.target.value)}
            slotProps={{input:{startAdornment:<InputAdornment position="start"><Search size={14}/></InputAdornment>}}}/>
          <Button variant="outlined" size="small" startIcon={<RefreshCw size={14}/>} onClick={()=>void load()}>刷新</Button>
        </Stack>
      </Paper>
      <TableContainer component={Paper} variant="outlined" sx={{borderColor:"#E8E8EC",borderRadius:"12px"}}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{bgcolor:"#FAFAFA"}}>
              {["用户","联系电话","微信状态","订单数","地址数","积分","创建时间","最近活跃"].map(h=>(
                <TableCell key={h} sx={{fontWeight:600,color:"#6B6B6B"}}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map(user=>(
              <TableRow key={user._id} hover onClick={()=>onViewUser?.(user._id)} sx={{cursor:"pointer"}}>
                <TableCell>
                  <Stack direction="row" spacing={1} sx={{alignItems:"center"}}>
                    {user.avatarUrl
                      ?<img src={cloudUrlToHttps(user.avatarUrl)} className="w-8 h-8 rounded-full object-cover"/>
                      :<div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center"><User size={14}/></div>}
                    <Typography variant="body2" sx={{fontWeight:500}}>{user.nickName||"微信用户"}</Typography>
                  </Stack>
                </TableCell>
                <TableCell><Typography variant="body2" sx={{fontFamily:"monospace"}}>{user.phone||"—"}</Typography></TableCell>
                <TableCell><Chip size="small" variant={user.wechatBound?"filled":"outlined"} color={user.wechatBound?"success":"default"} label={user.wechatBound?"已绑定":"未绑定"}/></TableCell>
                <TableCell><Typography variant="body2">{user.orderCount}</Typography></TableCell>
                <TableCell><Typography variant="body2">{user.addressCount}</Typography></TableCell>
                <TableCell><Typography variant="body2">{(user as UserRecord&{points?:number}).points??0}</Typography></TableCell>
                <TableCell><Typography variant="caption" color="text.secondary" sx={{fontFamily:"monospace"}}>{formatCloudTime(user.createTime)}</Typography></TableCell>
                <TableCell><Typography variant="caption" color="text.secondary">{formatCloudTime(user.lastLoginTime||user.updateTime)}</Typography></TableCell>
              </TableRow>
            ))}
            {loading&&users.length===0&&<TableRow><TableCell colSpan={8} align="center" sx={{py:8}}>
              <Loader size={24} className="mx-auto text-indigo-600 animate-spin mb-3"/>
              <Typography variant="body2" color="text.disabled">正在加载用户…</Typography>
            </TableCell></TableRow>}
            {!loading&&users.length===0&&<TableRow><TableCell colSpan={8} align="center" sx={{py:8}}>
              <Users size={32} className="mx-auto text-gray-200 mb-3"/>
              <Typography variant="body2" color="text.disabled">{keyword?"没有匹配的用户":"暂无已同步的小程序用户"}</Typography>
            </TableCell></TableRow>}
          </TableBody>
        </Table>
        <div className="px-5 py-3 border-t border-[#E8E8EC] flex items-center justify-between">
          <span className="text-xs text-gray-400">显示 {users.length} / {total} 条</span>
          <div className="flex items-center gap-1">
            <button disabled={safePage<=1} onClick={()=>setCurrentPage(p=>Math.max(1,p-1))} className="w-7 h-7 rounded-md text-xs font-medium flex items-center justify-center border border-[#E8E8EC] text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">‹</button>
            {pageItems.map((item,idx)=>item==="..."?<span key={`de${idx}`} className="w-5 text-center text-xs text-gray-400">…</span>:<button key={item} onClick={()=>setCurrentPage(item as number)} className={`w-7 h-7 rounded-md text-xs font-medium transition-all ${item===safePage?"bg-indigo-600 text-white":"text-gray-500 hover:bg-gray-100"}`}>{item}</button>)}
            <button disabled={safePage>=totalPages} onClick={()=>setCurrentPage(p=>Math.min(totalPages,p+1))} className="w-7 h-7 rounded-md text-xs font-medium flex items-center justify-center border border-[#E8E8EC] text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">›</button>
          </div>
        </div>
      </TableContainer>
    </div>
  );
}

// 角色 Chip：内置角色用 ROLE_META 的配色，自定义角色回落到灰色
function RoleChips({ roleKeys,roles }:{ roleKeys:string[];roles:RoleRecord[] }) {
  if(!roleKeys.length)return <Typography variant="caption" color="text.disabled">未分配</Typography>;
  return <Stack direction="row" spacing={0.5} useFlexGap sx={{flexWrap:"wrap"}}>
    {roleKeys.map(key=>{
      const meta=ROLE_META[key];
      const label=roles.find(r=>r.roleKey===key)?.name||meta?.label||key;
      return <Chip key={key} size="small" label={label} color={meta?.color||"default"} variant={meta?.color&&meta.color!=="default"?"filled":"outlined"}/>;
    })}
  </Stack>;
}

// ─── 成员管理（后台用户 + 工作人员） ───────────────────────────────────────────
function MembersPage({ token,roles,onSaveMember,onToggleStatus,onError }:{
  token:string;
  roles:RoleRecord[];
  onSaveMember:(member:Partial<MemberRecord>)=>Promise<void>;
  onToggleStatus:(member:MemberRecord,status:MemberStatus)=>Promise<void>;
  onError:(error:unknown)=>void;
}) {
  const auth=useAuth();
  const canWrite=auth.has("member:write");
  const [data,setData]=useState<MemberListResult|null>(null);
  const [loading,setLoading]=useState(true);
  const [needInit,setNeedInit]=useState(false);
  const [keyword,setKeyword]=useState("");
  const [roleFilter,setRoleFilter]=useState("");
  const [statusFilter,setStatusFilter]=useState("");
  const [storeFilter,setStoreFilter]=useState("");
  const [editing,setEditing]=useState<MemberRecord|null|undefined>(undefined);
  const [detailId,setDetailId]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const result=await callCloud<MemberListResult>("adminListMembers",{
        sessionToken:token,keyword,roleKey:roleFilter,status:statusFilter,store:storeFilter,
      });
      setData(result||null);
      setNeedInit(false);
    }catch(error){
      // 集合未创建 / 接口未部署：提示先执行初始化，不弹全局错误
      setNeedInit(true);
      setData(null);
      void error;
    }finally{setLoading(false);}
  },[token,keyword,roleFilter,statusFilter,storeFilter]);

  useEffect(()=>{void load();},[load]);

  const list=data?.list||[];
  const counts=data?.counts||{active:0,resting:0,resigned:0};

  const submit=async(member:Partial<MemberRecord>)=>{
    await onSaveMember(member);
    setEditing(undefined);
    await load();
  };

  const toggle=async(member:MemberRecord,status:MemberStatus)=>{
    await onToggleStatus(member,status);
    await load();
  };

  if(needInit)return(
    <div className="p-6 space-y-5">
      <h1 className="text-xl font-semibold text-gray-900">成员管理</h1>
      <Paper variant="outlined" sx={{borderColor:"#E8E8EC",borderRadius:"12px",p:4,textAlign:"center"}}>
        <Shield size={32} className="mx-auto text-gray-200 mb-3"/>
        <Typography variant="body2" color="text.secondary">成员集合尚未初始化</Typography>
        <Typography variant="caption" color="text.disabled" sx={{mt:1,display:"block"}}>
          请在云开发控制台依次调用 initMemberCollections 与 migrateMembersFromLegacy，完成集合创建与历史数据迁移后刷新本页。
        </Typography>
        <Button variant="outlined" size="small" sx={{mt:2}} onClick={()=>void load()}>重新检测</Button>
      </Paper>
    </div>
  );

  return(
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">成员管理</h1>
          <p className="text-xs text-gray-400 mt-1">后台用户与工作人员统一档案，共 {list.length} 人。点击任意一行查看详情。</p>
        </div>
        {canWrite&&<Button variant="contained" size="small" startIcon={<Plus size={14}/>} onClick={()=>setEditing(null)}>添加成员</Button>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {([["active","在职"],["resting","休息"],["resigned","离职"]] as [MemberStatus,string][]).map(([key,label])=>(
          <Paper key={key} variant="outlined" sx={{borderColor:"#E8E8EC",borderRadius:"12px",p:2}}>
            <Typography variant="h5" color={key==="active"?"success.main":key==="resting"?"warning.main":"text.disabled"} sx={{fontWeight:700,fontFamily:"monospace"}}>
              {counts[key]||0}
            </Typography>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
          </Paper>
        ))}
      </div>

      <Paper variant="outlined" sx={{borderColor:"#E8E8EC",borderRadius:"12px",p:2}}>
        <Stack direction={{xs:"column",md:"row"}} spacing={2}>
          <TextField size="small" fullWidth placeholder="搜索姓名 / 手机号 / 工号" value={keyword} onChange={e=>setKeyword(e.target.value)}
            slotProps={{input:{startAdornment:<InputAdornment position="start"><Search size={14}/></InputAdornment>}}}/>
          <TextField select size="small" label="角色" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)} sx={{minWidth:160}}>
            <MenuItem value="">全部角色</MenuItem>
            {(data?.roles||[]).map(r=><MenuItem key={r.roleKey} value={r.roleKey}>{r.name}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="状态" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} sx={{minWidth:140}}>
            <MenuItem value="">全部状态</MenuItem>
            <MenuItem value="active">在职</MenuItem>
            <MenuItem value="resting">休息</MenuItem>
            <MenuItem value="resigned">离职</MenuItem>
          </TextField>
          <TextField select size="small" label="门店" value={storeFilter} onChange={e=>setStoreFilter(e.target.value)} sx={{minWidth:140}}>
            <MenuItem value="">全部门店</MenuItem>
            {(data?.stores||[]).map(s=><MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
        </Stack>
      </Paper>

      <TableContainer component={Paper} variant="outlined" sx={{borderColor:"#E8E8EC",borderRadius:"12px"}}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{bgcolor:"#FAFAFA"}}>
              {["成员","手机号","角色","门店","状态","微信","入职日期"].map(h=>(
                <TableCell key={h} sx={{fontWeight:600,color:"#6B6B6B"}}>{h}</TableCell>
              ))}
              {canWrite&&<TableCell sx={{fontWeight:600,color:"#6B6B6B"}}>操作</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map(member=>{
              const statusMeta=MEMBER_STATUS_META[member.status];
              return(
                <TableRow key={member._id} hover onClick={()=>setDetailId(member._id)} sx={{cursor:"pointer"}}>
                  <TableCell>
                    <Typography variant="body2" sx={{fontWeight:500}}>{member.name||"未命名"}</Typography>
                    {member.employeeNo&&<Typography variant="caption" color="text.disabled">{member.employeeNo}</Typography>}
                  </TableCell>
                  <TableCell><Typography variant="body2" sx={{fontFamily:"monospace"}}>{member.phone||"—"}</Typography></TableCell>
                  <TableCell><RoleChips roleKeys={member.roleKeys} roles={roles}/></TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{member.store||"—"}</Typography></TableCell>
                  <TableCell><Chip size="small" label={statusMeta.label} color={statusMeta.color} variant={member.status==="resigned"?"outlined":"filled"}/></TableCell>
                  <TableCell><Chip size="small" variant="outlined" color={member.wechatBound?"success":"default"} label={member.wechatBound?"已绑定":"未绑定"}/></TableCell>
                  <TableCell><Typography variant="caption" color="text.secondary" sx={{fontFamily:"monospace"}}>{member.joinDate||"—"}</Typography></TableCell>
                  {canWrite&&<TableCell onClick={e=>e.stopPropagation()}>
                    <RowActions layout="inline">
                      <RowActionButton tone="blue" icon={Edit2} onClick={()=>setEditing(member)}>编辑</RowActionButton>
                      {member.status==="active"
                        ?<RowActionButton tone="red" icon={Ban} onClick={()=>void toggle(member,"resigned").catch(onError)}>离职</RowActionButton>
                        :<RowActionButton tone="green" icon={CheckCircle2} onClick={()=>void toggle(member,"active").catch(onError)}>复职</RowActionButton>}
                    </RowActions>
                  </TableCell>}
                </TableRow>
              );
            })}
            {loading&&!list.length&&<TableRow><TableCell colSpan={canWrite?8:7} align="center" sx={{py:8}}>
              <CircularProgress size={20}/>
            </TableCell></TableRow>}
            {!loading&&!list.length&&<TableRow><TableCell colSpan={canWrite?8:7} align="center" sx={{py:8}}>
              <Users size={32} className="mx-auto text-gray-200 mb-3"/>
              <Typography variant="body2" color="text.disabled">没有符合条件的成员</Typography>
            </TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>

      {editing!==undefined&&<MemberEditor initial={editing} roles={roles} stores={data?.stores||[]} onClose={()=>setEditing(undefined)} onSave={submit}/>}
      {detailId&&<MemberDetailModal token={token} id={detailId} roles={roles} onClose={()=>setDetailId("")} onError={onError}/>}
    </div>
  );
}

function MemberEditor({ initial,roles,stores,onClose,onSave }:{
  initial:MemberRecord|null;
  roles:RoleRecord[];
  stores:string[];
  onClose:()=>void;
  onSave:(member:Partial<MemberRecord>)=>Promise<void>;
}) {
  const isEdit=Boolean(initial);
  const [form,setForm]=useState<Partial<MemberRecord>>(initial||{
    name:"",phone:"",roleKeys:[],status:"active",employeeNo:"",store:"",area:"",joinDate:"",
  });
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const phoneValid=/^1[3-9]\d{9}$/.test(String(form.phone||""));
  const roleKeys=form.roleKeys||[];
  const canSave=phoneValid&&String(form.name||"").trim().length>0&&roleKeys.length>0;

  const save=async()=>{
    if(!canSave)return;
    setError("");
    setSaving(true);
    try{
      await onSave({...form,name:String(form.name||"").trim(),phone:String(form.phone||"").replace(/\D/g,"")});
    }catch(e:unknown){
      const hint=(e&&typeof e==="object"&&"data" in e)?(e as {data?:{hint?:string}}).data?.hint:"";
      setError(hint||(e instanceof Error?e.message:"保存失败"));
    }finally{setSaving(false);}
  };

  return(
    <Dialog open fullWidth maxWidth="sm" onClose={onClose} slotProps={{paper:{sx:{borderRadius:3}}}}>
      <DialogTitle>{isEdit?"编辑成员":"添加成员"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{pt:1}}>
          <Stack direction="row" spacing={2}>
            <TextField label="姓名" required fullWidth value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})}/>
            <TextField label="手机号" required fullWidth value={form.phone||""} onChange={e=>setForm({...form,phone:e.target.value.trim()})}
              error={!!form.phone&&!phoneValid}
              helperText={form.phone&&!phoneValid?"需为 11 位数字且以 1[3-9] 开头":"用于关联小程序账号"}
              slotProps={{htmlInput:{inputMode:"numeric",maxLength:11,style:{fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace"}}}}/>
          </Stack>
          <TextField select required fullWidth label="角色" value={roleKeys}
            onChange={e=>setForm({...form,roleKeys:e.target.value as unknown as string[]})}
            error={!roleKeys.length}
            helperText={roleKeys.length?"可多选，权限为所选角色的并集":"请至少选择一个角色"}
            slotProps={{select:{
              multiple:true,
              renderValue:(selected)=>(
                <Stack direction="row" spacing={0.5} sx={{flexWrap:"wrap",gap:0.5}}>
                  {(selected as string[]).map(key=>{
                    const role=roles.find(r=>r.roleKey===key);
                    const meta=ROLE_META[key];
                    return <Chip key={key} size="small" label={role?.name||key} color={meta?.color||"default"}
                      variant={meta?.color&&meta.color!=="default"?"filled":"outlined"}/>;
                  })}
                </Stack>
              ),
            }}}>
            {roles.map(role=>(
              <MenuItem key={role.roleKey} value={role.roleKey}>
                <Checkbox size="small" checked={roleKeys.includes(role.roleKey)} sx={{mr:1,p:0.5}}/>
                <ListItemText primary={role.name} secondary={role.description||role.roleKey}
                  slotProps={{primary:{variant:"body2"},secondary:{variant:"caption"}}}/>
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={2}>
            <TextField select label="状态" fullWidth value={form.status||"active"} onChange={e=>setForm({...form,status:e.target.value as MemberStatus})}>
              <MenuItem value="active">在职</MenuItem>
              <MenuItem value="resting">休息</MenuItem>
              <MenuItem value="resigned">离职</MenuItem>
            </TextField>
            <TextField label="工号" fullWidth value={form.employeeNo||""} onChange={e=>setForm({...form,employeeNo:e.target.value})}/>
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField label="所属门店" fullWidth value={form.store||""} onChange={e=>setForm({...form,store:e.target.value})}
              slotProps={{htmlInput:{list:"member-store-options"}}}/>
            <datalist id="member-store-options">{stores.map(s=><option key={s} value={s}/>)}</datalist>
            <TextField label="服务区域" fullWidth value={form.area||""} onChange={e=>setForm({...form,area:e.target.value})}/>
          </Stack>
          <TextField label="入职日期" type="date" fullWidth value={form.joinDate||""} onChange={e=>setForm({...form,joinDate:e.target.value})}
            slotProps={{inputLabel:{shrink:true}}}/>
          {error&&<Typography variant="caption" color="error">{error}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{px:3,py:2}}>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" disabled={saving||!canSave} onClick={()=>void save()}>{saving?"保存中…":"保存"}</Button>
      </DialogActions>
    </Dialog>
  );
}

function MemberDetailModal({ token,id,roles,onClose,onError }:{
  token:string;id:string;roles:RoleRecord[];onClose:()=>void;onError:(error:unknown)=>void;
}) {
  const [detail,setDetail]=useState<MemberDetailResult|null>(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let alive=true;
    (async()=>{
      try{
        const result=await callCloud<MemberDetailResult>("adminGetMemberDetail",{sessionToken:token,id});
        if(alive)setDetail(result||null);
      }catch(error){onError(error);}
      finally{if(alive)setLoading(false);}
    })();
    return()=>{alive=false;};
  },[token,id,onError]);

  const member=detail?.member;
  return(
    <Dialog open fullWidth maxWidth="sm" onClose={onClose} slotProps={{paper:{sx:{borderRadius:3}}}}>
      <DialogTitle>成员详情</DialogTitle>
      <DialogContent dividers>
        {loading?<Box sx={{py:6,textAlign:"center"}}><CircularProgress size={20}/></Box>:!member?
          <Typography variant="body2" color="text.disabled" sx={{py:4,textAlign:"center"}}>未找到该成员</Typography>:
          <Stack spacing={2.5} sx={{pt:1}}>
            <Stack direction="row" spacing={2} sx={{alignItems:"center"}}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold" style={{background:"var(--genesis-primary)"}}>
                {(member.name||"?").slice(0,1)}
              </div>
              <div>
                <Typography variant="subtitle1" sx={{fontWeight:600}}>{member.name||"未命名"}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{fontFamily:"monospace"}}>{member.phone||"—"}</Typography>
              </div>
              <Box sx={{ml:"auto"}}><Chip size="small" label={MEMBER_STATUS_META[member.status].label} color={MEMBER_STATUS_META[member.status].color}/></Box>
            </Stack>
            <Divider/>
            <Stack spacing={1.5}>
              <Stack direction="row" sx={{alignItems:"center",justifyContent:"space-between"}}>
                <Typography variant="body2" color="text.secondary">角色</Typography>
                <RoleChips roleKeys={member.roleKeys} roles={roles}/>
              </Stack>
              {([["工号",member.employeeNo],["所属门店",member.store],["服务区域",member.area],["入职日期",member.joinDate]] as [string,string|undefined][]).map(([label,value])=>(
                <Stack key={label} direction="row" sx={{justifyContent:"space-between"}}>
                  <Typography variant="body2" color="text.secondary">{label}</Typography>
                  <Typography variant="body2">{value||"—"}</Typography>
                </Stack>
              ))}
              <Stack direction="row" sx={{justifyContent:"space-between"}}>
                <Typography variant="body2" color="text.secondary">登录绑定</Typography>
                <Stack direction="row" spacing={0.5}>
                  <Chip size="small" variant="outlined" color={member.wechatBound?"success":"default"} label={member.wechatBound?"微信已绑定":"微信未绑定"}/>
                  <Chip size="small" variant="outlined" color={member.phoneLoginBound?"success":"default"} label={member.phoneLoginBound?"手机号已登录":"手机号未登录"}/>
                </Stack>
              </Stack>
              {member.roleKeys.includes("recycler")&&<Stack direction="row" sx={{justifyContent:"space-between"}}>
                <Typography variant="body2" color="text.secondary">累计接单</Typography>
                <Typography variant="body2">{detail?.orderCount??0} 单</Typography>
              </Stack>}
            </Stack>
            <Divider/>
            <div>
              <Typography variant="body2" color="text.secondary" gutterBottom>关联的小程序账号</Typography>
              {detail?.linkedUser?
                <Stack direction="row" spacing={1.5} sx={{mt:1,alignItems:"center"}}>
                  {detail.linkedUser.avatarUrl
                    ?<img src={cloudUrlToHttps(detail.linkedUser.avatarUrl)} className="w-9 h-9 rounded-full object-cover"/>
                    :<div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center"><User size={14}/></div>}
                  <div>
                    <Typography variant="body2" sx={{fontWeight:500}}>{detail.linkedUser.nickName||"微信用户"}</Typography>
                    <Typography variant="caption" color="text.secondary">积分 {detail.linkedUser.points??0} · 最近活跃 {formatCloudTime(detail.linkedUser.lastLoginTime)}</Typography>
                  </div>
                </Stack>:
                <Typography variant="caption" color="text.disabled">该手机号尚未在小程序注册</Typography>}
            </div>
          </Stack>}
      </DialogContent>
      <DialogActions sx={{px:3,py:2}}><Button onClick={onClose}>关闭</Button></DialogActions>
    </Dialog>
  );
}

// ─── 评估员招募报名（小程序留资，后台跟进） ───────────────────────────────────
const RECRUIT_STATUS_META: Record<StaffRecruitStatus,{label:string;color:"warning"|"primary"|"success"|"default"}> = {
  pending:  {label:"待联系", color:"warning"},
  contacted:{label:"已联系", color:"primary"},
  passed:   {label:"已通过", color:"success"},
  rejected: {label:"已拒绝", color:"default"},
};

function StaffRecruitsPage({ token,onError,notify }:{
  token:string;
  onError:(error:unknown)=>void;
  notify:(message:{kind:"success"|"error";text:string})=>void;
}) {
  const auth=useAuth();
  const canWrite=auth.has("member:write");
  const [list,setList]=useState<StaffRecruitRecord[]>([]);
  const [loading,setLoading]=useState(true);
  const [needInit,setNeedInit]=useState(false);
  const [keyword,setKeyword]=useState("");
  const [statusFilter,setStatusFilter]=useState("");
  const [editing,setEditing]=useState<StaffRecruitRecord|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      // 云函数返回的是分页信封 {list,total,hasMore}，不是数组。
      // 页面内没有分页 UI，统计与筛选都基于全量，所以这里把每一页取完。
      // pageSize 必须 <= 云函数的 PAGE_SIZE_MAX(50)，否则 skip 计算会漏数据。
      const PAGE=50;
      const query=(page:number)=>callCloud<StaffRecruitListResult>("adminListStaffRecruits",{
        sessionToken:token,keyword,status:statusFilter,page,pageSize:PAGE,
      });
      const first=await query(1);
      const all=[...(first?.list||[])];
      const pageCount=Math.ceil((first?.total||0)/PAGE);
      if(pageCount>1){
        const rest=await Promise.all(Array.from({length:pageCount-1},(_,index)=>query(index+2)));
        rest.forEach(result=>all.push(...(result?.list||[])));
      }
      setList(all);
      setNeedInit(false);
    }catch(error){
      // 集合未创建 / 接口未部署：给出提示而不弹全局错误
      setNeedInit(true);
      setList([]);
      void error;
    }finally{setLoading(false);}
  },[token,keyword,statusFilter]);

  useEffect(()=>{void load();},[load]);

  // 状态统计基于当前筛选结果，仅作参考
  const counts=useMemo(()=>{
    const base:Record<StaffRecruitStatus,number>={pending:0,contacted:0,passed:0,rejected:0};
    if(!Array.isArray(list))return base;
    list.forEach(item=>{if(base[item.status]!==undefined)base[item.status]+=1;});
    return base;
  },[list]);

  const update=async(id:string,payload:{status?:StaffRecruitStatus;remark?:string})=>{
    try{
      await callCloud("adminUpdateStaffRecruit",{sessionToken:token,recruitId:id,...payload});
      notify({kind:"success",text:"报名信息已更新"});
      await load();
    }catch(error){onError(error);throw error;}
  };

  const remove=async(id:string)=>{
    if(!window.confirm("确认删除这条报名记录？"))return;
    try{
      await callCloud("adminDeleteStaffRecruit",{sessionToken:token,recruitId:id});
      notify({kind:"success",text:"报名记录已删除"});
      await load();
    }catch(error){onError(error);}
  };

  if(needInit)return(
    <div className="p-6 space-y-5">
      <h1 className="text-xl font-semibold text-gray-900">评估员招募</h1>
      <Paper variant="outlined" sx={{borderColor:"#E8E8EC",borderRadius:"12px",p:4,textAlign:"center"}}>
        <UserPlus size={32} className="mx-auto text-gray-200 mb-3"/>
        <Typography variant="body2" color="text.secondary">招募报名功能尚未就绪</Typography>
        <Typography variant="caption" color="text.disabled" sx={{mt:1,display:"block"}}>
          请确认云函数已部署且 staff_recruits 集合已创建，然后刷新本页。
        </Typography>
        <Button variant="outlined" size="small" sx={{mt:2}} onClick={()=>void load()}>重新检测</Button>
      </Paper>
    </div>
  );

  return(
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">评估员招募</h1>
          <p className="text-xs text-gray-400 mt-1">小程序招募页提交的报名留资，共 {list.length} 条。联系后请及时更新状态。</p>
        </div>
        <Button variant="outlined" size="small" startIcon={<RefreshCw size={14}/>} onClick={()=>void load()}>刷新</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.keys(RECRUIT_STATUS_META) as StaffRecruitStatus[]).map(key=>(
          <Paper key={key} variant="outlined" sx={{borderColor:"#E8E8EC",borderRadius:"12px",p:2}}>
            <Typography variant="h5" color={key==="pending"?"warning.main":key==="contacted"?"primary.main":key==="passed"?"success.main":"text.disabled"} sx={{fontWeight:700,fontFamily:"monospace"}}>
              {counts[key]}
            </Typography>
            <Typography variant="caption" color="text.secondary">{RECRUIT_STATUS_META[key].label}</Typography>
          </Paper>
        ))}
      </div>

      <Paper variant="outlined" sx={{borderColor:"#E8E8EC",borderRadius:"12px",p:2}}>
        <Stack direction={{xs:"column",md:"row"}} spacing={2}>
          <TextField size="small" fullWidth placeholder="搜索姓名 / 手机号 / 期望工作区域" value={keyword} onChange={e=>setKeyword(e.target.value)}
            slotProps={{input:{startAdornment:<InputAdornment position="start"><Search size={14}/></InputAdornment>}}}/>
          <TextField select size="small" label="状态" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} sx={{minWidth:160}}>
            <MenuItem value="">全部状态</MenuItem>
            {(Object.keys(RECRUIT_STATUS_META) as StaffRecruitStatus[]).map(key=>(
              <MenuItem key={key} value={key}>{RECRUIT_STATUS_META[key].label}</MenuItem>
            ))}
          </TextField>
        </Stack>
      </Paper>

      <TableContainer component={Paper} variant="outlined" sx={{borderColor:"#E8E8EC",borderRadius:"12px"}}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{bgcolor:"#FAFAFA"}}>
              {["姓名","手机号","期望工作区域","状态","备注","报名时间"].map(h=>(
                <TableCell key={h} sx={{fontWeight:600,color:"#6B6B6B"}}>{h}</TableCell>
              ))}
              {canWrite&&<TableCell sx={{fontWeight:600,color:"#6B6B6B"}}>操作</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map(item=>{
              const meta=RECRUIT_STATUS_META[item.status]||RECRUIT_STATUS_META.pending;
              return(
                <TableRow key={item._id} hover>
                  <TableCell><Typography variant="body2" sx={{fontWeight:500}}>{item.name||"未填写"}</Typography></TableCell>
                  <TableCell><Typography variant="body2" sx={{fontFamily:"monospace"}}>{item.phone||"—"}</Typography></TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{item.expectArea||"—"}</Typography></TableCell>
                  <TableCell><Chip size="small" label={meta.label} color={meta.color} variant={item.status==="rejected"?"outlined":"filled"}/></TableCell>
                  <TableCell sx={{maxWidth:220}}><Typography variant="body2" color="text.secondary" sx={{wordBreak:"break-all"}}>{item.remark||"—"}</Typography></TableCell>
                  <TableCell><Typography variant="caption" color="text.secondary" sx={{fontFamily:"monospace"}}>{formatCloudTime(item.createTime)}</Typography></TableCell>
                  {canWrite&&<TableCell>
                    <RowActions layout="inline">
                      <RowActionButton tone="blue" icon={Edit2} onClick={()=>setEditing(item)}>跟进</RowActionButton>
                      {item.status==="pending"&&<RowActionButton tone="green" icon={Phone} onClick={()=>void update(item._id,{status:"contacted"}).catch(()=>{})}>标记已联系</RowActionButton>}
                      <RowActionButton tone="red" icon={Trash2} onClick={()=>void remove(item._id)}>删除</RowActionButton>
                    </RowActions>
                  </TableCell>}
                </TableRow>
              );
            })}
            {loading&&!list.length&&<TableRow><TableCell colSpan={canWrite?7:6} align="center" sx={{py:8}}>
              <CircularProgress size={20}/>
            </TableCell></TableRow>}
            {!loading&&!list.length&&<TableRow><TableCell colSpan={canWrite?7:6} align="center" sx={{py:8}}>
              <UserPlus size={32} className="mx-auto text-gray-200 mb-3"/>
              <Typography variant="body2" color="text.disabled">暂无符合条件的报名记录</Typography>
            </TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>

      {editing&&<StaffRecruitEditor initial={editing} onClose={()=>setEditing(null)} onSave={async(payload)=>{
        await update(editing._id,payload);
        setEditing(null);
      }}/>}
    </div>
  );
}

function StaffRecruitEditor({ initial,onClose,onSave }:{
  initial:StaffRecruitRecord;
  onClose:()=>void;
  onSave:(payload:{status:StaffRecruitStatus;remark:string})=>Promise<void>;
}) {
  const [status,setStatus]=useState<StaffRecruitStatus>(initial.status||"pending");
  const [remark,setRemark]=useState(initial.remark||"");
  const [saving,setSaving]=useState(false);

  const submit=async()=>{
    setSaving(true);
    try{await onSave({status,remark});}
    catch{setSaving(false);}
  };

  return(
    <Dialog open fullWidth maxWidth="xs" onClose={onClose}>
      <DialogTitle>跟进报名 · {initial.name||"未填写"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{pt:1}}>
          <Stack direction="row" sx={{justifyContent:"space-between"}}>
            <Typography variant="body2" color="text.secondary">手机号</Typography>
            <Typography variant="body2" sx={{fontFamily:"monospace"}}>{initial.phone||"—"}</Typography>
          </Stack>
          <Stack direction="row" sx={{justifyContent:"space-between"}}>
            <Typography variant="body2" color="text.secondary">期望工作区域</Typography>
            <Typography variant="body2">{initial.expectArea||"—"}</Typography>
          </Stack>
          <TextField select size="small" label="处理状态" value={status} onChange={e=>setStatus(e.target.value as StaffRecruitStatus)}>
            {(Object.keys(RECRUIT_STATUS_META) as StaffRecruitStatus[]).map(key=>(
              <MenuItem key={key} value={key}>{RECRUIT_STATUS_META[key].label}</MenuItem>
            ))}
          </TextField>
          <TextField size="small" label="备注" multiline minRows={3} value={remark} onChange={e=>setRemark(e.target.value.slice(0,200))}
            placeholder="记录沟通结果，如已加微信、约定面谈时间等" helperText={`${remark.length}/200`}/>
        </Stack>
      </DialogContent>
      <DialogActions sx={{px:3,py:2}}>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" disabled={saving} onClick={()=>void submit()}>{saving?"保存中…":"保存"}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── 角色管理 ─────────────────────────────────────────────────────────────────
function RolesPage({ roles,catalog,superAdminKey,onSaveRole,onDeleteRole }:{
  roles:RoleRecord[];
  catalog:PermissionModule[];
  superAdminKey:string;
  onSaveRole:(role:Partial<RoleRecord>)=>Promise<void>;
  onDeleteRole:(role:RoleRecord)=>Promise<void>;
}) {
  const auth=useAuth();
  const canWrite=auth.has("role:write");
  const [editing,setEditing]=useState<RoleRecord|null|undefined>(undefined);

  if(!roles.length)return(
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">角色管理</h1>
          <p className="text-xs text-gray-400 mt-1">为成员配置权限点。内置角色可调整权限但不可删除。</p>
        </div>
        {canWrite&&<Button variant="contained" size="small" startIcon={<Plus size={14}/>} onClick={()=>setEditing(null)}>添加角色</Button>}
      </div>
      <Paper variant="outlined" sx={{borderColor:"#E8E8EC",borderRadius:"12px",p:4,textAlign:"center"}}>
        <Lock size={32} className="mx-auto text-gray-200 mb-3"/>
        <Typography variant="body2" color="text.secondary">角色集合尚未初始化</Typography>
        <Typography variant="caption" color="text.disabled" sx={{mt:1,display:"block"}}>
          云函数部署后会自动写入内置角色；也可直接点击右上角「添加角色」自建。
        </Typography>
      </Paper>
      {editing!==undefined&&<RoleEditor initial={editing} catalog={catalog} superAdminKey={superAdminKey}
        onClose={()=>setEditing(undefined)}
        onSave={async(role)=>{await onSaveRole(role);setEditing(undefined);}}/>}
    </div>
  );

  return(
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">角色管理</h1>
          <p className="text-xs text-gray-400 mt-1">为成员配置权限点。内置角色可调整权限但不可删除。</p>
        </div>
        {canWrite&&<Button variant="contained" size="small" startIcon={<Plus size={14}/>} onClick={()=>setEditing(null)}>添加角色</Button>}
      </div>

      <TableContainer component={Paper} variant="outlined" sx={{borderColor:"#E8E8EC",borderRadius:"12px"}}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{bgcolor:"#FAFAFA"}}>
              {["角色","标识","说明","权限数","成员数","类型"].map(h=>(
                <TableCell key={h} sx={{fontWeight:600,color:"#6B6B6B"}}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {roles.map(role=>(
                <TableRow key={role._id} hover onClick={()=>canWrite&&setEditing(role)} sx={{cursor:canWrite?"pointer":"default"}}>
                  <TableCell>
                    <Chip size="small" label={role.name} variant="outlined" sx={{bgcolor:"#FFFFFF"}}/>
                  </TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary" sx={{fontFamily:"monospace"}}>{role.roleKey}</Typography></TableCell>
                  <TableCell><Typography variant="body2" color={role.description?"text.primary":"text.disabled"}>{role.description||"—"}</Typography></TableCell>
                  <TableCell><Typography variant="body2">{role.roleKey===superAdminKey?"全部":role.permissions.length}</Typography></TableCell>
                  <TableCell><Typography variant="body2">{role.memberCount??0}</Typography></TableCell>
                  <TableCell><Chip size="small" variant="outlined" label={role.builtIn?"内置":"自定义"}/></TableCell>
                </TableRow>
            ))}
          </TableBody>
        </Table>
        {canWrite&&<div className="px-5 py-3 border-t border-[#E8E8EC]">
          <span className="text-xs text-gray-400">点击任意一行即可编辑该角色的权限</span>
        </div>}
      </TableContainer>

      {editing!==undefined&&<RoleEditor initial={editing} catalog={catalog} superAdminKey={superAdminKey}
        onClose={()=>setEditing(undefined)}
        onSave={async(role)=>{await onSaveRole(role);setEditing(undefined);}}
        onDelete={editing?async()=>{await onDeleteRole(editing);setEditing(undefined);}:undefined}/>}
    </div>
  );
}

function RoleEditor({ initial,catalog,superAdminKey,onClose,onSave,onDelete }:{
  initial:RoleRecord|null;
  catalog:PermissionModule[];
  superAdminKey:string;
  onClose:()=>void;
  onSave:(role:Partial<RoleRecord>)=>Promise<void>;
  onDelete?:()=>Promise<void>;
}) {
  const isEdit=Boolean(initial);
  const isSuperAdmin=initial?.roleKey===superAdminKey;
  const inUse=(initial?.memberCount??0)>0;
  const [form,setForm]=useState<Partial<RoleRecord>>(initial||{roleKey:"",name:"",description:"",permissions:[],sort:999});
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [confirmingDelete,setConfirmingDelete]=useState(false);
  const permissions=form.permissions||[];
  const roleKeyValid=isEdit||/^[a-z][a-z0-9_]{1,31}$/.test(String(form.roleKey||""));
  const canSave=String(form.name||"").trim().length>0&&roleKeyValid;

  const togglePermission=(key:string)=>{
    if(isSuperAdmin)return;
    setForm(current=>{
      const list=current.permissions||[];
      return {...current,permissions:list.includes(key)?list.filter(k=>k!==key):[...list,key]};
    });
  };

  const toggleModule=(module:PermissionModule,checked:boolean)=>{
    if(isSuperAdmin)return;
    const keys=module.items.map(i=>i.key);
    setForm(current=>{
      const list=current.permissions||[];
      return {...current,permissions:checked?[...new Set([...list,...keys])]:list.filter(k=>!keys.includes(k))};
    });
  };

  const save=async()=>{
    if(!canSave)return;
    setError("");
    setSaving(true);
    try{
      await onSave({...form,name:String(form.name||"").trim()});
    }catch(e:unknown){
      const hint=(e&&typeof e==="object"&&"data" in e)?(e as {data?:{hint?:string}}).data?.hint:"";
      setError(hint||(e instanceof Error?e.message:"保存失败"));
    }finally{setSaving(false);}
  };

  return(
    <Dialog open fullWidth maxWidth="md" onClose={onClose} slotProps={{paper:{sx:{borderRadius:3}}}}>
      <DialogTitle>{isEdit?"编辑角色":"添加角色"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{pt:1}}>
          <Stack direction="row" spacing={2}>
            <TextField label="角色名称" required fullWidth value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})}/>
            <TextField label="角色标识" required fullWidth value={form.roleKey||""} disabled={isEdit}
              onChange={e=>setForm({...form,roleKey:e.target.value.trim().toLowerCase()})}
              error={!!form.roleKey&&!roleKeyValid}
              helperText={isEdit?"标识创建后不可修改":"小写字母、数字和下划线，以字母开头，长度 2-32"}
              slotProps={{htmlInput:{style:{fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace"}}}}/>
          </Stack>
          <TextField label="角色说明" fullWidth value={form.description||""} onChange={e=>setForm({...form,description:e.target.value})}/>
          <Divider/>
          <div>
            <Stack direction="row" spacing={1} sx={{alignItems:"center"}}>
              <FormLabel sx={{fontSize:13,color:"text.secondary"}}>权限点</FormLabel>
              {isSuperAdmin&&<MuiTooltip title="管理员固定拥有全部权限，避免误操作导致无人可管理系统">
                <Chip size="small" color="error" variant="outlined" label="全部权限，不可修改"/>
              </MuiTooltip>}
            </Stack>
            <Stack spacing={1.5} sx={{mt:1.5}}>
              {catalog.map(module=>{
                const keys=module.items.map(i=>i.key);
                const checkedCount=keys.filter(k=>permissions.includes(k)).length;
                const allChecked=isSuperAdmin||checkedCount===keys.length;
                return(
                  <Paper key={module.module} variant="outlined" sx={{borderColor:"#E8E8EC",borderRadius:"6px",px:2,py:1.5}}>
                    <FormControlLabel
                      control={<Checkbox size="small" disabled={isSuperAdmin} checked={allChecked}
                        indeterminate={!allChecked&&checkedCount>0}
                        onChange={e=>toggleModule(module,e.target.checked)}/>}
                      label={<Typography variant="body2" sx={{fontWeight:600}}>{module.label}</Typography>}/>
                    <FormGroup row sx={{pl:3}}>
                      {module.items.map(item=>(
                        <FormControlLabel key={item.key} sx={{minWidth:140}}
                          control={<Checkbox size="small" disabled={isSuperAdmin}
                            checked={isSuperAdmin||permissions.includes(item.key)}
                            onChange={()=>togglePermission(item.key)}/>}
                          label={<Typography variant="body2">{item.label}</Typography>}/>
                      ))}
                    </FormGroup>
                  </Paper>
                );
              })}
            </Stack>
          </div>
          {error&&<Typography variant="caption" color="error">{error}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{px:3,py:2}}>
        {onDelete&&initial&&!initial.builtIn&&(
          inUse
            ?<MuiTooltip title={`该角色下还有 ${initial.memberCount} 名成员，请先移除后再删除`}>
              <span style={{marginRight:"auto"}}><Button color="error" disabled>删除角色</Button></span>
            </MuiTooltip>
            :<Button color="error" variant={confirmingDelete?"contained":"text"} sx={{mr:"auto"}}
              onClick={()=>{if(!confirmingDelete){setConfirmingDelete(true);return;}void onDelete();}}>
              {confirmingDelete?"确认删除":"删除角色"}
            </Button>
        )}
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" disabled={saving||!canSave} onClick={()=>void save()}>{saving?"保存中…":"保存"}</Button>
      </DialogActions>
    </Dialog>
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
  return <div><span className="block text-xs font-medium text-gray-500 mb-1.5">父级节点</span><div className="grid grid-cols-2 gap-2">{levels.map((items,index)=><TextField select key={index} fullWidth value={path[index]||""} onChange={(event)=>selectAt(index,event.target.value)}><MenuItem value="">{index===0?"无父级（根节点）":"停在上一级"}</MenuItem>{items.map((item)=><MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField>)}</div>{path.length>0&&<p className="text-xs text-indigo-700 mt-2">当前父级：{path.map((id)=>flattenCategoryTree(nodes).find((item)=>item.id===id)?.name).filter(Boolean).join(" / ")}</p>}</div>;
}

function CategoryNodeModal({nodes,initial,defaultParentId,onSave,onClose,onDelete}:{nodes:CategoryNode[];initial?:CategoryNode;defaultParentId?:string;onSave:(item:RecycleItem)=>Promise<void>;onClose:()=>void;onDelete?:(item:RecycleItem)=>Promise<void>}) {
  const allNodes=flattenCategoryTree(nodes);
  const descendantIds=new Set(initial?flattenCategoryTree(initial.children).map((item)=>item.id):[]);
  const excludedIds=new Set([initial?.id,...descendantIds].filter(Boolean) as string[]);
  // 新增时显示顺序默认取同级最大值 +1，避免多个节点都是 0 导致排序不稳定。
  const nextSortOrder=(parentId:string)=>allNodes.filter((item)=>(item.parentId||"")===parentId).reduce((max,item)=>Math.max(max,item.sortOrder??0),0)+1;
  const [form,setForm]=useState({
    name:initial?.name||"",
    parentId:initial?.parentId||defaultParentId||"",
    unit:initial?.unit||"公斤",
    // 输入框只显示价格部分，「元/单位」后缀由 endAdornment 呈现
    priceRef:splitPriceRef(initial?.priceRef),
    sortOrder:initial?.sortOrder??nextSortOrder(defaultParentId||""),
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
    // 一级分类只做分组，不承载价格 / 现场估价 / 起收门槛，保存时统一清空避免残留旧值。
    const isRoot=!form.parentId;
    try{
      await onSave({
        ...initial,
        id:initial?.id||`category-${Date.now()}`,
        categoryId:initial?.categoryId,
        parentId:form.parentId||null,
        name:form.name.trim(),
        unit:form.unit,
        // 报价为自由文本，一级分类与现场估价节点一律留空；
        // 输入框只收价格部分，落库时补上「元/单位」后缀
        priceRef:isRoot||form.fieldEstimate?"":joinPriceRef(form.priceRef,form.unit),
        sortOrder:form.sortOrder,
        fieldEstimate:isRoot?false:form.fieldEstimate,
        enabled:form.enabled,
        showOnHome:form.parentId?false:form.showOnHome,
        minVisitKg: isRoot||form.minVisitKg.trim()==="" ? undefined : Number(form.minVisitKg),
      });
      onClose();
    }finally{setSaving(false);}
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
      await onDelete(initial as RecycleItem);
      onClose();
    }finally{
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };
  const descendantCount=initial?flattenCategoryTree(initial.children).length:0;
  return <div className="fixed inset-0 z-50 flex items-center justify-center">
    <button className="absolute inset-0 bg-black/40" onClick={onClose}/>
    <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8EC]">
        <div><h2 className="font-semibold text-gray-900">{initial?"编辑品类节点":"添加品类"}</h2><p className="text-xs text-gray-400 mt-1">不选择父级即为一级类别，可选择任意节点作为父级</p></div>
        <button onClick={onClose}><X size={19} className="text-gray-400"/></button>
      </div>
      <div className="px-8 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
        <CategoryParentCascader nodes={nodes} value={form.parentId} excluded={excludedIds} onChange={(parentId)=>setForm({...form,parentId,showOnHome:parentId?false:form.showOnHome,sortOrder:initial?form.sortOrder:nextSortOrder(parentId)})}/>
        <div className="grid grid-cols-2 gap-4">
          <TextField label="品类名称" required autoFocus fullWidth value={form.name} onChange={(event)=>{setForm({...form,name:event.target.value});setError("");}} placeholder="请输入品类名称" error={!!error} helperText={error}/>
          <TextField label="显示顺序" fullWidth type="number" value={form.sortOrder} onChange={(event)=>setForm({...form,sortOrder:Number(event.target.value)||0})}/>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <TextField select label="计量单位" fullWidth value={form.unit} onChange={(event)=>setForm({...form,unit:event.target.value})}>
            {["公斤","斤","台","件","双","袋","箱"].map((unit)=><MenuItem key={unit} value={unit}>{unit}</MenuItem>)}
          </TextField>
          {form.parentId&&<>
            {/* 输入框里只填价格数字/区间，「元/单位」由后缀自动跟随计量单位，保存时再拼成完整 priceRef */}
            <TextField label="参考价格" fullWidth disabled={form.fieldEstimate} value={form.priceRef} onChange={(event)=>setForm({...form,priceRef:event.target.value})} placeholder={form.fieldEstimate?"现场估价":"如：0.5-0.8"} helperText={form.fieldEstimate?"":"可填单价或区间，留空不展示价格"} slotProps={{input:{endAdornment:<InputAdornment position="end"><span className="text-xs text-gray-500 whitespace-nowrap">元/{form.unit}</span></InputAdornment>}}}/>
            <TextField label={`最低上门门槛（${form.unit}）`} fullWidth type="number" value={form.minVisitKg} onChange={(event)=>setForm({...form,minVisitKg:event.target.value})} placeholder={`例如：10（单位：${form.unit}）`} helperText="留空不限制" slotProps={{htmlInput:{min:0,step:0.1}}}/>
          </>}
        </div>
        {form.parentId&&<div className="flex items-center justify-between px-3 py-2 bg-amber-50 rounded-xl"><div><p className="text-sm font-medium text-amber-800">现场估价</p><p className="text-xs text-amber-600">该节点不设置固定参考价格</p></div><button onClick={()=>setForm({...form,fieldEstimate:!form.fieldEstimate})}>{form.fieldEstimate?<ToggleRight size={26} className="text-amber-500"/>:<ToggleLeft size={26} className="text-gray-300"/>}</button></div>}
        {!form.parentId&&<div className="flex items-center justify-between px-3 py-2 bg-indigo-50 rounded-xl"><div><p className="text-sm font-medium text-indigo-800">首页展示</p><p className="text-xs text-indigo-600">首页最多展示排序靠前的 4 个一级类别</p></div><button onClick={()=>setForm({...form,showOnHome:!form.showOnHome})}>{form.showOnHome?<ToggleRight size={26} className="text-indigo-500"/>:<ToggleLeft size={26} className="text-gray-300"/>}</button></div>}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-xl"><div><p className="text-sm font-medium text-gray-700">启用节点</p><p className="text-xs text-gray-400">停用后该节点不在小程序展示</p></div><button onClick={()=>setForm({...form,enabled:!form.enabled})}>{form.enabled?<ToggleRight size={26} className="text-indigo-500"/>:<ToggleLeft size={26} className="text-gray-300"/>}</button></div>
      </div>
      <div className="flex items-center gap-2 px-6 py-4 border-t border-[#E8E8EC] bg-gray-50/50">
        {initial&&onDelete&&(
          <button type="button" onClick={()=>void handleDeleteClick()} disabled={deleting} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors disabled:opacity-50 mr-auto ${confirmingDelete?"bg-red-600 text-white hover:bg-red-700":"text-red-500 hover:bg-red-50"}`}>
            <Trash2 size={14}/>
            {deleting?"删除中…":confirmingDelete?(descendantCount?`确认删除（含 ${descendantCount} 个子节点）？`:"确认删除？"):"删除"}
          </button>
        )}
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">取消</button>
        <button disabled={saving} onClick={()=>void save()} className="px-5 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40">{saving?"保存中…":initial?"保存修改":"添加品类"}</button>
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
  const [adding,setAdding]=useState<{parentId?:string}>();
  useEffect(()=>setExpanded((current)=>new Set([...current,...flattenCategoryTree(nodes).map((item)=>item.id)])),[nodes]);
  const visible=filterCategoryTree(nodes,search);
  const toggle=(id:string)=>setExpanded((current)=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next;});
  // 单位/参考价/上门门槛不再单独占列，折进品类名下方的一行摘要，避免表格横向滚动。
  // 一级分类只做分组，不展示价格与起收门槛。
  const metaOf=(item:CategoryNode)=>{
    const parts:string[]=[];
    const isRoot=!item.parentId;
    if(!isRoot){
      if(item.fieldEstimate) parts.push("现场估价");
      else if(item.priceRef) parts.push(item.priceRef);
      else if(item.unit) parts.push(item.unit);
      if(typeof item.minVisitKg==="number") parts.push(`≥ ${item.minVisitKg}${item.unit||""}`);
    }
    if(item.children.length>0) parts.push(`${item.children.length} 个子节点`);
    return parts.join(" · ");
  };
  // 移动端优先：用 flex 行代替 table，缩进随层级递减，保证三列在窄屏同屏显示且不横向滚动。
  const renderRows=(items:CategoryNode[],depth=0):ReactNode=>items.map((item)=><Fragment key={item.id}><div role="button" tabIndex={0} onClick={()=>setEditing(item)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setEditing(item);}}} className={`flex items-center gap-2 px-3 py-2.5 border-b border-gray-50 hover:bg-indigo-50/40 cursor-pointer ${!item.enabled?"opacity-50":""}`}><div className="flex items-center gap-1.5 min-w-0 flex-1 max-w-[440px]" style={{paddingLeft:Math.min(depth,4)*14}}>{item.children.length>0?<button onClick={(event)=>{event.stopPropagation();toggle(item.id);}} className="w-5 h-5 shrink-0 rounded flex items-center justify-center text-gray-400 hover:bg-gray-100">{expanded.has(item.id)?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</button>:<span className="w-5 shrink-0 flex justify-center"><span className="w-1.5 h-1.5 rounded-full bg-gray-300"/></span>}<div className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center ${depth===0?"bg-indigo-100 text-indigo-700":"bg-gray-100 text-gray-500"}`}>{depth===0?<Package size={13}/>:<Tags size={12}/>}</div><div className="min-w-0 flex-1"><p className="text-sm font-medium text-gray-800 truncate">{item.name}</p><p className="text-[10px] text-gray-400 truncate">{metaOf(item)||"—"}</p></div>{depth===0&&<button title="新增子品类" onClick={(event)=>{event.stopPropagation();setAdding({parentId:item.id});}} className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-indigo-600 border border-indigo-200 bg-white hover:bg-indigo-50"><Plus size={13}/></button>}</div><span className="w-12 shrink-0 text-xs text-gray-500 text-center tabular-nums">{item.sortOrder??0}</span><button className="w-16 shrink-0 flex items-center justify-center leading-none" onClick={(event)=>{event.stopPropagation();void onSave({...item,enabled:!item.enabled});}}>{item.enabled?<span className="shrink-0 whitespace-nowrap px-2 py-1 rounded-full text-[10px] leading-none bg-indigo-100 text-indigo-700 border border-indigo-200">已启用</span>:<span className="shrink-0 whitespace-nowrap px-2 py-1 rounded-full text-[10px] leading-none bg-red-50 text-red-600 border border-red-200">已停用</span>}</button><span className="flex-1"/></div>{item.children.length>0&&expanded.has(item.id)&&renderRows(item.children,depth+1)}</Fragment>);
  return <div className="p-6 space-y-5"><div className="flex items-center justify-between"><div><h1 className="text-xl font-semibold text-gray-900">品类管理</h1><p className="text-sm text-gray-400 mt-0.5">统一父子节点模型，支持任意层级嵌套</p></div><button onClick={()=>setAdding({})} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"><Plus size={14}/>添加品类</button></div><TextField fullWidth value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="搜索品类节点…" slotProps={{input:{startAdornment:<InputAdornment position="start"><Search size={14} className="text-gray-400"/></InputAdornment>}}}/><div className="bg-white rounded-xl border border-[#E8E8EC] overflow-hidden"><div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border-b border-[#E8E8EC]"><span className="flex-1 min-w-0 max-w-[440px] text-xs font-semibold text-gray-500">品类树</span><span className="w-12 shrink-0 text-xs font-semibold text-gray-500 text-center">排序</span><span className="w-16 shrink-0 text-xs font-semibold text-gray-500 text-center">状态</span><span className="flex-1"/></div>{renderRows(visible)}{visible.length===0&&<div className="px-6 py-16 text-center text-sm text-gray-400">暂无品类节点</div>}</div>{adding&&<CategoryNodeModal key={`new-${adding.parentId||"root"}`} nodes={nodes} defaultParentId={adding.parentId} onSave={onSave} onClose={()=>setAdding(undefined)}/>} {editing&&<CategoryNodeModal key={editing.id} nodes={nodes} initial={editing} onSave={onSave} onClose={()=>setEditing(undefined)} onDelete={async(item)=>{await onDelete(item);setEditing(undefined);}}/>}</div>;
}

// ─── System Page ──────────────────────────────────────────────────────────────

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
    ?<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-emerald-100 text-emerald-700 border-emerald-200"><CheckCircle2 size={11}/>已处理</span>
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
      <button onClick={()=>void onRefresh()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs text-gray-500 border border-[#E8E8EC] hover:bg-gray-50"><RefreshCw size={12} className={loading?"animate-spin":""}/>刷新</button>
    </div>

    <div className="flex flex-col sm:flex-row gap-2">
      <TextField
        className="flex-1"
        value={search}
        onChange={(event)=>{setSearch(event.target.value);setCurrentPage(1);}}
        placeholder="搜索内容、标签、昵称或手机号…"
        slotProps={{input:{startAdornment:<InputAdornment position="start"><Search size={14} className="text-gray-400"/></InputAdornment>}}}
      />
      <div className="flex items-center gap-1 bg-white rounded-xl border border-[#E8E8EC] p-1">
        {([["all","全部"],["pending","待处理"],["handled","已处理"]] as const).map(([value,label])=>
          <button key={value} onClick={()=>{setStatusFilter(value);setCurrentPage(1);}} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${statusFilter===value?"bg-indigo-50 text-indigo-700":"text-gray-500 hover:bg-gray-50"}`}>{label}</button>)}
      </div>
    </div>

    {/* Mobile Card List */}
    <div className="md:hidden space-y-3">
      {paged.length===0?<div className="bg-white rounded-xl p-8 text-center text-sm text-gray-400 border border-[#E8E8EC]">暂无反馈</div>:paged.map((item)=>
        <div key={item._id} className="bg-white rounded-xl p-4 border border-[#E8E8EC]">
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
    <div className="hidden md:block bg-white rounded-xl border border-[#E8E8EC] overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-[#E8E8EC]">
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
      <div className="px-5 py-3 border-t border-[#E8E8EC] flex items-center justify-between">
        <span className="text-xs text-gray-400">显示 {paged.length} / {filtered.length} 条</span>
        <div className="flex items-center gap-1">
          <button disabled={safePage<=1} onClick={()=>setCurrentPage((page)=>Math.max(1,page-1))} className="w-7 h-7 rounded-md text-xs flex items-center justify-center border border-[#E8E8EC] text-gray-500 disabled:opacity-30">‹</button>
          <span className="px-2 text-xs text-gray-500">{safePage}/{totalPages}</span>
          <button disabled={safePage>=totalPages} onClick={()=>setCurrentPage((page)=>Math.min(totalPages,page+1))} className="w-7 h-7 rounded-md text-xs flex items-center justify-center border border-[#E8E8EC] text-gray-500 disabled:opacity-30">›</button>
        </div>
      </div>
    </div>
  </div>;
}

// 单条配置行：只读展示，整行点击进入编辑弹窗。
const SYS_TYPE_LABEL:Record<SystemSetting["type"],string>={text:"文本",number:"数字",boolean:"布尔",image:"图片",longtext:"长文本"};

function SystemSettingRow({item,onEdit}:{item:SystemSetting;onEdit:()=>void}){
  const value=()=>{
    if(item.type==="boolean")
      return <Chip size="small" color={item.value==="true"?"primary":"default"} variant={item.value==="true"?"filled":"outlined"} label={item.value==="true"?"开启":"关闭"}/>;
    if(item.type==="image")
      return item.imageUrl
        ?<img src={cloudUrlToHttps(item.imageUrl)} alt={item.label} className="w-24 h-14 object-cover rounded-md border border-[#E8E8EC]"/>
        :<div className="w-24 h-14 rounded-md border-2 border-dashed border-[#E8E8EC] bg-gray-50 flex items-center justify-center text-gray-300"><ImageIcon size={18}/></div>;
    if(item.type==="longtext"){
      const chars=item.value.trim().length;
      return <Typography variant="body2" color={chars?"text.primary":"text.disabled"}>{chars?`已配置 ${chars} 字`:"未配置"}</Typography>;
    }
    return <Typography variant="body2" color={item.value?"text.primary":"text.disabled"} sx={{wordBreak:"break-all"}}>{item.value||"未配置"}</Typography>;
  };

  return <TableRow hover onClick={onEdit} sx={{cursor:"pointer"}}>
    <TableCell sx={{verticalAlign:"top"}}>
      <Typography variant="body2" sx={{fontWeight:500}}>{item.label||item.key}</Typography>
    </TableCell>
    <TableCell sx={{verticalAlign:"top"}}>
      <Typography variant="body2" color={item.description?"text.secondary":"text.disabled"}>{item.description||"—"}</Typography>
    </TableCell>
    <TableCell sx={{verticalAlign:"top"}}>
      <Typography variant="caption" sx={{fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",color:"text.secondary"}}>{item.key}</Typography>
    </TableCell>
    <TableCell sx={{verticalAlign:"top"}}>
      <Chip size="small" variant="outlined" label={SYS_TYPE_LABEL[item.type]}/>
    </TableCell>
    <TableCell sx={{verticalAlign:"top"}}>{value()}</TableCell>
  </TableRow>;
}

function SystemPage({items,onSave,onDelete}:{items:SystemSetting[];onSave:(item:SystemSetting)=>Promise<void>;onDelete:(item:SystemSetting)=>Promise<void>}){
  const [search,setSearch]=useState("");
  const [editing,setEditing]=useState<SystemSetting|null|undefined>(undefined);
  const filtered=items.filter((item)=>[item.key,item.label,item.value,item.description].some((value)=>String(value||"").toLowerCase().includes(search.toLowerCase())));

  return <div className="p-6 space-y-4">
    <Stack direction="row" spacing={2} sx={{alignItems:"flex-start",justifyContent:"space-between"}}>
      <div>
        <Typography variant="h6" sx={{fontWeight:600}}>系统配置</Typography>
        <Typography variant="body2" color="text.secondary">点击任意一行即可编辑该配置项</Typography>
      </div>
      <Button variant="contained" startIcon={<Plus size={14}/>} onClick={()=>setEditing(null)}>新增配置</Button>
    </Stack>
    <Stack direction="row" spacing={1.5} sx={{alignItems:"center"}}>
      <TextField
        className="w-1/3 min-w-[240px]"
        value={search}
        onChange={(event)=>setSearch(event.target.value)}
        placeholder="搜索 Key、名称或说明…"
        slotProps={{input:{startAdornment:<InputAdornment position="start"><Search size={14} className="text-gray-400"/></InputAdornment>}}}
      />
      <Typography variant="caption" color="text.secondary">共 {filtered.length} 项</Typography>
    </Stack>
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{fontWeight:600,width:"20%"}}>配置项</TableCell>
            <TableCell sx={{fontWeight:600,width:"26%"}}>说明</TableCell>
            <TableCell sx={{fontWeight:600,width:"18%"}}>Key</TableCell>
            <TableCell sx={{fontWeight:600,width:80}}>类型</TableCell>
            <TableCell sx={{fontWeight:600}}>值</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filtered.map((item)=><SystemSettingRow key={item.key} item={item} onEdit={()=>setEditing(item)}/>)}
          {filtered.length===0&&<TableRow>
            <TableCell colSpan={5} align="center" sx={{py:8,color:"text.secondary"}}>暂无匹配的配置项</TableCell>
          </TableRow>}
        </TableBody>
      </Table>
    </TableContainer>
    {editing!==undefined&&<SystemSettingEditor key={(editing&&editing._id)||"new"} initial={editing} onClose={()=>setEditing(undefined)} onSave={async(item)=>{await onSave(item);setEditing(undefined);}} onDelete={async(item)=>{await onDelete(item);setEditing(undefined);}}/>}
  </div>;
}

function SystemSettingEditor({initial,onClose,onSave,onDelete}:{initial:SystemSetting|null;onClose:()=>void;onSave:(item:SystemSetting)=>Promise<void>;onDelete?:(item:SystemSetting)=>Promise<void>}){
  const [form,setForm]=useState<SystemSetting>(initial?{...initial}:{key:"",value:"",type:"text",label:"",description:"",linkUrl:""});
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [uploadError,setUploadError]=useState("");
  const [confirmingDelete,setConfirmingDelete]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const fileInputRef=useRef<HTMLInputElement>(null);
  const keyLocked=Boolean(initial);
  const validKey=/^[a-z][a-z0-9_]{1,63}$/.test(form.key);
  const isBanner=/^home_banner(?:_\d+)?$/.test(form.key);
  // 跳转路径自由填写，只做格式兜底：以 / 开头的小程序内页路径，可带 query
  const linkValid=!form.linkUrl||/^\/[A-Za-z0-9_\-/]+(\?[^\s]*)?$/.test(form.linkUrl);
  const submit=async()=>{
    if(!validKey||uploading||!linkValid||(form.type==="image"&&!form.value))return;
    setSaving(true);
    try{
      await onSave({...form,key:form.key.trim(),label:form.label.trim(),description:form.description?.trim(),linkUrl:form.linkUrl?.trim()||""});
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
  return <Dialog open fullWidth maxWidth="sm" onClose={onClose} slotProps={{paper:{sx:{borderRadius:3}}}}>
    <DialogTitle sx={{pb:1.5}}>
      <Stack direction="row" spacing={2} sx={{alignItems:"flex-start",justifyContent:"space-between"}}>
        <div>
          <Typography variant="subtitle1" sx={{fontWeight:600}}>{initial?"编辑配置":"新增配置"}</Typography>
          <Typography variant="caption" color="text.secondary">图片类型会自动上传至云存储并保存 FileID</Typography>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
      </Stack>
    </DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2.5} sx={{pt:1}}>
        <TextField
          label="Key" required fullWidth disabled={keyLocked}
          value={form.key} onChange={(event)=>setForm({...form,key:event.target.value})}
          placeholder="例如 home_banner_2"
          error={!validKey&&!!form.key}
          helperText={!validKey&&form.key?"只能使用小写字母、数字和下划线，并以字母开头":undefined}
        />
        <Stack direction="row" spacing={2}>
          <TextField label="名称" fullWidth value={form.label} onChange={(event)=>setForm({...form,label:event.target.value})}/>
          <TextField select label="类型" fullWidth value={form.type} onChange={(event)=>setForm({...form,type:event.target.value as SystemSetting["type"]})}>
            <MenuItem value="text">文本</MenuItem>
            <MenuItem value="number">数字</MenuItem>
            <MenuItem value="boolean">布尔</MenuItem>
            <MenuItem value="image">图片上传</MenuItem>
            <MenuItem value="longtext">长文本</MenuItem>
          </TextField>
        </Stack>
        {form.type==="image"?<div>
          <Typography variant="caption" color="text.secondary">图片文件 *</Typography>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event)=>void uploadImage(event.target.files?.[0])}/>
          <button type="button" onClick={()=>fileInputRef.current?.click()} disabled={uploading} className="mt-1 w-full min-h-40 rounded-xl border-2 border-dashed border-[#E8E8EC] bg-gray-50 hover:border-indigo-300 overflow-hidden disabled:opacity-60">
            {form.imageUrl?<div className="relative"><img src={form.imageUrl} alt="配置图片预览" className="w-full h-40 object-cover"/><span className="absolute right-2 bottom-2 px-2 py-1 rounded bg-black/60 text-white text-xs">{uploading?"上传中…":"点击更换"}</span></div>:<div className="h-40 flex flex-col items-center justify-center gap-2 text-gray-400"><Upload size={24}/><span className="text-sm">{uploading?"正在上传…":"点击选择图片"}</span><span className="text-xs">JPG / PNG / WebP，最大 10MB</span></div>}
          </button>
          {isBanner&&<Typography variant="caption" color="text.secondary" sx={{display:"block",mt:1}}>首页 Banner 建议使用 5:3 横图；轮播最多 5 张，Key 依次为 home_banner、home_banner_2 ~ home_banner_5，留空的槽位小程序端自动跳过。</Typography>}
          {uploadError&&<Typography variant="caption" color="error" sx={{display:"block",mt:1}}>{uploadError}</Typography>}
        </div>:(form.type==="boolean"
          ?<TextField select label="Value" fullWidth value={form.value} onChange={(event)=>setForm({...form,value:event.target.value})}>
            <MenuItem value="true">true</MenuItem>
            <MenuItem value="false">false</MenuItem>
          </TextField>
          :<TextField label="Value" fullWidth multiline rows={form.type==="longtext"?14:4} value={form.value} onChange={(event)=>setForm({...form,value:event.target.value})} placeholder={form.type==="longtext"?"请输入完整条款内容，支持换行…":"配置值"}/>
        )}
        {isBanner&&<TextField
          label="跳转路径" fullWidth
          value={form.linkUrl||""} onChange={(event)=>setForm({...form,linkUrl:event.target.value})}
          placeholder="例如 /pages/staff-recruit/index"
          error={!linkValid}
          helperText={linkValid
            ?"点击该 Banner 后跳转的小程序页面路径，可带 query（如 /pages/order-create/index?source=demolition）；留空则该图仅作展示，点击无跳转"
            :"路径需以 / 开头，例如 /pages/category/index"}
        />}
        <TextField label="说明" fullWidth multiline rows={2} value={form.description||""} onChange={(event)=>setForm({...form,description:event.target.value})}/>
      </Stack>
    </DialogContent>
    <DialogActions sx={{px:3,py:2}}>
      {initial&&onDelete&&
        <Button color="error" variant={confirmingDelete?"contained":"text"} startIcon={<Trash2 size={14}/>} disabled={deleting} onClick={()=>void handleDeleteClick()} sx={{mr:"auto"}}>
          {deleting?"删除中…":confirmingDelete?"确认删除？":(initial._id?.startsWith("virtual:")?"移除默认":"删除")}
        </Button>}
      <Button variant="outlined" onClick={onClose}>取消</Button>
      <Button variant="contained" disabled={saving||uploading||!validKey||!linkValid||(form.type==="image"&&!form.value)} onClick={()=>void submit()}>{uploading?"上传中…":saving?"保存中…":"保存"}</Button>
    </DialogActions>
  </Dialog>;
}

const STATUS_COLORS: Record<string,string> = {
  "待上门":"#f59e0b","进行中":"#3b82f6","已完成":"#22c55e","已取消":"#9ca3af",
};
const CAT_PALETTE = ["#0076de","#66b0f2","#3b82f6","#8b5cf6","#f59e0b","#ef4444","#14b8a6","#ec4899"];

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
    {label:"总订单",value:String(total),sub:`取消 ${cancelledCount} 单`,icon:Package,color:"#0076de",bg:"#e6f2fd"},
    {label:"完成率",value:`${completionRate}%`,sub:`完成 ${completedOrders.length} 单`,icon:CheckCircle2,color:"#10b981",bg:"#ecfdf5"},
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
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${range===r.value?"bg-white shadow-sm text-gray-800":"text-gray-500 hover:text-gray-700"}`}
              >{r.label}</button>
            ))}
          </div>
          <button onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white hover:opacity-90 transition-all"
            style={{background:"var(--genesis-primary)"}}
          ><Download size={14}/>导出报表</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-3 md:gap-4">
        {kpis.map(({label,value,sub,icon:Icon,color,bg})=>(
          <div key={label} className="bg-white rounded-xl p-5 border border-[#E8E8EC] flex items-start justify-between">
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
        <div className="col-span-1 md:col-span-3 bg-white rounded-xl p-3 md:p-5 border border-[#E8E8EC]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">订单趋势</p>
              <p className="text-xs text-gray-400 mt-0.5">按创建日期统计</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 inline-block rounded-full bg-indigo-600"/><span>订单量</span></span>
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
                <Bar yAxisId="left" dataKey="订单量" fill="#cce5fb" radius={[4,4,0,0]}/>
                <Line yAxisId="left" type="monotone" dataKey="订单量" stroke="#0076de" strokeWidth={2.5} dot={{fill:"#0076de",r:4,strokeWidth:0}} activeDot={{r:5}}/>
                <Line yAxisId="right" type="monotone" dataKey="回收金额" stroke="#f59e0b" strokeWidth={2} dot={{fill:"#f59e0b",r:3,strokeWidth:0}} strokeDasharray="5 3" activeDot={{r:5}}/>
              </ComposedChart>
            </ResponsiveContainer>
          }
        </div>

        {/* Status Pie */}
        <div className="col-span-1 md:col-span-2 bg-white rounded-xl p-3 md:p-5 border border-[#E8E8EC]">
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
        <div className="bg-white rounded-xl p-3 md:p-5 border border-[#E8E8EC]">
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
        <div className="bg-white rounded-xl p-3 md:p-5 border border-[#E8E8EC]">
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
                <Bar dataKey="接单量" fill="#cce5fb" stroke="#0076de" strokeWidth={0} radius={[4,4,0,0]} barSize={14}/>
                <Bar dataKey="完成量" fill="#0076de" radius={[4,4,0,0]} barSize={14}/>
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
            ?<div className="bg-white rounded-xl p-8 text-center text-sm text-gray-400 border border-[#E8E8EC]">当前筛选范围内无已结算订单</div>
            :completedOrders.filter(o=>o.amount).sort((a,b)=>(b.amount||0)-(a.amount||0)).map(o=>(
              <div key={o.id} className="bg-white rounded-xl p-4 border border-[#E8E8EC]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-gray-500">{o.id.slice(0,12)}…</span>
                  <span className="text-sm font-bold text-indigo-700">¥{(o.amount||0).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600 mb-1.5">
                  <span>{o.userName}</span>
                  <span className="text-gray-300">·</span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 font-medium">{o.category}</span>
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
      <div className="hidden md:block bg-white rounded-xl border border-[#E8E8EC] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E8EC]">
          <div>
            <p className="text-sm font-semibold text-gray-800">已完成订单明细</p>
            <p className="text-xs text-gray-400 mt-0.5">有回收金额的已结算订单</p>
          </div>
          <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full font-medium">{completedOrders.filter(o=>o.amount).length} 笔</span>
        </div>
        <table className="w-full">
          <thead><tr className="border-b border-[#E8E8EC] bg-gray-50/60">
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
                  <td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 font-medium">{o.category}</span></td>
                  <td className="px-5 py-3"><div className="flex flex-wrap gap-1">{o.recyclers.map(r=><span key={r} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{r}</span>)}</div></td>
                  <td className="px-5 py-3"><span className="text-xs text-gray-500">{o.completedAt||"—"}</span></td>
                  <td className="px-5 py-3"><span className="text-sm font-bold text-indigo-700">¥{(o.amount||0).toFixed(2)}</span></td>
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
function AdminOrderDetailPage({id,token,staff,onSaveOrder,onAssignRecycler,onDeleteOrder,onBack,onError,notify}:{id:string;token:string;staff:Staff[];onSaveOrder:(order:Order)=>Promise<void>;onAssignRecycler:(order:Order,person:Staff)=>Promise<void>;onDeleteOrder:(docId:string)=>Promise<void>;onBack:()=>void;onError:(error:unknown)=>void;notify:(message:{kind:"success"|"error";text:string})=>void}){
  const [editing,setEditing]=useState(false);
  const [showDeleteConfirm,setShowDeleteConfirm]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [order,setOrder]=useState<CloudOrder|null>(null);
  const [loading,setLoading]=useState(true);
  const [finalPriceText,setFinalPriceText]=useState("");
  const [finalWeightText,setFinalWeightText]=useState("");
  const [finalCountText,setFinalCountText]=useState("");
  const [assigning,setAssigning]=useState(false);
  const [adminRemarkText,setAdminRemarkText]=useState("");
  const [savingResult,setSavingResult]=useState(false);
  const [showAssignModal,setShowAssignModal]=useState(false);
  const [regranting,setRegranting]=useState(false);
  const [previewInfo,setPreviewInfo]=useState<{images:string[];idx:number}|null>(null);
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
    setFinalWeightText(order.finalWeight==null?"":String(order.finalWeight));
    setFinalCountText(order.finalCount==null?"":String(order.finalCount));
    setAdminRemarkText(order.adminRemark||"");
  },[order]);
  // status 传入时同时流转状态（「保存并完成」用）；不传则仅保存处理结果
  const saveResult=async(status?:OrderStatus)=>{
    if(!order)return;
    setSavingResult(true);
    try{
      await onSaveOrder({...cloudOrderToFigma(order),amount:finalPriceText===""?undefined:Number(finalPriceText),finalWeight:finalWeightText===""?undefined:Number(finalWeightText),finalCount:finalCountText===""?undefined:Number(finalCountText),adminRemark:adminRemarkText,...(status?{status}:{})});
      if(status){
        // 状态流转需刷新（状态徽章/完成时间来自服务端）
        await reload();
      }else{
        // 保存成功后直接回写本地状态，避免 reload 让页面重新进入 loading
        setOrder({...order,finalPrice:finalPriceText===""?null:Number(finalPriceText),finalWeight:finalWeightText===""?null:Number(finalWeightText),finalCount:finalCountText===""?null:Number(finalCountText),adminRemark:adminRemarkText,updateTime:Date.now()});
      }
    }catch{/* saveOrder 内部已统一提示错误 */}
    finally{setSavingResult(false);}
  };
  const saveAndComplete=async()=>{
    if(!order)return;
    if(finalPriceText===""&&!window.confirm("最终金额未填写，确认标记完成？"))return;
    await saveResult("已完成");
  };
  // 积分同步失败或漏发时的人工补发。幂等键仍由后端按订单发放轮次生成，重复点击不会多发
  const regrantPoints=async()=>{
    if(!order)return;
    setRegranting(true);
    try{
      const data=await callCloud<{points:number}>("adminRegrantOrderPoints",{sessionToken:token,orderId:order._id});
      notify({kind:"success",text:`已补发 ${Number(data?.points||0).toLocaleString("zh-CN")} 积分`});
      await reload();
    }catch(error){onError(error);}
    finally{setRegranting(false);}
  };
  if(loading)return <div className="min-h-[520px] flex items-center justify-center gap-3 text-gray-400"><Loader size={22} className="animate-spin text-indigo-600"/><span className="text-sm">正在读取订单详情…</span></div>;
  if(!order)return <div className="p-6"><button onClick={onBack} className="text-sm text-indigo-700">← 返回订单列表</button><div className="mt-8 bg-white rounded-xl p-12 text-center text-gray-400">订单不存在或加载失败</div></div>;
  const address=order.addressSnapshot||{};
  const status=CLOUD_TO_FIGMA_STATUS[order.status]||"待上门";
  const isTerminal=status==="已完成"||status==="已取消";
  const hasRecycler=Boolean(order.recyclerName||order.recyclerId);
  // 订单里的 recyclerName/recyclerPhone 是派单时的快照，优先按 recyclerId 取人员表当前值
  const recyclerStaff=order.recyclerId?staff.find((item)=>item.docId===order.recyclerId):undefined;
  const recyclerName=recyclerStaff?.name||order.recyclerName||"";
  const recyclerPhone=recyclerStaff?.phone||order.recyclerPhone||"";
  const businessOrderType=resolveBusinessOrderType(order);
  const detailItems=order.source==="demolition"
    ? (order.demolition?.items||[]).map((name)=>({categoryName:name,demolition:true,estWeightRange:undefined,estWeight:undefined,estCount:undefined}))
    : (order.items||[]).map((item)=>({...item,demolition:false}));
  // 云存储下载域带 Content-Disposition: attachment，新开标签页会直接下载；预览一律走站内 ImagePreviewModal
  const photoHttpsList=cloudUrlsToHttps(order.photoUrls||[]);
  return <div className="p-4 md:p-6 space-y-3 md:space-y-4 max-w-6xl mx-auto">
    <div className="flex items-center justify-between gap-3">
      <button onClick={onBack} className="text-sm text-indigo-700 hover:text-indigo-900">← 返回订单列表</button>
      <button onClick={()=>setShowDeleteConfirm(true)} disabled={deleting} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 disabled:opacity-50 flex-shrink-0"><Trash2 size={13}/>{deleting?"删除中…":"删除订单"}</button>
    </div>
    {/* 左栏：订单基本信息 + 回收员 / 右栏：处理结果（含积分）。下方跨栏放物品明细 */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 items-start">
      <section className="bg-white rounded-xl border border-[#E8E8EC] p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <OrderTypeBadge type={businessOrderType}/>
              <StatusBadge status={status}/>
            </div>
            <p className="text-sm text-gray-700 font-mono mt-2 break-all">{order.orderNo}</p>
            <p className="text-[11px] text-gray-400 mt-1">下单 {formatCloudTime(order.createTime)} · 修改 {formatCloudTime(order.updateTime)}</p>
          </div>
          <button onClick={()=>setEditing(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 flex-shrink-0"><Edit2 size={12}/>编辑</button>
        </div>
        <div className="pt-3 border-t border-gray-50">
          {hasRecycler?(
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0" style={{background:"var(--genesis-primary)"}}>{recyclerName[0]||"R"}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{recyclerName}</p>
                <p className="text-xs text-gray-500 mt-0.5">{recyclerPhone}</p>
              </div>
              {!isTerminal&&<button onClick={()=>setShowAssignModal(true)} disabled={assigning} className="px-3 py-1.5 rounded-md text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 flex-shrink-0">改派</button>}
            </div>
          ):(
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-400">暂未分配工作人员</span>
              {!isTerminal&&<button onClick={()=>setShowAssignModal(true)} disabled={assigning} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 flex-shrink-0" style={{background:"var(--genesis-primary)"}}><UserPlus size={13}/>{assigning?"分配中…":"分配人员"}</button>}
            </div>
          )}
        </div>
        <div className="pt-3 border-t border-gray-50">
          <DetailField label="联系人" value={address.contactName}/>
          <DetailField label="联系电话" value={address.phone}/>
          <DetailField label="预约时间" value={[order.appointDate,order.appointSlot].filter(Boolean).join(" ")}/>
          <DetailField label="上门地址" value={[address.region,address.detail].filter(Boolean).join(" ")}/>
          <DetailField label="用户备注" value={order.remark}/>
        </div>
        {/* 物品明细：结构化清单 + 物品照片，紧跟用户备注 */}
        <div className="pt-3 border-t border-gray-50 space-y-2">
          <h3 className="text-sm font-semibold text-gray-800">物品明细</h3>
          {detailItems.length>0?(
            <div className="grid grid-cols-2 gap-x-5">
              {detailItems.map((item,index)=>(
                <div key={`${item.categoryName}-${index}`} className="py-1.5 flex justify-between gap-3 text-sm border-b border-gray-50">
                  <span className="font-medium text-gray-700 truncate">{item.categoryName||"未命名项目"}</span>
                  <span className="text-gray-500 flex-shrink-0">
                    {item.demolition?"拆除评估":item.estWeightRange?(WEIGHT_RANGE_LABELS[item.estWeightRange]||"待现场确认"):item.estWeight?`约 ${item.estWeight} 斤`:item.estCount?`约 ${item.estCount} 件`:"待现场确认"}
                  </span>
                </div>
              ))}
            </div>
          ):(
            <p className="text-sm text-gray-400">暂无结构化物品明细</p>
          )}
          <div className="pt-1">
            <p className="text-[11px] text-gray-500 mb-2">物品照片{photoHttpsList.length?`（${photoHttpsList.length}）`:""}</p>
            {photoHttpsList.length>0
              ?<div className="flex flex-wrap gap-2">{photoHttpsList.map((url,index)=><button key={url} type="button" title="点击预览大图" onClick={()=>setPreviewInfo({images:photoHttpsList,idx:index})} className="w-20 h-20 rounded-md overflow-hidden border border-[#E8E8EC] hover:opacity-80 transition-opacity"><img src={url} alt={`物品照片 ${index+1}`} className="w-full h-full object-cover"/></button>)}</div>
              :<p className="text-sm text-gray-400">暂无物品照片</p>}
          </div>
        </div>
      </section>
      <section className="bg-white rounded-xl border border-[#E8E8EC] p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">处理结果</h2>
          {isTerminal
            ?<button onClick={()=>saveResult()} disabled={savingResult} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50"><Save size={12}/>{savingResult?"保存中…":"保存"}</button>
            :<button onClick={()=>void saveAndComplete()} disabled={savingResult} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white hover:opacity-90 disabled:opacity-50" style={{background:"var(--genesis-primary)"}}><CheckCircle2 size={12}/>{savingResult?"提交中…":"保存并完成"}</button>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="最终金额（元）" fullWidth type="number" value={finalPriceText} onChange={e=>setFinalPriceText(e.target.value)} slotProps={{htmlInput:{step:"0.01",inputMode:"decimal"}}}/>
          <TextField label="最终重量（斤）" fullWidth type="number" value={finalWeightText} onChange={e=>setFinalWeightText(e.target.value)} slotProps={{htmlInput:{step:"0.1",inputMode:"decimal"}}}/>
        </div>
        <TextField label="备注说明" fullWidth multiline minRows={2} value={adminRemarkText} onChange={e=>setAdminRemarkText(e.target.value)}/>
        {order.cancelReason&&<DetailField label="取消原因" value={order.cancelReason}/>}
        {/* 积分是处理结果的产物，跟着金额一起看 */}
        <div className="pt-3 border-t border-[#E8E8EC] space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <Coins size={14} className="text-indigo-600 self-center flex-shrink-0"/>
              <span className="text-lg font-semibold text-gray-900">{Number(order.pointsGranted||0).toLocaleString("zh-CN")}</span>
              <span className="text-xs text-gray-400">积分</span>
              {order.pointsGrantAt?<span className="text-[11px] text-gray-400 ml-1 truncate">发放于 {formatCloudTime(order.pointsGrantAt)}</span>:null}
            </div>
            {status==="已完成"&&<button onClick={()=>void regrantPoints()} disabled={regranting} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 flex-shrink-0"><RotateCcw size={11}/>{regranting?"补发中…":"补发积分"}</button>}
          </div>
          {order.pointsGrantError
            ?<div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-100 px-2.5 py-1.5">
              <AlertCircle size={13} className="text-red-500 mt-0.5 flex-shrink-0"/>
              <p className="text-[11px] text-red-600 break-all">积分同步失败（{order.pointsGrantError}），请点击「补发积分」重试</p>
            </div>
            :<p className="text-[11px] text-gray-400">订单完成后按最终金额自动发放，撤回完成状态时会自动冲正扣回</p>}
        </div>
      </section>
    </div>
    {showDeleteConfirm&&<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={()=>!deleting&&setShowDeleteConfirm(false)}>
      <div className="bg-white rounded-xl w-full max-w-sm p-5 space-y-4" onClick={(event)=>event.stopPropagation()}>
        <h3 className="font-semibold text-gray-800">确认删除该订单？</h3>
        <p className="text-sm text-gray-500 break-all">订单号 {order.orderNo}</p>
        <div className="flex justify-end gap-2">
          <button onClick={()=>setShowDeleteConfirm(false)} disabled={deleting} className="px-3.5 py-2 rounded-md text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50">取消</button>
          <button onClick={()=>{setDeleting(true);void onDeleteOrder(id).catch(()=>{setDeleting(false);setShowDeleteConfirm(false);});}} disabled={deleting} className="px-3.5 py-2 rounded-md text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">{deleting?"删除中…":"确认删除"}</button>
        </div>
      </div>
    </div>}
    {previewInfo&&<ImagePreviewModal images={previewInfo.images} initialIndex={previewInfo.idx} onClose={()=>setPreviewInfo(null)}/>}
    {editing&&<OrderEditModal order={cloudOrderToFigma(order)} onSave={async(o)=>{try{await onSaveOrder(o);setEditing(false);await reload();}catch{setEditing(false);}}} onClose={()=>setEditing(false)}/>}
    {showAssignModal&&order&&<AssignRecyclerModal order={cloudOrderToFigma(order)} staff={staff} onAssign={async(person)=>{await onAssignRecycler(cloudOrderToFigma(order),person);await reload();setShowAssignModal(false);}} onClose={()=>setShowAssignModal(false)}/>}
  </div>;
}

// ─── Points Page ──────────────────────────────────────────────────────────────
const POINTS_TYPE_LABEL:Record<PointsRecordType,string>={
  earn_order:"订单获得",
  adjust_order:"订单调整",
  revoke_order:"订单冲正",
  admin_adjust:"手动调整",
  exchange:"兑换消耗",
  refund:"兑换退回",
  expire:"过期扣减",
  invite_bind:"拉新奖励",
  invite_order:"拉新首单",
  invite_revoke:"拉新冲正",
};

const formatPoints=(value?:number|null)=>{
  const number=Number(value)||0;
  return `${number>0?"+":""}${number.toLocaleString("zh-CN")}`;
};

function PointsTypeBadge({type}:{type:PointsRecordType}){
  const earn=["earn_order","adjust_order","admin_adjust","refund","invite_bind","invite_order"].includes(type);
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs border whitespace-nowrap ${earn?"bg-indigo-50 text-indigo-700 border-indigo-200":"bg-orange-50 text-orange-700 border-orange-200"}`}>{POINTS_TYPE_LABEL[type]||type}</span>;
}

// 积分管理：流水 / 商品 / 兑换单三个 Tab
type PointsTab="records"|"goods"|"exchanges";
const POINTS_TABS:Array<{key:PointsTab;label:string}>=[
  {key:"records",  label:"积分流水"},
  {key:"goods",    label:"兑换商品"},
  {key:"exchanges",label:"兑换单"},
];

function PointsPage({token,onError,onViewOrder,notify}:{token:string;onError:(error:unknown)=>void;onViewOrder:(id:string)=>void;notify:(message:{kind:"success"|"error";text:string})=>void}){
  const [tab,setTab]=useState<PointsTab>("records");
  return <div className="p-4 md:p-6 space-y-4 md:space-y-5">
    <div>
      <h1 className="text-lg md:text-xl font-semibold text-gray-900">积分管理</h1>
      <p className="text-xs md:text-sm text-gray-400 mt-0.5">积分流水由订单完成后自动发放；兑换商品与兑换单构成积分商城</p>
    </div>
    <div className="flex gap-1 border-b border-[#E8E8EC]">
      {POINTS_TABS.map((item)=>
        <button key={item.key} onClick={()=>setTab(item.key)}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${tab===item.key?"border-indigo-600 text-indigo-700":"border-transparent text-gray-500 hover:text-gray-700"}`}>
          {item.label}
        </button>)}
    </div>
    {tab==="records"  &&<PointsRecordsTab token={token} onError={onError} onViewOrder={onViewOrder}/>}
    {tab==="goods"    &&<PointsGoodsTab token={token} onError={onError} notify={notify}/>}
    {tab==="exchanges"&&<PointsExchangesTab token={token} onError={onError} notify={notify}/>}
  </div>;
}

function PointsRecordsTab({token,onError,onViewOrder}:{token:string;onError:(error:unknown)=>void;onViewOrder:(id:string)=>void}){
  const PAGE_SIZE=20;
  const [phoneInput,setPhoneInput]=useState("");
  const [phone,setPhone]=useState("");
  const [typeFilter,setTypeFilter]=useState<"all"|PointsRecordType>("all");
  const [currentPage,setCurrentPage]=useState(1);
  const [result,setResult]=useState<PointsRecordListResult|null>(null);
  const [loading,setLoading]=useState(true);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const data=await callCloud<PointsRecordListResult>("adminListPointsRecords",{
        sessionToken:token,
        page:currentPage,
        pageSize:PAGE_SIZE,
        ...(phone?{phone}:{}),
        ...(typeFilter==="all"?{}:{type:typeFilter}),
      });
      setResult(data||{list:[],total:0,hasMore:false});
    }catch(error){onError(error);}
    finally{setLoading(false);}
  },[token,currentPage,phone,typeFilter,onError]);
  useEffect(()=>{void load();},[load]);

  const list=result?.list||[];
  const total=result?.total||0;
  const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  const nameOf=(item:PointsRecord)=>item.user?.nickName||"微信用户";

  return <div className="space-y-4 md:space-y-5">
    <div className="flex items-center justify-between flex-wrap gap-2">
      <p className="text-xs md:text-sm text-gray-400">共 {total} 条流水。手动加减请进入「人员管理 - 用户详情」</p>
      <button onClick={()=>void load()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs text-gray-500 border border-[#E8E8EC] hover:bg-gray-50"><RefreshCw size={12} className={loading?"animate-spin":""}/>刷新</button>
    </div>

    <div className="flex flex-col sm:flex-row gap-2">
      <form className="flex-1" onSubmit={(event)=>{event.preventDefault();setPhone(phoneInput.trim());setCurrentPage(1);}}>
        <TextField
          fullWidth
          value={phoneInput}
          onChange={(event)=>setPhoneInput(event.target.value)}
          placeholder="按用户手机号精确查询，回车确认…"
          slotProps={{input:{startAdornment:<InputAdornment position="start"><Search size={14} className="text-gray-400"/></InputAdornment>}}}
        />
      </form>
      <TextField select value={typeFilter} onChange={(event)=>{setTypeFilter(event.target.value as "all"|PointsRecordType);setCurrentPage(1);}} sx={{minWidth:150}}>
        <MenuItem value="all">全部类型</MenuItem>
        {(Object.keys(POINTS_TYPE_LABEL) as PointsRecordType[]).map((value)=>
          <MenuItem key={value} value={value}>{POINTS_TYPE_LABEL[value]}</MenuItem>)}
      </TextField>
    </div>

    {/* Mobile Card List */}
    <div className="md:hidden space-y-3">
      {loading?<div className="bg-white rounded-xl p-8 text-center text-sm text-gray-400 border border-[#E8E8EC]">加载中…</div>
      :list.length===0?<div className="bg-white rounded-xl p-8 text-center text-sm text-gray-400 border border-[#E8E8EC]">暂无积分流水</div>
      :list.map((item)=>
        <div key={item._id} className="bg-white rounded-xl p-4 border border-[#E8E8EC] space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{nameOf(item)}</p>
              <p className="text-xs text-gray-400 font-mono">{item.user?.phone||"未绑定手机"}</p>
            </div>
            <span className={`text-base font-semibold ${item.points>=0?"text-indigo-600":"text-orange-600"}`}>{formatPoints(item.points)}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PointsTypeBadge type={item.type}/>
            <span className="text-xs text-gray-400">余额 {Number(item.balanceAfter||0).toLocaleString("zh-CN")}</span>
          </div>
          <p className="text-xs text-gray-500 break-words">{item.title||"—"}{item.remark?` · ${item.remark}`:""}</p>
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="font-mono truncate">{item.orderNo||""}</span>
            <span>{formatCloudTime(item.createTime)}</span>
          </div>
          {item.orderId&&<button onClick={()=>onViewOrder(item.orderId as string)} className="text-xs text-indigo-700">查看订单 →</button>}
        </div>
      )}
    </div>

    {/* Desktop Table */}
    <div className="hidden md:block bg-white rounded-xl border border-[#E8E8EC] overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-[#E8E8EC]">
            {["用户","类型","变动","变动后余额","说明","关联订单","操作人","时间"].map((title)=>
              <th key={title} className="text-left px-4 py-3 text-xs font-medium text-gray-500 tracking-wide whitespace-nowrap">{title}</th>)}
          </tr>
        </thead>
        <tbody>
          {list.map((item)=>
            <tr key={item._id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 align-top">
              <td className="px-4 py-3">
                <p className="text-sm text-gray-700">{nameOf(item)}</p>
                <p className="text-xs text-gray-400 font-mono">{item.user?.phone||"—"}</p>
              </td>
              <td className="px-4 py-3"><PointsTypeBadge type={item.type}/></td>
              <td className={`px-4 py-3 text-sm font-semibold whitespace-nowrap ${item.points>=0?"text-indigo-600":"text-orange-600"}`}>{formatPoints(item.points)}</td>
              <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{Number(item.balanceAfter||0).toLocaleString("zh-CN")}</td>
              <td className="px-4 py-3 text-sm text-gray-600 max-w-[220px] break-words">{item.title||"—"}{item.remark?<span className="block text-xs text-gray-400 mt-0.5">{item.remark}</span>:null}</td>
              <td className="px-4 py-3 text-xs font-mono text-gray-500">
                {item.orderId
                  ?<button onClick={()=>onViewOrder(item.orderId as string)} className="text-indigo-700 hover:underline">{item.orderNo||item.orderId}</button>
                  :"—"}
              </td>
              <td className="px-4 py-3 text-xs text-gray-500 break-all">{item.operator||"—"}</td>
              <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatCloudTime(item.createTime)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {!loading&&list.length===0&&<div className="py-12 text-center text-sm text-gray-400">暂无积分流水</div>}
      {loading&&<div className="py-12 flex items-center justify-center gap-2 text-sm text-gray-400"><Loader size={16} className="animate-spin text-indigo-600"/>加载中…</div>}
    </div>

    <div className="flex items-center justify-between text-xs text-gray-400">
      <span>第 {currentPage} / {totalPages} 页，共 {total} 条</span>
      <div className="flex gap-2">
        <button onClick={()=>setCurrentPage((value)=>Math.max(1,value-1))} disabled={currentPage<=1||loading} className="px-3 py-1.5 rounded-md border border-[#E8E8EC] bg-white disabled:opacity-40">上一页</button>
        <button onClick={()=>setCurrentPage((value)=>value+1)} disabled={!result?.hasMore||loading} className="px-3 py-1.5 rounded-md border border-[#E8E8EC] bg-white disabled:opacity-40">下一页</button>
      </div>
    </div>
  </div>;
}

// ─── Points Goods Tab ─────────────────────────────────────────────────────────
const GOODS_CATEGORY_LABEL: Record<PointsGoodsCategory,string> = {
  grain:"米面油", egg:"蛋奶", daily:"日用品",
};
const FULFILL_LABEL: Record<PointsFulfillType,string> = {
  pickup:"门店自提", express:"邮寄到家",
};

// 商品表单初值。id 为空表示新增
const emptyGoodsForm=():PointsGoods=>({
  _id:"", name:"", cover:"", images:[], desc:"", category:"grain",
  costPoints:1000, stock:0, limitPerUser:0, fulfillType:"pickup",
  pickupStore:"", status:"off", sort:0,
});

function PointsGoodsTab({token,onError,notify}:{token:string;onError:(error:unknown)=>void;notify:(message:{kind:"success"|"error";text:string})=>void}){
  const PAGE_SIZE=20;
  const [statusFilter,setStatusFilter]=useState<"all"|"on"|"off">("all");
  const [categoryFilter,setCategoryFilter]=useState<"all"|PointsGoodsCategory>("all");
  const [currentPage,setCurrentPage]=useState(1);
  const [result,setResult]=useState<PointsGoodsListResult|null>(null);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState<PointsGoods|null>(null);
  const [saving,setSaving]=useState(false);
  const [formError,setFormError]=useState("");
  const [uploading,setUploading]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const data=await callCloud<PointsGoodsListResult>("adminListPointsGoods",{
        sessionToken:token,
        page:currentPage,
        pageSize:PAGE_SIZE,
        ...(statusFilter==="all"?{}:{status:statusFilter}),
        ...(categoryFilter==="all"?{}:{category:categoryFilter}),
      });
      setResult(data||{list:[],total:0,hasMore:false});
    }catch(error){onError(error);}
    finally{setLoading(false);}
  },[token,currentPage,statusFilter,categoryFilter,onError]);
  useEffect(()=>{void load();},[load]);

  const list=result?.list||[];
  const total=result?.total||0;
  const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));

  const pickCover=async(file:File)=>{
    setUploading(true);
    try{
      const fileId=await uploadSystemImage("points-goods",file);
      setForm((prev)=>prev?{...prev,cover:fileId}:prev);
    }catch(error){onError(error);}
    finally{setUploading(false);}
  };

  const submit=async()=>{
    if(!form)return;
    if(!form.name.trim()){setFormError("请填写商品名称");return;}
    if(!(form.costPoints>0)){setFormError("兑换积分必须大于 0");return;}
    if(form.fulfillType==="pickup"&&!form.pickupStore?.trim()){setFormError("自提商品需填写自提门店");return;}
    setFormError("");
    setSaving(true);
    try{
      await callCloud("adminSavePointsGoods",{
        sessionToken:token,
        ...(form._id?{id:form._id}:{}),
        name:form.name.trim(),
        cover:form.cover||"",
        desc:form.desc||"",
        category:form.category,
        costPoints:form.costPoints,
        stock:form.stock,
        limitPerUser:form.limitPerUser,
        fulfillType:form.fulfillType,
        pickupStore:form.pickupStore||"",
        status:form.status,
        sort:form.sort,
      });
      notify({kind:"success",text:form._id?"商品已更新":"商品已创建"});
      setForm(null);
      await load();
    }catch(error){onError(error);}
    finally{setSaving(false);}
  };

  const toggle=async(item:PointsGoods)=>{
    try{
      await callCloud("adminTogglePointsGoods",{sessionToken:token,id:item._id});
      notify({kind:"success",text:item.status==="on"?"商品已下架":"商品已上架"});
      await load();
    }catch(error){onError(error);}
  };

  return <div className="space-y-4 md:space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <TextField select value={statusFilter} onChange={(event)=>{setStatusFilter(event.target.value as "all"|"on"|"off");setCurrentPage(1);}} sx={{minWidth:130}}>
        <MenuItem value="all">全部状态</MenuItem>
        <MenuItem value="on">已上架</MenuItem>
        <MenuItem value="off">已下架</MenuItem>
      </TextField>
      <TextField select value={categoryFilter} onChange={(event)=>{setCategoryFilter(event.target.value as "all"|PointsGoodsCategory);setCurrentPage(1);}} sx={{minWidth:130}}>
        <MenuItem value="all">全部分类</MenuItem>
        {(Object.keys(GOODS_CATEGORY_LABEL) as PointsGoodsCategory[]).map((value)=>
          <MenuItem key={value} value={value}>{GOODS_CATEGORY_LABEL[value]}</MenuItem>)}
      </TextField>
      <div className="flex-1"/>
      <button onClick={()=>{setFormError("");setForm(emptyGoodsForm());}} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium text-white hover:opacity-90" style={{background:"var(--genesis-primary)"}}><Plus size={12}/>新增商品</button>
      <button onClick={()=>void load()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs text-gray-500 border border-[#E8E8EC] hover:bg-gray-50"><RefreshCw size={12} className={loading?"animate-spin":""}/>刷新</button>
    </div>

    {/* Mobile Card List */}
    <div className="md:hidden space-y-3">
      {loading?<div className="bg-white rounded-xl p-8 text-center text-sm text-gray-400 border border-[#E8E8EC]">加载中…</div>
      :list.length===0?<div className="bg-white rounded-xl p-8 text-center text-sm text-gray-400 border border-[#E8E8EC]">暂无兑换商品</div>
      :list.map((item)=>
        <div key={item._id} className="bg-white rounded-xl p-4 border border-[#E8E8EC] space-y-2">
          <div className="flex items-start gap-3">
            {item.cover
              ?<img src={cloudUrlToHttps(item.cover)} className="w-14 h-14 rounded-md object-cover flex-shrink-0"/>
              :<div className="w-14 h-14 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0"><ImageIcon size={18} className="text-gray-400"/></div>}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-800 break-words">{item.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{GOODS_CATEGORY_LABEL[item.category]} · {FULFILL_LABEL[item.fulfillType]}</p>
            </div>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs flex-shrink-0 ${item.status==="on"?"bg-emerald-50 text-emerald-700":"bg-gray-100 text-gray-500"}`}>{item.status==="on"?"已上架":"已下架"}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="text-indigo-600 font-semibold">{item.costPoints.toLocaleString("zh-CN")} 积分</span>
            <span>库存 {item.stock}</span>
            <span>已兑 {item.exchangedCount||0}</span>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={()=>{setFormError("");setForm({...item,images:item.images||[]});}} className="flex-1 px-3 py-1.5 rounded-md text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100">编辑</button>
            <button onClick={()=>void toggle(item)} className="flex-1 px-3 py-1.5 rounded-md text-xs text-gray-600 bg-gray-100 hover:bg-gray-200">{item.status==="on"?"下架":"上架"}</button>
          </div>
        </div>
      )}
    </div>

    {/* Desktop Table */}
    <div className="hidden md:block bg-white rounded-xl border border-[#E8E8EC] overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-[#E8E8EC]">
            {["商品","分类","兑换积分","库存","已兑换","限兑","履约方式","排序","状态","操作"].map((title)=>
              <th key={title} className="text-left px-4 py-3 text-xs font-medium text-gray-500 tracking-wide whitespace-nowrap">{title}</th>)}
          </tr>
        </thead>
        <tbody>
          {list.map((item)=>
            <tr key={item._id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  {item.cover
                    ?<img src={cloudUrlToHttps(item.cover)} className="w-9 h-9 rounded-md object-cover flex-shrink-0"/>
                    :<div className="w-9 h-9 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0"><ImageIcon size={14} className="text-gray-400"/></div>}
                  <span className="text-sm text-gray-700 max-w-[180px] break-words">{item.name}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{GOODS_CATEGORY_LABEL[item.category]}</td>
              <td className="px-4 py-3 text-sm font-semibold text-indigo-600 whitespace-nowrap">{item.costPoints.toLocaleString("zh-CN")}</td>
              <td className={`px-4 py-3 text-sm whitespace-nowrap ${item.stock<=0?"text-red-600":"text-gray-600"}`}>{item.stock}</td>
              <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{item.exchangedCount||0}</td>
              <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{item.limitPerUser>0?item.limitPerUser:"不限"}</td>
              <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                {FULFILL_LABEL[item.fulfillType]}
                {item.fulfillType==="pickup"&&item.pickupStore?<span className="block text-xs text-gray-400 mt-0.5">{item.pickupStore}</span>:null}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{item.sort}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${item.status==="on"?"bg-emerald-50 text-emerald-700":"bg-gray-100 text-gray-500"}`}>{item.status==="on"?"已上架":"已下架"}</span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="flex gap-1.5">
                  <button onClick={()=>{setFormError("");setForm({...item,images:item.images||[]});}} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100"><Edit2 size={11}/>编辑</button>
                  <button onClick={()=>void toggle(item)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-gray-600 bg-gray-100 hover:bg-gray-200">
                    {item.status==="on"?<><ToggleLeft size={11}/>下架</>:<><ToggleRight size={11}/>上架</>}
                  </button>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {!loading&&list.length===0&&<div className="py-12 text-center text-sm text-gray-400">暂无兑换商品</div>}
      {loading&&<div className="py-12 flex items-center justify-center gap-2 text-sm text-gray-400"><Loader size={16} className="animate-spin text-indigo-600"/>加载中…</div>}
    </div>

    <div className="flex items-center justify-between text-xs text-gray-400">
      <span>第 {currentPage} / {totalPages} 页，共 {total} 件商品</span>
      <div className="flex gap-2">
        <button onClick={()=>setCurrentPage((value)=>Math.max(1,value-1))} disabled={currentPage<=1||loading} className="px-3 py-1.5 rounded-md border border-[#E8E8EC] bg-white disabled:opacity-40">上一页</button>
        <button onClick={()=>setCurrentPage((value)=>value+1)} disabled={!result?.hasMore||loading} className="px-3 py-1.5 rounded-md border border-[#E8E8EC] bg-white disabled:opacity-40">下一页</button>
      </div>
    </div>

    {/* 商品编辑弹窗 */}
    {form&&<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto" onClick={()=>!saving&&setForm(null)}>
      <div className="bg-white rounded-xl w-full max-w-lg p-5 space-y-4 my-8" onClick={(event)=>event.stopPropagation()}>
        <h3 className="font-semibold text-gray-800">{form._id?"编辑商品":"新增商品"}</h3>
        <TextField label="商品名称" required fullWidth value={form.name} onChange={(event)=>setForm({...form,name:event.target.value})} slotProps={{htmlInput:{maxLength:40}}}/>
        <div className="flex items-center gap-3">
          {form.cover
            ?<img src={cloudUrlToHttps(form.cover)} className="w-16 h-16 rounded-md object-cover"/>
            :<div className="w-16 h-16 rounded-md bg-gray-100 flex items-center justify-center"><ImageIcon size={20} className="text-gray-400"/></div>}
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 cursor-pointer">
            <Upload size={12}/>{uploading?"上传中…":"上传封面"}
            <input type="file" accept="image/*" hidden onChange={(event)=>{const file=event.target.files?.[0];if(file)void pickCover(file);event.target.value="";}}/>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField select label="分类" value={form.category} onChange={(event)=>setForm({...form,category:event.target.value as PointsGoodsCategory})}>
            {(Object.keys(GOODS_CATEGORY_LABEL) as PointsGoodsCategory[]).map((value)=>
              <MenuItem key={value} value={value}>{GOODS_CATEGORY_LABEL[value]}</MenuItem>)}
          </TextField>
          <TextField select label="履约方式" value={form.fulfillType} onChange={(event)=>setForm({...form,fulfillType:event.target.value as PointsFulfillType})}>
            {(Object.keys(FULFILL_LABEL) as PointsFulfillType[]).map((value)=>
              <MenuItem key={value} value={value}>{FULFILL_LABEL[value]}</MenuItem>)}
          </TextField>
          <TextField label="兑换积分" required type="number" value={form.costPoints} onChange={(event)=>setForm({...form,costPoints:Math.max(0,Math.trunc(Number(event.target.value)||0))})} slotProps={{htmlInput:{min:1,step:"1"}}}/>
          <TextField label="库存" type="number" value={form.stock} onChange={(event)=>setForm({...form,stock:Math.max(0,Math.trunc(Number(event.target.value)||0))})} slotProps={{htmlInput:{min:0,step:"1"}}}/>
          <TextField label="每人限兑（0 为不限）" type="number" value={form.limitPerUser} onChange={(event)=>setForm({...form,limitPerUser:Math.max(0,Math.trunc(Number(event.target.value)||0))})} slotProps={{htmlInput:{min:0,step:"1"}}}/>
          <TextField label="排序（越大越前）" type="number" value={form.sort} onChange={(event)=>setForm({...form,sort:Math.trunc(Number(event.target.value)||0)})} slotProps={{htmlInput:{step:"1"}}}/>
        </div>
        {form.fulfillType==="pickup"&&<TextField label="自提门店" required fullWidth value={form.pickupStore||""} onChange={(event)=>setForm({...form,pickupStore:event.target.value})} placeholder="例如：来卖吧回收站（XX路 123 号）" slotProps={{htmlInput:{maxLength:80}}}/>}
        <TextField label="商品说明" fullWidth multiline rows={3} value={form.desc||""} onChange={(event)=>setForm({...form,desc:event.target.value})} slotProps={{htmlInput:{maxLength:500}}}/>
        <FormControlLabel control={<Checkbox checked={form.status==="on"} onChange={(event)=>setForm({...form,status:event.target.checked?"on":"off"})}/>} label="立即上架"/>
        {formError&&<p className="text-xs text-red-500">{formError}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={()=>setForm(null)} disabled={saving} className="px-3.5 py-2 rounded-md text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50">取消</button>
          <button onClick={()=>void submit()} disabled={saving||uploading} className="px-3.5 py-2 rounded-md text-xs font-medium text-white hover:opacity-90 disabled:opacity-50" style={{background:"var(--genesis-primary)"}}>{saving?"保存中…":"保存"}</button>
        </div>
      </div>
    </div>}
  </div>;
}

// ─── Points Exchanges Tab ─────────────────────────────────────────────────────
const EXCHANGE_STATUS_META: Record<PointsExchangeStatus,{label:string;className:string}> = {
  pending: {label:"待领取", className:"bg-amber-50 text-amber-700"},
  done:    {label:"已完成", className:"bg-emerald-50 text-emerald-700"},
  canceled:{label:"已取消", className:"bg-gray-100 text-gray-500"},
};

function PointsExchangesTab({token,onError,notify}:{token:string;onError:(error:unknown)=>void;notify:(message:{kind:"success"|"error";text:string})=>void}){
  const PAGE_SIZE=20;
  const [statusFilter,setStatusFilter]=useState<"all"|PointsExchangeStatus>("all");
  const [fulfillFilter,setFulfillFilter]=useState<"all"|PointsFulfillType>("all");
  const [currentPage,setCurrentPage]=useState(1);
  const [result,setResult]=useState<PointsExchangeListResult|null>(null);
  const [loading,setLoading]=useState(true);
  // 核销：输入 6 位码直接完成自提单
  const [verifyCode,setVerifyCode]=useState("");
  const [verifying,setVerifying]=useState(false);
  // 发货：邮寄单填快递单号
  const [shipTarget,setShipTarget]=useState<PointsExchange|null>(null);
  const [expressNo,setExpressNo]=useState("");
  const [shipping,setShipping]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const data=await callCloud<PointsExchangeListResult>("adminListExchanges",{
        sessionToken:token,
        page:currentPage,
        pageSize:PAGE_SIZE,
        ...(statusFilter==="all"?{}:{status:statusFilter}),
        ...(fulfillFilter==="all"?{}:{fulfillType:fulfillFilter}),
      });
      setResult(data||{list:[],total:0,hasMore:false});
    }catch(error){onError(error);}
    finally{setLoading(false);}
  },[token,currentPage,statusFilter,fulfillFilter,onError]);
  useEffect(()=>{void load();},[load]);

  const list=result?.list||[];
  const total=result?.total||0;
  const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));

  const verify=async()=>{
    const code=verifyCode.trim();
    if(code.length!==6){notify({kind:"error",text:"请输入 6 位核销码"});return;}
    setVerifying(true);
    try{
      const data=await callCloud<{goodsName?:string}>("adminVerifyExchange",{sessionToken:token,pickupCode:code});
      notify({kind:"success",text:`核销成功：${data?.goodsName||"商品"}`});
      setVerifyCode("");
      await load();
    }catch(error){onError(error);}
    finally{setVerifying(false);}
  };

  const ship=async()=>{
    if(!shipTarget)return;
    if(!expressNo.trim()){notify({kind:"error",text:"请填写快递单号"});return;}
    setShipping(true);
    try{
      await callCloud("adminShipExchange",{sessionToken:token,exchangeId:shipTarget._id,expressNo:expressNo.trim()});
      notify({kind:"success",text:"已标记发货"});
      setShipTarget(null);
      setExpressNo("");
      await load();
    }catch(error){onError(error);}
    finally{setShipping(false);}
  };

  return <div className="space-y-4 md:space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <form className="flex items-center gap-2" onSubmit={(event)=>{event.preventDefault();void verify();}}>
        <TextField
          value={verifyCode}
          onChange={(event)=>setVerifyCode(event.target.value.replace(/\D/g,"").slice(0,6))}
          placeholder="输入 6 位核销码"
          sx={{width:180}}
          slotProps={{input:{startAdornment:<InputAdornment position="start"><CheckCircle2 size={14} className="text-gray-400"/></InputAdornment>}}}
        />
        <button type="submit" disabled={verifying||verifyCode.length!==6} className="px-3.5 py-2 rounded-md text-xs font-medium text-white hover:opacity-90 disabled:opacity-40 whitespace-nowrap" style={{background:"var(--genesis-primary)"}}>{verifying?"核销中…":"核销"}</button>
      </form>
      <div className="flex-1"/>
      <TextField select value={statusFilter} onChange={(event)=>{setStatusFilter(event.target.value as "all"|PointsExchangeStatus);setCurrentPage(1);}} sx={{minWidth:130}}>
        <MenuItem value="all">全部状态</MenuItem>
        {(Object.keys(EXCHANGE_STATUS_META) as PointsExchangeStatus[]).map((value)=>
          <MenuItem key={value} value={value}>{EXCHANGE_STATUS_META[value].label}</MenuItem>)}
      </TextField>
      <TextField select value={fulfillFilter} onChange={(event)=>{setFulfillFilter(event.target.value as "all"|PointsFulfillType);setCurrentPage(1);}} sx={{minWidth:130}}>
        <MenuItem value="all">全部方式</MenuItem>
        {(Object.keys(FULFILL_LABEL) as PointsFulfillType[]).map((value)=>
          <MenuItem key={value} value={value}>{FULFILL_LABEL[value]}</MenuItem>)}
      </TextField>
      <button onClick={()=>void load()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs text-gray-500 border border-[#E8E8EC] hover:bg-gray-50"><RefreshCw size={12} className={loading?"animate-spin":""}/>刷新</button>
    </div>

    {/* Mobile Card List */}
    <div className="md:hidden space-y-3">
      {loading?<div className="bg-white rounded-xl p-8 text-center text-sm text-gray-400 border border-[#E8E8EC]">加载中…</div>
      :list.length===0?<div className="bg-white rounded-xl p-8 text-center text-sm text-gray-400 border border-[#E8E8EC]">暂无兑换单</div>
      :list.map((item)=>
        <div key={item._id} className="bg-white rounded-xl p-4 border border-[#E8E8EC] space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono text-gray-500 truncate">{item.exchangeNo}</span>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs flex-shrink-0 ${EXCHANGE_STATUS_META[item.status].className}`}>{EXCHANGE_STATUS_META[item.status].label}</span>
          </div>
          <p className="text-sm font-medium text-gray-800 break-words">{item.goodsSnapshot?.name||"—"}</p>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="text-indigo-600 font-semibold">{item.costPoints.toLocaleString("zh-CN")} 积分</span>
            <span>{FULFILL_LABEL[item.fulfillType]}</span>
          </div>
          <p className="text-xs text-gray-500">{item.user?.nickName||"微信用户"} · {item.user?.phone||"未绑定手机"}</p>
          {item.pickupCode&&<p className="text-xs text-gray-500">核销码 <span className="font-mono font-semibold text-gray-700">{item.pickupCode}</span></p>}
          {item.addressSnapshot&&<p className="text-xs text-gray-500 break-words">{[item.addressSnapshot.contactName,item.addressSnapshot.phone,item.addressSnapshot.region,item.addressSnapshot.detail].filter(Boolean).join(" ")}</p>}
          {item.expressNo&&<p className="text-xs text-gray-500">快递单号 <span className="font-mono">{item.expressNo}</span></p>}
          <p className="text-xs text-gray-400">{formatCloudTime(item.createTime)}</p>
          {item.status==="pending"&&item.fulfillType==="express"&&
            <button onClick={()=>{setShipTarget(item);setExpressNo("");}} className="w-full px-3 py-1.5 rounded-md text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100">填写快递单号发货</button>}
        </div>
      )}
    </div>

    {/* Desktop Table */}
    <div className="hidden md:block bg-white rounded-xl border border-[#E8E8EC] overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-[#E8E8EC]">
            {["兑换单号","用户","商品","积分","方式","核销码/收货信息","状态","兑换时间","操作"].map((title)=>
              <th key={title} className="text-left px-4 py-3 text-xs font-medium text-gray-500 tracking-wide whitespace-nowrap">{title}</th>)}
          </tr>
        </thead>
        <tbody>
          {list.map((item)=>
            <tr key={item._id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 align-top">
              <td className="px-4 py-3 text-xs font-mono text-gray-500 whitespace-nowrap">{item.exchangeNo}</td>
              <td className="px-4 py-3">
                <p className="text-sm text-gray-700">{item.user?.nickName||"微信用户"}</p>
                <p className="text-xs text-gray-400 font-mono">{item.user?.phone||"—"}</p>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600 max-w-[180px] break-words">{item.goodsSnapshot?.name||"—"}</td>
              <td className="px-4 py-3 text-sm font-semibold text-indigo-600 whitespace-nowrap">{item.costPoints.toLocaleString("zh-CN")}</td>
              <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{FULFILL_LABEL[item.fulfillType]}</td>
              <td className="px-4 py-3 text-xs text-gray-500 max-w-[220px] break-words">
                {item.fulfillType==="pickup"
                  ?<>
                    {item.pickupCode?<span className="font-mono font-semibold text-gray-700">{item.pickupCode}</span>:"—"}
                    {item.goodsSnapshot?.pickupStore?<span className="block text-gray-400 mt-0.5">{item.goodsSnapshot.pickupStore}</span>:null}
                    {item.verifiedBy?<span className="block text-gray-400 mt-0.5">核销人 {item.verifiedBy}</span>:null}
                  </>
                  :<>
                    {item.addressSnapshot
                      ?<span>{[item.addressSnapshot.contactName,item.addressSnapshot.phone].filter(Boolean).join(" ")}<span className="block text-gray-400 mt-0.5">{[item.addressSnapshot.region,item.addressSnapshot.detail].filter(Boolean).join(" ")}</span></span>
                      :"—"}
                    {item.expressNo?<span className="block font-mono text-gray-600 mt-0.5">{item.expressNo}</span>:null}
                  </>}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${EXCHANGE_STATUS_META[item.status].className}`}>{EXCHANGE_STATUS_META[item.status].label}</span>
              </td>
              <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatCloudTime(item.createTime)}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                {item.status==="pending"&&item.fulfillType==="express"
                  ?<button onClick={()=>{setShipTarget(item);setExpressNo("");}} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100">发货</button>
                  :<span className="text-xs text-gray-400">—</span>}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {!loading&&list.length===0&&<div className="py-12 text-center text-sm text-gray-400">暂无兑换单</div>}
      {loading&&<div className="py-12 flex items-center justify-center gap-2 text-sm text-gray-400"><Loader size={16} className="animate-spin text-indigo-600"/>加载中…</div>}
    </div>

    <div className="flex items-center justify-between text-xs text-gray-400">
      <span>第 {currentPage} / {totalPages} 页，共 {total} 单</span>
      <div className="flex gap-2">
        <button onClick={()=>setCurrentPage((value)=>Math.max(1,value-1))} disabled={currentPage<=1||loading} className="px-3 py-1.5 rounded-md border border-[#E8E8EC] bg-white disabled:opacity-40">上一页</button>
        <button onClick={()=>setCurrentPage((value)=>value+1)} disabled={!result?.hasMore||loading} className="px-3 py-1.5 rounded-md border border-[#E8E8EC] bg-white disabled:opacity-40">下一页</button>
      </div>
    </div>

    {/* 发货弹窗 */}
    {shipTarget&&<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={()=>!shipping&&setShipTarget(null)}>
      <div className="bg-white rounded-xl w-full max-w-sm p-5 space-y-4" onClick={(event)=>event.stopPropagation()}>
        <h3 className="font-semibold text-gray-800">填写快递单号</h3>
        <div className="bg-gray-50 rounded-md p-3 space-y-1 text-xs text-gray-500">
          <p className="text-sm text-gray-700">{shipTarget.goodsSnapshot?.name||"—"}</p>
          <p className="font-mono">{shipTarget.exchangeNo}</p>
          {shipTarget.addressSnapshot&&<p className="break-words">{[shipTarget.addressSnapshot.contactName,shipTarget.addressSnapshot.phone,shipTarget.addressSnapshot.region,shipTarget.addressSnapshot.detail].filter(Boolean).join(" ")}</p>}
        </div>
        <TextField label="快递单号" required fullWidth value={expressNo} onChange={(event)=>setExpressNo(event.target.value)} slotProps={{htmlInput:{maxLength:40}}}/>
        <div className="flex justify-end gap-2">
          <button onClick={()=>setShipTarget(null)} disabled={shipping} className="px-3.5 py-2 rounded-md text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50">取消</button>
          <button onClick={()=>void ship()} disabled={shipping} className="px-3.5 py-2 rounded-md text-xs font-medium text-white hover:opacity-90 disabled:opacity-50" style={{background:"var(--genesis-primary)"}}>{shipping?"提交中…":"确认发货"}</button>
        </div>
      </div>
    </div>}
  </div>;
}

// ─── User Detail Page ─────────────────────────────────────────────────────────
function UserDetailPage({userId,token,onBack,onViewOrder,onError,notify}:{userId:string;token:string;onBack:()=>void;onViewOrder:(id:string)=>void;onError:(error:unknown)=>void;notify:(message:{kind:"success"|"error";text:string})=>void}){
  const [data,setData]=useState<{user:UserRecord&{openid?:string};addresses:Array<{_id:string;contactName?:string;phone?:string;region?:string;detail?:string;isDefault?:boolean;createTime?:number}>;orders:Array<{_id:string;orderNo?:string;status:string;estimatePrice?:number;finalPrice?:number;appointDate?:string;appointSlot?:string;summary?:string;createTime?:number}>}|null>(null);
  const [loading,setLoading]=useState(true);
  const [points,setPoints]=useState<UserPointsDetail|null>(null);
  const [showAdjust,setShowAdjust]=useState(false);
  const [adjustText,setAdjustText]=useState("");
  const [adjustRemark,setAdjustRemark]=useState("");
  const [adjusting,setAdjusting]=useState(false);
  const [adjustError,setAdjustError]=useState("");
  const loadPoints=useCallback(async()=>{
    try{
      const result=await callCloud<UserPointsDetail>("adminGetUserPoints",{sessionToken:token,userId});
      setPoints(result||null);
    }catch{
      // 积分读取失败不影响用户详情主体展示
      setPoints(null);
    }
  },[userId,token]);
  const reload=useCallback(async()=>{
    setLoading(true);
    try{
      const result=await callCloud<typeof data>("adminUserDetail",{sessionToken:token,userId});
      setData(result||null);
    }catch(error){onError(error);}
    finally{setLoading(false);}
  },[userId,token,onError]);
  useEffect(()=>{void reload();},[reload]);
  useEffect(()=>{void loadPoints();},[loadPoints]);
  const submitAdjust=async()=>{
    const value=Math.trunc(Number(adjustText));
    if(!Number.isFinite(value)||value===0){setAdjustError("请输入非零整数，负数为扣减");return;}
    if(!adjustRemark.trim()){setAdjustError("请填写调整原因");return;}
    setAdjustError("");
    setAdjusting(true);
    try{
      await callCloud("adminAdjustUserPoints",{sessionToken:token,userId,points:value,remark:adjustRemark.trim()});
      notify({kind:"success",text:"积分调整成功"});
      setShowAdjust(false);
      setAdjustText("");
      setAdjustRemark("");
      await loadPoints();
    }catch(error){onError(error);}
    finally{setAdjusting(false);}
  };
  if(loading)return <div className="min-h-[520px] flex items-center justify-center gap-3 text-gray-400"><Loader size={22} className="animate-spin text-indigo-600"/><span className="text-sm">正在读取用户详情…</span></div>;
  if(!data||!data.user)return <div className="p-6"><button onClick={onBack} className="text-sm text-indigo-700">← 返回人员管理</button><div className="mt-8 bg-white rounded-xl p-12 text-center text-gray-400">用户不存在或加载失败</div></div>;
  const {user,addresses,orders}=data;
  return <div className="p-4 md:p-6 space-y-4 md:space-y-5 max-w-6xl mx-auto">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <button onClick={onBack} className="text-sm text-indigo-700 hover:text-indigo-900 mb-2">← 返回人员管理</button>
        <div className="flex items-center gap-3 flex-wrap">
          {user.avatarUrl?<img src={cloudUrlToHttps(user.avatarUrl)} className="w-10 h-10 rounded-full"/>:<div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center"><User size={18}/></div>}
          <div><h1 className="text-lg md:text-xl font-semibold text-gray-900">{user.nickName||"微信用户"}</h1>
          <p className="text-xs text-gray-400 font-mono">{user.phone||"未绑定手机"}</p></div>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${user.wechatBound?"bg-emerald-50 text-emerald-700":"bg-gray-100 text-gray-500"}`}>{user.wechatBound?"已绑定":"未绑定"}</span>
        </div>
      </div>
      <div className="text-right text-xs text-gray-400"><p>注册时间</p><p className="font-mono mt-1">{formatCloudTime(user.createTime)}</p></div>
    </div>
    <section className="bg-white rounded-xl border border-[#E8E8EC] p-4 md:p-5 space-y-3 md:space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Coins size={16} className="text-indigo-600"/>积分账户</h2>
        <button onClick={()=>{setAdjustError("");setShowAdjust(true);}} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 flex-shrink-0"><Edit2 size={12}/>手动调整</button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-50 rounded-md p-3">
          <p className="text-xs text-gray-400">当前余额</p>
          <p className={`text-lg font-semibold mt-1 ${(points?.points||0)<0?"text-red-600":"text-gray-900"}`}>{(points?.points||0).toLocaleString("zh-CN")}</p>
        </div>
        <div className="bg-gray-50 rounded-md p-3">
          <p className="text-xs text-gray-400">累计获得</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">{(points?.pointsTotal||0).toLocaleString("zh-CN")}</p>
        </div>
        <div className="bg-gray-50 rounded-md p-3">
          <p className="text-xs text-gray-400">累计消耗</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">{(points?.pointsUsed||0).toLocaleString("zh-CN")}</p>
        </div>
      </div>
      {(points?.records||[]).length===0?<p className="text-sm text-gray-400">暂无积分流水</p>:
      <div className="divide-y divide-gray-50">{(points?.records||[]).map((record)=>(
        <div key={record._id} className="py-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap"><PointsTypeBadge type={record.type}/><span className="text-sm text-gray-700 truncate">{record.title||"—"}</span></div>
            {record.remark&&<p className="text-xs text-gray-400 mt-0.5 break-words">{record.remark}</p>}
            <p className="text-xs text-gray-400 mt-0.5">{formatCloudTime(record.createTime)}{record.orderNo?` · ${record.orderNo}`:""}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className={`text-sm font-semibold ${record.points>=0?"text-indigo-600":"text-orange-600"}`}>{formatPoints(record.points)}</p>
            <p className="text-xs text-gray-400 mt-0.5">余 {Number(record.balanceAfter||0).toLocaleString("zh-CN")}</p>
          </div>
        </div>
      ))}</div>}
    </section>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
      <section className="bg-white rounded-xl border border-[#E8E8EC] p-4 md:p-5 space-y-3 md:space-y-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2"><MapPin size={16} className="text-indigo-600"/>收货地址（{addresses.length}）</h2>
        {addresses.length===0?<p className="text-sm text-gray-400">暂无地址</p>:
        <div className="space-y-3">{addresses.map(a=>(
          <div key={a._id} className="bg-gray-50 rounded-md p-3 space-y-1">
            <div className="flex items-center gap-2"><span className="text-sm font-medium text-gray-700">{a.contactName||"未填写"}</span><span className="text-xs font-mono text-gray-500">{a.phone||""}</span>{a.isDefault&&<span className="inline-flex rounded-full px-1.5 py-0.5 text-xs bg-indigo-50 text-indigo-700">默认</span>}</div>
            <p className="text-xs text-gray-500">{[a.region,a.detail].filter(Boolean).join(" ")||"无详细地址"}</p>
            <p className="text-xs text-gray-400">{formatCloudTime(a.createTime)}</p>
          </div>
        ))}</div>}
      </section>
      <section className="bg-white rounded-xl border border-[#E8E8EC] p-4 md:p-5 space-y-3 md:space-y-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Package size={16} className="text-indigo-600"/>订单记录（{orders.length}）</h2>
        {orders.length===0?<p className="text-sm text-gray-400">暂无订单</p>:
        <div className="space-y-2">{orders.map(o=>{
          const fStatus=CLOUD_TO_FIGMA_STATUS[o.status as CloudOrderStatus]||"待上门";
          return <div key={o._id} onClick={()=>onViewOrder(o._id)} className="bg-gray-50 rounded-md p-3 cursor-pointer hover:bg-gray-100 transition-colors">
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
    {showAdjust&&<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={()=>!adjusting&&setShowAdjust(false)}>
      <div className="bg-white rounded-xl w-full max-w-sm p-5 space-y-4" onClick={(event)=>event.stopPropagation()}>
        <h3 className="font-semibold text-gray-800">手动调整积分</h3>
        <p className="text-xs text-gray-400">当前余额 {(points?.points||0).toLocaleString("zh-CN")}，正数为增加、负数为扣减</p>
        <TextField label="调整值" fullWidth type="number" value={adjustText} onChange={(event)=>setAdjustText(event.target.value)} placeholder="例如 1000 或 -500" slotProps={{htmlInput:{step:"1",inputMode:"numeric"}}}/>
        <TextField label="调整原因" required fullWidth multiline rows={3} value={adjustRemark} onChange={(event)=>setAdjustRemark(event.target.value)} slotProps={{htmlInput:{maxLength:200}}}/>
        {adjustError&&<p className="text-xs text-red-500">{adjustError}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={()=>setShowAdjust(false)} disabled={adjusting} className="px-3.5 py-2 rounded-md text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50">取消</button>
          <button onClick={()=>void submitAdjust()} disabled={adjusting} className="px-3.5 py-2 rounded-md text-xs font-medium text-white hover:opacity-90 disabled:opacity-50" style={{background:"var(--genesis-primary)"}}>{adjusting?"提交中…":"确认调整"}</button>
        </div>
      </div>
    </div>}
  </div>;
}

function DetailField({label,value}:{label:string;value?:string|null}){return <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-50 last:border-0"><span className="text-sm text-gray-400 flex-shrink-0">{label}</span><span className="text-sm text-gray-700 text-right break-words min-w-0">{value||"—"}</span></div>;}

// ─── Invites (拉新邀请) ────────────────────────────────────────────────────────
const INVITE_STATUS_META: Record<InviteStatus,{label:string;color:"default"|"primary"|"success"|"warning"|"error"}> = {
  bound:     {label:"已绑定",   color:"default"},
  l1rewarded:{label:"拉新已发", color:"primary"},
  l2rewarded:{label:"首单已发", color:"success"},
  l2revoked: {label:"首单冲正", color:"warning"},
  invalid:   {label:"已作废",   color:"error"},
};

function InvitesPage({token,onError,notify}:{
  token:string;
  onError:(error:unknown)=>void;
  notify:(message:{kind:"success"|"error";text:string})=>void;
}){
  const PAGE_SIZE=20;
  const auth=useAuth();
  const canWrite=auth.has("points:write");
  const [stat,setStat]=useState<InviteStat|null>(null);
  const [result,setResult]=useState<InviteListResult|null>(null);
  const [loading,setLoading]=useState(true);
  const [needInit,setNeedInit]=useState(false);
  const [phoneInput,setPhoneInput]=useState("");
  const [inviterPhone,setInviterPhone]=useState("");
  const [statusFilter,setStatusFilter]=useState("");
  const [currentPage,setCurrentPage]=useState(1);
  const [invalidating,setInvalidating]=useState<InviteRecord|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const [list,summary]=await Promise.all([
        callCloud<InviteListResult>("adminListInvites",{
          sessionToken:token,
          page:currentPage,
          pageSize:PAGE_SIZE,
          ...(inviterPhone?{inviterPhone}:{}),
          ...(statusFilter?{status:statusFilter}:{}),
        }),
        callCloud<InviteStat>("adminInviteStat",{sessionToken:token}),
      ]);
      setResult(list||{list:[],total:0,hasMore:false});
      setStat(summary||null);
      setNeedInit(false);
    }catch(error){
      // 集合未创建 / 接口未部署：给出提示而不弹全局错误
      setNeedInit(true);
      setResult(null);
      setStat(null);
      void error;
    }finally{setLoading(false);}
  },[token,currentPage,inviterPhone,statusFilter]);

  useEffect(()=>{void load();},[load]);

  const invalidate=async(recordId:string,remark:string)=>{
    try{
      const data=await callCloud<{revokedPoints:number}>("adminInvalidateInvite",{
        sessionToken:token,recordId,remark,
      });
      notify({kind:"success",text:`已作废，扣回 ${Number(data?.revokedPoints||0).toLocaleString("zh-CN")} 积分`});
      await load();
    }catch(error){onError(error);throw error;}
  };

  if(needInit)return(
    <div className="p-4 md:p-6 space-y-5">
      <h1 className="text-lg md:text-xl font-semibold text-gray-900">邀请管理</h1>
      <Paper variant="outlined" sx={{borderColor:"#E8E8EC",borderRadius:"12px",p:4,textAlign:"center"}}>
        <UserPlus size={32} className="mx-auto text-gray-200 mb-3"/>
        <Typography variant="body2" color="text.secondary">拉新邀请功能尚未就绪</Typography>
        <Typography variant="caption" color="text.disabled" sx={{mt:1,display:"block"}}>
          请确认云函数已部署且 invite_records 集合已创建，然后刷新本页。
        </Typography>
        <Button variant="outlined" size="small" sx={{mt:2}} onClick={()=>void load()}>重新检测</Button>
      </Paper>
    </div>
  );

  const list=result?.list||[];
  const total=result?.total||0;
  const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  const cards:Array<{label:string;value:number;color:string}>=[
    {label:"累计绑定",     value:stat?.totalBound||0,        color:"text-gray-800"},
    {label:"本月绑定",     value:stat?.monthBound||0,        color:"text-gray-800"},
    {label:"拉新奖励已发", value:stat?.l1RewardedCount||0,   color:"text-indigo-600"},
    {label:"首单奖励已发", value:stat?.l2RewardedCount||0,   color:"text-emerald-600"},
    {label:"上限拦截",     value:stat?.limitBlockedCount||0, color:"text-amber-600"},
    {label:"累计发放积分", value:stat?.totalPoints||0,       color:"text-indigo-600"},
  ];

  return(
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg md:text-xl font-semibold text-gray-900">邀请管理</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-0.5">拉新奖励在被邀请人绑定手机号后发放，首单奖励在其首个订单完成后发放；奖励规则见「系统配置」中的 invite_* 项</p>
        </div>
        <Button variant="outlined" size="small" startIcon={<RefreshCw size={14} className={loading?"animate-spin":""}/>} onClick={()=>void load()}>刷新</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {cards.map(card=>(
          <Paper key={card.label} variant="outlined" sx={{borderColor:"#E8E8EC",borderRadius:"12px",p:2}}>
            <p className={`text-xl font-semibold font-mono ${card.color}`}>{card.value.toLocaleString("zh-CN")}</p>
            <Typography variant="caption" color="text.secondary">{card.label}</Typography>
          </Paper>
        ))}
      </div>

      <Paper variant="outlined" sx={{borderColor:"#E8E8EC",borderRadius:"12px",p:2}}>
        <Stack direction={{xs:"column",md:"row"}} spacing={2}>
          <form className="flex-1" onSubmit={(event)=>{event.preventDefault();setInviterPhone(phoneInput.trim());setCurrentPage(1);}}>
            <TextField size="small" fullWidth value={phoneInput} onChange={e=>setPhoneInput(e.target.value)}
              placeholder="按邀请人手机号精确查询，回车确认…"
              slotProps={{input:{startAdornment:<InputAdornment position="start"><Search size={14} className="text-gray-400"/></InputAdornment>}}}/>
          </form>
          <TextField select size="small" label="状态" value={statusFilter}
            onChange={e=>{setStatusFilter(e.target.value);setCurrentPage(1);}} sx={{minWidth:160}}>
            <MenuItem value="">全部状态</MenuItem>
            {(Object.keys(INVITE_STATUS_META) as InviteStatus[]).map(key=>(
              <MenuItem key={key} value={key}>{INVITE_STATUS_META[key].label}</MenuItem>
            ))}
          </TextField>
        </Stack>
      </Paper>

      <TableContainer component={Paper} variant="outlined" sx={{borderColor:"#E8E8EC",borderRadius:"12px"}}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{bgcolor:"#FAFAFA"}}>
              {["邀请人","被邀请人","状态","拉新奖励","首单奖励","关联订单","绑定时间"].map(h=>(
                <TableCell key={h} sx={{fontWeight:600,color:"#6B6B6B",whiteSpace:"nowrap"}}>{h}</TableCell>
              ))}
              {canWrite&&<TableCell sx={{fontWeight:600,color:"#6B6B6B"}}>操作</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map(item=>{
              const meta=INVITE_STATUS_META[item.status]||INVITE_STATUS_META.bound;
              return(
                <TableRow key={item._id} hover sx={{verticalAlign:"top"}}>
                  <TableCell>
                    <Typography variant="body2" sx={{fontWeight:500}}>{item.inviter?.nickName||"微信用户"}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{fontFamily:"monospace"}}>{item.inviter?.phone||"—"}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{fontWeight:500}}>{item.invitee?.nickName||"微信用户"}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{fontFamily:"monospace"}}>{item.invitee?.phone||"—"}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={meta.label} color={meta.color} variant={item.status==="bound"?"outlined":"filled"}/>
                    {item.limitBlocked&&<Typography variant="caption" color="warning.main" sx={{display:"block",mt:0.5}}>曾被上限拦截</Typography>}
                  </TableCell>
                  <TableCell>
                    {item.l1Rewarded
                      ?<Typography variant="body2" color="primary.main" sx={{fontWeight:600,fontFamily:"monospace"}}>+{Number(item.l1Points||0).toLocaleString("zh-CN")}</Typography>
                      :<Typography variant="body2" color="text.disabled">未发放</Typography>}
                  </TableCell>
                  <TableCell>
                    {item.l2Revoked
                      ?<Typography variant="body2" color="warning.main">已冲正</Typography>
                      :item.l2Rewarded
                        ?<Typography variant="body2" color="success.main" sx={{fontWeight:600,fontFamily:"monospace"}}>+{Number(item.l2Points||0).toLocaleString("zh-CN")}</Typography>
                        :<Typography variant="body2" color="text.disabled">未发放</Typography>}
                  </TableCell>
                  <TableCell><Typography variant="caption" color="text.secondary" sx={{fontFamily:"monospace"}}>{item.orderNo||"—"}</Typography></TableCell>
                  <TableCell><Typography variant="caption" color="text.secondary" sx={{fontFamily:"monospace",whiteSpace:"nowrap"}}>{formatCloudTime(item.createTime)}</Typography></TableCell>
                  {canWrite&&<TableCell>
                    {item.status!=="invalid"&&<RowActions layout="inline">
                      <RowActionButton tone="red" icon={Ban} onClick={()=>setInvalidating(item)}>作废</RowActionButton>
                    </RowActions>}
                  </TableCell>}
                </TableRow>
              );
            })}
            {loading&&!list.length&&<TableRow><TableCell colSpan={canWrite?8:7} align="center" sx={{py:8}}>
              <CircularProgress size={20}/>
            </TableCell></TableRow>}
            {!loading&&!list.length&&<TableRow><TableCell colSpan={canWrite?8:7} align="center" sx={{py:8}}>
              <UserPlus size={32} className="mx-auto text-gray-200 mb-3"/>
              <Typography variant="body2" color="text.disabled">暂无符合条件的邀请记录</Typography>
            </TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>第 {currentPage} / {totalPages} 页，共 {total} 条</span>
        <div className="flex gap-2">
          <button onClick={()=>setCurrentPage(value=>Math.max(1,value-1))} disabled={currentPage<=1||loading} className="px-3 py-1.5 rounded-md border border-[#E8E8EC] bg-white disabled:opacity-40">上一页</button>
          <button onClick={()=>setCurrentPage(value=>value+1)} disabled={!result?.hasMore||loading} className="px-3 py-1.5 rounded-md border border-[#E8E8EC] bg-white disabled:opacity-40">下一页</button>
        </div>
      </div>

      {invalidating&&<InviteInvalidateDialog record={invalidating} onClose={()=>setInvalidating(null)} onSubmit={async(remark)=>{
        await invalidate(invalidating._id,remark);
        setInvalidating(null);
      }}/>}
    </div>
  );
}

// 作废弹窗：备注必填，提交后按「已发 L1 + 未冲正的 L2」扣回积分
function InviteInvalidateDialog({record,onClose,onSubmit}:{
  record:InviteRecord;
  onClose:()=>void;
  onSubmit:(remark:string)=>Promise<void>;
}){
  const [remark,setRemark]=useState("");
  const [saving,setSaving]=useState(false);
  const revokable=(record.l1Rewarded?Number(record.l1Points||0):0)
    +(record.l2Rewarded&&!record.l2Revoked?Number(record.l2Points||0):0);

  const submit=async()=>{
    if(!remark.trim())return;
    setSaving(true);
    try{await onSubmit(remark.trim());}
    catch{setSaving(false);}
  };

  return(
    <Dialog open fullWidth maxWidth="xs" onClose={()=>!saving&&onClose()}>
      <DialogTitle>作废邀请记录</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{pt:1}}>
          <Stack direction="row" sx={{justifyContent:"space-between"}}>
            <Typography variant="body2" color="text.secondary">邀请人</Typography>
            <Typography variant="body2">{record.inviter?.nickName||"微信用户"} · {record.inviter?.phone||"—"}</Typography>
          </Stack>
          <Stack direction="row" sx={{justifyContent:"space-between"}}>
            <Typography variant="body2" color="text.secondary">被邀请人</Typography>
            <Typography variant="body2">{record.invitee?.nickName||"微信用户"} · {record.invitee?.phone||"—"}</Typography>
          </Stack>
          <Stack direction="row" sx={{justifyContent:"space-between"}}>
            <Typography variant="body2" color="text.secondary">将扣回积分</Typography>
            <Typography variant="body2" color="error.main" sx={{fontWeight:600,fontFamily:"monospace"}}>-{revokable.toLocaleString("zh-CN")}</Typography>
          </Stack>
          <Typography variant="caption" color="text.disabled">
            作废后该记录不再参与后续奖励发放，已发放的拉新与首单奖励将从邀请人账户扣回；此操作不可撤销。
          </Typography>
          <TextField size="small" label="作废原因" required multiline minRows={3} value={remark}
            onChange={e=>setRemark(e.target.value.slice(0,200))}
            placeholder="例如：判定为同人多号刷分" helperText={`${remark.length}/200`}/>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>取消</Button>
        <Button variant="contained" color="error" onClick={()=>void submit()} disabled={saving||!remark.trim()}>
          {saving?"提交中…":"确认作废"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// 侧边栏：children 非空的项渲染为可展开的分组，本身不可点击。
// permission 为空表示不做权限校验（订单等基础页面对所有能登录后台的成员开放）。
interface NavItem {
  id: Page;
  path: string;
  label: string;
  permission?: string;
}
interface NavGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  item?: NavItem;
  children?: NavItem[];
}

const NAV: NavGroup[] = [
  {key:"orders",   label:"订单管理", icon:Package,      item:{id:"orders",path:"/orders",label:"订单管理",permission:"order:read"}},
  {key:"people",   label:"人员管理", icon:Users,        children:[
    {id:"users",   path:"/users",   label:"用户管理", permission:"user:read"},
    {id:"members", path:"/members", label:"成员管理", permission:"member:read"},
    {id:"roles",   path:"/roles",   label:"角色管理", permission:"role:read"},
    {id:"recruits",path:"/recruits",label:"评估员招募", permission:"member:read"},
  ]},
  {key:"cats",      label:"品类管理", icon:Tags,         item:{id:"cats",path:"/categories",label:"品类管理",permission:"category:read"}},
  {key:"analytics", label:"分析统计", icon:BarChart2,    item:{id:"analytics",path:"/analytics",label:"分析统计",permission:"analytics:read"}},
  {key:"feedback",  label:"投诉建议", icon:MessageSquare,item:{id:"feedback",path:"/feedback",label:"投诉建议",permission:"feedback:read"}},
  {key:"points",    label:"积分管理", icon:Coins,        item:{id:"points",path:"/points",label:"积分管理",permission:"points:read"}},
  {key:"invites",   label:"邀请管理", icon:UserPlus,     item:{id:"invites",path:"/invites",label:"邀请管理",permission:"points:read"}},
  {key:"system",    label:"系统配置", icon:Settings,     item:{id:"system",path:"/settings",label:"系统配置",permission:"setting:read"}},
];

// 内置角色的展示名与配色。自定义角色回落到 roleKey 原文 + 默认灰色。
const ROLE_META: Record<string,{label:string;color:"error"|"primary"|"warning"|"success"|"default"}> = {
  admin:        {label:"管理员",     color:"error"},
  store_manager:{label:"店长",       color:"warning"},
  recycler:     {label:"回收员",     color:"success"},
  support:      {label:"客服",       color:"default"},
};

const MEMBER_STATUS_META: Record<MemberStatus,{label:string;color:"success"|"warning"|"default"}> = {
  active:  {label:"在职", color:"success"},
  resting: {label:"休息", color:"warning"},
  resigned:{label:"离职", color:"default"},
};

// 页面 id → 面包屑文案，二级页面带上父级名称
const PAGE_LABEL: Record<Page,string> = {
  orders:"订单管理", users:"用户管理", members:"成员管理", roles:"角色管理", recruits:"评估员招募",
  cats:"品类管理", analytics:"分析统计", feedback:"投诉建议", points:"积分管理", invites:"邀请管理", system:"系统配置",
};

const pageFromPath=(pathname:string):Page|null=>{
  if(pathname==="/orders"||pathname.startsWith("/orders/"))return "orders";
  if(pathname==="/users"||pathname.startsWith("/users/"))return "users";
  // /staff 是旧路径，MainLayout 里会重定向到 /members
  if(pathname==="/members"||pathname.startsWith("/members/")||pathname==="/staff")return "members";
  if(pathname==="/roles")return "roles";
  if(pathname==="/recruits")return "recruits";
  if(pathname==="/categories"||pathname==="/cats")return "cats";
  if(pathname==="/analytics")return "analytics";
  if(pathname==="/feedback")return "feedback";
  if(pathname==="/points")return "points";
  if(pathname==="/invites")return "invites";
  if(pathname==="/settings"||pathname==="/system")return "system";
  return null;
};

// 所有导航项打平，用于按权限找首个可访问页面
const flatNav=(():NavItem[]=>{
  const list:NavItem[]=[];
  NAV.forEach(g=>{if(g.item)list.push(g.item);(g.children||[]).forEach(c=>list.push(c));});
  return list;
})();

function MainLayout({ token,adminName,onLogout,onError,notify }:FigmaAdminProps) {
  const navigate=useNavigate();
  const location=useLocation();
  const detailMatch=location.pathname.match(/^\/orders\/([^/]+)$/);
  const detailId=detailMatch?decodeURIComponent(detailMatch[1]):"";
  const userDetailMatch=location.pathname.match(/^\/users\/([^/]+)$/);
  const userDetailId=userDetailMatch?decodeURIComponent(userDetailMatch[1]):"";
  const [page,setPage]=useState<Page>(()=>pageFromPath(location.pathname)||"orders");
  const [orders,setOrders]=useState<Order[]>([]);
  const [staff,setStaff]=useState<Staff[]>([]);
  const [groups,setGroups]=useState<RecycleGroup[]>([]);
  const [categoryTree,setCategoryTree]=useState<CategoryNode[]>([]);
  const [systemSettings,setSystemSettings]=useState<SystemSetting[]>([]);
  const [feedbacks,setFeedbacks]=useState<FeedbackRecord[]>([]);
  const [roles,setRoles]=useState<RoleRecord[]>([]);
  const [permissionCatalog,setPermissionCatalog]=useState<PermissionModule[]>([]);
  const [superAdminKey,setSuperAdminKey]=useState("super_admin");
  const [loading,setLoading]=useState(true);
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
  const [expandedGroups,setExpandedGroups]=useState<string[]>([]);
  // 面包屑：二级页面时显示父级名称
  const parentLabel=(()=>{
    for(const g of NAV)if(g.children&&g.children.some(c=>c.id===page))return g.label;
    return "";
  })();
  // 权限：adminGetAuthInfo 未部署时 ready 保持 false，has() 全放行，旧环境照常可用
  const [authInfo,setAuthInfo]=useState<AuthInfo|null>(null);
  const auth=useMemo<AuthState>(()=>{
    const permissions=new Set(authInfo?.permissions||[]);
    const ready=Boolean(authInfo)&&!authInfo?.legacy;
    return {
      ready,
      member:authInfo?.member||null,
      permissions,
      has:(permission?:string)=>!ready||!permission||permissions.has(permission),
    } as AuthState;
  },[authInfo]);
  // 侧边栏底部角色文案：优先用 roles 集合里的真实名称，回落到内置映射
  const roleNameMap=useMemo(()=>{
    const map:Record<string,string>={};
    Object.entries(ROLE_META).forEach(([key,meta])=>{map[key]=meta.label;});
    roles.forEach(r=>{map[r.roleKey]=r.name||r.roleKey;});
    return map;
  },[roles]);
  // 展示用订单：回收员姓名/电话按 recyclerId 从 staff 实时反查，避免改名后仍显示派单时的旧快照
  const displayOrders=useMemo(()=>withLiveRecycler(orders,staff),[orders,staff]);

  useEffect(()=>{
    let alive=true;
    (async()=>{
      try{
        const info=await callCloud<AuthInfo>("adminGetAuthInfo",{sessionToken:token});
        if(alive)setAuthInfo(info||null);
      }catch{
        // 接口尚未部署：保持全放行
        if(alive)setAuthInfo(null);
      }
    })();
    return()=>{alive=false;};
  },[token]);

  useEffect(()=>{
    const routedPage=pageFromPath(location.pathname);
    if(routedPage){
      setPage(routedPage);
      if(location.pathname==="/cats")navigate("/categories",{replace:true});
      if(location.pathname==="/system")navigate("/settings",{replace:true});
      if(location.pathname==="/staff")navigate("/members",{replace:true});
      return;
    }
    navigate("/orders",{replace:true});
  },[location.pathname,navigate]);

  // 无权访问当前页时，跳到第一个有权访问的页面
  useEffect(()=>{
    if(!auth.ready)return;
    const current=flatNav.find(n=>n.id===page);
    if(current&&auth.has(current.permission))return;
    const fallback=flatNav.find(n=>auth.has(n.permission));
    if(fallback&&fallback.id!==page)navigate(fallback.path,{replace:true});
  },[auth,page,navigate]);

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

  // 投诉建议：页面内做关键词/状态筛选和分页，所以这里要把云端数据取全。
  // 只取第一页会让第 2 页之后的反馈永远搜不到、也翻不到。
  const loadFeedbacks=async()=>{
    // pageSize 必须 <= 云函数的 PAGE_SIZE_MAX(50)，否则 skip 计算会漏数据
    const PAGE=50;
    const first=await callCloud<FeedbackListResult>("adminListFeedbacks",{sessionToken:token,page:1,pageSize:PAGE});
    const all=[...(first?.list||[])];
    const pageCount=Math.ceil((first?.total||0)/PAGE);
    if(pageCount>1){
      const rest=await Promise.all(Array.from({length:pageCount-1},(_,index)=>
        callCloud<FeedbackListResult>("adminListFeedbacks",{sessionToken:token,page:index+2,pageSize:PAGE}),
      ));
      rest.forEach((result)=>all.push(...(result?.list||[])));
    }
    return all;
  };

  const refresh=async()=>{
    setLoading(true);
    try {
      // 订单是管理端的核心数据，独立加载，避免某个辅助接口尚未部署时整页变成空数据。
      // adminListOrders 已下发列表页需要的全部字段，这里不再逐条拉详情（N+1）；
      // 照片等重字段在订单详情页按需获取。
      try {
        // pageSize 必须 <= 云函数的 PAGE_SIZE_MAX(50)，否则会被服务端夹到 50，
        // 而 skip 仍按请求值累进，中间的数据会被整段跳过。
        const PAGE=50;
        const firstOrderPage=await callCloud<OrderListResult>("adminListOrders",{sessionToken:token,page:1,pageSize:PAGE,status:"",keyword:""});
      const orderPages=[...(firstOrderPage.list||[])];
      const pageCount=Math.ceil(firstOrderPage.total/PAGE);
      if(pageCount>1){
        const rest=await Promise.all(Array.from({length:pageCount-1},(_,index)=>
          callCloud<OrderListResult>("adminListOrders",{sessionToken:token,page:index+2,pageSize:PAGE,status:"",keyword:""}),
        ));
        rest.forEach((result)=>orderPages.push(...(result.list||[])));
      }
      setOrders(orderPages.map(cloudOrderToFigma));
      } catch(error) {
        setOrders([]);
        onError(error);
      }

      // 用户列表不在这里预加载：UsersPage 自己按页取数
      const [categoriesResult,settingsResult,staffResult,feedbacksResult,rolesResult]=await Promise.allSettled([
        loadCategories(),
        loadSystemSettings(),
        callCloud<StaffRecord[]>("adminListStaff",{sessionToken:token}),
        loadFeedbacks(),
        callCloud<RoleListResult>("adminListRoles",{sessionToken:token}),
      ]);
      if(categoriesResult.status==="fulfilled"){
        const categories=categoriesResult.value||[];
        setGroups(categoriesToGroups(categories));
        setCategoryTree(categoriesToTree(categories));
      }
      if(settingsResult.status==="fulfilled")setSystemSettings(settingsResult.value||[]);
      if(staffResult.status==="fulfilled")setStaff(staffFromCloud(staffResult.value||[]));
      if(feedbacksResult.status==="fulfilled")setFeedbacks(feedbacksResult.value||[]);
      // 角色接口未部署时静默跳过：角色管理页会自行提示需要初始化
      if(rolesResult.status==="fulfilled"&&rolesResult.value){
        setRoles(rolesResult.value.list||[]);
        setPermissionCatalog(rolesResult.value.catalog||[]);
        setSuperAdminKey(rolesResult.value.superAdminKey||"super_admin");
      }

      const failedAuxiliary=[categoriesResult,settingsResult,staffResult]
        .find((result)=>result.status==="rejected");
      if(failedAuxiliary?.status==="rejected")onError(failedAuxiliary.reason);
    }finally{setLoading(false);}
  };

  useEffect(()=>{void refresh();},[token]);

  const unsupported=(feature:string)=>notify({kind:"error",text:`${feature}尚未接入后端，当前未保存任何演示数据`});

  const reloadRoles=async()=>{
    const result=await callCloud<RoleListResult>("adminListRoles",{sessionToken:token});
    if(!result)return;
    setRoles(result.list||[]);
    setPermissionCatalog(result.catalog||[]);
    setSuperAdminKey(result.superAdminKey||"super_admin");
  };

  const saveRole=async(role:Partial<RoleRecord>)=>{
    try{
      await callCloud("adminSaveRole",{sessionToken:token,role});
      await reloadRoles();
      notify({kind:"success",text:role._id?"角色已更新":"角色已添加"});
    }catch(error){onError(error);throw error;}
  };

  const deleteRole=async(role:RoleRecord)=>{
    try{
      await callCloud("adminDeleteRole",{sessionToken:token,id:role._id});
      await reloadRoles();
      notify({kind:"success",text:"角色已删除"});
    }catch(error){onError(error);throw error;}
  };

  // 成员保存后要刷新 staff：成员的姓名/电话变更会经双写同步到 staff，订单页的回收员反查依赖它
  const saveMember=async(member:Partial<MemberRecord>)=>{
    try{
      await callCloud("adminSaveMember",{sessionToken:token,member});
      const list=await callCloud<StaffRecord[]>("adminListStaff",{sessionToken:token}).catch(()=>null);
      if(list)setStaff(staffFromCloud(list));
      notify({kind:"success",text:member._id?"成员已更新":"成员已添加"});
    }catch(error){onError(error);throw error;}
  };

  const toggleMemberStatus=async(member:MemberRecord,status:MemberStatus)=>{
    try{
      await callCloud("adminToggleMemberStatus",{sessionToken:token,id:member._id,status});
      const list=await callCloud<StaffRecord[]>("adminListStaff",{sessionToken:token}).catch(()=>null);
      if(list)setStaff(staffFromCloud(list));
      notify({kind:"success",text:`已标记为${MEMBER_STATUS_META[status].label}`});
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
        // transferProofs 为 undefined 时不下发，云函数据此保留原有凭证不清空
        ...(order.transferProofs?{transferProofs:order.transferProofs}:{}),
        // 实际重量/件数：空值不下发（undefined 时云函数跳过，不误清已有值）
        ...(order.finalWeight!=null?{finalWeight:order.finalWeight}:{}),
        ...(order.finalCount!=null?{finalCount:order.finalCount}:{}),
      });
      notify({kind:"success",text:"订单已更新"});
      await refresh();
    }catch(error){onError(error);throw error;}
  };

  const deleteOrder=async(docId:string)=>{
    try{
      await callCloud("adminDeleteOrder",{sessionToken:token,id:docId});
      notify({kind:"success",text:"订单已删除"});
      navigate("/orders");
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
        recyclerId:person.docId,
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
    const allowedUnits:CloudCategory["unit"][]=["公斤","kg","斤","台","件","双","袋","箱"];
    const unit=allowedUnits.includes(item.unit as CloudCategory["unit"])?item.unit as CloudCategory["unit"]:"公斤";
    const category:CloudCategory={
      _id:item.categoryId,
      parentId:item.parentId||null,
      name:item.name,
      unit,
      // 报价改为自由文本 priceRef 直传；fieldEstimate 为 true 时云端会强制写「现场估价」
      priceRef:item.fieldEstimate?"":item.priceRef||"",
      fieldEstimate:!!item.fieldEstimate,
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
      notify({kind:"success",text:"品类节点及其子节点已删除"});
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
    <AuthContext.Provider value={auth}>
    <div className="h-full flex overflow-hidden" style={{fontFamily:"'Noto Sans SC',sans-serif"}}>
      {/* 移动端遮罩 */}
      {mobileMenuOpen&&<div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={()=>setMobileMenuOpen(false)}/>}
      {/* 侧边栏 */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-60 h-full flex-shrink-0 flex flex-col bg-white border-r border-[#E8E8EC] transition-transform duration-200 md:relative md:translate-x-0 ${mobileMenuOpen?"translate-x-0":"-translate-x-full"}`}>
        <div className="h-14 px-4 border-b border-[#E8E8EC] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md flex items-center justify-center bg-indigo-500"><RefreshCw size={16} className="text-white"/></div>
            <div><p className="text-[#0A0A0A] font-semibold text-sm leading-tight tracking-[-0.02em]">来卖吧</p><p className="text-[#9C9C9C] text-[11px]">管理后台 v1.0</p></div>
          </div>
          <button onClick={()=>setMobileMenuOpen(false)} className="md:hidden p-2 rounded-md text-[#9C9C9C] hover:bg-[#F4F4F6]"><X size={18}/></button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map((group)=>{
            const Icon=group.icon;
            if(group.item){
              if(!auth.has(group.item.permission))return null;
              const active=page===group.item.id;
              const target=group.item;
              return(<button key={group.key} onClick={()=>{navigate(target.path);setMobileMenuOpen(false);}} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${active?"bg-indigo-50 text-indigo-600":"text-[#6B6B6B] hover:bg-[#F4F4F6] hover:text-[#0A0A0A]"}`}>
                <Icon size={17}/>{group.label}{active&&<ChevronRight size={13} className="ml-auto"/>}
              </button>);
            }
            const children=(group.children||[]).filter(c=>auth.has(c.permission));
            if(!children.length)return null;
            const groupActive=children.some(c=>c.id===page);
            const expanded=expandedGroups.includes(group.key)||groupActive;
            return(<div key={group.key}>
              <button onClick={()=>setExpandedGroups(current=>current.includes(group.key)?current.filter(k=>k!==group.key):[...current,group.key])} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${groupActive?"text-indigo-600":"text-[#6B6B6B] hover:bg-[#F4F4F6] hover:text-[#0A0A0A]"}`}>
                <Icon size={17}/>{group.label}
                {expanded?<ChevronUp size={13} className="ml-auto"/>:<ChevronDown size={13} className="ml-auto"/>}
              </button>
              {expanded&&<div className="mt-0.5 ml-4 pl-3 border-l border-[#E8E8EC] space-y-0.5">
                {children.map(child=>{
                  const active=page===child.id;
                  return(<button key={child.id} onClick={()=>{navigate(child.path);setMobileMenuOpen(false);}} className={`w-full flex items-center px-3 py-2 rounded-md text-sm transition-colors ${active?"bg-indigo-50 text-indigo-600 font-medium":"text-[#6B6B6B] hover:bg-[#F4F4F6] hover:text-[#0A0A0A]"}`}>
                    {child.label}{active&&<ChevronRight size={13} className="ml-auto"/>}
                  </button>);
                })}
              </div>}
            </div>);
          })}
        </nav>
        <div className="px-3 py-3 border-t border-[#E8E8EC]">
          <div className="flex items-center gap-2.5 mb-2 px-1">
            <div className="w-8 h-8 rounded-full bg-[#F4F4F6] flex items-center justify-center flex-shrink-0"><span className="text-xs font-semibold text-[#6B6B6B]">管</span></div>
            <div className="flex-1 min-w-0"><p className="text-sm font-medium text-[#0A0A0A] truncate">{auth.member?.name||adminName||"管理员"}</p><p className="text-[11px] text-[#9C9C9C] truncate">{auth.member?.roleKeys?.map(k=>roleNameMap[k]||k).join("、")||"管理员"}</p></div>
          </div>
          <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-[#F4F4F6] transition-colors"><LogOut size={14}/>退出登录</button>
        </div>
      </aside>
      <main className="h-full min-w-0 flex-1 overflow-y-auto bg-[#FAFAFA]" style={{WebkitOverflowScrolling:"touch",overscrollBehavior:"contain"}}>
        {/* Genesis 导航：56px 高，靠 backdrop-blur 表达层级而非阴影 */}
        <div className="h-14 bg-white/80 backdrop-blur-md border-b border-[#E8E8EC] px-4 md:px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <button onClick={()=>setMobileMenuOpen(true)} className="md:hidden p-2 -ml-2 rounded-md text-[#6B6B6B] hover:bg-[#F4F4F6] flex items-center justify-center"><Menu size={20}/></button>
            <div className="hidden md:flex items-center gap-2 text-sm text-[#9C9C9C]"><span>首页</span>{parentLabel&&<><ChevronRight size={12}/><span>{parentLabel}</span></>}<ChevronRight size={12}/><span className="text-[#0A0A0A] font-medium">{PAGE_LABEL[page]}</span></div>
            <span className="md:hidden text-sm font-medium text-[#0A0A0A]">{PAGE_LABEL[page]}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#9C9C9C]"><div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/><span className="hidden sm:inline">系统运行正常</span></div>
        </div>
        {detailId?<AdminOrderDetailPage id={detailId} token={token} staff={staff} onSaveOrder={saveOrder} onAssignRecycler={assignOrderRecycler} onDeleteOrder={deleteOrder} onBack={()=>navigate("/orders")} onError={onError} notify={notify}/>:userDetailId?<UserDetailPage userId={userDetailId} token={token} onBack={()=>navigate("/users")} onViewOrder={(id)=>navigate(`/orders/${encodeURIComponent(id)}`)} onError={onError} notify={notify}/>:loading?<div className="min-h-[420px] flex flex-col items-center justify-center text-gray-400 gap-3"><Loader size={24} className="animate-spin text-indigo-600"/><p className="text-sm">正在加载真实业务数据…</p></div>:<>
          {page==="orders"    &&<OrdersPage staff={staff} groups={groups} orders={displayOrders} onSaveOrder={saveOrder} onAssignRecycler={assignOrderRecycler} onUnsupported={unsupported} onViewOrder={(id)=>navigate(`/orders/${encodeURIComponent(id)}`)}/>}
          {page==="users"     &&<UsersPage token={token} onError={onError} onViewUser={(id)=>navigate(`/users/${encodeURIComponent(id)}`)}/>}
          {page==="members"   &&<MembersPage token={token} roles={roles} onSaveMember={saveMember} onToggleStatus={toggleMemberStatus} onError={onError}/>}
          {page==="roles"     &&<RolesPage roles={roles} catalog={permissionCatalog} superAdminKey={superAdminKey} onSaveRole={saveRole} onDeleteRole={deleteRole}/>}
          {page==="recruits"  &&<StaffRecruitsPage token={token} onError={onError} notify={notify}/>}
          {page==="cats"      &&<CategoryTreePage nodes={categoryTree} onSave={saveCategoryNode} onDelete={deleteCategory}/>}
          {page==="analytics" &&<AnalyticsPage orders={displayOrders}/>} 
          {page==="feedback"  &&<FeedbackPage items={feedbacks} loading={loading} onRefresh={reloadFeedbacks}/>}
          {page==="points"    &&<PointsPage token={token} onError={onError} notify={notify} onViewOrder={(id)=>navigate(`/orders/${encodeURIComponent(id)}`)}/>}
          {page==="invites"   &&<InvitesPage token={token} onError={onError} notify={notify}/>}
          {page==="system"    &&<SystemPage items={systemSettings} onSave={saveSystemSetting} onDelete={deleteSystemSetting}/>}
        </>}
      </main>
    </div>
    </AuthContext.Provider>
  );
}

export default function FigmaAdminApp(props:FigmaAdminProps) {
  return <MainLayout {...props}/>;
}
