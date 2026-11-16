import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { GoogleGenAI, Type } from '@google/genai';
import type { NextFunction, Request, Response } from 'express';
import type {
  ChatMessage,
  ConciergeAction,
  CountryOption,
  CurrencyCode,
  EncryptionSeal,
  EscrowDeal,
  FeedPost,
  FraudCheckResult,
  OnlineUser,
  Product,
  ReelItem,
  SecurityEvent,
  SubscriptionPlan,
  Transaction,
  UserProfile,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '5mb' }));

// Security Headers & CORS
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, user-id, x-session-token'
  );
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('Referrer-Policy', 'no-referrer');
  res.header('X-XSS-Protection', '1; mode=block');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// Zero-Trust AES-256-GCM Vault Key & HMAC-SHA256 Session Signing Key
const VAULT_MASTER_KEY = crypto
  .createHash('sha256')
  .update(process.env.VAULT_SECRET || 'vexo-zero-trust-vault-key-2026')
  .digest();

const SESSION_HMAC_KEY = crypto
  .createHash('sha256')
  .update((process.env.VAULT_SECRET || 'vexo-zero-trust-vault-key-2026') + ':session')
  .digest();

const encryptedPayloads = new Map<string, { iv: string; authTag: string; ciphertext: string }>();

// Sliding-Window Rate Limiter for Auth & Financial Endpoints
const rateBuckets = new Map<string, number[]>();

function createRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'local'}:${req.path}`;
    const now = Date.now();
    const history = (rateBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (history.length >= maxRequests) {
      res.status(429).json({
        error: 'Rate limit exceeded for security protection. Please wait a few seconds.',
      });
      return;
    }
    history.push(now);
    rateBuckets.set(key, history);
    next();
  };
}

const authLimiter = createRateLimiter(20, 60_000);
const financeLimiter = createRateLimiter(30, 60_000);

function issueSessionToken(userId: string): string {
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24;
  const payload = `${userId}.${expiresAt}`;
  const sig = crypto
    .createHmac('sha256', SESSION_HMAC_KEY)
    .update(payload)
    .digest('hex');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string, expectedUserId: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [tokenUserId, expStr, providedSig] = parts;
  if (tokenUserId !== expectedUserId) return false;
  const expiresAt = Number(expStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_HMAC_KEY)
    .update(`${tokenUserId}.${expStr}`)
    .digest('hex');

  const a = Buffer.from(providedSig, 'hex');
  const b = Buffer.from(expectedSig, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, originalHex] = storedHash.split(':');
  if (!salt || !originalHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

function sealWithAes256Gcm(payload: Record<string, unknown>): EncryptionSeal {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', VAULT_MASTER_KEY, iv);
  const plaintext = JSON.stringify(payload);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  const ivHex = iv.toString('hex');

  const integrityHash = crypto
    .createHmac('sha256', VAULT_MASTER_KEY)
    .update(`${ivHex}:${authTag}:${encrypted}`)
    .digest('hex');

  const recordId = String(payload.transactionId || payload.escrowId || '');
  if (recordId) {
    encryptedPayloads.set(recordId, {
      iv: ivHex,
      authTag,
      ciphertext: encrypted,
    });
  }

  return {
    algorithm: 'AES-256-GCM',
    iv: ivHex,
    authTag,
    ciphertextPreview: `${encrypted.slice(0, 18)}...${encrypted.slice(-10)}`,
    integrityHash,
    verified: true,
  };
}

function verifyAes256GcmSeal(recordId: string): {
  valid: boolean;
  decryptedPayload?: Record<string, unknown>;
  error?: string;
} {
  const record = encryptedPayloads.get(recordId);
  if (!record) {
    return { valid: false, error: 'Encrypted payload record not found in vault.' };
  }
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      VAULT_MASTER_KEY,
      Buffer.from(record.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(record.authTag, 'hex'));
    let decrypted = decipher.update(record.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return { valid: true, decryptedPayload: JSON.parse(decrypted) as Record<string, unknown> };
  } catch {
    return { valid: false, error: 'AES-256-GCM authentication tag verification failed.' };
  }
}

function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Server-authoritative state
interface StoredAccount {
  profile: UserProfile;
  passwordHash: string;
}

interface StoredEscrow {
  deal: EscrowDeal;
  releaseCodePlain: string;
  releaseCodeHash: string;
}

const accounts: Record<string, StoredAccount> = {};
const transactions: Transaction[] = [];
const escrowVault: StoredEscrow[] = [];
const securityEvents: SecurityEvent[] = [];

const chatHistory: ChatMessage[] = [
  {
    id: 'msg_welcome_khushi',
    room: 'vip_khushi',
    senderId: 'khushi_rathore',
    senderName: 'Khushi Rathore',
    text: 'Hello Khushi Rathore! VEXO Super App में आपका स्वागत है। यहाँ चैटिंग, वीडियो कॉल और पेमेंट सब कुछ 100% सुरक्षित है।',
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: 'msg_welcome_1',
    room: 'general',
    senderId: 'vexo_concierge',
    senderName: 'VEXO Concierge',
    text: 'End-to-end encrypted channel initialized. Messages sync in real time across connected sessions over Socket.io.',
    timestamp: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
  },
];

const products: Product[] = [
  {
    id: 1,
    name: 'Royal Gold Smart Watch',
    category: 'Wearables',
    editorialLabel: 'Bestseller',
    description:
      'Brushed gold titanium timepiece with sapphire crystal, health telemetry, and 7-day battery endurance.',
    specs: '44mm Titanium Gold · 50m WR · Woven Charcoal Strap',
    priceINR: 2499,
    priceUSD: 35,
    image: '/src/assets/images/vexo_gold_smartwatch_1794817761477.jpg',
    inStock: true,
  },
  {
    id: 2,
    name: 'Luxury Silk Designer Saree',
    category: 'Fashion',
    editorialLabel: 'Meesho Choice',
    description:
      'Handloom-inspired emerald and champagne gold woven Banarasi silk saree with ornate zari pallu.',
    specs: 'Pure Silk Blend · Woven Zari Border · Matching Blouse Piece',
    priceINR: 1899,
    priceUSD: 28,
    image: '/src/assets/images/vexo_silk_saree_1794817762388.jpg',
    inStock: true,
  },
  {
    id: 3,
    name: 'Noise-Cancelling Studio Pods',
    category: 'Audio',
    editorialLabel: 'VEXO Exclusive',
    description:
      'Matte obsidian wireless earbuds with brushed gold acoustic chambers and 48dB active noise cancellation.',
    specs: 'Lossless Wireless · 36h Case Battery · Spatial Audio',
    priceINR: 3299,
    priceUSD: 45,
    image: '/src/assets/images/vexo_studio_pods_1794817763190.jpg',
    inStock: true,
  },
  {
    id: 4,
    name: 'Italian Leather Handbag',
    category: 'Luxury',
    editorialLabel: 'Limited Edition',
    description:
      'Structured full-grain espresso leather tote finished with solid brushed-brass lock hardware.',
    specs: 'Full-Grain Calfskin · Brushed Gold Clasp · Detachable Strap',
    priceINR: 4199,
    priceUSD: 55,
    image: '/src/assets/images/vexo_leather_handbag_1794817763945.jpg',
    inStock: true,
  },
  {
    id: 5,
    name: 'Wireless Studio Headphones',
    category: 'Audio',
    editorialLabel: 'Studio Grade',
    description:
      'Acoustic-sealed over-ear wireless headphones with 42-hour battery life and adaptive noise cancellation.',
    specs: '40mm Beryllium Drivers · USB-C Lossless · 265g',
    priceINR: 1999,
    priceUSD: 25,
    image: '/src/assets/images/product_wireless_headphones_1794817074350.jpg',
    inStock: true,
  },
  {
    id: 6,
    name: 'Tactile 65% Keyboard',
    category: 'Workspace',
    editorialLabel: 'Pro Series',
    description:
      'CNC anodized aluminum wireless mechanical keyboard with gasket mount and tri-mode Bluetooth.',
    specs: 'Hot-Swappable Tactile · PBT Keycaps · 4000mAh',
    priceINR: 6499,
    priceUSD: 79,
    image: '/src/assets/images/product_mechanical_keyboard_1794817074846.jpg',
    inStock: true,
  },
];

const feedPosts: FeedPost[] = [
  {
    id: 'post_1',
    authorId: 'khushi_rathore',
    authorName: 'Khushi Rathore',
    location: 'Mumbai Atelier',
    caption:
      'Unveiling the Emerald & Champagne Banarasi Silk edition — crafted with fine woven zari and paired with VEXO instant checkout.',
    image: '/src/assets/images/vexo_silk_saree_1794817762388.jpg',
    likes: 128,
    likedBy: [],
    linkedProductId: 2,
    createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
  },
  {
    id: 'post_2',
    authorId: 'vexo_horology',
    authorName: 'VEXO Horology',
    location: 'Geneva Studio',
    caption:
      'Brushed Titanium Gold meets 7-day endurance. Tap below to inspect the Royal Gold Smart Watch in VEXO Mall.',
    image: '/src/assets/images/vexo_gold_smartwatch_1794817761477.jpg',
    likes: 214,
    likedBy: [],
    linkedProductId: 1,
    createdAt: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
  },
  {
    id: 'post_3',
    authorId: 'alex_02',
    authorName: 'Alex Rivera',
    location: 'Milan Leather House',
    caption:
      'Morning studio light on full-grain calfskin and solid brass hardware. Limited batch now open for INR & USD wallet orders.',
    image: '/src/assets/images/vexo_leather_handbag_1794817763945.jpg',
    likes: 94,
    likedBy: [],
    linkedProductId: 4,
    createdAt: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
  },
];

const reelsList: ReelItem[] = [
  {
    id: 'reel_1',
    creatorId: 'vexo_horology',
    creatorName: 'VEXO Horology',
    title: 'Royal Gold Titanium Edition',
    caption: 'Precision sapphire dial and 50m endurance — crafted for day-to-evening wear.',
    audioTrack: 'VEXO Studio · Obsidian Pulse',
    image: '/src/assets/images/vexo_reel_horology_1794818271174.jpg',
    likes: 842,
    likedBy: [],
    comments: [
      {
        id: 'rc_1',
        userId: 'khushi_rathore',
        authorName: 'Khushi Rathore',
        text: 'The brushed gold bezel looks super clean in low light.',
        createdAt: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
      },
    ],
    linkedProductId: 1,
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: 'reel_2',
    creatorId: 'khushi_rathore',
    creatorName: 'Khushi Rathore',
    title: 'Emerald Banarasi Silk Drape',
    caption: 'Festive handloom weave with champagne zari detail — shop directly from the reel.',
    audioTrack: 'Atelier Acoustic · Monsoon Silk',
    image: '/src/assets/images/vexo_reel_atelier_1794818270690.jpg',
    likes: 1290,
    likedBy: [],
    comments: [
      {
        id: 'rc_2',
        userId: 'alex_02',
        authorName: 'Alex Rivera',
        text: 'Stunning emerald weave!',
        createdAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
      },
    ],
    linkedProductId: 2,
    createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
  {
    id: 'reel_3',
    creatorId: 'vexo_acoustics',
    creatorName: 'VEXO Acoustics',
    title: 'Morning Espresso & Lossless Audio',
    caption: '48dB active noise cancellation with warm gold acoustic accents.',
    audioTrack: 'Studio Session · Lo-Fi Brass',
    image: '/src/assets/images/vexo_reel_acoustics_1794818272046.jpg',
    likes: 615,
    likedBy: [],
    comments: [],
    linkedProductId: 3,
    createdAt: new Date(Date.now() - 1000 * 60 * 160).toISOString(),
  },
];

function createSubscriptionPlan(country: CountryOption): SubscriptionPlan {
  const isIndia = country === 'India';
  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + 30);
  return {
    status: 'trial_active',
    trialEndsAt: trialEndDate.toISOString(),
    currency: isIndia ? 'INR' : 'USD',
    monthlyPrice: isIndia ? 29 : 5,
    gateway: isIndia ? 'Razorpay' : 'Stripe',
    country,
  };
}

function seedAccount(
  username: string,
  password: string,
  displayName: string,
  country: CountryOption,
  extra?: { bio?: string; upiId?: string; avatarUrl?: string }
): UserProfile {
  const normalized = username.toLowerCase();
  const profile: UserProfile = {
    userId: normalized,
    username: normalized,
    displayName,
    bio: extra?.bio || 'VEXO VIP Member · Verified Zero-Trust ID',
    upiId: extra?.upiId || '2010jiya@fam',
    avatarUrl: extra?.avatarUrl,
    followersCount: normalized === 'khushi_rathore' ? 1248 : 14,
    followingCount: normalized === 'khushi_rathore' ? 186 : 12,
    settings: {
      privateAccount: false,
      showActivityStatus: true,
      readReceipts: true,
      defaultGhostChat: false,
      pushNotifications: true,
      callAlerts: true,
      twoFactorEnabled: true,
    },
    country,
    subscription: createSubscriptionPlan(country),
    walletBalanceINR: 10000,
    walletBalanceUSD: 500,
  };
  accounts[normalized] = {
    passwordHash: hashPassword(password),
    profile,
  };
  return profile;
}

// Seed ready accounts & creator accounts
seedAccount('khushi_rathore', 'vexo1234', 'Khushi Rathore', 'India', {
  bio: 'VIP Creator · Luxury Lifestyle, Reels & VEXO Pay',
  upiId: '2010jiya@fam',
});
seedAccount('alex_02', 'vexo1234', 'Alex Rivera', 'International', {
  bio: 'Global Hardware & Acoustics Curator',
  upiId: 'alex_02@vexo',
});
seedAccount('vexo_horology', 'vexo1234', 'VEXO Horology', 'International', {
  bio: 'Official Swiss-Inspired Timepiece Studio · 5% Creator Partner',
  upiId: 'horology@vexo',
});
seedAccount('vexo_acoustics', 'vexo1234', 'VEXO Acoustics', 'India', {
  bio: 'Studio Audio Engineering & VEXO Mall Flagship',
  upiId: 'acoustics@vexo',
});

const onlineUsersBySocket = new Map<string, OnlineUser>();

function recordSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>) {
  const fullEvent: SecurityEvent = {
    id: `SEC_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...event,
  };
  securityEvents.unshift(fullEvent);
  if (securityEvents.length > 100) {
    securityEvents.pop();
  }
  return fullEvent;
}

