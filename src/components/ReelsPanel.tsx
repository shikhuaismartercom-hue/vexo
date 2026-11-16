import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Heart,
  MessageCircle,
  Music2,
  Pause,
  Play,
  Plus,
  Send,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import type { CurrencyCode, Product, ReelItem, WorkspaceTab } from '../types.ts';

interface ReelsPanelProps {
  userId: string;
  currency: CurrencyCode;
  reels: ReelItem[];
  products: Product[];
  onToggleLike: (reelId: string) => Promise<void>;
  onAddComment: (reelId: string, text: string) => Promise<void>;
  onCreateReel: (params: {
    title: string;
    caption: string;
    linkedProductId?: number;
  }) => Promise<void>;
  onAddProductToCart: (product: Product, attributedCreatorId?: string) => void;
  onNavigateTab: (tab: WorkspaceTab) => void;
}

export const ReelsPanel: React.FC<ReelsPanelProps> = ({
  userId,
  currency,
  reels,
  products,
  onToggleLike,
  onAddComment,
  onCreateReel,
  onAddProductToCart,
  onNavigateTab,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [heartBurst, setHeartBurst] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCaption, setNewCaption] = useState('');
  const [newProductId, setNewProductId] = useState<number | ''>('');

  const safeIndex = Math.min(activeIndex, Math.max(0, reels.length - 1));
  const currentReel = reels[safeIndex];

  useEffect(() => {
    setProgress(0);
  }, [safeIndex]);

  useEffect(() => {
    if (!playing || !currentReel) return;
    const timer = window.setInterval(() => {
      setProgress((prev) => (prev >= 100 ? 0 : prev + 2));
    }, 140);
    return () => window.clearInterval(timer);
  }, [playing, currentReel]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(reels.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [reels.length]);

  if (!currentReel) {
    return (
      <div className="glass-panel rounded-2xl p-12 text-center text-sm text-[#9BA1A8]">
        Loading VEXO Reels...
      </div>
    );
  }

  const liked = currentReel.likedBy.includes(userId);
  const linkedProduct = currentReel.linkedProductId
    ? products.find((p) => p.id === currentReel.linkedProductId)
    : undefined;

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentDraft.trim()) return;
    await onAddComment(currentReel.id, commentDraft.trim());
    setCommentDraft('');
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newCaption.trim()) return;
    await onCreateReel({
      title: newTitle.trim(),
      caption: newCaption.trim(),
      linkedProductId: newProductId ? Number(newProductId) : undefined,
    });
    setNewTitle('');
    setNewCaption('');
    setNewProductId('');
    setShowCreateForm(false);
    setActiveIndex(0);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#F2F1EC]">VEXO Reels</h2>
          <p className="text-xs text-[#8F969E]">
            Vertical editorial showcases · Tap to pause or shop featured gear
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#090C10] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{showCreateForm ? 'Close Studio' : 'Create Reel'}</span>
        </button>
      </div>

      {showCreateForm && (
        <form onSubmit={handleCreateSubmit} className="glass-panel rounded-2xl p-5 space-y-3">
          <div className="text-xs font-semibold text-[#D4A853]">Publish New Reel</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Reel title (e.g. Evening Watch Look)"
              className="px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-[#F2F1EC] focus:outline-none focus:border-[#D4A853]"
            />
            <select
              value={newProductId}
              onChange={(e) =>
                setNewProductId(e.target.value ? Number(e.target.value) : '')
              }
              className="px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-[#C8CDD3] focus:outline-none focus:border-[#D4A853]"
            >
              <option value="" className="bg-[#0E131A]">
                Tag a VEXO Mall item (optional)
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#0E131A]">
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            value={newCaption}
            onChange={(e) => setNewCaption(e.target.value)}
            placeholder="Write your reel caption..."
            className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-[#F2F1EC] focus:outline-none focus:border-[#D4A853]"
          />
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#090C10] text-xs font-semibold cursor-pointer"
          >
            Publish Reel
          </button>
        </form>
      )}

      {/* Main 2-Column Vertical Stage + Interactive Comments & Shop Rail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 flex items-center justify-center gap-4">
          {/* 9:16 Vertical Reel Frame */}
          <div
            onDoubleClick={() => {
              if (!liked) {
                void onToggleLike(currentReel.id);
              }
              setHeartBurst(true);
              window.setTimeout(() => setHeartBurst(false), 700);
            }}
            className="relative w-full max-w-[360px] aspect-[9/16] rounded-3xl overflow-hidden border border-white/[0.12] bg-[#10141C] shadow-2xl select-none"
          >
            <img
              src={currentReel.image}
              alt={currentReel.title}
              referrerPolicy="no-referrer"
              onClick={() => setPlaying(!playing)}
              className={`w-full h-full object-cover cursor-pointer transition-transform duration-[8000ms] ease-linear ${
                playing ? 'scale-105' : 'scale-100'
              }`}
            />

            {/* Measured Scrim for Media Overlay */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/30"
            />

            {/* Top Progress Strip */}
            <div className="absolute top-2.5 left-4 right-4 h-1 rounded-full bg-white/20 overflow-hidden">
              <div
                style={{ width: `${progress}%` }}
                className="h-full bg-[#D4A853] transition-[width] duration-150 ease-linear"
              />
            </div>

            {/* Double-Tap Heart Burst */}
            {heartBurst && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20 animate-ping">
                <Heart className="w-20 h-20 fill-red-500 text-red-500 drop-shadow-2xl" />
              </div>
            )}

            {/* Top Audio & Play Control */}
            <div className="absolute top-6 left-4 right-4 flex items-center justify-between text-xs text-white/90">
              <div className="flex items-center gap-2 bg-black/45 backdrop-blur-md px-3 py-1.5 rounded-lg">
                <Music2 className="w-3.5 h-3.5 text-[#D4A853]" />
                <span className="truncate max-w-[180px]">{currentReel.audioTrack}</span>
              </div>
              <button
                type="button"
                onClick={() => setPlaying(!playing)}
                className="p-2 rounded-lg bg-black/45 backdrop-blur-md hover:bg-black/65 cursor-pointer"
                aria-label={playing ? 'Pause reel' : 'Play reel'}
              >
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
            </div>

            {/* Right Vertical Action Stack (Instagram style) */}
            <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4">
              <button
                type="button"
                onClick={() => void onToggleLike(currentReel.id)}
                className="flex flex-col items-center gap-1 text-white cursor-pointer"
              >
                <div className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center">
                  <Heart
                    className={`w-5 h-5 ${
                      liked ? 'fill-red-500 text-red-500' : 'text-white'
                    }`}
                  />
                </div>
                <span className="text-xs font-mono tabular-nums">{currentReel.likes}</span>
              </button>

              <div className="flex flex-col items-center gap-1 text-white">
                <div className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <span className="text-xs font-mono tabular-nums">
                  {currentReel.comments.length}
                </span>
              </div>
            </div>

            {/* Bottom Creator & Shop CTA Overlay */}
            <div className="absolute bottom-4 left-4 right-16 space-y-2.5 text-white">
              <div>
                <div className="text-xs font-semibold text-[#D4A853]">
                  @{currentReel.creatorId} · {currentReel.creatorName}
                </div>
                <div className="text-sm font-bold">{currentReel.title}</div>
                <p className="text-xs text-white/85 line-clamp-2">{currentReel.caption}</p>
              </div>

              {linkedProduct && (
                <div className="space-y-1.5">
                  <div className="text-[11px] text-[#6EE7B7] flex items-center gap-1 font-medium">
                    <Sparkles className="w-3 h-3" />
                    <span>5% Instant Creator Royalty on checkout</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onAddProductToCart(linkedProduct, currentReel.creatorId);
                      onNavigateTab('shopping');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#090C10] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>
                      Shop {linkedProduct.name} (
                      {currency === 'INR'
                        ? `₹${linkedProduct.priceINR.toLocaleString('en-IN')}`
                        : `$${linkedProduct.priceUSD.toFixed(2)}`}
                      )
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Vertical Next / Prev Switcher */}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              disabled={safeIndex === 0}
              onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
              className="p-3 rounded-xl glass-panel hover:bg-white/[0.1] disabled:opacity-35 text-[#F2F1EC] cursor-pointer"
              aria-label="Previous reel"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
            <span className="text-xs font-mono tabular-nums text-[#9BA1A8]">
              {safeIndex + 1}/{reels.length}
            </span>
            <button
              type="button"
              disabled={safeIndex >= reels.length - 1}
              onClick={() => setActiveIndex((i) => Math.min(reels.length - 1, i + 1))}
              className="p-3 rounded-xl glass-panel hover:bg-white/[0.1] disabled:opacity-35 text-[#F2F1EC] cursor-pointer"
              aria-label="Next reel"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Comments & Reel Playlist Rail */}
        <div className="lg:col-span-6 space-y-5">
          <div className="glass-panel rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
              <h3 className="text-base font-semibold text-[#F2F1EC]">
                Comments ({currentReel.comments.length})
              </h3>
              <span className="text-xs text-[#8F969E]">{currentReel.title}</span>
            </div>

            <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
              {currentReel.comments.length === 0 ? (
                <p className="text-xs text-[#8F969E] py-6 text-center">
                  No comments yet. Be the first to share your thoughts.
                </p>
              ) : (
                currentReel.comments.map((c) => (
                  <div
                    key={c.id}
                    className="py-2 border-b border-white/[0.05] last:border-b-0 space-y-0.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#EAE9E4]">{c.authorName}</span>
                      <span className="font-mono text-[#7E858E]">
                        {new Date(c.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-[#B8BEC5]">{c.text}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleCommentSubmit} className="flex items-center gap-2 pt-2">
              <input
                type="text"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-[#F2F1EC] focus:outline-none focus:border-[#D4A853]"
              />
              <button
                type="submit"
                disabled={!commentDraft.trim()}
                className="px-4 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] disabled:opacity-50 text-[#090C10] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <span>Post</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>

          {/* Up Next Playlist */}
          <div className="glass-panel rounded-2xl p-5 space-y-3">
            <div className="text-xs font-semibold text-[#9BA1A8]">Up Next in Reels</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {reels.map((r, idx) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  className={`p-2.5 rounded-xl text-left border transition-colors cursor-pointer ${
                    idx === safeIndex
                      ? 'bg-[#D4A853]/15 border-[#D4A853]/45'
                      : 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.07]'
                  }`}
                >
                  <div className="text-xs font-semibold text-[#F2F1EC] truncate">{r.title}</div>
                  <div className="text-[11px] text-[#8F969E] truncate">@{r.creatorId}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
