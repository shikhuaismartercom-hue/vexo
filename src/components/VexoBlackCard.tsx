import React, { useRef, useState } from 'react';
import { Eye, EyeOff, RefreshCw, ShieldAlert, ShieldCheck, Snowflake } from 'lucide-react';
import type { CurrencyCode } from '../types.ts';

interface VexoBlackCardProps {
  holderName: string;
  username: string;
  currency: CurrencyCode;
  balance: number;
  previewOnly?: boolean;
  onCardActionNotice?: (msg: string) => void;
}

function generateGhostDigits(): { last4: string; mid1: string; mid2: string; cvv: string } {
  const rand = (len: number) =>
    Array.from({ length: len }, () => Math.floor(Math.random() * 10)).join('');
  return {
    mid1: rand(4),
    mid2: rand(4),
    last4: rand(4),
    cvv: rand(3),
  };
}

export const VexoBlackCard: React.FC<VexoBlackCardProps> = ({
  holderName,
  username,
  currency,
  balance,
  previewOnly = false,
  onCardActionNotice,
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50 });
  const [revealed, setRevealed] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [ghostDigits, setGhostDigits] = useState(() => generateGhostDigits());

  const symbol = currency === 'INR' ? '₹' : '$';
  const formattedBalance =
    currency === 'INR'
      ? `${symbol}${balance.toLocaleString('en-IN')}`
      : `${symbol}${balance.toFixed(2)}`;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const ry = (x - 0.5) * 14;
    const rx = (0.5 - y) * 12;
    setTilt({
      rx,
      ry,
      gx: Math.round(x * 100),
      gy: Math.round(y * 100),
    });
  };

  const handleMouseLeave = () => {
    setTilt({ rx: 0, ry: 0, gx: 50, gy: 50 });
  };

  const handleRegenerateGhost = () => {
    const next = generateGhostDigits();
    setGhostDigits(next);
    setRevealed(true);
    onCardActionNotice?.(
      `New single-use Ghost Burner Card minted (••${next.last4}) — previous number burned.`
    );
  };

  const handleToggleFreeze = () => {
    const next = !frozen;
    setFrozen(next);
    onCardActionNotice?.(
      next
        ? 'VEXO Black Card frozen — all online & card charges locked.'
        : 'VEXO Black Card unfrozen and ready for payments.'
    );
  };

  return (
    <div className="space-y-3">
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `perspective(1000px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          transition: tilt.rx === 0 && tilt.ry === 0 ? 'transform 350ms ease' : 'none',
        }}
        className={`relative rounded-2xl p-6 overflow-hidden border select-none shadow-2xl ${
          frozen
            ? 'border-sky-400/35 bg-gradient-to-br from-[#0F1824] via-[#0B1119] to-[#080B10]'
            : 'border-[#D4A853]/35 bg-gradient-to-br from-[#191B22] via-[#0E1117] to-[#080A0F]'
        }`}
      >
        {/* Dynamic metallic cursor sheen */}
        <div
          aria-hidden="true"
          style={{
            background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, ${
              frozen ? 'rgba(56, 189, 248, 0.16)' : 'rgba(212, 168, 83, 0.22)'
            }, transparent 58%)`,
          }}
          className="pointer-events-none absolute inset-0"
        />

        {/* Top row */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-bold tracking-[0.26em] text-[#D4A853]">VEXO</span>
            <span className="text-[11px] font-mono text-[#9BA1A8]">BLACK · GHOST CARD</span>
          </div>
          <span
            className={`text-[11px] font-mono flex items-center gap-1 ${
              frozen ? 'text-sky-300' : 'text-[#10B981]'
            }`}
          >
            {frozen ? (
              <>
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>FROZEN</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>AES-256 ACTIVE</span>
              </>
            )}
          </span>
        </div>

        {/* Metallic EMV Chip & Balance */}
        <div className="relative z-10 mt-6 flex items-end justify-between gap-4">
          <div className="w-10 h-7 rounded-md bg-gradient-to-br from-[#E7C77A] via-[#C6953D] to-[#7D5B1F] border border-[#F3DC9B]/40 shadow-inner" />
          <div className="text-right">
            <div className="text-[11px] text-[#8F969E]">Available Balance</div>
            <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[#F2F1EC]">
              {formattedBalance}
            </div>
          </div>
        </div>

        {/* Card Number */}
        <div className="relative z-10 mt-6 font-mono text-base sm:text-lg tracking-[0.2em] tabular-nums text-[#EAE9E4]">
          {revealed
            ? `4921  ${ghostDigits.mid1}  ${ghostDigits.mid2}  ${ghostDigits.last4}`
            : `4921  ••••  ••••  ${ghostDigits.last4}`}
        </div>

        {/* Bottom Holder + CVV */}
        <div className="relative z-10 mt-5 pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#7E858E]">Cardholder</div>
            <div className="font-semibold text-[#F2F1EC] uppercase tracking-wide">
              {holderName} · @{username}
            </div>
          </div>
          <div className="flex items-center gap-5 font-mono tabular-nums">
            <div>
              <div className="text-[10px] uppercase text-[#7E858E]">Exp</div>
              <div className="text-[#EAE9E4]">12/29</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-[#7E858E]">CVV</div>
              <div className="text-[#D4A853] font-semibold">
                {revealed ? ghostDigits.cvv : '•••'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {!previewOnly && (
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setRevealed(!revealed)}
            className="py-2 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-xs font-medium text-[#EAE9E4] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {revealed ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-[#D4A853]" />
                <span>Hide</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-[#D4A853]" />
                <span>Reveal</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleRegenerateGhost}
            className="py-2 px-3 rounded-xl bg-[#D4A853]/15 hover:bg-[#D4A853]/25 border border-[#D4A853]/35 text-xs font-semibold text-[#E8C57B] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Burner Card</span>
          </button>

          <button
            type="button"
            onClick={handleToggleFreeze}
            className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
              frozen
                ? 'bg-sky-500/20 border-sky-400/40 text-sky-200'
                : 'bg-white/[0.05] hover:bg-white/[0.09] border-white/[0.08] text-[#EAE9E4]'
            }`}
          >
            <Snowflake className="w-3.5 h-3.5" />
            <span>{frozen ? 'Unfreeze' : 'Freeze'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
