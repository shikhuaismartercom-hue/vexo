import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Compass,
  MessageSquarePlus,
  Mic,
  MicOff,
  Phone,
  Send,
  ShieldCheck,
  ShoppingBag,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { ConciergeAction, CurrencyCode, Product, WorkspaceTab } from '../types.ts';

interface ConciergeBarProps {
  userId: string;
  sessionToken: string;
  currency: CurrencyCode;
  products: Product[];
  onAddProductsToCart: (productIds: number[]) => void;
  onExecutePayment: (params: {
    receiverId: string;
    amount: number;
    note: string;
  }) => Promise<void>;
  onInitiateCallByUserId: (targetUserId: string, callType: 'audio' | 'video') => void;
  onNavigateTab: (
    tab: WorkspaceTab,
    subView?: 'wallet' | 'vault' | 'posts' | 'settings'
  ) => void;
  onDraftMessage: (params: { room: 'vip_khushi' | 'general'; text: string }) => void;
  onSendMessageNow: (params: { room: 'vip_khushi' | 'general'; text: string }) => void;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence?: number;
}

interface SpeechRecognitionResultLike {
  isFinal?: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex?: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type VoiceLocale = 'en-IN' | 'en-US' | 'hi-IN';

const LOCAL_TAB_COMMANDS: Array<{
  patterns: RegExp[];
  tab: WorkspaceTab;
  subView?: 'wallet' | 'vault' | 'posts' | 'settings';
  label: string;
}> = [
  {
    patterns: [
      /^(open|go to|switch to|show|navigate to)\s+(the\s+)?(security vault|aes vault|security|vault)\b/i,
    ],
    tab: 'payment',
    subView: 'vault',
    label: 'AES-256 Security Vault',
  },
  {
    patterns: [
      /^(open|go to|switch to|show|navigate to)\s+(my\s+|the\s+)?(settings|privacy settings|instagram settings|account settings)\b/i,
    ],
    tab: 'profile',
    subView: 'settings',
    label: 'Settings & Privacy',
  },
  {
    patterns: [
      /^(open|go to|switch to|show|navigate to)\s+(my\s+|the\s+)?(profile|my profile|account)\b/i,
    ],
    tab: 'profile',
    subView: 'posts',
    label: 'My Profile',
  },
  {
    patterns: [
      /^(open|go to|switch to|show|navigate to)\s+(the\s+)?(home|feed|home feed)\b/i,
    ],
    tab: 'home',
    label: 'Home Feed',
  },
  {
    patterns: [
      /^(open|go to|switch to|show|navigate to)\s+(the\s+)?(message|messages|chat|chats|inbox)\b/i,
    ],
    tab: 'message',
    label: 'Messages',
  },
  {
    patterns: [
      /^(open|go to|switch to|show|navigate to)\s+(the\s+)?(reel|reels|video|videos)\b/i,
    ],
    tab: 'reels',
    label: 'Reels',
  },
  {
    patterns: [
      /^(open|go to|switch to|show|navigate to)\s+(the\s+)?(payment|payments|pay|wallet|escrow)\b/i,
    ],
    tab: 'payment',
    subView: 'wallet',
    label: 'VEXO Pay',
  },
  {
    patterns: [
      /^(open|go to|switch to|show|navigate to)\s+(the\s+)?(shopping|shop|mall|store|marketplace|bag|cart)\b/i,
    ],
    tab: 'shopping',
    label: 'VEXO Mall',
  },
];

export const ConciergeBar: React.FC<ConciergeBarProps> = ({
  userId,
  sessionToken,
  currency,
  products,
  onAddProductsToCart,
  onExecutePayment,
  onInitiateCallByUserId,
  onNavigateTab,
  onDraftMessage,
  onSendMessageNow,
}) => {
  const [prompt, setPrompt] = useState('');
  const [interimText, setInterimText] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceLocale, setVoiceLocale] = useState<VoiceLocale>('en-IN');
  const [voiceReplyEnabled, setVoiceReplyEnabled] = useState(true);
  const [lastAction, setLastAction] = useState<ConciergeAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authorizingPay, setAuthorizingPay] = useState(false);
  const [payCompleted, setPayCompleted] = useState(false);
  const [draftSent, setDraftSent] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const latestTranscriptRef = useRef<string>('');
  const speechSupported =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    );

  const symbol = currency === 'INR' ? '₹' : '$';

  const speakResponse = React.useCallback(
    (text: string) => {
      if (!voiceReplyEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = voiceLocale;
        utterance.rate = 1.03;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch {
        // Ignore speech synthesis errors on restricted platforms
      }
    },
    [voiceLocale, voiceReplyEnabled]
  );

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const applyConciergeAction = React.useCallback(
    (action: ConciergeAction, spokenSource: boolean) => {
      setLastAction(action);

      if (action.intent === 'shop_add' && action.productIds?.length) {
        onAddProductsToCart(action.productIds);
      } else if (action.intent === 'navigate_tab' && action.tab) {
        if (action.tab === 'security') {
          onNavigateTab('payment', 'vault');
        } else if (action.tab === 'settings') {
          onNavigateTab('profile', 'settings');
        } else if (action.tab === 'profile') {
          onNavigateTab('profile', 'posts');
        } else {
          const tabMap: Record<string, WorkspaceTab> = {
            home: 'home',
            message: 'message',
            chat: 'message',
            reels: 'reels',
            payment: 'payment',
            pay: 'payment',
            shopping: 'shopping',
            shop: 'shopping',
            profile: 'profile',
          };
          onNavigateTab(tabMap[action.tab] || 'home', action.tab === 'payment' ? 'wallet' : undefined);
        }
      } else if (action.intent === 'draft_message' && action.draftMessage?.text) {
        const room = action.draftMessage.room === 'general' ? 'general' : 'vip_khushi';
        onDraftMessage({ room, text: action.draftMessage.text });
      } else if (action.intent === 'pay_transfer' && action.payment) {
        onNavigateTab('payment', 'wallet');
      } else if (action.intent === 'start_call' && action.callTarget?.targetUserId) {
        const callType = action.callTarget.callType === 'audio' ? 'audio' : 'video';
        onInitiateCallByUserId(action.callTarget.targetUserId, callType);
      }

      if (spokenSource && action.reply) {
        speakResponse(action.reply);
      }
    },
    [onAddProductsToCart, onDraftMessage, onInitiateCallByUserId, onNavigateTab, speakResponse]
  );

  const submitCommand = async (textToSubmit?: string, fromVoice = false) => {
    const query = (textToSubmit ?? prompt).trim();
    if (!query || loading) return;

    setError(null);
    setPayCompleted(false);
    setDraftSent(false);

    // Zero-latency local routing for direct tab navigation voice commands
    const trimmedLower = query.replace(/[.!?]+$/, '').trim();
    for (const rule of LOCAL_TAB_COMMANDS) {
      if (rule.patterns.some((re) => re.test(trimmedLower))) {
        const localAction: ConciergeAction = {
          intent: 'navigate_tab',
          tab:
            rule.subView === 'vault'
              ? 'security'
              : rule.subView === 'settings'
                ? 'settings'
                : rule.tab,
          reply: `Opening ${rule.label}.`,
        };
        applyConciergeAction(localAction, fromVoice);
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch('/api/concierge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-id': userId,
          'x-session-token': sessionToken,
        },
        body: JSON.stringify({ prompt: query }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Concierge request failed.');
      }

      const action = data as ConciergeAction;
      applyConciergeAction(action, fromVoice);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unable to reach AI Concierge.';
      setError(errMsg);
      if (fromVoice) {
        speakResponse('Sorry, I could not complete that voice command.');
      }
    } finally {
      setLoading(false);
    }
  };

  const stopVoiceCapture = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setListening(false);
    setInterimText('');
  };

  const toggleVoiceInput = () => {
    if (listening) {
      stopVoiceCapture();
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };

    const RecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setError(
        'Web Speech API (SpeechRecognition) is not supported in this browser. Use Chrome, Edge, or Safari, or type your command.'
      );
      return;
    }

    setError(null);
    setInterimText('');
    latestTranscriptRef.current = '';

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    const recognition = new RecognitionCtor();
    recognition.lang = voiceLocale;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let finalChunk = '';
      let interimChunk = '';

      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript || '';
        if (result?.isFinal) {
          finalChunk += `${transcript} `;
        } else {
          interimChunk += `${transcript} `;
        }
      }

      const combined = (finalChunk || interimChunk).trim();
      if (combined) {
        latestTranscriptRef.current = combined;
        setPrompt(combined);
        setInterimText(interimChunk.trim());
      }

      if (finalChunk.trim()) {
        setInterimText('');
        setListening(false);
        void submitCommand(finalChunk.trim(), true);
      }
    };

    recognition.onerror = (event) => {
      setListening(false);
      setInterimText('');
      const code = event?.error || 'unknown';
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setError('Microphone permission blocked. Allow mic access in your browser bar to use voice commands.');
      } else if (code === 'no-speech') {
        setError('No speech detected. Tap the microphone and speak clearly.');
      } else if (code === 'audio-capture') {
        setError('No microphone hardware detected on this device.');
      } else if (code !== 'aborted') {
        setError(`Voice capture error (${code}). Try speaking again or type your command.`);
      }
    };

    recognition.onend = () => {
      setListening(false);
      setInterimText('');
    };

    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      setError('Could not start Web Speech recognition. Please try again.');
    }
  };

  const handleConfirmConciergePayment = async () => {
    if (!lastAction?.payment) return;
    setAuthorizingPay(true);
    try {
      await onExecutePayment({
        receiverId: lastAction.payment.receiverId,
        amount: lastAction.payment.amount,
        note: lastAction.payment.note || 'Voice Concierge Transfer',
      });
      setPayCompleted(true);
      speakResponse(
        `Transfer of ${symbol}${lastAction.payment.amount} to ${lastAction.payment.receiverId} completed.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed.');
    } finally {
      setAuthorizingPay(false);
    }
  };

  const handleSendDraftedMessage = () => {
    if (!lastAction?.draftMessage?.text) return;
    const room = lastAction.draftMessage.room === 'general' ? 'general' : 'vip_khushi';
    onSendMessageNow({ room, text: lastAction.draftMessage.text });
    setDraftSent(true);
    speakResponse('Message sent.');
  };

  const quickExamples = [
    'Open Reels',
    'Draft message to Khushi: Running 10 mins late!',
    currency === 'INR' ? 'Send ₹500 to 2010jiya@fam' : 'Send $25 to 2010jiya@fam',
    'Add Royal Gold Smart Watch to cart',
  ];

  return (
    <section className="glass-panel rounded-2xl px-4 py-3 space-y-2.5">
      <div className="flex flex-col md:flex-row md:items-center gap-2.5">
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={toggleVoiceInput}
            aria-label={listening ? 'Stop listening' : 'Start voice command'}
            className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
              listening
                ? 'bg-red-500/20 border-red-500/50 text-red-300'
                : 'bg-[#D4A853]/15 border-[#D4A853]/30 text-[#D4A853] hover:bg-[#D4A853]/25'
            }`}
          >
            {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <span className="text-xs font-semibold text-[#F2F1EC] whitespace-nowrap">
            Voice AI
          </span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitCommand(undefined, false);
          }}
          className="flex-1 flex flex-wrap sm:flex-nowrap items-center gap-2"
        >
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                listening
                  ? interimText || 'Listening... say "Open Reels", "Send ₹500 to 2010jiya@fam", or "Draft message..."'
                  : 'Speak or type: "Open Reels", "Send ₹500 to 2010jiya@fam", "Draft message to Khushi"'
              }
              className={`w-full pl-3.5 pr-10 py-2 rounded-xl bg-white/[0.04] border text-xs sm:text-sm text-[#F2F1EC] placeholder-[#6F767F] focus:outline-none ${
                listening
                  ? 'border-red-400/60 bg-red-500/[0.05]'
                  : 'border-white/[0.1] focus:border-[#D4A853]'
              }`}
            />
            <button
              type="button"
              onClick={toggleVoiceInput}
              title={
                speechSupported
                  ? listening
                    ? 'Stop Web Speech voice capture'
                    : 'Speak voice command (Web Speech API)'
                  : 'Speech recognition unavailable in this browser'
              }
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors cursor-pointer ${
                listening
                  ? 'bg-red-500/25 text-red-200'
                  : 'text-[#9BA1A8] hover:text-[#F2F1EC] hover:bg-white/[0.06]'
              }`}
            >
              {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <select
              aria-label="Voice recognition language"
              value={voiceLocale}
              onChange={(e) => setVoiceLocale(e.target.value as VoiceLocale)}
              className="px-2 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-[#C8CDD3] focus:outline-none focus:border-[#D4A853]"
            >
              <option value="en-IN" className="bg-[#0E131A]">
                EN-IN
              </option>
              <option value="en-US" className="bg-[#0E131A]">
                EN-US
              </option>
              <option value="hi-IN" className="bg-[#0E131A]">
                HI-IN
              </option>
            </select>

            <button
              type="button"
              onClick={() => {
                const next = !voiceReplyEnabled;
                setVoiceReplyEnabled(next);
                if (!next && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                  window.speechSynthesis.cancel();
                }
              }}
              title={voiceReplyEnabled ? 'Mute spoken voice replies' : 'Enable spoken voice replies'}
              aria-label={voiceReplyEnabled ? 'Mute spoken voice replies' : 'Enable spoken voice replies'}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                voiceReplyEnabled
                  ? 'bg-white/[0.06] border-white/[0.12] text-[#D4A853]'
                  : 'bg-white/[0.03] border-white/[0.07] text-[#7E858E]'
              }`}
            >
              {voiceReplyEnabled ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="px-3.5 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] disabled:opacity-50 text-[#090C10] text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <span>{loading ? 'Thinking...' : 'Run'}</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>

      {/* Live Web Speech Interim Feedback with Waveform */}
      {listening && (
        <div className="px-3.5 py-2 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-red-200 min-w-0">
            <div className="flex items-end gap-0.5 h-3.5 shrink-0" aria-hidden="true">
              <span className="w-0.5 h-2 bg-red-400 animate-pulse rounded-full" />
              <span className="w-0.5 h-3.5 bg-red-300 animate-pulse rounded-full" />
              <span className="w-0.5 h-2.5 bg-red-400 animate-pulse rounded-full" />
              <span className="w-0.5 h-3 bg-red-300 animate-pulse rounded-full" />
            </div>
            <span className="truncate">
              {interimText
                ? `Heard: "${interimText}"`
                : `Listening (${voiceLocale}) — say "Open Reels", "Send ₹500 to 2010jiya@fam", or "Draft message to Khushi..."`}
            </span>
          </div>
          <button
            type="button"
            onClick={stopVoiceCapture}
            className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-100 font-semibold whitespace-nowrap cursor-pointer"
          >
            Stop
          </button>
        </div>
      )}

      {/* Quick command suggestions */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#8F969E]">
        {quickExamples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              setPrompt(example);
              void submitCommand(example, false);
            }}
            className="px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.07] text-[#C8CDD3] transition-colors whitespace-nowrap cursor-pointer"
          >
            {example}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-300">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="p-1 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Structured Action Response Card */}
      {lastAction && (
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.09] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="text-xs font-medium text-[#D4A853]">
              Concierge Response · {lastAction.intent.replace('_', ' ')}
            </div>
            <p className="text-sm text-[#EAE9E4]">{lastAction.reply}</p>

            {lastAction.intent === 'shop_add' && lastAction.productIds?.length ? (
              <p className="text-xs text-[#9BA1A8]">
                Added:{' '}
                {lastAction.productIds
                  .map((id) => products.find((p) => p.id === id)?.name)
                  .filter(Boolean)
                  .join(', ')}
              </p>
            ) : null}

            {lastAction.intent === 'draft_message' && lastAction.draftMessage?.text ? (
              <p className="text-xs text-[#C8CDD3] bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 mt-1">
                Draft ({lastAction.draftMessage.room === 'general' ? '#general' : 'Khushi Rathore'}):{' '}
                <span className="text-[#F2F1EC] font-medium">
                  &ldquo;{lastAction.draftMessage.text}&rdquo;
                </span>
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {lastAction.intent === 'navigate_tab' && lastAction.tab && (
              <button
                type="button"
                onClick={() => {
                  if (lastAction.tab === 'security') {
                    onNavigateTab('payment', 'vault');
                  } else if (lastAction.tab === 'settings') {
                    onNavigateTab('profile', 'settings');
                  } else {
                    onNavigateTab((lastAction.tab as WorkspaceTab) || 'home');
                  }
                }}
                className="px-3.5 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-[#F2F1EC] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5 text-[#D4A853]" />
                <span>In {lastAction.tab}</span>
              </button>
            )}

            {lastAction.intent === 'draft_message' && lastAction.draftMessage?.text && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    onDraftMessage({
                      room:
                        lastAction.draftMessage!.room === 'general'
                          ? 'general'
                          : 'vip_khushi',
                      text: lastAction.draftMessage!.text,
                    })
                  }
                  className="px-3.5 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-[#F2F1EC] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5 text-[#D4A853]" />
                  <span>Edit in Message</span>
                </button>
                <button
                  type="button"
                  disabled={draftSent}
                  onClick={handleSendDraftedMessage}
                  className="px-3.5 py-2 rounded-lg bg-[#D4A853] hover:bg-[#E0B96B] disabled:opacity-60 text-[#090C10] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{draftSent ? 'Sent to Chat' : 'Send Draft Now'}</span>
                </button>
              </>
            )}

            {lastAction.intent === 'shop_add' && (
              <button
                type="button"
                onClick={() => onNavigateTab('shopping')}
                className="px-3.5 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-[#F2F1EC] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-[#D4A853]" />
                <span>View VEXO Mall</span>
              </button>
            )}

            {lastAction.intent === 'pay_transfer' && lastAction.payment && (
              <button
                type="button"
                disabled={authorizingPay || payCompleted}
                onClick={() => void handleConfirmConciergePayment()}
                className="px-4 py-2 rounded-lg bg-[#D4A853] hover:bg-[#E0B96B] disabled:opacity-60 text-[#090C10] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  {payCompleted
                    ? 'Transfer Completed'
                    : authorizingPay
                      ? 'Sealing...'
                      : `Authorize ${symbol}${lastAction.payment.amount} → ${lastAction.payment.receiverId}`}
                </span>
              </button>
            )}

            {lastAction.intent === 'start_call' && lastAction.callTarget && (
              <button
                type="button"
                onClick={() =>
                  onInitiateCallByUserId(
                    lastAction.callTarget!.targetUserId,
                    lastAction.callTarget!.callType === 'audio' ? 'audio' : 'video'
                  )
                }
                className="px-3.5 py-2 rounded-lg bg-[#10B981]/20 hover:bg-[#10B981]/30 border border-[#10B981]/35 text-xs font-semibold text-[#6EE7B7] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Open Call Desk</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setLastAction(null)}
              className="p-1.5 rounded-lg text-[#8F969E] hover:text-[#F2F1EC] hover:bg-white/[0.05] cursor-pointer"
              aria-label="Dismiss concierge response"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
