import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  Camera,
  Globe,
  Heart,
  LogOut,
  MessageCircle,
  Plus,
  Settings,
  ShieldCheck,
  ShoppingBag,
  User,
  Wallet,
  X,
} from 'lucide-react';
import type {
  FeedPost,
  Product,
  UserProfile,
  WorkspaceTab,
} from '../types.ts';
import { CameraQrModal } from './CameraQrModal.tsx';

interface HomeFeedPanelProps {
  user: UserProfile;
  posts: FeedPost[];
  products: Product[];
  onToggleLike: (postId: string) => Promise<void>;
  onCreatePost: (params: {
    caption: string;
    image?: string;
    linkedProductId?: number;
  }) => Promise<void>;
  onNavigateTab: (tab: WorkspaceTab) => void;
  onAddProductToCart: (product: Product, attributedCreatorId?: string) => void;
  onSwitchRegion: () => Promise<void>;
  onLogout: () => void;
  onOpenSecurityVault: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
}

export const HomeFeedPanel: React.FC<HomeFeedPanelProps> = ({
  user,
  posts,
  products,
  onToggleLike,
  onCreatePost,
  onNavigateTab,
  onAddProductToCart,
  onSwitchRegion,
  onLogout,
  onOpenSecurityVault,
  onOpenProfile,
  onOpenSettings,
}) => {
  const [caption, setCaption] = useState('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('');
  const [posting, setPosting] = useState(false);
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [cameraOpen, setCameraOpen] = useState(false);
  const [burstPostId, setBurstPostId] = useState<string | null>(null);
  const [activeStory, setActiveStory] = useState<{
    id: string;
    name: string;
    handle: string;
    headline: string;
    image: string;
    ctaLabel: string;
    tab: WorkspaceTab;
  } | null>(null);
  const [storyProgress, setStoryProgress] = useState(0);

  const plan = user.subscription!;
  const currency = plan.currency;
  const primaryBalance =
    currency === 'INR'
      ? `₹${user.walletBalanceINR.toLocaleString('en-IN')}`
      : `$${user.walletBalanceUSD.toFixed(2)}`;

  useEffect(() => {
    if (!activeStory) {
      setStoryProgress(0);
      return;
    }
    setStoryProgress(0);
    const timer = window.setInterval(() => {
      setStoryProgress((prev) => {
        if (prev >= 100) {
          setActiveStory(null);
          return 0;
        }
        return prev + 2.5;
      });
    }, 125);
    return () => window.clearInterval(timer);
  }, [activeStory]);

  const stories = [
    {
      id: 'you',
      name: user.displayName.split(' ')[0],
      handle: `@${user.username}`,
      action: () => setCameraOpen(true),
    },
    {
      id: 'khushi',
      name: 'Khushi',
      handle: 'VIP Chat',
      action: () =>
        setActiveStory({
          id: 'khushi',
          name: 'Khushi Rathore',
          handle: '@khushi_rathore · VIP Online',
          headline: 'End-to-End Encrypted VIP Room + Live Hindi/English Translator is active.',
          image: '/src/assets/images/vexo_silk_saree_1794817762388.jpg',
          ctaLabel: 'Open VIP Message',
          tab: 'message',
        }),
    },
    {
      id: 'reels',
      name: 'Reels',
      handle: '5% Royalty',
      action: () =>
        setActiveStory({
          id: 'reels',
          name: 'VEXO Reels Studio',
          handle: 'Shoppable 9:16 Drops',
          headline: 'Every tagged product purchased from Reels pays an instant 5% Creator Royalty.',
          image: '/src/assets/images/vexo_reel_horology_1794818271174.jpg',
          ctaLabel: 'Watch Reels',
          tab: 'reels',
        }),
    },
    {
      id: 'mall',
      name: 'VEXO Mall',
      handle: '6 Drops',
      action: () =>
        setActiveStory({
          id: 'mall',
          name: 'VEXO Mall Curated',
          handle: 'Luxury Electronics & Atelier',
          headline: 'Shop noise-cancelling studio pods, Italian leather, and Swiss-inspired horology.',
          image: '/src/assets/images/vexo_studio_pods_1794817763190.jpg',
          ctaLabel: 'Browse VEXO Mall',
          tab: 'shopping',
        }),
    },
    {
      id: 'pay',
      name: 'VEXO Pay',
      handle: primaryBalance,
      action: () =>
        setActiveStory({
          id: 'pay',
          name: 'VEXO Black Card & Escrow',
          handle: `UPI: ${user.upiId || '2010jiya@fam'} · AES-256`,
          headline: 'Mint single-use Ghost Burner Cards or lock peer deals in 6-digit PIN Escrow.',
          image: '/src/assets/images/vexo_gold_smartwatch_1794817761477.jpg',
          ctaLabel: 'Open VEXO Pay',
          tab: 'payment',
        }),
    },
  ];

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caption.trim()) return;
    setPosting(true);
    try {
      await onCreatePost({
        caption: caption.trim(),
        image: capturedImage || undefined,
        linkedProductId: selectedProductId ? Number(selectedProductId) : undefined,
      });
      setCaption('');
      setCapturedImage(null);
      setSelectedProductId('');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <CameraQrModal
        open={cameraOpen}
        mode="camera"
        onClose={() => setCameraOpen(false)}
        onCapturePhoto={(dataUrl) => setCapturedImage(dataUrl)}
      />

      {activeStory && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-[380px] aspect-[9/16] rounded-3xl overflow-hidden border border-white/[0.16] bg-[#0B0F15] shadow-2xl">
            <img
              src={activeStory.image}
              alt={activeStory.name}
              className="w-full h-full object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/55"
            />
            <div className="absolute top-3 left-4 right-4 space-y-2.5">
              <div className="h-1 w-full rounded-full bg-white/25 overflow-hidden">
                <div
                  style={{ width: `${storyProgress}%` }}
                  className="h-full bg-[#D4A853] transition-[width] duration-150 ease-linear"
                />
              </div>
              <div className="flex items-center justify-between text-white">
                <div>
                  <div className="text-sm font-bold">{activeStory.name}</div>
                  <div className="text-xs text-[#D4A853]">{activeStory.handle}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveStory(null)}
                  className="p-2 rounded-xl bg-black/50 hover:bg-black/75 cursor-pointer"
                  aria-label="Close story"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="absolute bottom-5 left-5 right-5 space-y-3">
              <p className="text-sm text-white/95 leading-relaxed">{activeStory.headline}</p>
              <button
                type="button"
                onClick={() => {
                  const target = activeStory.tab;
                  setActiveStory(null);
                  onNavigateTab(target);
                }}
                className="w-full py-3 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#090C10] text-xs font-bold cursor-pointer"
              >
                {activeStory.ctaLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Feed Column */}
      <div className="lg:col-span-8 space-y-6">
        {/* Stories Strip */}
        <section className="glass-panel rounded-2xl p-4 overflow-x-auto">
          <div className="flex items-center gap-5 min-w-max">
            {stories.map((story, idx) => (
              <button
                key={story.id}
                type="button"
                onClick={story.action}
                className="flex flex-col items-center gap-1.5 group cursor-pointer"
              >
                <div
                  className={`w-14 h-14 rounded-full p-[2px] ${
                    idx === 0
                      ? 'bg-white/20'
                      : 'bg-gradient-to-tr from-[#D4A853] via-[#F2D08A] to-[#10B981]'
                  }`}
                >
                  <div className="w-full h-full rounded-full bg-[#11161E] flex items-center justify-center text-sm font-bold text-[#F2F1EC] group-hover:scale-95 transition-transform">
                    {idx === 0 ? <Plus className="w-5 h-5 text-[#D4A853]" /> : story.name[0]}
                  </div>
                </div>
                <span className="text-xs font-medium text-[#EAE9E4] whitespace-nowrap">
                  {story.name}
                </span>
                <span className="text-[11px] text-[#8F969E] whitespace-nowrap">
                  {story.handle}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Quick Post Composer */}
        <form onSubmit={handlePublish} className="glass-panel rounded-2xl p-5 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#D4A853]">
              Share to VEXO Home Feed
            </span>
            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              className="text-xs text-[#C8CDD3] hover:text-[#F2F1EC] flex items-center gap-1.5 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-[#D4A853]" />
              <span>{capturedImage ? 'Retake Photo' : 'Attach Camera Photo'}</span>
            </button>
          </div>

          {capturedImage && (
            <div className="relative w-40 h-28 rounded-xl overflow-hidden border border-[#D4A853]/40">
              <img src={capturedImage} alt="Attached capture" className="w-full h-full object-cover" />
            </div>
          )}

          <textarea
            rows={2}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={`What's new, ${user.displayName.split(' ')[0]}? Share an update or tag a VEXO Mall drop...`}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.09] text-sm text-[#F2F1EC] placeholder-[#6F767F] focus:outline-none focus:border-[#D4A853] resize-none"
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <select
              value={selectedProductId}
              onChange={(e) =>
                setSelectedProductId(e.target.value ? Number(e.target.value) : '')
              }
              className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-[#C8CDD3] focus:outline-none focus:border-[#D4A853]"
            >
              <option value="" className="bg-[#0E131A]">
                Tag a product (optional)
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#0E131A]">
                  {p.name}
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={posting || !caption.trim()}
              className="px-5 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] disabled:opacity-50 text-[#090C10] text-xs font-semibold whitespace-nowrap cursor-pointer"
            >
              {posting ? 'Publishing...' : 'Publish Post'}
            </button>
          </div>
        </form>

        {/* Instagram-style Feed Posts */}
        <div className="space-y-6">
          {posts.map((post) => {
            const liked = post.likedBy.includes(user.userId);
            const saved = Boolean(savedIds[post.id]);
            const taggedProduct = post.linkedProductId
              ? products.find((p) => p.id === post.linkedProductId)
              : undefined;

            return (
              <article key={post.id} className="glass-panel rounded-2xl overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between border-b border-white/[0.06]">
                  <div>
                    <div className="text-sm font-semibold text-[#F2F1EC]">
                      {post.authorName}
                    </div>
                    <div className="text-xs text-[#8F969E]">
                      @{post.authorId} · {post.location}
                    </div>
                  </div>
                  <span className="text-xs font-mono text-[#7E858E]">
                    {new Date(post.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div
                  onDoubleClick={() => {
                    if (!liked) {
                      void onToggleLike(post.id);
                    }
                    setBurstPostId(post.id);
                    window.setTimeout(() => setBurstPostId((c) => (c === post.id ? null : c)), 700);
                  }}
                  className="relative aspect-[4/3] w-full bg-[#131821] overflow-hidden cursor-pointer select-none"
                >
                  <img
                    src={post.image}
                    alt={post.caption}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  {burstPostId === post.id && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center animate-ping">
                      <Heart className="w-16 h-16 fill-red-500 text-red-500 drop-shadow-2xl" />
                    </div>
                  )}
                </div>

                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => void onToggleLike(post.id)}
                        className="flex items-center gap-1.5 text-xs font-medium text-[#EAE9E4] hover:text-[#D4A853] cursor-pointer"
                      >
                        <Heart
                          className={`w-5 h-5 ${
                            liked ? 'fill-red-500 text-red-500' : 'text-[#EAE9E4]'
                          }`}
                        />
                        <span className="font-mono tabular-nums">{post.likes}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onNavigateTab('message')}
                        className="flex items-center gap-1.5 text-xs text-[#9BA1A8] hover:text-[#F2F1EC] cursor-pointer"
                      >
                        <MessageCircle className="w-5 h-5" />
                        <span>Discuss</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setSavedIds((prev) => ({ ...prev, [post.id]: !prev[post.id] }))
                      }
                      className="text-[#9BA1A8] hover:text-[#D4A853] cursor-pointer"
                      aria-label="Save post"
                    >
                      <Bookmark
                        className={`w-5 h-5 ${
                          saved ? 'fill-[#D4A853] text-[#D4A853]' : ''
                        }`}
                      />
                    </button>
                  </div>

                  <p className="text-sm text-[#EAE9E4] leading-relaxed">
                    <span className="font-semibold mr-2">{post.authorName}</span>
                    {post.caption}
                  </p>

                  {taggedProduct && (
                    <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
                      <div className="text-xs text-[#C8CDD3]">
                        Featured: <span className="font-semibold text-[#F2F1EC]">{taggedProduct.name}</span>{' '}
                        ·{' '}
                        <span className="font-mono tabular-nums text-[#D4A853]">
                          {currency === 'INR'
                            ? `₹${taggedProduct.priceINR.toLocaleString('en-IN')}`
                            : `$${taggedProduct.priceUSD.toFixed(2)}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onAddProductToCart(taggedProduct, post.authorId);
                          onNavigateTab('shopping');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#D4A853] hover:bg-[#E0B96B] text-[#090C10] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Shop Now</span>
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* Right Profile & Quick Actions Sidebar */}
      <aside className="lg:col-span-4 space-y-6">
        <div className="glass-panel-elevated rounded-2xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] pb-4">
            <button
              type="button"
              onClick={onOpenProfile}
              className="flex items-center gap-3 text-left min-w-0 group cursor-pointer"
            >
              <div className="w-11 h-11 rounded-full p-[2px] bg-gradient-to-tr from-[#D4A853] to-[#10B981] shrink-0">
                <div className="w-full h-full rounded-full bg-[#10151D] overflow-hidden flex items-center justify-center text-xs font-bold text-[#D4A853]">
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
              </div>
              <div className="min-w-0">
                <div className="text-base font-bold text-[#F2F1EC] group-hover:text-[#D4A853] transition-colors truncate">
                  {user.displayName}
                </div>
                <div className="text-xs font-mono text-[#9BA1A8] truncate">
                  @{user.username} · VIP Active
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs text-[#EAE9E4] flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-[#8F969E]">VEXO Secure Wallet</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[#D4A853]">
              {primaryBalance}
            </div>
            <div className="text-xs text-[#9BA1A8]">
              1-Month Free Trial · Then{' '}
              {currency === 'INR' ? '₹29/mo via Razorpay' : '$5/mo via Stripe'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-2">
            <button
              type="button"
              onClick={onOpenProfile}
              className="py-2.5 px-3 rounded-xl bg-[#D4A853]/15 hover:bg-[#D4A853]/25 border border-[#D4A853]/35 text-xs font-semibold text-[#D4A853] flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <User className="w-3.5 h-3.5" />
              <span>My Profile</span>
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="py-2.5 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-semibold text-[#F2F1EC] flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-[#D4A853]" />
              <span>IG Settings</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('payment')}
              className="py-2.5 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-semibold text-[#F2F1EC] flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Wallet className="w-3.5 h-3.5 text-[#D4A853]" />
              <span>Open Pay</span>
            </button>
            <button
              type="button"
              onClick={onOpenSecurityVault}
              className="py-2.5 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-semibold text-[#F2F1EC] flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
              <span>AES Vault</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => void onSwitchRegion()}
            className="w-full py-2.5 px-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] text-xs text-[#D4A853] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>
              Region: {user.country} (Switch to{' '}
              {user.country === 'India' ? 'International $5' : 'India ₹29'})
            </span>
          </button>
        </div>
      </aside>
    </div>
  );
};
