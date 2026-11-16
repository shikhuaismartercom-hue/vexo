import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import {
  Clapperboard,
  Home,
  LogOut,
  MessageCircle,
  Settings,
  ShoppingBag,
  Wallet,
  X,
} from 'lucide-react';
import { AuthGate } from './components/AuthGate.tsx';
import { ConciergeBar } from './components/ConciergeBar.tsx';
import { HomeFeedPanel } from './components/HomeFeedPanel.tsx';
import { ChatCallPanel } from './components/ChatCallPanel.tsx';
import { ReelsPanel } from './components/ReelsPanel.tsx';
import { PaymentsPanel } from './components/PaymentsPanel.tsx';
import { MarketplacePanel } from './components/MarketplacePanel.tsx';
import { SecurityVaultPanel } from './components/SecurityVaultPanel.tsx';
import { ProfilePanel } from './components/ProfilePanel.tsx';
import type {
  CartItem,
  ChatMessage,
  CountryOption,
  EscrowDeal,
  FeedPost,
  OnlineUser,
  Product,
  ReelItem,
  SecurityEvent,
  Transaction,
  UserProfile,
  UserSettings,
  WorkspaceTab,
} from './types.ts';

function detectRegionFromBrowser(): { country: CountryOption; label: string } {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const lang = navigator.language || '';
    if (tz.includes('Kolkata') || tz.includes('Calcutta') || lang.endsWith('-IN')) {
      return { country: 'India', label: `India (${tz || 'en-IN'})` };
    }
    return { country: 'International', label: tz ? `Global (${tz})` : 'Global' };
  } catch {
    return { country: 'India', label: 'India (Default)' };
  }
}

