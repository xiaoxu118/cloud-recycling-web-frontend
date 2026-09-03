export type OrderStatus = "submitted" | "processing" | "completed" | "canceled";

export interface AddressSnapshot {
  contactName?: string;
  phone?: string;
  region?: string;
  detail?: string;
}

export interface OrderItem {
  categoryName?: string;
  /** 品类单位（斤/kg/件/台等），由小程序下单时写入；旧订单可能缺失 */
  unit?: string;
  estWeight?: number;
  estCount?: number;
}

export interface Order {
  _id: string;
  orderNo: string;
  source?: "category" | "photo" | "general" | "demolition";
  orderType?: "recycle" | "furniture_demolition" | "shop_demolition";
  demolition?: {
    scene?: "home" | "business";
    items?: string[];
  } | null;
  summary?: string;
  status: OrderStatus;
  addressSnapshot?: AddressSnapshot;
  appointDate?: string;
  appointSlot?: string;
  items?: OrderItem[];
  remark?: string;
  photoUrls?: string[];
  estimatePrice?: number | null;
  finalWeight?: number | null;
  finalCount?: number | null;
  finalPrice?: number | null;
  recyclerId?: string;
  recyclerName?: string;
  recyclerPhone?: string;
  assignedAt?: number;
  transferProofs?: string[];
  transferProofUrls?: string[];
  cancelReason?: string;
  adminRemark?: string;
  createTime?: number;
  updateTime?: number;
  completedAt?: number | null;
  canceledAt?: number | null;
}

export interface Category {
  _id?: string;
  parentId?: string | null;
  name: string;
  /** 计量单位。"kg" 为历史存量值，新建品类统一用"公斤" */
  unit: "公斤" | "kg" | "斤" | "台" | "件" | "双" | "袋" | "箱";
  /** 数字单价（权威数据）。null 表示现场估价 */
  price?: number | null;
  /** 展示文案，由云函数用 price + unit 拼出，管理端只读 */
  priceRef?: string;
  minVisitKg?: number;
  sortOrder: number;
  enabled: boolean;
  showOnHome?: boolean;
  deleted?: boolean;
  deletedAt?: number;
}

export interface RecycleSettings {
  key: "recycle_rules";
  photoOrderCheckMinQuantity: boolean;
  updateTime?: number;
}

export interface OrderListResult {
  list: Order[];
  total: number;
  hasMore: boolean;
}

export interface SystemSetting {
  _id?: string;
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "image" | "longtext";
  value: string;
  description?: string;
  imageUrl?: string;
  updateTime?: number;
}

export interface UserRecord {
  _id: string;
  wechatBound?: boolean;
  nickName?: string;
  avatarUrl?: string;
  phone?: string;
  orderCount: number;
  addressCount: number;
  createTime?: number;
  updateTime?: number;
  lastLoginTime?: number;
}

export interface StaffRecord {
  _id?: string;
  employeeNo: string;
  wechatBound?: boolean;
  name: string;
  phone: string;
  status: "online" | "resting" | "resigned";
  area?: string;
  store?: string;
  joinDate?: string;
  createTime?: number;
  updateTime?: number;
}

/** 后端 admins 集合记录。phone 为主键，cloudbaseUid/openid 由登录流程自动回填。 */
export interface AdminRecord {
  _id: string;
  phone: string;
  name: string;
  role: string;
  enabled: boolean;
  cloudbaseUid?: string;
  openid?: string;
  wechatBound?: boolean;
  loginMethod?: "phone" | "wechat" | "none";
  createTime?: number;
  updateTime?: number;
}

/** feedbacks 集合记录。小程序端「投诉和建议」提交，后台只读 + 标记已处理。 */
export interface FeedbackRecord {
  _id: string;
  tags?: string[];
  content?: string;
  contact?: string;
  userSnapshot?: {
    nickName?: string;
    phone?: string;
  };
  status: "pending" | "handled";
  handledAt?: number | null;
  handledBy?: string;
  createTime?: number;
  updateTime?: number;
}

export interface FeedbackListResult {
  list: FeedbackRecord[];
  total: number;
  hasMore: boolean;
}