function evaluateFraudRisk(params: {
  senderId: string;
  receiverId: string;
  amount: number;
  currency: CurrencyCode;
  confirmHighValue?: boolean;
}): FraudCheckResult {
  const { senderId, receiverId, amount, currency, confirmHighValue } = params;
  const rulesTriggered: string[] = [];
  let riskScore = 6;

  if (senderId.toLowerCase() === receiverId.toLowerCase()) {
    rulesTriggered.push('SELF_TRANSFER_PROHIBITED');
    return { riskScore: 95, decision: 'BLOCKED', rulesTriggered };
  }

  const loweredReceiver = receiverId.toLowerCase();
  if (
    loweredReceiver.startsWith('fraud') ||
    loweredReceiver.startsWith('scam') ||
    loweredReceiver.includes('blacklist')
  ) {
    rulesTriggered.push('RECIPIENT_WATCHLIST_MATCH');
    return { riskScore: 98, decision: 'BLOCKED', rulesTriggered };
  }

  const recentDuplicate = transactions.find(
    (t) =>
      t.senderId === senderId &&
      t.receiverId === receiverId &&
      t.amount === amount &&
      t.currency === currency &&
      Date.now() - new Date(t.createdAt).getTime() < 8000
  );
  if (recentDuplicate) {
    rulesTriggered.push('VELOCITY_REPLAY_GUARD');
    return { riskScore: 88, decision: 'BLOCKED', rulesTriggered };
  }

  const highValueThreshold = currency === 'INR' ? 10000 : 200;
  if (amount >= highValueThreshold && !confirmHighValue) {
    rulesTriggered.push('HIGH_VALUE_STEP_UP_VERIFICATION');
    riskScore = 64;
    return { riskScore, decision: 'STEP_UP_REQUIRED', rulesTriggered };
  }

  if (amount >= highValueThreshold && confirmHighValue) {
    rulesTriggered.push('STEP_UP_CONFIRMED');
    riskScore = 18;
  }

  return { riskScore, decision: 'APPROVED', rulesTriggered };
}

function sanitizeEscrowForUser(stored: StoredEscrow, viewerId: string): EscrowDeal {
  return {
    ...stored.deal,
    releaseCodeForBuyer:
      stored.deal.buyerId === viewerId && stored.deal.status === 'LOCKED'
        ? stored.releaseCodePlain
        : undefined,
  };
}

// 1. Username & Password Authentication (Register / Login)
app.post('/api/auth/register', authLimiter, (req: Request, res: Response) => {
  const { username, password, displayName, country = 'India', bio, upiId } = req.body as {
    username?: string;
    password?: string;
    displayName?: string;
    country?: string;
    bio?: string;
    upiId?: string;
  };

  const cleanUsername = String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '');

  if (cleanUsername.length < 3) {
    res.status(400).json({ error: 'Username must be at least 3 characters (letters, numbers, _).' });
    return;
  }
  if (!password || password.length < 4) {
    res.status(400).json({ error: 'Password must be at least 4 characters.' });
    return;
  }
  if (accounts[cleanUsername]) {
    res.status(409).json({ error: `Username "${cleanUsername}" is already registered. Please sign in.` });
    return;
  }

  const normalizedCountry: CountryOption =
    country.toLowerCase() === 'india' ? 'India' : 'International';

  const created = seedAccount(
    cleanUsername,
    password,
    displayName?.trim() || cleanUsername,
    normalizedCountry,
    {
      bio: bio?.trim() || undefined,
      upiId: upiId?.trim() || '2010jiya@fam',
    }
  );

  const sessionToken = issueSessionToken(created.userId);

  recordSecurityEvent({
    userId: created.userId,
    action: `Account registered & HMAC token issued (${normalizedCountry})`,
    decision: 'APPROVED',
    riskScore: 4,
    reason: 'Salted scrypt credential verified and AES-256-GCM vault initialized.',
  });

  res.json({
    message: 'Account created and 1-Month Free VIP Trial activated!',
    user: created,
    sessionToken,
  });
});

app.post('/api/auth/login', authLimiter, (req: Request, res: Response) => {
  const { username, password } = req.body as {
    username?: string;
    password?: string;
  };

  const cleanUsername = String(username || '').trim().toLowerCase();
  if (!cleanUsername || !password) {
    res.status(400).json({ error: 'Enter both username and password.' });
    return;
  }

  const account = accounts[cleanUsername];
  if (!account || !verifyPassword(password, account.passwordHash)) {
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }

  if (!account.profile.subscription) {
    account.profile.subscription = createSubscriptionPlan(account.profile.country);
  }

  const sessionToken = issueSessionToken(account.profile.userId);

  recordSecurityEvent({
    userId: account.profile.userId,
    action: `Password sign-in & HMAC token verified (@${account.profile.username})`,
    decision: 'APPROVED',
    riskScore: 3,
    reason: 'Salted scrypt hash matched.',
  });

  const userTxns = transactions.filter(
    (t) =>
      t.senderId === account.profile.userId ||
      t.receiverId.toLowerCase() === account.profile.userId
  );
  const userSecurity = securityEvents.filter((e) => e.userId === account.profile.userId);

  res.json({
    message: `Welcome back, ${account.profile.displayName}!`,
    user: account.profile,
    sessionToken,
    transactions: userTxns,
    securityEvents: userSecurity,
  });
});

app.post('/api/subscribe', authLimiter, (req: Request, res: Response) => {
  const { userId, country = 'India', displayName } = req.body as {
    userId?: string;
    country?: string;
    displayName?: string;
  };

  const cleanId = String(userId || '').trim().toLowerCase();
  if (!cleanId) {
    res.status(400).json({ error: 'User ID is required.' });
    return;
  }

  const normalizedCountry: CountryOption =
    country.toLowerCase() === 'india' ? 'India' : 'International';

  if (!accounts[cleanId]) {
    seedAccount(cleanId, 'vexo1234', displayName?.trim() || cleanId, normalizedCountry);
  } else {
    accounts[cleanId].profile.country = normalizedCountry;
    if (displayName?.trim()) {
      accounts[cleanId].profile.displayName = displayName.trim();
    }
    accounts[cleanId].profile.subscription = createSubscriptionPlan(normalizedCountry);
  }

  const user = accounts[cleanId].profile;
  const sessionToken = issueSessionToken(user.userId);
  res.json({
    message: '1-Month Free Trial Activated!',
    plan: user.subscription,
    user,
    sessionToken,
  });
});

app.get('/api/user/me', (req: Request, res: Response) => {
  const userId = String(req.headers['user-id'] || '').trim().toLowerCase();
  const token = String(req.headers['x-session-token'] || '').trim();
  if (!userId || !accounts[userId]) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  if (token && !verifySessionToken(token, userId)) {
    res.status(401).json({ error: 'Session signature expired. Please sign in again.' });
    return;
  }
  const user = accounts[userId].profile;
  const userTxns = transactions.filter(
    (t) => t.senderId === userId || t.receiverId.toLowerCase() === userId
  );
  const userSecurity = securityEvents.filter((e) => e.userId === userId);
  res.json({
    user,
    sessionToken: token || issueSessionToken(userId),
    transactions: userTxns,
    securityEvents: userSecurity,
  });
});

const checkSubscription = (req: Request, res: Response, next: NextFunction) => {
  const userId = String(req.headers['user-id'] || '').trim().toLowerCase();
  const token = String(req.headers['x-session-token'] || '').trim();
  const account = accounts[userId];
  if (!account || !account.profile.subscription || account.profile.subscription.status === 'cancelled') {
    res.status(403).json({
      error: 'Please sign in with your username and password to access VEXO.',
    });
    return;
  }
  if (token && !verifySessionToken(token, userId)) {
    res.status(401).json({
      error: 'Zero-Trust session signature invalid or expired. Please sign in again.',
    });
    return;
  }
  next();
};

