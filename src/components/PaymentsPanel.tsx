import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Building2,
  Check,
  Copy,
  ExternalLink,
  Lock,
  Plus,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Unlock,
  X,
  Zap,
} from 'lucide-react';
import type { CurrencyCode, EscrowDeal, GatewayName, Transaction } from '../types.ts';
import { CameraQrModal } from './CameraQrModal.tsx';
import { VexoBlackCard } from './VexoBlackCard.tsx';

const PRIMARY_UPI_ID = '2010jiya@fam';

interface PaymentsPanelProps {
  userId: string;
  displayName?: string;
  primaryUpiId?: string;
  currency: CurrencyCode;
  gateway: GatewayName;
  balanceINR: number;
  balanceUSD: number;
  transactions: Transaction[];
  escrowDeals: EscrowDeal[];
  onExecutePayment: (params: {
    receiverId: string;
    amount: number;
    note: string;
    type?: Transaction['type'];
    confirmHighValue?: boolean;
  }) => Promise<Transaction | undefined>;
  onCreateEscrow: (params: {
    sellerId: string;
    amount: number;
    itemNote: string;
  }) => Promise<EscrowDeal | undefined>;
  onReleaseEscrow: (escrowId: string, releaseCode: string) => Promise<void>;
  onRefundEscrow: (escrowId: string) => Promise<void>;
  onTopUp: (amount: number) => Promise<void>;
  onVerifyTransaction: () => void;
}

