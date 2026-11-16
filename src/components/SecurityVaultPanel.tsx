import React, { useState } from 'react';
import { CheckCircle2, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { CurrencyCode, SecurityEvent, Transaction } from '../types.ts';

interface SecurityVaultPanelProps {
  userId: string;
  sessionToken: string;
  currency: CurrencyCode;
  transactions: Transaction[];
  securityEvents: SecurityEvent[];
  onTestFraudBlock: () => Promise<void>;
  onTestHighValueStepUp: () => Promise<void>;
}

export const SecurityVaultPanel: React.FC<SecurityVaultPanelProps> = ({
  userId,
  sessionToken,
  currency,
  transactions,
  securityEvents,
  onTestFraudBlock,
  onTestHighValueStepUp,
}) => {
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifiedResult, setVerifiedResult] = useState<{
    transactionId: string;
    valid: boolean;
    decryptedPayload?: Record<string, unknown>;
    error?: string;
  } | null>(null);

  const handleVerifySeal = async (transactionId: string) => {
    setVerifyingId(transactionId);
    try {
      const res = await fetch('/api/security/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-id': userId,
          'x-session-token': sessionToken,
        },
        body: JSON.stringify({ transactionId }),
      });
      const data = await res.json();
      setVerifiedResult({
        transactionId,
        valid: Boolean(data.valid),
        decryptedPayload: data.decryptedPayload,
        error: data.error,
      });
    } catch {
      setVerifiedResult({
        transactionId,
        valid: false,
        error: 'Unable to reach verification vault.',
      });
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Architecture Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-panel rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#9BA1A8]">Payload Cipher</span>
            <Lock className="w-4 h-4 text-[#D4A853]" />
          </div>
          <div className="text-xl font-bold font-mono text-[#F2F1EC]">AES-256-GCM</div>
          <p className="text-xs text-[#8F969E] leading-relaxed">
            Every transaction receipt is sealed server-side with a unique 96-bit IV, 128-bit auth
            tag, and HMAC-SHA256 integrity signature.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#9BA1A8]">Active Fraud Rules</span>
            <ShieldCheck className="w-4 h-4 text-[#10B981]" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-[#F2F1EC]">
            4 Real-Time Guards
          </div>
          <p className="text-xs text-[#8F969E] leading-relaxed">
            Self-transfer block · 8s replay velocity guard · Watchlist match · Step-up check at{' '}
            <span className="font-mono tabular-nums text-[#D4A853]">
              {currency === 'INR' ? '₹10,000+' : '$200+'}
            </span>
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#9BA1A8]">Simulate Fraud Shield</span>
            <ShieldAlert className="w-4 h-4 text-[#D4A853]" />
          </div>
          <p className="text-xs text-[#8F969E]">
            Trigger a live server-side fraud check to inspect how Zero-Trust blocks or escalates
            risky payloads.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => void onTestFraudBlock()}
              className="px-3 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-semibold text-red-200 transition-colors whitespace-nowrap cursor-pointer"
            >
              Test Watchlist Block
            </button>
            <button
              type="button"
              onClick={() => void onTestHighValueStepUp()}
              className="px-3 py-2 rounded-lg bg-[#D4A853]/15 hover:bg-[#D4A853]/25 border border-[#D4A853]/35 text-xs font-semibold text-[#E8C57B] transition-colors whitespace-nowrap cursor-pointer"
            >
              Test Step-Up Guard
            </button>
          </div>
        </div>
      </div>

      {/* Decryption Verification Result Banner */}
      {verifiedResult && (
        <div className="glass-panel-elevated rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#F2F1EC]">
              <CheckCircle2
                className={`w-4 h-4 ${
                  verifiedResult.valid ? 'text-[#10B981]' : 'text-red-400'
                }`}
              />
              <span>
                Cryptographic Verification for{' '}
                <span className="font-mono">{verifiedResult.transactionId}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setVerifiedResult(null)}
              className="text-xs text-[#8F969E] hover:text-[#F2F1EC] cursor-pointer"
            >
              Close
            </button>
          </div>
          {verifiedResult.valid && verifiedResult.decryptedPayload ? (
            <pre className="p-3.5 rounded-xl bg-black/40 border border-white/[0.08] text-xs font-mono text-[#A7F3D0] overflow-x-auto">
              {JSON.stringify(verifiedResult.decryptedPayload, null, 2)}
            </pre>
          ) : (
            <p className="text-xs text-red-300">{verifiedResult.error}</p>
          )}
        </div>
      )}

      {/* Two-Column Split: Encrypted Receipts + Security Audit Trail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
            <div>
              <h3 className="text-base font-semibold text-[#F2F1EC]">
                AES-256-GCM Sealed Payloads
              </h3>
              <p className="text-xs text-[#8F969E]">
                Click Verify Seal to decrypt and authenticate the tag on the server
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#9BA1A8]">
              {transactions.length} sealed
            </span>
          </div>

          {transactions.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#8F969E]">
              No encrypted transactions yet. Complete a wallet transfer or marketplace checkout to
              inspect its AES-256-GCM seal.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {transactions.map((txn) => (
                <div
                  key={txn.transactionId}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-[#C8CDD3]">
                      <span className="font-mono font-semibold text-[#F2F1EC]">
                        {txn.transactionId}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {txn.currency === 'INR'
                          ? `₹${txn.amount.toLocaleString('en-IN')}`
                          : `$${txn.amount.toFixed(2)}`}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#10B981]">
                        Risk {txn.fraudCheck.riskScore}/100
                      </span>
                    </div>
                    <div className="text-xs font-mono text-[#7E858E] truncate">
                      IV: {txn.seal.iv.slice(0, 14)}... · Cipher: {txn.seal.ciphertextPreview}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={verifyingId === txn.transactionId}
                    onClick={() => void handleVerifySeal(txn.transactionId)}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-[#F2F1EC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {verifyingId === txn.transactionId ? 'Verifying...' : 'Verify Seal'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
            <div>
              <h3 className="text-base font-semibold text-[#F2F1EC]">
                Fraud Shield Audit Trail
              </h3>
              <p className="text-xs text-[#8F969E]">
                Real-time security decisions logged by the server
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#9BA1A8]">
              {securityEvents.length} events
            </span>
          </div>

          {securityEvents.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#8F969E]">
              Security audit events will appear here as transactions are screened.
            </div>
          ) : (
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {securityEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="py-2.5 border-b border-white/[0.06] last:border-b-0 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`font-semibold ${
                        ev.decision === 'BLOCKED'
                          ? 'text-red-400'
                          : ev.decision === 'STEP_UP_REQUIRED'
                            ? 'text-[#E8C57B]'
                            : 'text-[#10B981]'
                      }`}
                    >
                      {ev.decision} · Risk {ev.riskScore}/100
                    </span>
                    <span className="font-mono tabular-nums text-[#7E858E]">
                      {new Date(ev.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-[#EAE9E4]">{ev.action}</div>
                  <div className="text-xs text-[#8F969E]">{ev.reason}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