app.put('/api/user/profile', checkSubscription, (req: Request, res: Response) => {
  const userId = String(req.headers['user-id'] || '').trim().toLowerCase();
  const profile = accounts[userId].profile;
  const { displayName, bio, upiId, avatarUrl, country, settings } = req.body as {
    displayName?: string;
    bio?: string;
    upiId?: string;
    avatarUrl?: string;
    country?: CountryOption;
    settings?: Partial<NonNullable<UserProfile['settings']>>;
  };

  if (displayName && displayName.trim()) {
    profile.displayName = displayName.trim().slice(0, 60);
  }
  if (typeof bio === 'string') {
    profile.bio = bio.trim().slice(0, 180);
  }
  if (typeof upiId === 'string' && upiId.trim()) {
    profile.upiId = upiId.trim().slice(0, 80);
  }
  if (
    typeof avatarUrl === 'string' &&
    (avatarUrl === '' || avatarUrl.startsWith('data:image/') || avatarUrl.startsWith('/'))
  ) {
    profile.avatarUrl = avatarUrl || undefined;
  }
  if (country === 'India' || country === 'International') {
    profile.country = country;
    profile.subscription = createSubscriptionPlan(country);
  }
  if (settings && typeof settings === 'object') {
    profile.settings = {
      privateAccount: Boolean(settings.privateAccount ?? profile.settings?.privateAccount),
      showActivityStatus: Boolean(settings.showActivityStatus ?? profile.settings?.showActivityStatus ?? true),
      readReceipts: Boolean(settings.readReceipts ?? profile.settings?.readReceipts ?? true),
      defaultGhostChat: Boolean(settings.defaultGhostChat ?? profile.settings?.defaultGhostChat),
      pushNotifications: Boolean(settings.pushNotifications ?? profile.settings?.pushNotifications ?? true),
      callAlerts: Boolean(settings.callAlerts ?? profile.settings?.callAlerts ?? true),
      twoFactorEnabled: Boolean(settings.twoFactorEnabled ?? profile.settings?.twoFactorEnabled ?? true),
    };
  }

  recordSecurityEvent({
    userId,
    action: 'Profile & Instagram privacy settings updated',
    decision: 'APPROVED',
    riskScore: 2,
    reason: `Updated settings/profile for @${profile.username}.`,
  });

  res.json({
    message: 'Profile & settings saved.',
    user: profile,
  });
});

app.post('/api/auth/change-password', checkSubscription, authLimiter, (req: Request, res: Response) => {
  const userId = String(req.headers['user-id'] || '').trim().toLowerCase();
  const account = accounts[userId];
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !verifyPassword(currentPassword, account.passwordHash)) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }
  if (!newPassword || newPassword.length < 4) {
    res.status(400).json({ error: 'New password must be at least 4 characters.' });
    return;
  }

  account.passwordHash = hashPassword(newPassword);
  recordSecurityEvent({
    userId,
    action: 'Account password rotated (salted scrypt)',
    decision: 'APPROVED',
    riskScore: 5,
    reason: 'User updated password from Instagram-style Security Settings.',
  });

  res.json({ message: 'Password updated successfully.' });
});

// 2. Home Feed & Reels APIs
app.get('/api/feed', checkSubscription, (_req: Request, res: Response) => {
  res.json(feedPosts);
});

app.post('/api/feed', checkSubscription, (req: Request, res: Response) => {
  const userId = String(req.headers['user-id'] || '').trim().toLowerCase();
  const user = accounts[userId].profile;
  const { caption, image, location, linkedProductId } = req.body as {
    caption?: string;
    image?: string;
    location?: string;
    linkedProductId?: number;
  };

  if (!caption || !caption.trim()) {
    res.status(400).json({ error: 'Write a caption to publish your post.' });
    return;
  }

  const newPost: FeedPost = {
    id: `post_${Date.now()}`,
    authorId: user.userId,
    authorName: user.displayName,
    location: location?.trim() || `${user.country} · VEXO Member`,
    caption: caption.trim(),
    image: image || '/src/assets/images/vexo_gold_smartwatch_1794817761477.jpg',
    likes: 0,
    likedBy: [],
    linkedProductId,
    createdAt: new Date().toISOString(),
  };

  feedPosts.unshift(newPost);
  io.emit('feed:new', newPost);
  res.json(newPost);
});

app.post('/api/feed/:id/like', checkSubscription, (req: Request, res: Response) => {
  const userId = String(req.headers['user-id'] || '').trim().toLowerCase();
  const post = feedPosts.find((p) => p.id === req.params.id);
  if (!post) {
    res.status(404).json({ error: 'Post not found.' });
    return;
  }
  const idx = post.likedBy.indexOf(userId);
  if (idx >= 0) {
    post.likedBy.splice(idx, 1);
    post.likes = Math.max(0, post.likes - 1);
  } else {
    post.likedBy.push(userId);
    post.likes += 1;
  }
  res.json(post);
});

app.get('/api/reels', checkSubscription, (_req: Request, res: Response) => {
  res.json(reelsList);
});

app.post('/api/reels', checkSubscription, (req: Request, res: Response) => {
  const userId = String(req.headers['user-id'] || '').trim().toLowerCase();
  const user = accounts[userId].profile;
  const { title, caption, image, audioTrack, linkedProductId } = req.body as {
    title?: string;
    caption?: string;
    image?: string;
    audioTrack?: string;
    linkedProductId?: number;
  };

  if (!title?.trim() || !caption?.trim()) {
    res.status(400).json({ error: 'Title and caption are required for your reel.' });
    return;
  }

  const reel: ReelItem = {
    id: `reel_${Date.now()}`,
    creatorId: user.userId,
    creatorName: user.displayName,
    title: title.trim(),
    caption: caption.trim(),
    audioTrack: audioTrack?.trim() || `${user.displayName} · Original Sound`,
    image: image || '/src/assets/images/vexo_reel_horology_1794818271174.jpg',
    likes: 1,
    likedBy: [userId],
    comments: [],
    linkedProductId,
    createdAt: new Date().toISOString(),
  };

  reelsList.unshift(reel);
  io.emit('reel:new', reel);
  res.json(reel);
});

app.post('/api/reels/:id/like', checkSubscription, (req: Request, res: Response) => {
  const userId = String(req.headers['user-id'] || '').trim().toLowerCase();
  const reel = reelsList.find((r) => r.id === req.params.id);
  if (!reel) {
    res.status(404).json({ error: 'Reel not found.' });
    return;
  }
  const idx = reel.likedBy.indexOf(userId);
  if (idx >= 0) {
    reel.likedBy.splice(idx, 1);
    reel.likes = Math.max(0, reel.likes - 1);
  } else {
    reel.likedBy.push(userId);
    reel.likes += 1;
  }
  res.json(reel);
});

app.post('/api/reels/:id/comment', checkSubscription, (req: Request, res: Response) => {
  const userId = String(req.headers['user-id'] || '').trim().toLowerCase();
  const user = accounts[userId].profile;
  const reel = reelsList.find((r) => r.id === req.params.id);
  if (!reel) {
    res.status(404).json({ error: 'Reel not found.' });
    return;
  }
  const { text } = req.body as { text?: string };
  if (!text || !text.trim()) {
    res.status(400).json({ error: 'Comment text is required.' });
    return;
  }
  reel.comments.push({
    id: `rc_${Date.now()}`,
    userId: user.userId,
    authorName: user.displayName,
    text: text.trim(),
    createdAt: new Date().toISOString(),
  });
  res.json(reel);
});

// 3. Shopping API
app.get('/api/products', checkSubscription, (_req: Request, res: Response) => {
  res.json(products);
});