export default function App() {
  const detectedRegion = React.useMemo(() => detectRegionFromBrowser(), []);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [sessionToken, setSessionToken] = useState<string>(
    () => window.localStorage.getItem('vexo_session_token') || ''
  );
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('home');
  const [paymentSubView, setPaymentSubView] = useState<'wallet' | 'vault'>('wallet');
  const [profileSubTab, setProfileSubTab] = useState<'posts' | 'reels' | 'royalty' | 'settings'>(
    'posts'
  );
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [escrowDeals, setEscrowDeals] = useState<EscrowDeal[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingCallRequest, setPendingCallRequest] = useState<{
    targetUserId: string;
    callType: 'audio' | 'video';
  } | null>(null);
  const [pendingMessageDraft, setPendingMessageDraft] = useState<{
    room: 'vip_khushi' | 'general';
    text: string;
  } | null>(null);

  const [toast, setToast] = useState<{ type: 'info' | 'error'; text: string } | null>(null);
  const socketRef = React.useRef<Socket | null>(null);

  const showToast = React.useCallback((text: string, type: 'info' | 'error' = 'info') => {
    setToast({ text, type });
    window.setTimeout(() => {
      setToast((curr) => (curr?.text === text ? null : curr));
    }, 4500);
  }, []);

  const fetchProtectedWorkspaceData = React.useCallback(
    async (userId: string, token: string) => {
      setLoadingProducts(true);
      try {
        const authHeaders = {
          'user-id': userId,
          'x-session-token': token,
        };
        const [prodRes, feedRes, reelsRes, txnRes, escrowRes, auditRes] = await Promise.all([
          fetch('/api/products', { headers: authHeaders }),
          fetch('/api/feed', { headers: authHeaders }),
          fetch('/api/reels', { headers: authHeaders }),
          fetch('/api/transactions', { headers: authHeaders }),
          fetch('/api/escrow', { headers: authHeaders }),
          fetch('/api/security/audit', { headers: authHeaders }),
        ]);
        if (prodRes.ok) setProducts((await prodRes.json()) as Product[]);
        if (feedRes.ok) setFeedPosts((await feedRes.json()) as FeedPost[]);
        if (reelsRes.ok) setReels((await reelsRes.json()) as ReelItem[]);
        if (txnRes.ok) setTransactions((await txnRes.json()) as Transaction[]);
        if (escrowRes.ok) setEscrowDeals((await escrowRes.json()) as EscrowDeal[]);
        if (auditRes.ok) {
          const auditData = (await auditRes.json()) as { events: SecurityEvent[] };
          setSecurityEvents(auditData.events || []);
        }
      } finally {
        setLoadingProducts(false);
      }
    },
    []
  );

  // Restore signed-in session if still active on server
  useEffect(() => {
    const savedId = window.localStorage.getItem('vexo_user_id');
    const savedToken = window.localStorage.getItem('vexo_session_token') || '';
    if (!savedId) return;

    fetch('/api/user/me', {
      headers: {
        'user-id': savedId,
        'x-session-token': savedToken,
      },
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as {
          user: UserProfile;
          sessionToken?: string;
          transactions: Transaction[];
          securityEvents: SecurityEvent[];
        };
      })
      .then((data) => {
        if (data?.user?.subscription) {
          const activeToken = data.sessionToken || savedToken;
          if (activeToken) {
            window.localStorage.setItem('vexo_session_token', activeToken);
            setSessionToken(activeToken);
          }
          setUser(data.user);
          setTransactions(data.transactions || []);
          setSecurityEvents(data.securityEvents || []);
          void fetchProtectedWorkspaceData(data.user.userId, activeToken);
        }
      })
      .catch(() => {
        // Ignore stale local session
      });
  }, [fetchProtectedWorkspaceData]);

  // Connect Socket.io once authenticated
  useEffect(() => {
    if (!user?.subscription) return;

    const socket = io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('register_user', {
        userId: user.userId,
        displayName: user.displayName,
        country: user.country,
      });
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('chat:history', (history: ChatMessage[]) => {
      setMessages(history);
    });

    socket.on('receive_message', (msg: ChatMessage) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    });

    socket.on('feed:new', (post: FeedPost) => {
      setFeedPosts((prev) => (prev.some((p) => p.id === post.id) ? prev : [post, ...prev]));
    });

    socket.on('reel:new', (reel: ReelItem) => {
      setReels((prev) => (prev.some((r) => r.id === reel.id) ? prev : [reel, ...prev]));
    });

    socket.on('users:online', (list: OnlineUser[]) => {
      setOnlineUsers(list);
    });

    socket.on(
      'wallet:updated',
      (bal: { walletBalanceINR: number; walletBalanceUSD: number }) => {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                walletBalanceINR: bal.walletBalanceINR,
                walletBalanceUSD: bal.walletBalanceUSD,
              }
            : prev
        );
      }
    );

    socket.on('transaction:new', (txn: Transaction) => {
      setTransactions((prev) =>
        prev.some((t) => t.transactionId === txn.transactionId) ? prev : [txn, ...prev]
      );
    });

    socket.on('escrow:updated', (deal: EscrowDeal) => {
      setEscrowDeals((prev) => {
        const exists = prev.some((d) => d.escrowId === deal.escrowId);
        return exists
          ? prev.map((d) => (d.escrowId === deal.escrowId ? deal : d))
          : [deal, ...prev];
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [user?.userId, user?.displayName, user?.country, Boolean(user?.subscription)]);

  const handleLogin = async (params: { username: string; password: string }) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign-in failed.');
      const nextUser = data.user as UserProfile;
      const nextToken = String(data.sessionToken || '');
      window.localStorage.setItem('vexo_user_id', nextUser.userId);
      window.localStorage.setItem('vexo_session_token', nextToken);
      setSessionToken(nextToken);
      setUser(nextUser);
      setActiveTab('home');
      await fetchProtectedWorkspaceData(nextUser.userId, nextToken);
      showToast(data.message || `Signed in as @${nextUser.username}`);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (params: {
    username: string;
    password: string;
    displayName: string;
    country: CountryOption;
    bio?: string;
    upiId?: string;
  }) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed.');
      const nextUser = data.user as UserProfile;
      const nextToken = String(data.sessionToken || '');
      window.localStorage.setItem('vexo_user_id', nextUser.userId);
      window.localStorage.setItem('vexo_session_token', nextToken);
      setSessionToken(nextToken);
      setUser(nextUser);
      setActiveTab('home');
      await fetchProtectedWorkspaceData(nextUser.userId, nextToken);
      showToast(data.message || `ID @${nextUser.username} created!`);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to create account.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    window.localStorage.removeItem('vexo_user_id');
    window.localStorage.removeItem('vexo_session_token');
    setSessionToken('');
    setUser(null);
    setCart([]);
    setTransactions([]);
    setEscrowDeals([]);
    setSecurityEvents([]);
    setMessages([]);
  };

  const handleSwitchRegion = async () => {
    if (!user) return;
    const nextCountry: CountryOption =
      user.country === 'India' ? 'International' : 'India';
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.userId,
        displayName: user.displayName,
        country: nextCountry,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      if (data.sessionToken) {
        window.localStorage.setItem('vexo_session_token', data.sessionToken);
        setSessionToken(data.sessionToken);
      }
      setUser(data.user as UserProfile);
      showToast(
        `Switched to ${nextCountry} (${data.plan.currency} ${data.plan.monthlyPrice}/mo after trial)`
      );
    }
  };

  const refreshAuditLog = React.useCallback(
    async (userId: string) => {
      const auditRes = await fetch('/api/security/audit', {
        headers: {
          'user-id': userId,
          'x-session-token': sessionToken,
        },
      });
      if (auditRes.ok) {
        const data = (await auditRes.json()) as { events: SecurityEvent[] };
        setSecurityEvents(data.events || []);
      }
    },
    [sessionToken]
  );

  const handleUpdateProfile = async (params: {
    displayName?: string;
    bio?: string;
    upiId?: string;
    avatarUrl?: string;
    country?: CountryOption;
    settings?: Partial<UserSettings>;
  }) => {
    if (!user) return;
    const res = await fetch('/api/user/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'user-id': user.userId,
        'x-session-token': sessionToken,
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Unable to update profile.');
    }
    setUser(data.user as UserProfile);
    await refreshAuditLog(user.userId);
  };

  const handleChangePassword = async (params: {
    currentPassword: string;
    newPassword: string;
  }) => {
    if (!user) return;
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': user.userId,
        'x-session-token': sessionToken,
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Unable to change password.');
    }
    await refreshAuditLog(user.userId);
  };

  const handleExecutePayment = async (params: {
    receiverId: string;
    amount: number;
    note: string;
    type?: Transaction['type'];
    confirmHighValue?: boolean;
    attributedCreatorIds?: string[];
  }): Promise<Transaction | undefined> => {
    if (!user?.subscription) return undefined;

    const res = await fetch('/api/pay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': user.userId,
        'x-session-token': sessionToken,
      },
      body: JSON.stringify({
        senderId: user.userId,
        receiverId: params.receiverId,
        amount: params.amount,
        currency: user.subscription.currency,
        type: params.type || 'transfer',
        note: params.note,
        confirmHighValue: Boolean(params.confirmHighValue),
        attributedCreatorIds: params.attributedCreatorIds || [],
      }),
    });

    const data = await res.json();
    await refreshAuditLog(user.userId);

    if (!res.ok) {
      const err = new Error(data.error || 'Payment failed.') as Error & {
        requiresStepUpVerification?: boolean;
      };
      err.requiresStepUpVerification = Boolean(data.requiresStepUpVerification);
      throw err;
    }

    const txn = data.transaction as Transaction;
    setUser((prev) =>
      prev
        ? {
            ...prev,
            walletBalanceINR: data.walletBalanceINR,
            walletBalanceUSD: data.walletBalanceUSD,
          }
        : prev
    );
    setTransactions((prev) =>
      prev.some((t) => t.transactionId === txn.transactionId) ? prev : [txn, ...prev]
    );
    showToast(data.message);
    return txn;
  };

  const handleCreateEscrow = async (params: {
    sellerId: string;
    amount: number;
    itemNote: string;
  }): Promise<EscrowDeal | undefined> => {
    if (!user?.subscription) return undefined;
    const res = await fetch('/api/escrow/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': user.userId,
        'x-session-token': sessionToken,
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    await refreshAuditLog(user.userId);
    if (!res.ok) throw new Error(data.error || 'Unable to lock funds in Escrow.');

    const deal = data.deal as EscrowDeal;
    const lockTxn = data.transaction as Transaction;
    setUser((prev) =>
      prev
        ? {
            ...prev,
            walletBalanceINR: data.walletBalanceINR,
            walletBalanceUSD: data.walletBalanceUSD,
          }
        : prev
    );
    setEscrowDeals((prev) =>
      prev.some((d) => d.escrowId === deal.escrowId) ? prev : [deal, ...prev]
    );
    if (lockTxn) {
      setTransactions((prev) =>
        prev.some((t) => t.transactionId === lockTxn.transactionId)
          ? prev
          : [lockTxn, ...prev]
      );
    }
    showToast(`Escrow ${deal.escrowId} locked with 6-digit buyer release PIN`);
    return deal;
  };

  const handleReleaseEscrow = async (escrowId: string, releaseCode: string) => {
    if (!user) return;
    const res = await fetch(`/api/escrow/${escrowId}/release`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': user.userId,
        'x-session-token': sessionToken,
      },
      body: JSON.stringify({ releaseCode }),
    });
    const data = await res.json();
    await refreshAuditLog(user.userId);
    if (!res.ok) throw new Error(data.error || 'Escrow release failed.');

    const updated = data.deal as EscrowDeal;
    const releaseTxn = data.transaction as Transaction;
    setEscrowDeals((prev) =>
      prev.map((d) => (d.escrowId === updated.escrowId ? updated : d))
    );
    if (releaseTxn) {
      setTransactions((prev) =>
        prev.some((t) => t.transactionId === releaseTxn.transactionId)
          ? prev
          : [releaseTxn, ...prev]
      );
    }
    showToast(`Escrow ${updated.escrowId} released to @${updated.sellerId}`);
  };

  const handleRefundEscrow = async (escrowId: string) => {
    if (!user) return;
    const res = await fetch(`/api/escrow/${escrowId}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': user.userId,
        'x-session-token': sessionToken,
      },
    });
    const data = await res.json();
    await refreshAuditLog(user.userId);
    if (!res.ok) throw new Error(data.error || 'Escrow refund failed.');

    const updated = data.deal as EscrowDeal;
    setEscrowDeals((prev) =>
      prev.map((d) => (d.escrowId === updated.escrowId ? updated : d))
    );
    setUser((prev) =>
      prev
        ? {
            ...prev,
            walletBalanceINR: data.walletBalanceINR,
            walletBalanceUSD: data.walletBalanceUSD,
          }
        : prev
    );
    showToast(`Escrow ${updated.escrowId} refunded to your wallet`);
  };

  const handleTopUp = async (amount: number) => {
    if (!user?.subscription) return;
    const res = await fetch('/api/wallet/topup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': user.userId,
        'x-session-token': sessionToken,
      },
      body: JSON.stringify({
        amount,
        currency: user.subscription.currency,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Top-up failed.');
    const txn = data.transaction as Transaction;
    setUser((prev) =>
      prev
        ? {
            ...prev,
            walletBalanceINR: data.walletBalanceINR,
            walletBalanceUSD: data.walletBalanceUSD,
          }
        : prev
    );
    setTransactions((prev) => [txn, ...prev]);
    showToast(`Added funds via ${txn.gateway}`);
  };

  const handleTogglePostLike = async (postId: string) => {
    if (!user) return;
    const res = await fetch(`/api/feed/${postId}/like`, {
      method: 'POST',
      headers: {
        'user-id': user.userId,
        'x-session-token': sessionToken,
      },
    });
    if (res.ok) {
      const updated = (await res.json()) as FeedPost;
      setFeedPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    }
  };

  const handleCreatePost = async (params: {
    caption: string;
    image?: string;
    linkedProductId?: number;
  }) => {
    if (!user) return;
    const res = await fetch('/api/feed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': user.userId,
        'x-session-token': sessionToken,
      },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const created = (await res.json()) as FeedPost;
      setFeedPosts((prev) =>
        prev.some((p) => p.id === created.id) ? prev : [created, ...prev]
      );
      showToast('Post published to VEXO Home Feed');
    }
  };

  const handleToggleReelLike = async (reelId: string) => {
    if (!user) return;
    const res = await fetch(`/api/reels/${reelId}/like`, {
      method: 'POST',
      headers: {
        'user-id': user.userId,
        'x-session-token': sessionToken,
      },
    });
    if (res.ok) {
      const updated = (await res.json()) as ReelItem;
      setReels((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    }
  };

  const handleAddReelComment = async (reelId: string, text: string) => {
    if (!user) return;
    const res = await fetch(`/api/reels/${reelId}/comment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': user.userId,
        'x-session-token': sessionToken,
      },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const updated = (await res.json()) as ReelItem;
      setReels((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    }
  };

  const handleCreateReel = async (params: {
    title: string;
    caption: string;
    linkedProductId?: number;
  }) => {
    if (!user) return;
    const res = await fetch('/api/reels', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': user.userId,
        'x-session-token': sessionToken,
      },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const created = (await res.json()) as ReelItem;
      setReels((prev) =>
        prev.some((r) => r.id === created.id) ? prev : [created, ...prev]
      );
      showToast('Reel published to VEXO Reels');
    }
  };

  const handleAddToCart = (product: Product, attributedCreatorId?: string) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? {
                ...i,
                quantity: i.quantity + 1,
                attributedCreatorId: attributedCreatorId || i.attributedCreatorId,
              }
            : i
        );
      }
      return [...prev, { product, quantity: 1, attributedCreatorId }];
    });
  };

  const handleConciergeAddProducts = (productIds: number[]) => {
    const matched = products.filter((p) => productIds.includes(p.id));
    if (matched.length === 0) return;
    matched.forEach((p) => handleAddToCart(p));
    setActiveTab('shopping');
    setCartOpen(true);
    showToast(`Added ${matched.map((m) => m.name).join(', ')} to your bag`);
  };

  const handleUpdateQty = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handleRemoveCartItem = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleCartCheckout = async () => {
    if (!user?.subscription || cart.length === 0) return undefined;
    const currency = user.subscription.currency;
    const total = cart.reduce((sum, item) => {
      const price = currency === 'INR' ? item.product.priceINR : item.product.priceUSD;
      return sum + price * item.quantity;
    }, 0);

    const attributedCreatorIds = Array.from(
      new Set(
        cart
          .map((item) => item.attributedCreatorId)
          .filter((id): id is string => Boolean(id))
      )
    );

    const summary = cart.map((i) => `${i.quantity}x ${i.product.name}`).join(', ');
    const txn = await handleExecutePayment({
      receiverId: 'vexo_mall',
      amount: total,
      note: summary,
      type: 'marketplace',
      confirmHighValue: true,
      attributedCreatorIds,
    });
    if (txn) {
      setCart([]);
    }
    return txn;
  };

  const handleTestFraudBlock = async () => {
    try {
      await handleExecutePayment({
        receiverId: 'fraud_watchlist_merchant',
        amount: user?.subscription?.currency === 'INR' ? 999 : 19,
        note: 'Watchlist Simulation',
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Blocked by Fraud Shield', 'error');
    }
  };

  const handleTestHighValueStepUp = async () => {
    try {
      await handleExecutePayment({
        receiverId: 'merchant_99@upi',
        amount: user?.subscription?.currency === 'INR' ? 12500 : 250,
        note: 'High-Value Threshold Simulation',
      });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Step-Up Verification triggered',
        'error'
      );
    }
  };

  if (!user || !user.subscription) {
    return (
      <AuthGate
        initialCountry={detectedRegion.country}
        autoDetectedLabel={detectedRegion.label}
        onLogin={handleLogin}
        onRegister={handleRegister}
        loading={authLoading}
        error={authError}
      />
    );
  }

  const plan = user.subscription;
  const totalCartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  const bottomNavItems: {
    id: WorkspaceTab;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'home', label: 'Home', Icon: Home },
    { id: 'message', label: 'Message', Icon: MessageCircle },
    { id: 'reels', label: 'Reels', Icon: Clapperboard },
    { id: 'payment', label: 'Payment', Icon: Wallet },
    { id: 'shopping', label: 'Shopping', Icon: ShoppingBag },
  ];

  return (
    <div className="min-h-screen bg-[#090C10] text-[#F2F1EC] relative overflow-x-hidden pb-24">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-56 left-1/3 w-[640px] h-[640px] rounded-full bg-[#D4A853]/[0.05] blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 w-[520px] h-[520px] rounded-full bg-[#16302B]/[0.16] blur-[150px]" />
      </div>

      {/* Compact Top Bar Contract: 3 zones */}
      <header className="relative z-20 border-b border-white/[0.08] bg-[#090C10]/85 backdrop-blur-xl sticky top-0 h-[54px]">
        <div className="max-w-[1280px] mx-auto h-full px-5 lg:px-10 flex items-center justify-between gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="text-lg font-bold tracking-[0.2em] font-display whitespace-nowrap shrink-0 text-[#D4A853] cursor-pointer"
          >
            VEXO
          </button>

          <div className="hidden sm:flex items-center gap-3 text-xs text-[#9BA1A8] truncate">
            <button
              type="button"
              onClick={() => {
                setProfileSubTab('posts');
                setActiveTab('profile');
              }}
              className="text-[#EAE9E4] hover:text-[#D4A853] font-medium cursor-pointer transition-colors"
            >
              @{user.username}
            </button>
            <span aria-hidden="true">·</span>
            <span className="text-[#10B981]">End-to-End Encrypted</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {plan.currency === 'INR'
                ? `₹${user.walletBalanceINR.toLocaleString('en-IN')}`
                : `$${user.walletBalanceUSD.toFixed(2)}`}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setProfileSubTab('posts');
                setActiveTab('profile');
              }}
              title="Open Profile"
              aria-label="Open Profile"
              className={`w-8 h-8 rounded-full p-[1.5px] cursor-pointer transition-transform hover:scale-105 ${
                activeTab === 'profile' && profileSubTab !== 'settings'
                  ? 'bg-[#D4A853]'
                  : 'bg-gradient-to-tr from-[#D4A853] to-[#10B981]'
              }`}
            >
              <div className="w-full h-full rounded-full bg-[#10151D] overflow-hidden flex items-center justify-center text-[11px] font-bold text-[#D4A853]">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  user.displayName.slice(0, 2).toUpperCase()
                )}
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setProfileSubTab('settings');
                setActiveTab('profile');
              }}
              title="Instagram-Style Settings & Privacy"
              aria-label="Settings and Privacy"
              className={`p-2 rounded-xl border cursor-pointer transition-colors ${
                activeTab === 'profile' && profileSubTab === 'settings'
                  ? 'bg-[#D4A853]/20 border-[#D4A853]/50 text-[#D4A853]'
                  : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.09] text-[#C8CDD3]'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('shopping');
                setCartOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#090C10] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span className="font-mono tabular-nums">Bag ({totalCartCount})</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out"
              className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-[#C8CDD3] cursor-pointer"
              aria-label="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-[1280px] mx-auto px-5 lg:px-10 py-6 space-y-6">
        {toast && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
              toast.type === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-200'
                : 'bg-[#10B981]/10 border-[#10B981]/30 text-[#6EE7B7]'
            }`}
          >
            <span>{toast.text}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="p-1 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* AI Personal Concierge */}
        <ConciergeBar
          userId={user.userId}
          sessionToken={sessionToken}
          currency={plan.currency}
          products={products}
          onAddProductsToCart={handleConciergeAddProducts}
          onExecutePayment={async (payParams) => {
            await handleExecutePayment(payParams);
          }}
          onInitiateCallByUserId={(targetUserId, callType) => {
            setActiveTab('message');
            setPendingCallRequest({ targetUserId, callType });
          }}
          onNavigateTab={(tab, subView) => {
            if (subView === 'wallet' || subView === 'vault') {
              setPaymentSubView(subView);
            } else if (subView === 'posts' || subView === 'settings') {
              setProfileSubTab(subView);
            }
            setActiveTab(tab);
          }}
          onDraftMessage={({ room, text }) => {
            setPendingMessageDraft({ room, text });
            setActiveTab('message');
            showToast(
              `Draft ready in ${room === 'general' ? '#general' : 'Khushi Rathore'} composer`
            );
          }}
          onSendMessageNow={({ room, text }) => {
            if (socketRef.current) {
              socketRef.current.emit('send_message', {
                id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                room,
                senderId: user.userId,
                senderName: user.displayName || user.userId,
                text,
                timestamp: new Date().toISOString(),
              });
              setActiveTab('message');
              showToast(`Message sent to ${room === 'general' ? '#general' : 'Khushi Rathore'}`);
            }
          }}
        />

        {activeTab === 'home' && (
          <HomeFeedPanel
            user={user}
            posts={feedPosts}
            products={products}
            onToggleLike={handleTogglePostLike}
            onCreatePost={handleCreatePost}
            onNavigateTab={setActiveTab}
            onAddProductToCart={(p, attributedCreatorId) => {
              handleAddToCart(p, attributedCreatorId);
              setCartOpen(true);
            }}
            onSwitchRegion={handleSwitchRegion}
            onLogout={handleLogout}
            onOpenSecurityVault={() => {
              setPaymentSubView('vault');
              setActiveTab('payment');
            }}
            onOpenProfile={() => {
              setProfileSubTab('posts');
              setActiveTab('profile');
            }}
            onOpenSettings={() => {
              setProfileSubTab('settings');
              setActiveTab('profile');
            }}
          />
        )}

        {activeTab === 'message' && (
          <ChatCallPanel
            socket={socketRef.current}
            connected={connected}
            userId={user.userId}
            sessionToken={sessionToken}
            displayName={user.displayName}
            onlineUsers={onlineUsers}
            messages={messages}
            pendingCallRequest={pendingCallRequest}
            onClearPendingCall={() => setPendingCallRequest(null)}
            pendingMessageDraft={pendingMessageDraft}
            onClearPendingDraft={() => setPendingMessageDraft(null)}
            defaultGhostChat={Boolean(user.settings?.defaultGhostChat)}
          />
        )}

        {activeTab === 'reels' && (
          <ReelsPanel
            userId={user.userId}
            currency={plan.currency}
            reels={reels}
            products={products}
            onToggleLike={handleToggleReelLike}
            onAddComment={handleAddReelComment}
            onCreateReel={handleCreateReel}
            onAddProductToCart={(p, attributedCreatorId) => {
              handleAddToCart(p, attributedCreatorId);
              setCartOpen(true);
            }}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'payment' && (
          <div className="space-y-5">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08] w-fit">
              <button
                type="button"
                onClick={() => setPaymentSubView('wallet')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  paymentSubView === 'wallet'
                    ? 'bg-[#D4A853] text-[#090C10]'
                    : 'text-[#A8AEB5] hover:text-white'
                }`}
              >
                VEXO Pay & Escrow
              </button>
              <button
                type="button"
                onClick={() => setPaymentSubView('vault')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  paymentSubView === 'vault'
                    ? 'bg-[#D4A853] text-[#090C10]'
                    : 'text-[#A8AEB5] hover:text-white'
                }`}
              >
                AES-256 Security Vault
              </button>
            </div>

            {paymentSubView === 'wallet' ? (
              <PaymentsPanel
                userId={user.userId}
                displayName={user.displayName}
                primaryUpiId={user.upiId}
                currency={plan.currency}
                gateway={plan.gateway}
                balanceINR={user.walletBalanceINR}
                balanceUSD={user.walletBalanceUSD}
                transactions={transactions}
                escrowDeals={escrowDeals}
                onExecutePayment={handleExecutePayment}
                onCreateEscrow={handleCreateEscrow}
                onReleaseEscrow={handleReleaseEscrow}
                onRefundEscrow={handleRefundEscrow}
                onTopUp={handleTopUp}
                onVerifyTransaction={() => setPaymentSubView('vault')}
              />
            ) : (
              <SecurityVaultPanel
                userId={user.userId}
                sessionToken={sessionToken}
                currency={plan.currency}
                transactions={transactions}
                securityEvents={securityEvents}
                onTestFraudBlock={handleTestFraudBlock}
                onTestHighValueStepUp={handleTestHighValueStepUp}
              />
            )}
          </div>
        )}

        {activeTab === 'shopping' && (
          <MarketplacePanel
            products={products}
            loading={loadingProducts}
            currency={plan.currency}
            gateway={plan.gateway}
            cart={cart}
            cartOpen={cartOpen}
            onSetCartOpen={setCartOpen}
            onAddToCart={handleAddToCart}
            onUpdateQty={handleUpdateQty}
            onRemoveItem={handleRemoveCartItem}
            onCheckout={handleCartCheckout}
          />
        )}

        {activeTab === 'profile' && (
          <ProfilePanel
            user={user}
            posts={feedPosts}
            reels={reels}
            transactions={transactions}
            initialSubTab={profileSubTab}
            onUpdateProfile={handleUpdateProfile}
            onChangePassword={handleChangePassword}
            onNavigateTab={setActiveTab}
            onOpenSecurityVault={() => {
              setPaymentSubView('vault');
              setActiveTab('payment');
            }}
            onLogout={handleLogout}
          />
        )}
      </main>

      {/* Instagram-Style Fixed Bottom Navigation Bar (5 Tabs) */}
      <nav
        aria-label="Primary Bottom Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.1] bg-[#0B0F15]/92 backdrop-blur-xl h-[60px]"
      >
        <div className="max-w-[720px] mx-auto h-full grid grid-cols-5 items-center px-2">
          {bottomNavItems.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
                  isActive ? 'text-[#D4A853]' : 'text-[#8F969E] hover:text-[#EAE9E4]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px] font-medium tracking-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
