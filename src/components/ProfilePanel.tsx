import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Camera,
  Check,
  Clapperboard,
  Edit3,
  Eye,
  Flame,
  Globe,
  Grid3X3,
  Heart,
  KeyRound,
  Lock,
  LogOut,
  PhoneCall,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCheck,
  UserPlus,
  Wallet,
} from 'lucide-react';
import type {
  CountryOption,
  FeedPost,
  ReelItem,
  Transaction,
  UserProfile,
  UserSettings,
  WorkspaceTab,
} from '../types.ts';
import { CameraQrModal } from './CameraQrModal.tsx';

interface ProfilePanelProps {
  user: UserProfile;
  posts: FeedPost[];
  reels: ReelItem[];
  transactions: Transaction[];
  initialSubTab?: 'posts' | 'reels' | 'royalty' | 'settings';
  onUpdateProfile: (params: {
    displayName?: string;
    bio?: string;
    upiId?: string;
    avatarUrl?: string;
    country?: CountryOption;
    settings?: Partial<UserSettings>;
  }) => Promise<void>;
  onChangePassword: (params: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
  onNavigateTab: (tab: WorkspaceTab) => void;
  onOpenSecurityVault: () => void;
  onLogout: () => void;
}

const DEFAULT_SETTINGS: UserSettings = {
  privateAccount: false,
  showActivityStatus: true,
  readReceipts: true,
  defaultGhostChat: false,
  pushNotifications: true,
  callAlerts: true,
  twoFactorEnabled: true,
};

export const ProfilePanel: React.FC<ProfilePanelProps> = ({
  user,
  posts,
  reels,
  transactions,
  initialSubTab = 'posts',
  onUpdateProfile,
  onChangePassword,
  onNavigateTab,
  onOpenSecurityVault,
  onLogout,
}) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [profileTab, setProfileTab] = useState<'posts' | 'reels' | 'royalty' | 'settings'>(
    initialSubTab
  );
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [displayName, setDisplayName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio || '');
  const [upiId, setUpiId] = useState(user.upiId || '2010jiya@fam');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [country, setCountry] = useState<CountryOption>(user.country);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    setProfileTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    setDisplayName(user.displayName);
    setBio(user.bio || '');
    setUpiId(user.upiId || '2010jiya@fam');
    setAvatarUrl(user.avatarUrl || '');
    setCountry(user.country);
  }, [user]);

  const activeSettings: UserSettings = {
    ...DEFAULT_SETTINGS,
    ...(user.settings || {}),
  };

  const plan = user.subscription!;
  const currency = plan.currency;
  const symbol = currency === 'INR' ? '₹' : '$';
  const primaryBalance =
    currency === 'INR' ? user.walletBalanceINR : user.walletBalanceUSD;

  const myPosts = posts.filter((p) => p.authorId === user.userId);
  const myReels = reels.filter((r) => r.creatorId === user.userId);
  const royaltyTxns = transactions.filter(
    (t) => t.type === 'royalty' && t.receiverId.toLowerCase() === user.userId
  );
  const totalRoyalty = royaltyTxns.reduce((sum, t) => sum + t.amount, 0);

  const showSuccess = (msg: string) => {
    setSettingsError(null);
    setSavedNotice(msg);
    window.setTimeout(() => {
      setSavedNotice((curr) => (curr === msg ? null : curr));
    }, 3000);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSettingsError(null);
    try {
      await onUpdateProfile({
        displayName: displayName.trim() || user.displayName,
        bio: bio.trim(),
        upiId: upiId.trim() || '2010jiya@fam',
        avatarUrl,
        country,
      });
      setEditing(false);
      showSuccess('Profile saved to your VEXO ID.');
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSetting = async (key: keyof UserSettings, label: string) => {
    const nextVal = !activeSettings[key];
    try {
      await onUpdateProfile({ settings: { [key]: nextVal } });
      showSuccess(`${label} ${nextVal ? 'enabled' : 'disabled'}.`);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to update setting.');
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangingPassword(true);
    setSettingsError(null);
    try {
      await onChangePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      showSuccess('Password updated securely with salted scrypt.');
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Unable to update password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarUrl(reader.result);
        void onUpdateProfile({ avatarUrl: reader.result });
        showSuccess('Profile photo updated.');
      }
    };
    reader.readAsDataURL(file);
  };

  const renderToggleRow = (params: {
    keyName: keyof UserSettings;
    Icon: React.ComponentType<{ className?: string }>;
    title: string;
    subtitle: string;
  }) => {
    const enabled = activeSettings[params.keyName];
    const RowIcon = params.Icon;
    return (
      <div
        key={params.keyName}
        className="py-3.5 flex items-center justify-between gap-4 border-b border-white/[0.06] last:border-b-0"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[#D4A853] shrink-0">
            <RowIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-[#F2F1EC]">{params.title}</div>
            <div className="text-xs text-[#8F969E]">{params.subtitle}</div>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => void handleToggleSetting(params.keyName, params.title)}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
            enabled ? 'bg-[#D4A853]' : 'bg-white/[0.14]'
          }`}
        >
          <span
            className={`block w-4 h-4 rounded-full bg-[#090C10] transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <CameraQrModal
        open={cameraOpen}
        mode="camera"
        onClose={() => setCameraOpen(false)}
        onCapturePhoto={(dataUrl) => {
          setAvatarUrl(dataUrl);
          void onUpdateProfile({ avatarUrl: dataUrl });
          showSuccess('Profile photo captured.');
        }}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Instagram-Style Profile Header Card */}
      <section className="glass-panel-elevated rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="relative w-24 h-24 shrink-0">
              <div className="w-24 h-24 rounded-full p-[3px] bg-gradient-to-tr from-[#D4A853] via-[#F2D08A] to-[#10B981]">
                <div className="w-full h-full rounded-full bg-[#10151D] overflow-hidden flex items-center justify-center">
                  {avatarUrl || user.avatarUrl ? (
                    <img
                      src={avatarUrl || user.avatarUrl}
                      alt={user.displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-bold text-[#D4A853]">
                      {user.displayName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                title="Take Profile Photo"
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#D4A853] hover:bg-[#E0B96B] text-[#090C10] flex items-center justify-center shadow-lg cursor-pointer"
                aria-label="Capture profile photo"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-2xl font-bold text-[#F2F1EC]">{user.displayName}</h2>
                  <span className="text-xs font-mono text-[#D4A853]">@{user.username}</span>
                  {activeSettings.privateAccount && (
                    <span className="text-xs text-[#10B981] flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>Private</span>
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#B8BEC5] mt-1 max-w-xl">
                  {user.bio || 'VEXO VIP Member · Verified Zero-Trust ID'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-5 text-xs text-[#9BA1A8]">
                <div>
                  <span className="font-mono font-bold text-[#F2F1EC] tabular-nums">
                    {myPosts.length + myReels.length}
                  </span>{' '}
                  Posts & Reels
                </div>
                <div>
                  <span className="font-mono font-bold text-[#F2F1EC] tabular-nums">
                    {(user.followersCount ?? 14).toLocaleString()}
                  </span>{' '}
                  Followers
                </div>
                <div>
                  <span className="font-mono font-bold text-[#F2F1EC] tabular-nums">
                    {(user.followingCount ?? 12).toLocaleString()}
                  </span>{' '}
                  Following
                </div>
                <div className="text-[#D4A853] font-mono">
                  UPI: {user.upiId || '2010jiya@fam'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              className="px-4 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#090C10] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{editing ? 'Cancel Edit' : 'Edit Profile'}</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-[#EAE9E4] flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-[#D4A853]" />
              <span>Photo</span>
            </button>
            <button
              type="button"
              onClick={() => setProfileTab('settings')}
              className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                profileTab === 'settings'
                  ? 'bg-white/[0.14] border-[#D4A853]/50 text-[#D4A853]'
                  : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.1] text-[#EAE9E4]'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          </div>
        </div>

        {savedNotice && (
          <div className="p-3 rounded-xl bg-[#10B981]/10 border border-[#10B981]/30 text-xs text-[#6EE7B7] flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>{savedNotice}</span>
          </div>
        )}
        {settingsError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
            {settingsError}
          </div>
        )}

        {editing && (
          <form
            onSubmit={handleSaveProfile}
            className="pt-5 border-t border-white/[0.08] grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#A8AEB5]">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-[#F2F1EC] focus:outline-none focus:border-[#D4A853]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#A8AEB5]">
                Linked UPI Handle (for QR & Payouts)
              </label>
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="2010jiya@fam"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm font-mono text-[#F2F1EC] focus:outline-none focus:border-[#D4A853]"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="block text-xs font-medium text-[#A8AEB5]">Bio</label>
              <input
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell people about yourself..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-[#F2F1EC] focus:outline-none focus:border-[#D4A853]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#A8AEB5]">
                Region & Auto-Currency
              </label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value as CountryOption)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-[#F2F1EC] focus:outline-none focus:border-[#D4A853]"
              >
                <option value="India" className="bg-[#0E131A]">
                  India (₹29/mo · Razorpay)
                </option>
                <option value="International" className="bg-[#0E131A]">
                  International ($5/mo · Stripe)
                </option>
              </select>
            </div>

            <div className="flex items-end justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium text-[#EAE9E4] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] disabled:opacity-60 text-[#090C10] text-xs font-semibold cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Profile Content Switcher */}
      <div className="flex flex-wrap items-center gap-2 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08] w-fit">
        <button
          type="button"
          onClick={() => setProfileTab('posts')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
            profileTab === 'posts'
              ? 'bg-[#D4A853] text-[#090C10]'
              : 'text-[#A8AEB5] hover:text-white'
          }`}
        >
          <Grid3X3 className="w-3.5 h-3.5" />
          <span>My Posts ({myPosts.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setProfileTab('reels')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
            profileTab === 'reels'
              ? 'bg-[#D4A853] text-[#090C10]'
              : 'text-[#A8AEB5] hover:text-white'
          }`}
        >
          <Clapperboard className="w-3.5 h-3.5" />
          <span>My Reels ({myReels.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setProfileTab('royalty')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
            profileTab === 'royalty'
              ? 'bg-[#D4A853] text-[#090C10]'
              : 'text-[#A8AEB5] hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Royalty & Wallet</span>
        </button>
        <button
          type="button"
          onClick={() => setProfileTab('settings')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
            profileTab === 'settings'
              ? 'bg-[#D4A853] text-[#090C10]'
              : 'text-[#A8AEB5] hover:text-white'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Settings & Privacy</span>
        </button>
      </div>

      {profileTab === 'posts' && (
        <section className="glass-panel rounded-2xl p-6">
          {myPosts.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-sm text-[#A8AEB5]">You haven&apos;t shared any posts yet.</p>
              <button
                type="button"
                onClick={() => onNavigateTab('home')}
                className="px-4 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#090C10] text-xs font-semibold cursor-pointer"
              >
                Create Your First Post on Home
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {myPosts.map((post) => (
                <div
                  key={post.id}
                  className="rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03]"
                >
                  <div className="aspect-square overflow-hidden bg-[#131821]">
                    <img
                      src={post.image}
                      alt={post.caption}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-3 space-y-1">
                    <p className="text-xs text-[#EAE9E4] line-clamp-2">{post.caption}</p>
                    <div className="flex items-center gap-1 text-xs text-[#9BA1A8] font-mono tabular-nums">
                      <Heart className="w-3.5 h-3.5 text-red-400" />
                      <span>{post.likes}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {profileTab === 'reels' && (
        <section className="glass-panel rounded-2xl p-6">
          {myReels.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-sm text-[#A8AEB5]">No Reels published from @{user.username} yet.</p>
              <button
                type="button"
                onClick={() => onNavigateTab('reels')}
                className="px-4 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#090C10] text-xs font-semibold cursor-pointer"
              >
                Open Reels Studio
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {myReels.map((reel) => (
                <div
                  key={reel.id}
                  onClick={() => onNavigateTab('reels')}
                  className="rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03] cursor-pointer hover:border-[#D4A853]/40 transition-colors"
                >
                  <div className="aspect-[9/12] overflow-hidden bg-[#131821]">
                    <img
                      src={reel.image}
                      alt={reel.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-3 space-y-1">
                    <div className="text-xs font-semibold text-[#F2F1EC] truncate">
                      {reel.title}
                    </div>
                    <div className="text-[11px] text-[#9BA1A8] font-mono tabular-nums">
                      {reel.likes} likes · {reel.comments.length} comments
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {profileTab === 'royalty' && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="glass-panel rounded-2xl p-6 space-y-2">
            <div className="flex items-center justify-between text-xs text-[#9BA1A8]">
              <span>5% Creator Royalty Earned</span>
              <Sparkles className="w-4 h-4 text-[#D4A853]" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[#10B981]">
              {currency === 'INR'
                ? `${symbol}${totalRoyalty.toLocaleString('en-IN')}`
                : `${symbol}${totalRoyalty.toFixed(2)}`}
            </div>
            <p className="text-xs text-[#8F969E]">
              Tag VEXO Mall products in your Posts or Reels to earn 5% on every shopper checkout.
            </p>
          </div>

          <div className="glass-panel rounded-2xl p-6 space-y-2">
            <div className="flex items-center justify-between text-xs text-[#9BA1A8]">
              <span>Wallet & Plan</span>
              <Wallet className="w-4 h-4 text-[#D4A853]" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[#F2F1EC]">
              {currency === 'INR'
                ? `₹${primaryBalance.toLocaleString('en-IN')}`
                : `$${primaryBalance.toFixed(2)}`}
            </div>
            <div className="text-xs text-[#8F969E] flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[#D4A853]" />
              <span>
                {user.country} · {currency === 'INR' ? '₹29/mo Razorpay' : '$5/mo Stripe'} (Trial Active)
              </span>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6 space-y-3">
            <div className="flex items-center justify-between text-xs text-[#9BA1A8]">
              <span>Zero-Trust Identity</span>
              <ShieldCheck className="w-4 h-4 text-[#10B981]" />
            </div>
            <div className="text-sm font-semibold text-[#F2F1EC]">
              Salted Scrypt + HMAC Token Active
            </div>
            <button
              type="button"
              onClick={onOpenSecurityVault}
              className="w-full py-2 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-[#D4A853] cursor-pointer"
            >
              Inspect AES-256 Security Vault →
            </button>
          </div>
        </section>
      )}

      {/* Instagram-Style Settings & Privacy */}
      {profileTab === 'settings' && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-6">
            <div className="glass-panel rounded-2xl p-6 space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#D4A853] pb-2 border-b border-white/[0.07]">
                Account Privacy (Instagram Style)
              </div>
              {renderToggleRow({
                keyName: 'privateAccount',
                Icon: Lock,
                title: 'Private Account',
                subtitle: 'Only approved followers and VIP contacts can view your full activity.',
              })}
              {renderToggleRow({
                keyName: 'showActivityStatus',
                Icon: UserCheck,
                title: 'Show Activity Status',
                subtitle: 'Allow contacts you message to see when you are online in VEXO.',
              })}
              {renderToggleRow({
                keyName: 'readReceipts',
                Icon: Eye,
                title: 'Read Receipts',
                subtitle: 'Let recipients see when you have read their encrypted messages.',
              })}
              {renderToggleRow({
                keyName: 'defaultGhostChat',
                Icon: Flame,
                title: 'Default Ghost Mode (10s Disappearing)',
                subtitle: 'Automatically start new chats with 10-second self-destruct enabled.',
              })}
            </div>

            <div className="glass-panel rounded-2xl p-6 space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#D4A853] pb-2 border-b border-white/[0.07]">
                Notifications & Zero-Trust Protection
              </div>
              {renderToggleRow({
                keyName: 'pushNotifications',
                Icon: Bell,
                title: 'Likes, Comments & Payment Alerts',
                subtitle: 'Receive instant updates for Reels royalties, Escrow locks, and likes.',
              })}
              {renderToggleRow({
                keyName: 'callAlerts',
                Icon: PhoneCall,
                title: 'Incoming WebRTC Call Ringing',
                subtitle: 'Show live audio & video call banners across active sessions.',
              })}
              {renderToggleRow({
                keyName: 'twoFactorEnabled',
                Icon: ShieldCheck,
                title: 'Two-Factor & High-Value Step-Up Guard',
                subtitle: 'Require confirmation for transfers above ₹10,000 or $200.',
              })}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            {/* Password & Security Card */}
            <form onSubmit={handlePasswordSubmit} className="glass-panel rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#D4A853]">
                <KeyRound className="w-4 h-4" />
                <span>Password & Security</span>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs text-[#A8AEB5]">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-[#F2F1EC] focus:outline-none focus:border-[#D4A853]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs text-[#A8AEB5]">New Password</label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 4 characters"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-[#F2F1EC] focus:outline-none focus:border-[#D4A853]"
                />
              </div>
              <button
                type="submit"
                disabled={changingPassword}
                className="w-full py-2.5 px-4 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] disabled:opacity-60 text-[#090C10] text-xs font-semibold cursor-pointer"
              >
                {changingPassword ? 'Updating...' : 'Change Password'}
              </button>
            </form>

            {/* Accounts Center & Login Actions */}
            <div className="glass-panel rounded-2xl p-6 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#9BA1A8]">
                Accounts Center & Login
              </div>
              <button
                type="button"
                onClick={onOpenSecurityVault}
                className="w-full py-2.5 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-medium text-[#F2F1EC] flex items-center justify-between cursor-pointer"
              >
                <span>AES-256 Encryption Vault</span>
                <ShieldCheck className="w-4 h-4 text-[#10B981]" />
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('payment')}
                className="w-full py-2.5 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-medium text-[#F2F1EC] flex items-center justify-between cursor-pointer"
              >
                <span>Manage UPI ({user.upiId || '2010jiya@fam'})</span>
                <Wallet className="w-4 h-4 text-[#D4A853]" />
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="w-full py-2.5 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-medium text-[#D4A853] flex items-center justify-between cursor-pointer"
              >
                <span>Add or Switch Account</span>
                <UserPlus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="w-full py-2.5 px-4 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-semibold text-red-200 flex items-center justify-between cursor-pointer"
              >
                <span>Log Out (@{user.username})</span>
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