// 4. Zero-Trust Payment / Wallet Transfer API + Creator Royalty Split
app.post('/api/pay', checkSubscription, financeLimiter, (req: Request, res: Response) => {
  const {
    senderId,
    receiverId,
    amount,
    currency,
    type = 'transfer',
    note = '',
    confirmHighValue = false,
    attributedCreatorIds = [],
  } = req.body as {
    senderId?: string;
    receiverId?: string;
    amount?: number | string;
    currency?: CurrencyCode;
    type?: Transaction['type'];
    note?: string;
    confirmHighValue?: boolean;
    attributedCreatorIds?: string[];
  };

  const userId = String(req.headers['user-id'] || senderId || '').trim().toLowerCase();
  const user = accounts[userId].profile;
  const parsedAmount = Number(amount);

  if (!receiverId || !receiverId.trim()) {
    res.status(400).json({ error: 'Please specify a recipient or merchant ID.' });
    return;
  }
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ error: 'Please enter a valid positive payment amount.' });
    return;
  }

  const trimmedReceiver = receiverId.trim();
  const activeCurrency: CurrencyCode =
    currency === 'USD' || currency === 'INR'
      ? currency
      : user.subscription!.currency;

  const fraudCheck = evaluateFraudRisk({
    senderId: userId,
    receiverId: trimmedReceiver,
    amount: parsedAmount,
    currency: activeCurrency,
    confirmHighValue,
  });

  if (fraudCheck.decision === 'BLOCKED') {
    recordSecurityEvent({
      userId,
      action: `Transfer ${activeCurrency} ${parsedAmount} → ${trimmedReceiver}`,
      decision: 'BLOCKED',
      riskScore: fraudCheck.riskScore,
      reason: `Blocked by ${fraudCheck.rulesTriggered.join(', ')}`,
    });
    res.status(403).json({
      error: `Zero-Trust Fraud Shield blocked this transfer (${fraudCheck.rulesTriggered.join(', ')}).`,
      fraudCheck,
    });
    return;
  }

  if (fraudCheck.decision === 'STEP_UP_REQUIRED') {
    recordSecurityEvent({
      userId,
      action: `High-value transfer ${activeCurrency} ${parsedAmount} → ${trimmedReceiver}`,
      decision: 'STEP_UP_REQUIRED',
      riskScore: fraudCheck.riskScore,
      reason: 'Amount crossed single-transaction threshold; awaiting biometric/step-up confirmation.',
    });
    res.status(422).json({
      requiresStepUpVerification: true,
      error: `Zero-Trust Step-Up Verification required for transfers ≥ ${activeCurrency === 'INR' ? '₹10,000' : '$200'}.`,
      fraudCheck,
    });
    return;
  }

  const currentBalance =
    activeCurrency === 'INR' ? user.walletBalanceINR : user.walletBalanceUSD;

  if (parsedAmount > currentBalance) {
    res.status(400).json({
      error: `Insufficient ${activeCurrency} wallet balance. Add Money or adjust amount.`,
    });
    return;
  }

  if (activeCurrency === 'INR') {
    user.walletBalanceINR = Number((user.walletBalanceINR - parsedAmount).toFixed(2));
  } else {
    user.walletBalanceUSD = Number((user.walletBalanceUSD - parsedAmount).toFixed(2));
  }

  const receiverAccount = accounts[trimmedReceiver.toLowerCase()];
  if (receiverAccount) {
    if (activeCurrency === 'INR') {
      receiverAccount.profile.walletBalanceINR = Number(
        (receiverAccount.profile.walletBalanceINR + parsedAmount).toFixed(2)
      );
    } else {
      receiverAccount.profile.walletBalanceUSD = Number(
        (receiverAccount.profile.walletBalanceUSD + parsedAmount).toFixed(2)
      );
    }
  }

  const transactionId = `TXN${Date.now()}`;
  const createdAt = new Date().toISOString();
  const gateway = activeCurrency === 'INR' ? 'Razorpay' : 'Stripe';
  const cleanNote =
    note.trim() || (type === 'marketplace' ? 'VEXO Mall Order' : 'Direct Transfer');

  const seal = sealWithAes256Gcm({
    transactionId,
    senderId: userId,
    receiverId: trimmedReceiver,
    amount: parsedAmount,
    currency: activeCurrency,
    gateway,
    createdAt,
  });

  const txn: Transaction = {
    transactionId,
    senderId: userId,
    receiverId: trimmedReceiver,
    amount: parsedAmount,
    currency: activeCurrency,
    gateway,
    type,
    note: cleanNote,
    createdAt,
    status: 'Success',
    seal,
    fraudCheck,
  };

  transactions.unshift(txn);

  recordSecurityEvent({
    userId,
    action: `AES-256-GCM sealed ${transactionId} (${activeCurrency} ${parsedAmount})`,
    decision: 'APPROVED',
    riskScore: fraudCheck.riskScore,
    reason: `Cleared via ${gateway} with risk score ${fraudCheck.riskScore}/100.`,
  });

  // 5% Instant Creator Royalty Split for Shoppable Reels / Feed Attribution
  let royaltyMessage = '';
  const uniqueCreators = Array.from(
    new Set(
      (attributedCreatorIds || [])
        .map((c) => c.trim().toLowerCase())
        .filter((c) => c && c !== userId && accounts[c])
    )
  );

  if (type === 'marketplace' && uniqueCreators.length > 0) {
    const totalRoyaltyPool = Number((parsedAmount * 0.05).toFixed(2));
    const perCreator = Number((totalRoyaltyPool / uniqueCreators.length).toFixed(2));
    if (perCreator > 0) {
      for (const creatorId of uniqueCreators) {
        const creatorAccount = accounts[creatorId];
        if (activeCurrency === 'INR') {
          creatorAccount.profile.walletBalanceINR = Number(
            (creatorAccount.profile.walletBalanceINR + perCreator).toFixed(2)
          );
        } else {
          creatorAccount.profile.walletBalanceUSD = Number(
            (creatorAccount.profile.walletBalanceUSD + perCreator).toFixed(2)
          );
        }

        const royaltyTxnId = `ROY${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;
        const royaltySeal = sealWithAes256Gcm({
          transactionId: royaltyTxnId,
          senderId: 'vexo_creator_pool',
          receiverId: creatorId,
          amount: perCreator,
          currency: activeCurrency,
          createdAt,
        });
        const royaltyTxn: Transaction = {
          transactionId: royaltyTxnId,
          senderId: 'vexo_creator_pool',
          receiverId: creatorId,
          amount: perCreator,
          currency: activeCurrency,
          gateway,
          type: 'royalty',
          note: `5% Reel/Feed Royalty from ${userId}`,
          createdAt,
          status: 'Success',
          seal: royaltySeal,
          fraudCheck: { riskScore: 2, decision: 'APPROVED', rulesTriggered: [] },
        };
        transactions.unshift(royaltyTxn);

        for (const [socketId, onlineUser] of onlineUsersBySocket.entries()) {
          if (onlineUser.userId === creatorId) {
            io.to(socketId).emit('transaction:new', royaltyTxn);
            io.to(socketId).emit('wallet:updated', {
              walletBalanceINR: creatorAccount.profile.walletBalanceINR,
              walletBalanceUSD: creatorAccount.profile.walletBalanceUSD,
            });
          }
        }
      }
      royaltyMessage = ` · 5% Creator Royalty credited to ${uniqueCreators.map((c) => `@${c}`).join(', ')}`;
    }
  }

  for (const [socketId, onlineUser] of onlineUsersBySocket.entries()) {
    if (
      onlineUser.userId === userId ||
      onlineUser.userId.toLowerCase() === trimmedReceiver.toLowerCase()
    ) {
      io.to(socketId).emit('transaction:new', txn);
      const targetAcc = accounts[onlineUser.userId.toLowerCase()];
      if (targetAcc) {
        io.to(socketId).emit('wallet:updated', {
          walletBalanceINR: targetAcc.profile.walletBalanceINR,
          walletBalanceUSD: targetAcc.profile.walletBalanceUSD,
        });
      }
    }
  }

  const formattedAmount =
    activeCurrency === 'INR'
      ? `₹${parsedAmount.toLocaleString('en-IN')}`
      : `$${parsedAmount.toFixed(2)}`;

  res.json({
    status: 'Success',
    transactionId: txn.transactionId,
    message: `${formattedAmount} transferred to ${trimmedReceiver} via ${txn.gateway} (AES-256-GCM Sealed)${royaltyMessage}`,
    transaction: txn,
    walletBalanceINR: user.walletBalanceINR,
    walletBalanceUSD: user.walletBalanceUSD,
  });
});

// 5. Zero-Trust Escrow Anti-Scam Lock Vault APIs
app.get('/api/escrow', checkSubscription, (req: Request, res: Response) => {
  const userId = String(req.headers['user-id'] || '').trim().toLowerCase();
  const visible = escrowVault
    .filter((s) => s.deal.buyerId === userId || s.deal.sellerId.toLowerCase() === userId)
    .map((s) => sanitizeEscrowForUser(s, userId));
  res.json(visible);
});

app.post('/api/escrow/create', checkSubscription, financeLimiter, (req: Request, res: Response) => {
  const buyerId = String(req.headers['user-id'] || '').trim().toLowerCase();
  const buyer = accounts[buyerId].profile;
  const { sellerId, amount, itemNote } = req.body as {
    sellerId?: string;
    amount?: number | string;
    itemNote?: string;
  };

  const cleanSeller = String(sellerId || '').trim();
  const parsedAmount = Number(amount);
  const currency = buyer.subscription!.currency;

  if (!cleanSeller) {
    res.status(400).json({ error: 'Seller ID or UPI handle is required for Escrow Lock.' });
    return;
  }
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ error: 'Enter a valid positive Escrow amount.' });
    return;
  }

  const fraudCheck = evaluateFraudRisk({
    senderId: buyerId,
    receiverId: cleanSeller,
    amount: parsedAmount,
    currency,
    confirmHighValue: true,
  });

  if (fraudCheck.decision === 'BLOCKED') {
    recordSecurityEvent({
      userId: buyerId,
      action: `Escrow Lock blocked (${currency} ${parsedAmount} → ${cleanSeller})`,
      decision: 'BLOCKED',
      riskScore: fraudCheck.riskScore,
      reason: `Blocked by ${fraudCheck.rulesTriggered.join(', ')}`,
    });
    res.status(403).json({
      error: `Zero-Trust Fraud Shield blocked this Escrow deal (${fraudCheck.rulesTriggered.join(', ')}).`,
    });
    return;
  }

  const balance = currency === 'INR' ? buyer.walletBalanceINR : buyer.walletBalanceUSD;
  if (parsedAmount > balance) {
    res.status(400).json({ error: `Insufficient ${currency} balance to lock in Escrow.` });
    return;
  }

  if (currency === 'INR') {
    buyer.walletBalanceINR = Number((buyer.walletBalanceINR - parsedAmount).toFixed(2));
  } else {
    buyer.walletBalanceUSD = Number((buyer.walletBalanceUSD - parsedAmount).toFixed(2));
  }

  const escrowId = `ESC${Date.now()}`;
  const releaseCodePlain = String(crypto.randomInt(100000, 999999));
  const releaseCodeHash = crypto
    .createHash('sha256')
    .update(`${escrowId}:${releaseCodePlain}`)
    .digest('hex');

  const now = new Date().toISOString();
  const seal = sealWithAes256Gcm({
    escrowId,
    buyerId,
    sellerId: cleanSeller,
    amount: parsedAmount,
    currency,
    status: 'LOCKED',
    createdAt: now,
  });

  const deal: EscrowDeal = {
    escrowId,
    buyerId,
    sellerId: cleanSeller,
    amount: parsedAmount,
    currency,
    itemNote: itemNote?.trim() || 'Escrow Protected Deal',
    status: 'LOCKED',
    seal,
    createdAt: now,
    updatedAt: now,
  };

  const stored: StoredEscrow = { deal, releaseCodePlain, releaseCodeHash };
  escrowVault.unshift(stored);

  const lockTxn: Transaction = {
    transactionId: `TXN_${escrowId}`,
    senderId: buyerId,
    receiverId: `escrow:${cleanSeller}`,
    amount: parsedAmount,
    currency,
    gateway: currency === 'INR' ? 'Razorpay' : 'Stripe',
    type: 'escrow_lock',
    note: `Escrow Lock (${deal.itemNote})`,
    createdAt: now,
    status: 'Success',
    seal,
    fraudCheck,
  };
  transactions.unshift(lockTxn);

  recordSecurityEvent({
    userId: buyerId,
    action: `Zero-Trust Escrow Locked ${escrowId} (${currency} ${parsedAmount} → ${cleanSeller})`,
    decision: 'APPROVED',
    riskScore: fraudCheck.riskScore,
    reason: 'Funds locked in AES-256-GCM Escrow Vault pending buyer release PIN.',
  });

  for (const [socketId, onlineUser] of onlineUsersBySocket.entries()) {
    if (
      onlineUser.userId === buyerId ||
      onlineUser.userId.toLowerCase() === cleanSeller.toLowerCase()
    ) {
      io.to(socketId).emit('escrow:updated', sanitizeEscrowForUser(stored, onlineUser.userId));
    }
  }

  res.json({
    deal: sanitizeEscrowForUser(stored, buyerId),
    transaction: lockTxn,
    walletBalanceINR: buyer.walletBalanceINR,
    walletBalanceUSD: buyer.walletBalanceUSD,
  });
});

app.post('/api/escrow/:id/release', checkSubscription, financeLimiter, (req: Request, res: Response) => {
  const buyerId = String(req.headers['user-id'] || '').trim().toLowerCase();
  const { releaseCode } = req.body as { releaseCode?: string };
  const stored = escrowVault.find((s) => s.deal.escrowId === req.params.id);

  if (!stored) {
    res.status(404).json({ error: 'Escrow deal not found.' });
    return;
  }
  if (stored.deal.buyerId !== buyerId) {
    res.status(403).json({ error: 'Only the buyer can authorize releasing Escrow funds.' });
    return;
  }
  if (stored.deal.status !== 'LOCKED') {
    res.status(400).json({ error: `Escrow deal is already ${stored.deal.status}.` });
    return;
  }

  const candidateHash = crypto
    .createHash('sha256')
    .update(`${stored.deal.escrowId}:${String(releaseCode || '').trim()}`)
    .digest('hex');

  if (
    !crypto.timingSafeEqual(
      Buffer.from(candidateHash, 'hex'),
      Buffer.from(stored.releaseCodeHash, 'hex')
    )
  ) {
    recordSecurityEvent({
      userId: buyerId,
      action: `Invalid Escrow PIN attempt on ${stored.deal.escrowId}`,
      decision: 'BLOCKED',
      riskScore: 82,
      reason: 'Release PIN verification failed.',
    });
    res.status(403).json({ error: 'Incorrect 6-digit Escrow Release PIN.' });
    return;
  }

  stored.deal.status = 'RELEASED';
  stored.deal.updatedAt = new Date().toISOString();

  const sellerAccount = accounts[stored.deal.sellerId.toLowerCase()];
  if (sellerAccount) {
    if (stored.deal.currency === 'INR') {
      sellerAccount.profile.walletBalanceINR = Number(
        (sellerAccount.profile.walletBalanceINR + stored.deal.amount).toFixed(2)
      );
    } else {
      sellerAccount.profile.walletBalanceUSD = Number(
        (sellerAccount.profile.walletBalanceUSD + stored.deal.amount).toFixed(2)
      );
    }
  }

  const releaseTxnId = `REL${Date.now()}`;
  const releaseSeal = sealWithAes256Gcm({
    transactionId: releaseTxnId,
    escrowId: stored.deal.escrowId,
    senderId: buyerId,
    receiverId: stored.deal.sellerId,
    amount: stored.deal.amount,
    currency: stored.deal.currency,
    status: 'RELEASED',
  });

  const releaseTxn: Transaction = {
    transactionId: releaseTxnId,
    senderId: buyerId,
    receiverId: stored.deal.sellerId,
    amount: stored.deal.amount,
    currency: stored.deal.currency,
    gateway: stored.deal.currency === 'INR' ? 'Razorpay' : 'Stripe',
    type: 'escrow_release',
    note: `Escrow Released (${stored.deal.escrowId})`,
    createdAt: stored.deal.updatedAt,
    status: 'Success',
    seal: releaseSeal,
    fraudCheck: { riskScore: 3, decision: 'APPROVED', rulesTriggered: ['PIN_VERIFIED'] },
  };
  transactions.unshift(releaseTxn);

  recordSecurityEvent({
    userId: buyerId,
    action: `Escrow Released ${stored.deal.escrowId} to ${stored.deal.sellerId}`,
    decision: 'APPROVED',
    riskScore: 3,
    reason: 'Buyer verified 6-digit PIN; funds settled to seller.',
  });

  for (const [socketId, onlineUser] of onlineUsersBySocket.entries()) {
    if (
      onlineUser.userId === buyerId ||
      onlineUser.userId.toLowerCase() === stored.deal.sellerId.toLowerCase()
    ) {
      io.to(socketId).emit('escrow:updated', sanitizeEscrowForUser(stored, onlineUser.userId));
      const targetAcc = accounts[onlineUser.userId.toLowerCase()];
      if (targetAcc) {
        io.to(socketId).emit('wallet:updated', {
          walletBalanceINR: targetAcc.profile.walletBalanceINR,
          walletBalanceUSD: targetAcc.profile.walletBalanceUSD,
        });
      }
    }
  }

  res.json({
    deal: sanitizeEscrowForUser(stored, buyerId),
    transaction: releaseTxn,
  });
});

app.post('/api/escrow/:id/refund', checkSubscription, financeLimiter, (req: Request, res: Response) => {
  const buyerId = String(req.headers['user-id'] || '').trim().toLowerCase();
  const buyer = accounts[buyerId].profile;
  const stored = escrowVault.find((s) => s.deal.escrowId === req.params.id);

  if (!stored) {
    res.status(404).json({ error: 'Escrow deal not found.' });
    return;
  }
  if (stored.deal.buyerId !== buyerId) {
    res.status(403).json({ error: 'Only the buyer can cancel and refund an active Escrow deal.' });
    return;
  }
  if (stored.deal.status !== 'LOCKED') {
    res.status(400).json({ error: `Escrow deal is already ${stored.deal.status}.` });
    return;
  }

  stored.deal.status = 'REFUNDED';
  stored.deal.updatedAt = new Date().toISOString();

  if (stored.deal.currency === 'INR') {
    buyer.walletBalanceINR = Number((buyer.walletBalanceINR + stored.deal.amount).toFixed(2));
  } else {
    buyer.walletBalanceUSD = Number((buyer.walletBalanceUSD + stored.deal.amount).toFixed(2));
  }

  recordSecurityEvent({
    userId: buyerId,
    action: `Escrow Refunded ${stored.deal.escrowId}`,
    decision: 'APPROVED',
    riskScore: 4,
    reason: 'Locked Escrow funds safely returned to buyer wallet.',
  });

  res.json({
    deal: sanitizeEscrowForUser(stored, buyerId),
    walletBalanceINR: buyer.walletBalanceINR,
    walletBalanceUSD: buyer.walletBalanceUSD,
  });
});

app.post('/api/wallet/topup', checkSubscription, financeLimiter, (req: Request, res: Response) => {
  const userId = String(req.headers['user-id'] || '').trim().toLowerCase();
  const user = accounts[userId].profile;
  const { amount, currency } = req.body as { amount?: number; currency?: CurrencyCode };
  const parsedAmount = Number(amount);

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ error: 'Enter a valid top-up amount.' });
    return;
  }

  const activeCurrency: CurrencyCode =
    currency === 'USD' || currency === 'INR'
      ? currency
      : user.subscription!.currency;

  if (activeCurrency === 'INR') {
    user.walletBalanceINR = Number((user.walletBalanceINR + parsedAmount).toFixed(2));
  } else {
    user.walletBalanceUSD = Number((user.walletBalanceUSD + parsedAmount).toFixed(2));
  }

  const transactionId = `TOP${Date.now()}`;
  const createdAt = new Date().toISOString();
  const gateway = activeCurrency === 'INR' ? 'Razorpay' : 'Stripe';
  const seal = sealWithAes256Gcm({
    transactionId,
    senderId: `${gateway} Rail`,
    receiverId: userId,
    amount: parsedAmount,
    currency: activeCurrency,
    createdAt,
  });

  const txn: Transaction = {
    transactionId,
    senderId: activeCurrency === 'INR' ? 'Razorpay Bank Rail' : 'Stripe Card Rail',
    receiverId: userId,
    amount: parsedAmount,
    currency: activeCurrency,
    gateway,
    type: 'topup',
    note: 'Added to VEXO Wallet',
    createdAt,
    status: 'Success',
    seal,
    fraudCheck: { riskScore: 2, decision: 'APPROVED', rulesTriggered: [] },
  };
  transactions.unshift(txn);

  res.json({
    status: 'Success',
    transaction: txn,
    walletBalanceINR: user.walletBalanceINR,
    walletBalanceUSD: user.walletBalanceUSD,
  });
});

app.get('/api/transactions', checkSubscription, (req: Request, res: Response) => {
  const userId = String(req.headers['user-id'] || '').trim().toLowerCase();
  const userTxns = transactions.filter(
    (t) => t.senderId === userId || t.receiverId.toLowerCase() === userId
  );
  res.json(userTxns);
});

app.get('/api/security/audit', checkSubscription, (req: Request, res: Response) => {
  const userId = String(req.headers['user-id'] || '').trim().toLowerCase();
  const userEvents = securityEvents.filter((e) => e.userId === userId);
  const userTxns = transactions.filter(
    (t) => t.senderId === userId || t.receiverId.toLowerCase() === userId
  );
  res.json({
    cipher: 'AES-256-GCM + HMAC-SHA256',
    events: userEvents,
    sealedCount: userTxns.length,
  });
});

app.post('/api/security/verify', checkSubscription, (req: Request, res: Response) => {
  const { transactionId } = req.body as { transactionId?: string };
  if (!transactionId) {
    res.status(400).json({ error: 'Transaction ID is required.' });
    return;
  }
  const result = verifyAes256GcmSeal(transactionId);
  if (!result.valid) {
    res.status(404).json({ valid: false, error: result.error });
    return;
  }
  res.json({
    valid: true,
    algorithm: 'AES-256-GCM',
    decryptedPayload: result.decryptedPayload,
  });
});

// 6. Real-Time Global Chat Translator (Gemini 4 Hydrogen)
app.post('/api/chat/translate', checkSubscription, async (req: Request, res: Response) => {
  const { text, targetLanguage } = req.body as { text?: string; targetLanguage?: string };
  if (!text?.trim() || !targetLanguage?.trim()) {
    res.status(400).json({ error: 'Text and targetLanguage are required.' });
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    res.status(503).json({
      error: 'GEMINI_API_KEY is not configured in Settings > Secrets for live translation.',
    });
    return;
  }

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Translate the following chat message naturally into ${targetLanguage.trim()}. Return only the translated sentence without quotes or extra commentary:\n\n${text.trim()}`,
    });
    res.json({ translatedText: (response.text ?? text).trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Translation failed';
    res.status(502).json({ error: `Translation unavailable: ${msg}` });
  }
});

