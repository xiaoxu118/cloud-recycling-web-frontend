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
  /** 重量类品类用户选的预估区间标识（lt30/30to100/gt100），单位固定为公斤 */
  estWeightRange?: string;
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
  /** 本单已发放积分（累计净值），由云函数在订单完成时写入 */
  pointsGranted?: number;
  /** 发放轮次序号，用于「完成→撤回→再完成」的幂等键 */
  pointsGrantSeq?: number;
  pointsGrantAt?: number | null;
  /** 非空表示上次积分同步失败，后台需人工补发 */
  pointsGrantError?: string;
}

export interface Category {
  _id?: string;
  parentId?: string | null;
  name: string;
  /** 计量单位。"kg" 为历史存量值，新建品类统一用"公斤" */
  unit: "公斤" | "kg" | "斤" | "台" | "件" | "双" | "袋" | "箱";
  /** @deprecated 旧的数字单价。仅存量数据保留，新建/编辑不再写入 */
  price?: number | null;
  /** 报价展示文案（权威数据），管理端自由填写，支持「0.5-0.8 元/公斤」这类区间 */
  priceRef?: string;
  /** 现场估价开关。true 时下单页不填数量、priceRef 固定为「现场估价」 */
  fieldEstimate?: boolean;
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
  // 仅首页 Banner 槽位使用：点击后跳转的小程序内页路径，留空则点击不跳转
  linkUrl?: string;
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

export interface UserListResult {
  list: UserRecord[];
  total: number;
  hasMore: boolean;
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

export type MemberStatus = "active" | "resting" | "resigned";

/** members 集合记录。_id 复用 staff._id，phone 与 users 集合关联。 */
export interface MemberRecord {
  _id: string;
  name: string;
  phone: string;
  roleKeys: string[];
  status: MemberStatus;
  employeeNo?: string;
  store?: string;
  area?: string;
  joinDate?: string;
  wechatBound?: boolean;
  phoneLoginBound?: boolean;
  createTime?: number;
  updateTime?: number;
}

export type StaffRecruitStatus = "pending" | "contacted" | "passed" | "rejected";

/** staff_recruits 集合记录，来自小程序评估员招募页留资。 */
export interface StaffRecruitRecord {
  _id: string;
  name: string;
  phone: string;
  expectArea?: string;
  status: StaffRecruitStatus;
  remark?: string;
  createTime?: number;
  updateTime?: number;
}

export interface StaffRecruitListResult {
  list: StaffRecruitRecord[];
  total: number;
  hasMore: boolean;
}

export interface MemberListResult {
  list: MemberRecord[];
  total: number;
  counts: Record<MemberStatus, number>;
  roles: { roleKey: string; name: string; builtIn: boolean }[];
  stores: string[];
}

export interface MemberDetailResult {
  member: MemberRecord;
  linkedUser: {
    nickName?: string;
    avatarUrl?: string;
    points?: number;
    createTime?: number;
    lastLoginTime?: number;
  } | null;
  orderCount: number;
}

/** roles 集合记录。roleKey 唯一且创建后不可修改，builtIn 角色不可删除。 */
export interface RoleRecord {
  _id: string;
  roleKey: string;
  name: string;
  description?: string;
  permissions: string[];
  builtIn: boolean;
  sort?: number;
  memberCount?: number;
  createTime?: number;
  updateTime?: number;
}

export interface PermissionModule {
  module: string;
  label: string;
  items: { key: string; label: string }[];
}

export interface RoleListResult {
  list: RoleRecord[];
  catalog: PermissionModule[];
  superAdminKey: string;
}

export interface AuthInfo {
  member: MemberRecord | null;
  name: string;
  permissions: string[];
  /** true 表示走的是旧 admins 鉴权路径，拥有全部权限 */
  legacy: boolean;
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

/** points_records 集合记录。流水是积分的唯一真相源，users.points 只是冗余快照。 */
export type PointsRecordType =
  | "earn_order"
  | "adjust_order"
  | "revoke_order"
  | "admin_adjust"
  | "exchange"
  | "refund"
  | "expire"
  | "invite_bind"
  | "invite_order"
  | "invite_revoke";

export interface PointsRecord {
  _id: string;
  type: PointsRecordType;
  /** 变动值，正为增加、负为扣减 */
  points: number;
  balanceAfter: number;
  bizType?: string;
  bizId?: string;
  orderId?: string;
  orderNo?: string;
  title?: string;
  remark?: string;
  operator?: string;
  createTime?: number;
  /** 后台列表专用：脱敏后的用户标识，用于按用户筛选 */
  userKey?: string;
  user?: { nickName?: string; phone?: string };
}

export interface PointsRecordListResult {
  list: PointsRecord[];
  total: number;
  hasMore: boolean;
}

export interface UserPointsDetail {
  points: number;
  pointsTotal: number;
  pointsUsed: number;
  records: PointsRecord[];
}

/** 积分商品分类，与云端 GOODS_CATEGORIES 对齐 */
export type PointsGoodsCategory = "grain" | "egg" | "daily";
/** 履约方式：门店自提 / 邮寄到家 */
export type PointsFulfillType = "pickup" | "express";

export interface PointsGoods {
  _id: string;
  name: string;
  cover?: string;
  images?: string[];
  desc?: string;
  category: PointsGoodsCategory;
  costPoints: number;
  stock: number;
  /** 0 表示不限购 */
  limitPerUser: number;
  fulfillType: PointsFulfillType;
  pickupStore?: string;
  status: "on" | "off";
  sort: number;
  exchangedCount?: number;
  createTime?: number;
  updateTime?: number;
}

export interface PointsGoodsListResult {
  list: PointsGoods[];
  total: number;
  hasMore: boolean;
}

export type PointsExchangeStatus = "pending" | "done" | "canceled";

export interface PointsExchange {
  _id: string;
  exchangeNo: string;
  goodsId: string;
  goodsSnapshot: {
    name?: string;
    cover?: string;
    costPoints?: number;
    fulfillType?: PointsFulfillType;
    pickupStore?: string;
  };
  costPoints: number;
  status: PointsExchangeStatus;
  fulfillType: PointsFulfillType;
  /** 自提核销码，邮寄单为空串 */
  pickupCode?: string;
  verifiedBy?: string;
  addressSnapshot?: {
    contactName?: string;
    phone?: string;
    region?: string;
    detail?: string;
  } | null;
  expressNo?: string;
  createTime?: number;
  doneTime?: number;
  user?: { nickName?: string; phone?: string };
}

export interface PointsExchangeListResult {
  list: PointsExchange[];
  total: number;
  hasMore: boolean;
}

/**
 * invite_records 集合记录（邀请拉新）。
 * bound 已绑定 / l1rewarded L1 已发 / l2rewarded 首单已发 / l2revoked 首单已冲正 / invalid 后台已作废
 */
export type InviteStatus = "bound" | "l1rewarded" | "l2rewarded" | "l2revoked" | "invalid";

export interface InviteRecord {
  _id: string;
  inviteCode: string;
  status: InviteStatus;
  l1Rewarded: boolean;
  l1Points: number;
  l2Rewarded: boolean;
  l2Revoked: boolean;
  l2Points: number;
  /** L2 发放轮次，「完成→撤回→再完成」每轮 +1，用于幂等键去重 */
  l2GrantSeq: number;
  /** true 表示曾被月度上限拦截 */
  limitBlocked: boolean;
  orderNo: string;
  createTime: number;
  inviter: { nickName?: string; phone?: string };
  invitee: { nickName?: string; phone?: string };
}

export interface InviteListResult {
  list: InviteRecord[];
  total: number;
  hasMore: boolean;
}

export interface InviteStat {
  totalBound: number;
  l1RewardedCount: number;
  l2RewardedCount: number;
  monthBound: number;
  limitBlockedCount: number;
  /** 累计发放积分（正流水减冲正负流水） */
  totalPoints: number;
}
