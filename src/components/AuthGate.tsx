import React, { useState } from 'react';
import { ArrowRight, Check, Eye, EyeOff, Globe, Lock, ShieldCheck } from 'lucide-react';
import type { CountryOption } from '../types.ts';
import { VexoBlackCard } from './VexoBlackCard.tsx';

interface AuthGateProps {
  initialCountry: CountryOption;
  autoDetectedLabel: string;
  onLogin: (params: { username: string; password: string }) => Promise<void>;
  onRegister: (params: {
    username: string;
    password: string;
    displayName: string;
    country: CountryOption;
    bio?: string;
    upiId?: string;
  }) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  initialCountry,
  autoDetectedLabel,
  onLogin,
  onRegister,
  loading,
  error,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('khushi_rathore');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [upiId, setUpiId] = useState('');
  const [country, setCountry] = useState<CountryOption>(initialCountry);
  const [showPassword, setShowPassword] = useState(false);

  const isIndia = country === 'India';

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    if (nextMode === 'register' && username === 'khushi_rathore') {
      setUsername('');
      setPassword('');
    } else if (nextMode === 'login' && !username) {
      setUsername('khushi_rathore');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') {
      await onLogin({ username: username.trim(), password });
    } else {
      await onRegister({
        username: username.trim(),
        password,
        displayName: displayName.trim() || username.trim(),
        country,
        bio: bio.trim() || undefined,
        upiId: upiId.trim() || undefined,
      });
    }
  };

  const fillDemoAccount = () => {
    setMode('login');
    setUsername('khushi_rathore');
    setPassword('vexo1234');
  };

  return (
    <div className="min-h-screen bg-[#090C10] text-[#F2F1EC] relative overflow-hidden flex flex-col justify-between">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-48 left-1/4 w-[620px] h-[620px] rounded-full bg-[#D4A853]/[0.06] blur-[140px]" />
        <div className="absolute -bottom-48 right-1/5 w-[540px] h-[540px] rounded-full bg-[#1E3A34]/[0.18] blur-[140px]" />
      </div>

      <header className="relative z-10 max-w-[1280px] w-full mx-auto px-6 lg:px-10 py-6 flex items-center justify-between gap-8 border-b border-white/[0.07]">
        <span className="text-xl font-bold tracking-[0.22em] font-display whitespace-nowrap shrink-0 text-[#D4A853]">
          VEXO
        </span>
        <nav className="hidden md:flex items-center gap-7 text-sm text-[#9BA1A8]">
          <span>Home Feed</span>
          <span>Encrypted Chat</span>
          <span>Reels</span>
          <span>UPI & Global Pay</span>
          <span>VEXO Mall</span>
        </nav>
        <button
          type="button"
          onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
          className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#D4A853] text-[#090C10] hover:bg-[#E0B96B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {mode === 'login' ? 'Create Account' : 'Sign In'}
        </button>
      </header>

      <main className="relative z-10 max-w-[1280px] w-full mx-auto px-6 lg:px-10 py-10 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-6 space-y-6">
          <p className="text-xs tracking-wide text-[#D4A853] font-medium">
            Social · Zero-Trust Escrow · Ghost Burner Card · Voice AI
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.08] text-[#F2F1EC] [text-wrap:balance] max-w-xl">
            Social, Escrow Pay & Voice AI in one private vault.
          </h1>
          <p className="text-base text-[#A2A8B0] leading-relaxed max-w-lg">
            One unified VEXO ID for your Home Feed, disappearing Messages, Video Calls, Shoppable
            Reels (5% Creator Royalty), and AES-256-GCM Payments with UPI <span className="font-mono text-[#D4A853]">2010jiya@fam</span>.
          </p>

          <div className="max-w-md pt-1">
            <VexoBlackCard
              holderName="Khushi Rathore"
              username="khushi_rathore"
              currency={isIndia ? 'INR' : 'USD'}
              balance={isIndia ? 10000 : 500}
              previewOnly
            />
          </div>

          <div className="pt-2 border-t border-white/[0.08] grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-[#9BA1A8]">
            <div className="space-y-1">
              <div className="font-semibold text-[#F2F1EC]">India Plan · Razorpay</div>
              <div>1 महीने फ्री ट्रायल के बाद ₹29/महीना</div>
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-[#F2F1EC]">Global Plan · Stripe</div>
              <div>After 1-month free trial, $5/month</div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 flex justify-center lg:justify-end">
          <form
            onSubmit={handleSubmit}
            className="glass-panel-elevated rounded-2xl p-6 sm:p-8 w-full max-w-md space-y-5"
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-[#9BA1A8]">
                <span>Detected: {autoDetectedLabel}</span>
                <span className="font-mono text-[#D4A853]">30-DAY FREE VIP</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-[#F2F1EC]">
                {mode === 'login' ? 'Sign in to VEXO' : 'Create your VEXO ID'}
              </h2>
            </div>

            {/* Segmented Mode Switcher */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  mode === 'login'
                    ? 'bg-[#D4A853] text-[#090C10]'
                    : 'text-[#A8AEB5] hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={`py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  mode === 'register'
                    ? 'bg-[#D4A853] text-[#090C10]'
                    : 'text-[#A8AEB5] hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>

            {mode === 'register' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor="displayName" className="block text-xs font-medium text-[#A8AEB5]">
                      Full Name
                    </label>
                    <input
                      id="displayName"
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Jiya Sharma"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-[#F2F1EC] placeholder-[#6B7280] focus:outline-none focus:border-[#D4A853]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="registerUpi" className="block text-xs font-medium text-[#A8AEB5]">
                      UPI ID (Optional)
                    </label>
                    <input
                      id="registerUpi"
                      type="text"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="2010jiya@fam"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm font-mono text-[#F2F1EC] placeholder-[#6B7280] focus:outline-none focus:border-[#D4A853]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="registerBio" className="block text-xs font-medium text-[#A8AEB5]">
                    Profile Bio (Optional)
                  </label>
                  <input
                    id="registerBio"
                    type="text"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Creator, Shopper & VEXO Member"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-[#F2F1EC] placeholder-[#6B7280] focus:outline-none focus:border-[#D4A853]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#A8AEB5]">
                    Smart Auto-Currency Plan
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setCountry('India')}
                      className={`px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                        isIndia
                          ? 'bg-[#D4A853] text-[#090C10] font-semibold'
                          : 'text-[#C2C7CE] hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="text-xs font-semibold">India</div>
                      <div className="text-[11px] font-mono tabular-nums opacity-85">
                        ₹29/mo · Razorpay
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCountry('International')}
                      className={`px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                        !isIndia
                          ? 'bg-[#D4A853] text-[#090C10] font-semibold'
                          : 'text-[#C2C7CE] hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="text-xs font-semibold">International</div>
                      <div className="text-[11px] font-mono tabular-nums opacity-85">
                        $5/mo · Stripe
                      </div>
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <label htmlFor="username" className="block text-xs font-medium text-[#A8AEB5]">
                Username
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="khushi_rathore"
                autoComplete="username"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm font-mono text-[#F2F1EC] placeholder-[#6B7280] focus:outline-none focus:border-[#D4A853]"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-xs font-medium text-[#A8AEB5]">
                  Password
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={fillDemoAccount}
                    className="text-xs text-[#D4A853] hover:underline cursor-pointer"
                  >
                    Use demo ID (khushi_rathore)
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password (demo: vexo1234)"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-[#F2F1EC] placeholder-[#6B7280] focus:outline-none focus:border-[#D4A853]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8F969E] hover:text-white cursor-pointer"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] disabled:opacity-60 text-[#090C10] font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>
                {loading
                  ? 'Opening your VEXO ID...'
                  : mode === 'login'
                    ? 'Open My VEXO ID'
                    : 'Create ID & Start 1-Month Free Trial'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between text-xs text-[#7E858E] pt-1">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#10B981]" />
                <span>Salted Scrypt + AES-256</span>
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#D4A853]" />
                <span>Zero-Fraud Guard</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                <span>Cancel anytime</span>
              </span>
            </div>
          </form>
        </div>
      </main>

      <footer className="relative z-10 max-w-[1280px] w-full mx-auto px-6 lg:px-10 py-5 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#7E858E]">
        <span>VEXO Super App · Demo accounts: khushi_rathore or alex_02 (password: vexo1234)</span>
        <span className="flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-[#10B981]" />
          <span>1-Month Free VIP Trial included</span>
        </span>
      </footer>
    </div>
  );
};
