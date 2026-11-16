export type CountryOption = 'India' | 'International';
export type CurrencyCode = 'INR' | 'USD';
export type GatewayName = 'Razorpay' | 'Stripe';
export type WorkspaceTab = 'home' | 'message' | 'reels' | 'payment' | 'shopping' | 'profile';

export interface SubscriptionPlan {
  status: 'trial_active' | 'active' | 'cancelled';
  trialEndsAt: string;
  currency: CurrencyCode;
  monthlyPrice: number;
  gateway: GatewayName;
  country: CountryOption;
}

export interface UserSettings {
  privateAccount: boolean;
  showActivityStatus: boolean;
  readReceipts: boolean;
  defaultGhostChat: boolean;
  pushNotifications: boolean;
  callAlerts: boolean;
  twoFactorEnabled: boolean;
}

export interface UserProfile {
  userId: string;
  username: string;
  displayName: string;
  bio?: string;
  upiId?: string;
  avatarUrl?: string;
  followersCount?: number;
  followingCount?: number;
  settings?: UserSettings;
  country: CountryOption;
  subscription: SubscriptionPlan | null;
  walletBalanceINR: number;
  walletBalanceUSD: number;
}

export interface Product {
  id: number;
  name: string;
  category: 'Wearables' | 'Fashion' | 'Audio' | 'Luxury' | 'Workspace';
  editorialLabel?: string;
  description: string;
  specs: string;
  priceINR: number;
  priceUSD: number;
  image: string;
  inStock: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  attributedCreatorId?: string;
}

export interface EncryptionSeal {
  algorithm: 'AES-256-GCM';
  iv: string;
  authTag: string;
  ciphertextPreview: string;
  integrityHash: string;
  verified: boolean;
}

export interface FraudCheckResult {
  riskScore: number;
  decision: 'APPROVED' | 'STEP_UP_REQUIRED' | 'BLOCKED';
  rulesTriggered: string[];
}

export interface Transaction {
  transactionId: string;
  senderId: string;
  receiverId: string;
  amount: number;
  currency: CurrencyCode;
  gateway: GatewayName;
  type: 'transfer' | 'bill' | 'marketplace' | 'topup' | 'escrow_lock' | 'escrow_release' | 'royalty';
  note: string;
  createdAt: string;
  status: 'Success';
  seal: EncryptionSeal;
  fraudCheck: FraudCheckResult;
}

export interface EscrowDeal {
  escrowId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: CurrencyCode;
  itemNote: string;
  status: 'LOCKED' | 'RELEASED' | 'REFUNDED';
  releaseCodeForBuyer?: string;
  seal: EncryptionSeal;
  createdAt: string;
  updatedAt: string;
}

export interface SecurityEvent {
  id: string;
  userId: string;
  action: string;
  decision: 'APPROVED' | 'STEP_UP_REQUIRED' | 'BLOCKED';
  riskScore: number;
  reason: string;
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  room: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
}

export interface OnlineUser {
  socketId: string;
  userId: string;
  displayName: string;
  country: CountryOption;
}

export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  location: string;
  caption: string;
  image: string;
  likes: number;
  likedBy: string[];
  linkedProductId?: number;
  createdAt: string;
}

export interface ReelComment {
  id: string;
  userId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface ReelItem {
  id: string;
  creatorId: string;
  creatorName: string;
  title: string;
  caption: string;
  audioTrack: string;
  image: string;
  likes: number;
  likedBy: string[];
  comments: ReelComment[];
  linkedProductId?: number;
  createdAt: string;
}

export interface ConciergeAction {
  reply: string;
  intent:
    | 'shop_add'
    | 'pay_transfer'
    | 'start_call'
    | 'navigate_tab'
    | 'draft_message'
    | 'answer_only';
  productIds?: number[];
  payment?: {
    receiverId: string;
    amount: number;
    note: string;
  };
  callTarget?: {
    targetUserId: string;
    callType: 'audio' | 'video';
  };
  draftMessage?: {
    room: 'vip_khushi' | 'general';
    recipientName?: string;
    text: string;
  };
  tab?: WorkspaceTab | 'security' | 'settings';
}