export const PaymentsPanel: React.FC<PaymentsPanelProps> = ({
  userId,
  displayName,
  primaryUpiId,
  currency,
  gateway,
  balanceINR,
  balanceUSD,
  transactions,
  escrowDeals,
  onExecutePayment,
  onCreateEscrow,
  onReleaseEscrow,
  onRefundEscrow,
  onTopUp,
  onVerifyTransaction,
}) => {
  const activeUpiId = primaryUpiId?.trim() || PRIMARY_UPI_ID;
  const [payMode, setPayMode] = useState<'direct' | 'escrow'>('direct');
  const [receiverId, setReceiverId] = useState(activeUpiId);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [showMyUpiQr, setShowMyUpiQr] = useState(false);
  const [myUpiQrDataUrl, setMyUpiQrDataUrl] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [toppingUp, setToppingUp] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [pinInputs, setPinInputs] = useState<Record<string, string>>({});
  const [escrowBusyId, setEscrowBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [stepUpPrompt, setStepUpPrompt] = useState<{
    receiverId: string;
    amount: number;
    note: string;
    reason: string;
  } | null>(null);

  const primaryBalance = currency === 'INR' ? balanceINR : balanceUSD;
  const secondaryBalance = currency === 'INR' ? balanceUSD : balanceINR;
  const symbol = currency === 'INR' ? '₹' : '$';
  const secondarySymbol = currency === 'INR' ? '$' : '₹';

  const quickRecipients = [
    { id: activeUpiId, label: `${activeUpiId} (My UPI)` },
    { id: 'merchant_99@upi', label: 'merchant_99@upi' },
    { id: 'alex_02', label: 'alex_02' },
    { id: 'HDFC_BANK_4410', label: 'Bank A/C ••4410' },
  ];

  useEffect(() => {
    setReceiverId(activeUpiId);
  }, [activeUpiId]);

  const handleCopyUpi = async () => {
    try {
      await navigator.clipboard.writeText(activeUpiId);
      setCopiedUpi(true);
      window.setTimeout(() => setCopiedUpi(false), 2000);
    } catch {
      setFeedback({ type: 'success', text: `UPI ID: ${activeUpiId}` });
    }
  };

  const upiIntentHref = (() => {
    const cleanTarget = receiverId.includes('@') ? receiverId.trim() : activeUpiId;
    const numeric = Number(amount);
    const params = new URLSearchParams({
      pa: cleanTarget,
      pn: 'VEXO Pay',
      tn: note.trim() || 'VEXO Super App Payment',
      cu: 'INR',
    });
    if (Number.isFinite(numeric) && numeric > 0) {
      params.set('am', String(numeric));
    }
    return `upi://pay?${params.toString()}`;
  })();

  const receiveUpiUri = (() => {
    const numeric = Number(amount);
    const params = new URLSearchParams({
      pa: activeUpiId,
      pn: 'VEXO Pay',
      tn: note.trim() || 'Pay via VEXO Super App',
      cu: 'INR',
    });
    if (Number.isFinite(numeric) && numeric > 0) {
      params.set('am', String(numeric));
    }
    return `upi://pay?${params.toString()}`;
  })();

  useEffect(() => {
    if (!showMyUpiQr) return;
    QRCode.toDataURL(receiveUpiUri, {
      width: 240,
      margin: 2,
      color: {
        dark: '#090C10',
        light: '#FFFFFF',
      },
    })
      .then((url) => setMyUpiQrDataUrl(url))
      .catch(() => setMyUpiQrDataUrl(''));
  }, [showMyUpiQr, receiveUpiUri]);

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setFeedback({ type: 'error', text: 'Enter a valid positive amount.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      if (payMode === 'escrow') {
        const deal = await onCreateEscrow({
          sellerId: receiverId.trim(),
          amount: numeric,
          itemNote: note.trim() || 'Escrow Anti-Scam Deal',
        });
        if (deal) {
          setFeedback({
            type: 'success',
            text: `Escrow Locked (${deal.escrowId}) · Save PIN ${deal.releaseCodeForBuyer} to release funds upon delivery.`,
          });
          setAmount('');
          setNote('');
        }
      } else {
        const txn = await onExecutePayment({
          receiverId: receiverId.trim(),
          amount: numeric,
          note: note.trim() || 'VEXO Instant Pay',
          type: 'transfer',
        });
        if (txn) {
          setFeedback({
            type: 'success',
            text: `${txn.transactionId} settled via ${txn.gateway} · AES-256-GCM Sealed`,
          });
          setAmount('');
          setNote('');
        }
      }
    } catch (err) {
      const customErr = err as Error & { requiresStepUpVerification?: boolean };
      if (customErr.requiresStepUpVerification) {
        setStepUpPrompt({
          receiverId: receiverId.trim(),
          amount: numeric,
          note: note.trim() || 'High-Value Verified Transfer',
          reason: customErr.message,
        });
      } else {
        setFeedback({
          type: 'error',
          text: customErr.message || 'Transfer could not be completed.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const confirmStepUpTransfer = async () => {
    if (!stepUpPrompt) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const txn = await onExecutePayment({
        receiverId: stepUpPrompt.receiverId,
        amount: stepUpPrompt.amount,
        note: stepUpPrompt.note,
        type: 'transfer',
        confirmHighValue: true,
      });
      if (txn) {
        setFeedback({
          type: 'success',
          text: `Step-Up Verified · ${txn.transactionId} settled via ${txn.gateway}`,
        });
        setAmount('');
        setNote('');
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Step-up transfer failed.',
      });
    } finally {
      setStepUpPrompt(null);
      setSubmitting(false);
    }
  };

  const handleQuickTopUp = async () => {
    setToppingUp(true);
    setFeedback(null);
    try {
      const topUpAmt = currency === 'INR' ? 1000 : 50;
      await onTopUp(topUpAmt);
      setFeedback({
        type: 'success',
        text: `Added ${symbol}${topUpAmt.toLocaleString()} to VEXO Wallet via ${gateway}`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Top-up failed.',
      });
    } finally {
      setToppingUp(false);
    }
  };

  const handleRelease = async (deal: EscrowDeal) => {
    const code = pinInputs[deal.escrowId] || '';
    if (!code.trim()) {
      setFeedback({ type: 'error', text: 'Enter the 6-digit Release PIN to release Escrow.' });
      return;
    }
    setEscrowBusyId(deal.escrowId);
    setFeedback(null);
    try {
      await onReleaseEscrow(deal.escrowId, code.trim());
      setFeedback({
        type: 'success',
        text: `Escrow ${deal.escrowId} verified and released to ${deal.sellerId}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Release failed.',
      });
    } finally {
      setEscrowBusyId(null);
    }
  };

  const handleRefund = async (deal: EscrowDeal) => {
    setEscrowBusyId(deal.escrowId);
    setFeedback(null);
    try {
      await onRefundEscrow(deal.escrowId);
      setFeedback({
        type: 'success',
        text: `Escrow ${deal.escrowId} refunded safely to your VEXO Wallet.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Refund failed.',
      });
    } finally {
      setEscrowBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <CameraQrModal
        open={qrModalOpen}
        mode="qr"
        onClose={() => setQrModalOpen(false)}
        onScanQrCode={(upiId) => {
          setReceiverId(upiId);
          setNote('QR Scan Instant Payment');
          setFeedback({
            type: 'success',
            text: `Scanned QR recipient "${upiId}". Enter amount to pay instantly.`,
          });
        }}
      />

      {stepUpPrompt && (
        <div className="glass-panel-elevated rounded-2xl p-6 border-[#D4A853]/50 space-y-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-[#D4A853]">
              Zero-Trust Step-Up Verification Required
            </div>
            <h3 className="text-lg font-bold text-[#F2F1EC]">
              Authorize High-Value Transfer ({symbol}
              {stepUpPrompt.amount.toLocaleString()})
            </h3>
            <p className="text-xs text-[#9BA1A8]">{stepUpPrompt.reason}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void confirmStepUpTransfer()}
              className="px-4 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#090C10] text-xs font-semibold cursor-pointer"
            >
              {submitting ? 'Authorizing...' : `Confirm & Send to ${stepUpPrompt.receiverId}`}
            </button>
            <button
              type="button"
              onClick={() => setStepUpPrompt(null)}
              className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-[#EAE9E4] cursor-pointer"
            >
              Cancel Transfer
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel-elevated rounded-2xl p-5 space-y-4">
            <VexoBlackCard
              holderName={displayName || userId}
              username={userId}
              currency={currency}
              balance={primaryBalance}
              onCardActionNotice={(msg) => setFeedback({ type: 'success', text: msg })}
            />

            {/* Primary Linked UPI Handle (2010jiya@fam) */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-[#D4A853]/30 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] text-[#8F969E]">Primary VEXO UPI Handle</div>
                  <div className="text-sm font-mono font-semibold text-[#D4A853] truncate">
                    {activeUpiId}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowMyUpiQr((v) => !v)}
                    className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs text-[#F2F1EC] flex items-center gap-1 cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5 text-[#D4A853]" />
                    <span>{showMyUpiQr ? 'Hide QR' : 'My QR'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyUpi()}
                    className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs text-[#F2F1EC] flex items-center gap-1 cursor-pointer"
                  >
                    {copiedUpi ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#10B981]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[#D4A853]" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                  <a
                    href={upiIntentHref}
                    className="px-2.5 py-1.5 rounded-lg bg-[#D4A853] hover:bg-[#E0B96B] text-[#090C10] text-xs font-semibold flex items-center gap-1 whitespace-nowrap"
                  >
                    <span>UPI App</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {showMyUpiQr && myUpiQrDataUrl && (
                <div className="pt-3 border-t border-white/[0.08] flex flex-col items-center gap-2.5">
                  <div className="flex items-center justify-between w-full text-xs text-[#9BA1A8]">
                    <span>Scan with PhonePe, GPay, FamPay, or Paytm</span>
                    <button
                      type="button"
                      onClick={() => setShowMyUpiQr(false)}
                      className="p-1 text-[#8F969E] hover:text-white cursor-pointer"
                      aria-label="Close UPI QR"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="p-3 rounded-2xl bg-white shadow-xl">
                    <img
                      src={myUpiQrDataUrl}
                      alt={`UPI QR code for ${activeUpiId}`}
                      className="w-44 h-44 block"
                    />
                  </div>
                  <div className="text-xs font-mono text-[#D4A853]">
                    {activeUpiId}
                    {Number(amount) > 0 ? ` · ₹${Number(amount).toLocaleString('en-IN')}` : ''}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setQrModalOpen(true)}
                className="p-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-semibold text-[#F2F1EC] flex flex-col items-center gap-1.5 transition-colors cursor-pointer"
              >
                <QrCode className="w-4 h-4 text-[#D4A853]" />
                <span>Scan QR</span>
              </button>

              <button
                type="button"
                disabled={toppingUp}
                onClick={() => void handleQuickTopUp()}
                className="p-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-semibold text-[#F2F1EC] flex flex-col items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#10B981]" />
                <span>{toppingUp ? 'Adding...' : 'Add Money'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setReceiverId('HDFC_BANK_4410');
                  setNote('Direct Bank Transfer');
                }}
                className="p-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-semibold text-[#F2F1EC] flex flex-col items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Building2 className="w-4 h-4 text-[#D4A853]" />
                <span>To Bank</span>
              </button>
            </div>

            <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between text-xs">
              <span className="text-[#8F969E] font-mono tabular-nums">
                Reserve: {secondarySymbol}
                {currency === 'INR'
                  ? secondaryBalance.toFixed(2)
                  : secondaryBalance.toLocaleString('en-IN')}{' '}
                · {gateway}
              </span>
              <button
                type="button"
                onClick={onVerifyTransaction}
                className="text-[#D4A853] hover:text-[#E5BD73] transition-colors cursor-pointer"
              >
                Security Vault →
              </button>
            </div>
          </div>

          <form onSubmit={handlePaySubmit} className="glass-panel rounded-2xl p-6 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-[#F2F1EC]">
                  VEXO Instant Pay ({currency})
                </h3>
                <span className="text-xs font-mono text-[#10B981]">Fraud Shield On</span>
              </div>

              {/* Direct Pay vs Zero-Trust Escrow Anti-Scam Lock */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setPayMode('direct')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    payMode === 'direct'
                      ? 'bg-[#D4A853] text-[#090C10]'
                      : 'text-[#A8AEB5] hover:text-white'
                  }`}
                >
                  Direct Instant Pay
                </button>
                <button
                  type="button"
                  onClick={() => setPayMode('escrow')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                    payMode === 'escrow'
                      ? 'bg-[#10B981] text-[#04140E]'
                      : 'text-[#A8AEB5] hover:text-white'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Escrow Anti-Scam</span>
                </button>
              </div>
              <p className="text-xs text-[#8F969E]">
                {payMode === 'escrow'
                  ? 'Funds stay locked in the AES-256 Escrow Vault until you enter your 6-digit Release PIN.'
                  : 'Instant UPI, peer-to-peer, and bank payouts screened by Zero-Trust Fraud Shield.'}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#A8AEB5]">
                {payMode === 'escrow' ? 'Seller ID / UPI Handle' : 'UPI ID / Bank Account / Recipient'}
              </label>
              <input
                type="text"
                value={receiverId}
                onChange={(e) => setReceiverId(e.target.value)}
                placeholder={activeUpiId}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm font-mono text-[#F2F1EC] focus:outline-none focus:border-[#D4A853]"
              />
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {quickRecipients.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setReceiverId(preset.id)}
                    className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-xs text-[#C8CDD3] cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#A8AEB5]">
                  Amount ({currency})
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={currency === 'INR' ? '499' : '25'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm font-mono tabular-nums text-[#F2F1EC] focus:outline-none focus:border-[#D4A853]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#A8AEB5]">Reference Note</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={payMode === 'escrow' ? 'Watch / Reel Order' : 'Instant UPI / Invoice'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-[#F2F1EC] focus:outline-none focus:border-[#D4A853]"
                />
              </div>
            </div>

            {feedback && (
              <div
                className={`p-3 rounded-xl text-xs border ${
                  feedback.type === 'success'
                    ? 'bg-[#10B981]/10 border-[#10B981]/30 text-[#6EE7B7]'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}
              >
                {feedback.text}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-3 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                payMode === 'escrow'
                  ? 'bg-[#10B981] hover:bg-[#059669] text-[#04140E]'
                  : 'bg-[#D4A853] hover:bg-[#E0B96B] text-[#090C10]'
              }`}
            >
              {payMode === 'escrow' ? (
                <>
                  <Lock className="w-4 h-4" />
                  <span>{submitting ? 'Locking in Vault...' : 'Lock Funds in Escrow Vault'}</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>{submitting ? 'Screening & Sealing...' : 'Pay Instantly'}</span>
                  <Zap className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right: Escrow Deals + Recent Secure Transactions */}
        <div className="lg:col-span-7 space-y-6">
          {/* Active Escrow Anti-Scam Vault */}
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
              <div>
                <h3 className="text-base font-semibold text-[#10B981]">
                  Zero-Trust Escrow Vault (Anti-Scam Lock)
                </h3>
                <p className="text-xs text-[#8F969E]">
                  Protected peer & creator deals — funds release only with buyer 6-digit PIN
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-[#9BA1A8]">
                {escrowDeals.length} deals
              </span>
            </div>

            {escrowDeals.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#8F969E]">
                No active Escrow locks. Select &ldquo;Escrow Anti-Scam&rdquo; on the left to test
                buyer-protected deals.
              </div>
            ) : (
              <div className="space-y-3">
                {escrowDeals.map((deal) => {
                  const isBuyer = deal.buyerId === userId;
                  const isLocked = deal.status === 'LOCKED';
                  return (
                    <div
                      key={deal.escrowId}
                      className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="text-xs font-mono text-[#D4A853]">
                            {deal.escrowId} · {deal.status}
                          </div>
                          <div className="text-sm font-semibold text-[#F2F1EC]">
                            {deal.itemNote} ({deal.buyerId} → {deal.sellerId})
                          </div>
                        </div>
                        <div className="text-base font-bold font-mono tabular-nums text-[#F2F1EC]">
                          {deal.currency === 'INR'
                            ? `₹${deal.amount.toLocaleString('en-IN')}`
                            : `$${deal.amount.toFixed(2)}`}
                        </div>
                      </div>

                      {isLocked && isBuyer && (
                        <div className="pt-2 border-t border-white/[0.07] space-y-2.5">
                          {deal.releaseCodeForBuyer && (
                            <div className="text-xs text-[#A7F3D0]">
                              Your Buyer Release PIN:{' '}
                              <span className="font-mono font-bold tracking-widest text-[#F2F1EC]">
                                {deal.releaseCodeForBuyer}
                              </span>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              maxLength={6}
                              value={pinInputs[deal.escrowId] || ''}
                              onChange={(e) =>
                                setPinInputs((prev) => ({
                                  ...prev,
                                  [deal.escrowId]: e.target.value,
                                }))
                              }
                              placeholder="Enter 6-digit PIN"
                              className="w-36 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.1] text-xs font-mono text-[#F2F1EC] focus:outline-none focus:border-[#10B981]"
                            />
                            <button
                              type="button"
                              disabled={escrowBusyId === deal.escrowId}
                              onClick={() => void handleRelease(deal)}
                              className="px-3.5 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-[#04140E] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                              <span>Release Funds</span>
                            </button>
                            <button
                              type="button"
                              disabled={escrowBusyId === deal.escrowId}
                              onClick={() => void handleRefund(deal)}
                              className="px-3.5 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs text-[#EAE9E4] flex items-center gap-1.5 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Cancel & Refund</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Secure Transactions */}
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
              <div>
                <h3 className="text-base font-semibold text-[#D4A853]">
                  Recent Secure Transactions
                </h3>
                <p className="text-xs text-[#8F969E]">
                  Cryptographically sealed payment & creator royalty history
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-[#9BA1A8]">
                {transactions.length} entries
              </span>
            </div>

            {transactions.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <p className="text-sm text-[#A8AEB5]">No transactions yet.</p>
                <p className="text-xs text-[#7E858E]">
                  Scan a QR code, lock an Escrow deal, or send an instant payment.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-xs text-[#8F969E]">
                      <th className="py-2.5 pr-4 font-medium">Transaction</th>
                      <th className="py-2.5 px-4 font-medium">Counterparty</th>
                      <th className="py-2.5 px-4 font-medium">Gateway</th>
                      <th className="py-2.5 pl-4 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-sm">
                    {transactions.map((txn) => {
                      const isCredit =
                        txn.type === 'topup' ||
                        txn.type === 'royalty' ||
                        txn.receiverId.toLowerCase() === userId;
                      return (
                        <tr key={txn.transactionId} className="hover:bg-white/[0.02]">
                          <td className="py-3 pr-4">
                            <div className="font-mono text-xs text-[#F2F1EC]">
                              {txn.transactionId}
                            </div>
                            <div className="text-xs text-[#8F969E]">{txn.note}</div>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-[#C8CDD3]">
                            {txn.type === 'topup' || txn.type === 'royalty'
                              ? txn.senderId
                              : txn.receiverId}
                          </td>
                          <td className="py-3 px-4 text-xs text-[#9BA1A8]">
                            {txn.gateway} · Risk {txn.fraudCheck.riskScore}/100
                          </td>
                          <td
                            className={`py-3 pl-4 font-mono tabular-nums text-right font-semibold ${
                              isCredit ? 'text-[#10B981]' : 'text-[#F2F1EC]'
                            }`}
                          >
                            {isCredit ? '+' : '-'}
                            {txn.currency === 'INR'
                              ? `₹${txn.amount.toLocaleString('en-IN')}`
                              : `$${txn.amount.toFixed(2)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