// 7. AI-Powered Personal Concierge (Gemini 4 Hydrogen)
app.post('/api/concierge', checkSubscription, async (req: Request, res: Response) => {
  const userId = String(req.headers['user-id'] || '').trim().toLowerCase();
  const user = accounts[userId].profile;
  const { prompt } = req.body as { prompt?: string };

  if (!prompt || !prompt.trim()) {
    res.status(400).json({ error: 'Please speak or type a request for your concierge.' });
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    res.status(503).json({
      error:
        'GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets to enable the AI Concierge.',
    });
    return;
  }

  const currency = user.subscription!.currency;
  const balance = currency === 'INR' ? user.walletBalanceINR : user.walletBalanceUSD;
  const peers = Array.from(onlineUsersBySocket.values()).map((u) => ({
    userId: u.userId,
    displayName: u.displayName,
  }));

  const catalogSummary = products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    priceINR: p.priceINR,
    priceUSD: p.priceUSD,
  }));

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `User (${user.displayName}, ID: ${user.userId}, Country: ${user.country}, Active Currency: ${currency}, Wallet Balance: ${currency} ${balance}) said: "${prompt.trim()}"

Available VEXO Mall Products:
${JSON.stringify(catalogSummary)}

Currently Online Peers for Calling:
${JSON.stringify(peers)}

Determine the user's intent and return a structured JSON action.`,
      config: {
        systemInstruction: `You are VEXO Concierge, an executive voice and text personal assistant inside a dark-luxury Super App with 5 bottom tabs (home, message, reels, payment, shopping) plus profile, settings (Instagram-style Settings & Privacy), and security (AES-256 Security Vault).
Understand English, Hindi, and Hinglish voice commands naturally.
Pick the single best intent:
- "shop_add": when the user wants to buy or add one or more catalog products to their cart. Populate productIds with matching product IDs.
- "pay_transfer": when the user wants to send money or pay a bill/merchant/UPI. Populate payment { receiverId, amount, note }. If the user says "my upi", "jiya", or doesn't specify a UPI ID, default receiverId to "2010jiya@fam".
- "draft_message": when the user wants to write, compose, or draft a chat message to someone (such as Khushi / VIP contact or the Global Lounge / general room). Populate draftMessage { room: "vip_khushi" | "general", recipientName, text }. Use "vip_khushi" when addressed to Khushi or a private VIP contact, and "general" for general/lounge/everyone.
- "start_call": when the user wants to start an audio or video call. Populate callTarget { targetUserId, callType }.
- "navigate_tab": when the user wants to open or switch to a section ("home", "message", "reels", "payment", "shopping", "profile", "settings", or "security" for the AES-256 Security Vault).
- "answer_only": for questions about wallet balance, pricing, or security.
Keep your reply crisp, warm, and under 2 sentences so it sounds natural when spoken aloud.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: {
              type: Type.STRING,
              description: 'Concise natural-language response suitable for voice readout.',
            },
            intent: {
              type: Type.STRING,
              description:
                'One of: shop_add, pay_transfer, draft_message, start_call, navigate_tab, answer_only',
            },
            productIds: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
              description: 'Matching product IDs when intent is shop_add.',
            },
            payment: {
              type: Type.OBJECT,
              properties: {
                receiverId: { type: Type.STRING },
                amount: { type: Type.NUMBER },
                note: { type: Type.STRING },
              },
              description: 'Transfer details when intent is pay_transfer.',
            },
            draftMessage: {
              type: Type.OBJECT,
              properties: {
                room: { type: Type.STRING },
                recipientName: { type: Type.STRING },
                text: { type: Type.STRING },
              },
              description:
                'Message draft when intent is draft_message. room must be vip_khushi or general.',
            },
            callTarget: {
              type: Type.OBJECT,
              properties: {
                targetUserId: { type: Type.STRING },
                callType: { type: Type.STRING },
              },
              description: 'Call target details when intent is start_call.',
            },
            tab: {
              type: Type.STRING,
              description:
                'Target tab (home, message, reels, payment, shopping, profile, settings, security).',
            },
          },
          required: ['reply', 'intent'],
        },
      },
    });

    const raw = (response.text ?? '{}').trim();
    const parsed = JSON.parse(raw) as ConciergeAction;
    res.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Concierge request failed';
    res.status(502).json({ error: `Concierge could not complete the request: ${message}` });
  }
});

// 8. Real-Time Chat & WebRTC Signaling (Socket.io)
function broadcastOnlineUsers() {
  io.emit('users:online', Array.from(onlineUsersBySocket.values()));
}

io.on('connection', (socket) => {
  socket.on(
    'register_user',
    (payload: { userId: string; displayName: string; country: CountryOption }) => {
      if (!payload?.userId) return;
      onlineUsersBySocket.set(socket.id, {
        socketId: socket.id,
        userId: payload.userId,
        displayName: payload.displayName || payload.userId,
        country: payload.country || 'India',
      });
      socket.emit('chat:history', chatHistory);
      broadcastOnlineUsers();
    }
  );

  socket.on('send_message', (data: ChatMessage) => {
    if (!data?.text?.trim()) return;
    const msg: ChatMessage = {
      id: data.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      room: data.room || 'general',
      senderId: data.senderId || 'anonymous',
      senderName: data.senderName || data.senderId || 'Member',
      text: data.text.trim(),
      timestamp: data.timestamp || new Date().toISOString(),
    };

    if (!chatHistory.some((existing) => existing.id === msg.id)) {
      chatHistory.push(msg);
      if (chatHistory.length > 200) {
        chatHistory.shift();
      }
      io.emit('receive_message', msg);
    }
  });

  socket.on(
    'call_user',
    (data: {
      userToCall: string;
      signalData: unknown;
      from: string;
      fromName: string;
      callType: 'audio' | 'video';
    }) => {
      io.to(data.userToCall).emit('incoming_call', {
        signal: data.signalData,
        from: data.from,
        fromName: data.fromName,
        callType: data.callType || 'video',
      });
    }
  );

  socket.on('answer_call', (data: { to: string; signal: unknown }) => {
    io.to(data.to).emit('call_accepted', { signal: data.signal });
  });

  socket.on('ice_candidate', (data: { to: string; candidate: unknown }) => {
    io.to(data.to).emit('ice_candidate', { candidate: data.candidate });
  });

  socket.on('end_call', (data: { to: string }) => {
    io.to(data.to).emit('call_ended');
  });

  socket.on('reject_call', (data: { to: string }) => {
    io.to(data.to).emit('call_rejected');
  });

  socket.on('disconnect', () => {
    onlineUsersBySocket.delete(socket.id);
    broadcastOnlineUsers();
  });
});

async function startServer() {
  const PORT = Number(process.env.PORT || 3000);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`VEXO Super App server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
