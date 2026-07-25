export type OrderStatus = "submitted" | "processing" | "completed" | "canceled";

export interface AddressSnapshot {
  contactName?: string;
  phone?: string;
  region?: string;
  detail?: string;
}

export interface OrderItem {
  categoryName?: string;
  unit?: "kg" | "件";
  estWeight?: number;
  estCount?: number;
}

export interface Order {
  _id: string;
  orderNo: string;
  source?: "category" | "photo";
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
  recyclerOpenid?: string;
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
  groupId?: string;
  name: string;
  unit: "kg" | "件";
  priceRef?: string;
  sortOrder: number;
  enabled: boolean;
}

export interface CategoryGroup {
  _id?: string;
  name: string;
  description?: string;
  sortOrder: number;
  enabled: boolean;
  allowFieldEstimate?: boolean;
}

export interface RecycleSettings {
  key: "recycle_rules";
  minWeightKg: number;
  minCount: number;
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
  type: "text" | "number" | "boolean" | "image";
  value: string;
  description?: string;
  imageUrl?: string;
  updateTime?: number;
}

export interface UserRecord {
  _id: string;
  openid: string;
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
  openid?: string;
  name: string;
  phone: string;
  status: "online" | "resting" | "resigned";
  area?: string;
  store?: string;
  joinDate?: string;
  createTime?: number;
  updateTime?: number;
}
