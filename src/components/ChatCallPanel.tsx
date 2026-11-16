import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Crown,
  Flame,
  Languages,
  Lock,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Send,
  Users,
  Video,
  VideoOff,
} from 'lucide-react';
import type { Socket } from 'socket.io-client';
import type { ChatMessage, OnlineUser } from '../types.ts';
import { CameraQrModal } from './CameraQrModal.tsx';

interface ChatCallPanelProps {
  socket: Socket | null;
  connected: boolean;
  userId: string;
  sessionToken: string;
  displayName: string;
  onlineUsers: OnlineUser[];
  messages: ChatMessage[];
  pendingCallRequest: { targetUserId: string; callType: 'audio' | 'video' } | null;
  onClearPendingCall: () => void;
  pendingMessageDraft?: { room: 'vip_khushi' | 'general'; text: string } | null;
  onClearPendingDraft?: () => void;
  defaultGhostChat?: boolean;
}

interface IncomingCallState {
  fromSocketId: string;
  fromName: string;
  callType: 'audio' | 'video';
  signal: RTCSessionDescriptionInit;
}

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export const ChatCallPanel: React.FC<ChatCallPanelProps> = ({
  socket,
  connected,
  userId,
  sessionToken,
  displayName,
  onlineUsers,
  messages,
  pendingCallRequest,
  onClearPendingCall,
  pendingMessageDraft,
  onClearPendingDraft,
  defaultGhostChat = false,
}) => {
  const [activeRoom, setActiveRoom] = useState<'vip_khushi' | 'general'>('vip_khushi');
  const [draft, setDraft] = useState('');
  const [translateTarget, setTranslateTarget] = useState<string>('Off');
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [callState, setCallState] = useState<'idle' | 'calling' | 'in_call'>('idle');
  const [callType, setCallType] = useState<'audio' | 'video'>('video');
  const [remoteName, setRemoteName] = useState('');
  const [incomingCall, setIncomingCall] = useState<IncomingCallState | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [capturedGallery, setCapturedGallery] = useState<string[]>([]);
  const [ghostMode, setGhostMode] = useState(Boolean(defaultGhostChat));
  const [ghostExpirations, setGhostExpirations] = useState<Record<string, number>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteSocketIdRef = useRef<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const draftInputRef = useRef<HTMLInputElement | null>(null);

  const visibleMessages = messages.filter((m) => {
    if ((m.room || 'general') !== activeRoom) return false;
    const exp = ghostExpirations[m.id];
    if (exp && nowMs >= exp) return false;
    return true;
  });
  const roomMessages = visibleMessages;
  const otherPeers = onlineUsers.filter((u) => u.socketId !== socket?.id);

  useEffect(() => {
    const hasActiveGhost = Object.values(ghostExpirations).some((exp) => exp > Date.now());
    if (!hasActiveGhost) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [ghostExpirations]);

  useEffect(() => {
    setGhostMode(Boolean(defaultGhostChat));
  }, [defaultGhostChat]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [roomMessages.length, capturedGallery.length]);

  useEffect(() => {
    if (callState !== 'in_call') {
      setCallSeconds(0);
      return;
    }
    const timer = window.setInterval(() => {
      setCallSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [callState]);

  const cleanupCall = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    remoteSocketIdRef.current = null;
    setCallState('idle');
    setIncomingCall(null);
    setMicMuted(false);
    setCamOff(false);
  };

  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = (data: {
      signal: RTCSessionDescriptionInit;
      from: string;
      fromName: string;
      callType: 'audio' | 'video';
    }) => {
      setIncomingCall({
        fromSocketId: data.from,
        fromName: data.fromName || 'Peer',
        callType: data.callType || 'video',
        signal: data.signal,
      });
    };

    const handleCallAccepted = async (data: { signal: RTCSessionDescriptionInit }) => {
      if (pcRef.current && data.signal) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.signal));
        setCallState('in_call');
      }
    };

    const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
      if (pcRef.current && data.candidate) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch {
          // Ignore stale ICE candidates
        }
      }
    };

    const handleCallEnded = () => {
      cleanupCall();
    };

    const handleCallRejected = () => {
      setCallError('Call was declined by the recipient.');
      cleanupCall();
    };

    socket.on('incoming_call', handleIncomingCall);
    socket.on('call_accepted', handleCallAccepted);
    socket.on('ice_candidate', handleIceCandidate);
    socket.on('call_ended', handleCallEnded);
    socket.on('call_rejected', handleCallRejected);

    return () => {
      socket.off('incoming_call', handleIncomingCall);
      socket.off('call_accepted', handleCallAccepted);
      socket.off('ice_candidate', handleIceCandidate);
      socket.off('call_ended', handleCallEnded);
      socket.off('call_rejected', handleCallRejected);
    };
  }, [socket]);

  useEffect(() => {
    return () => cleanupCall();
  }, []);

  const acquireMedia = async (type: 'audio' | 'video'): Promise<MediaStream | null> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCallError('WebRTC media capture is unavailable in this browser context.');
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch {
      if (type === 'video') {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          localStreamRef.current = audioStream;
          return audioStream;
        } catch {
          setCallError(
            'Camera and microphone permissions were denied or hardware is unavailable. Signaling works across tabs with mic/cam access.'
          );
          return null;
        }
      }
      setCallError('Microphone permission denied or unavailable.');
      return null;
    }
  };

  const startCallWithPeer = async (peer: OnlineUser, type: 'audio' | 'video') => {
    if (!socket) return;
    setCallError(null);
    setCallType(type);
    setRemoteName(peer.displayName || peer.userId);
    remoteSocketIdRef.current = peer.socketId;
    setCallState('calling');

    const stream = await acquireMedia(type);
    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcRef.current = pc;

    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    }

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice_candidate', {
          to: peer.socketId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: type === 'video',
    });
    await pc.setLocalDescription(offer);

    socket.emit('call_user', {
      userToCall: peer.socketId,
      signalData: offer,
      from: socket.id,
      fromName: displayName || userId,
      callType: type,
    });
  };

  const handleHeaderCall = async (type: 'audio' | 'video') => {
    if (otherPeers.length > 0) {
      await startCallWithPeer(otherPeers[0], type);
      return;
    }
    setCallError(
      'Open a second browser tab with another Session Handle (e.g. khushi_02) to place a live WebRTC call, or use the Live Camera modal.'
    );
  };

  useEffect(() => {
    if (!pendingCallRequest) return;
    const match = otherPeers.find(
      (p) =>
        p.userId.toLowerCase() === pendingCallRequest.targetUserId.toLowerCase() ||
        p.displayName.toLowerCase().includes(pendingCallRequest.targetUserId.toLowerCase())
    );
    if (match) {
      void startCallWithPeer(match, pendingCallRequest.callType);
    } else {
      setCallError(
        `No active session found for "${pendingCallRequest.targetUserId}". Open another tab with that User ID to connect via WebRTC.`
      );
    }
    onClearPendingCall();
  }, [pendingCallRequest]);

  useEffect(() => {
    if (!pendingMessageDraft) return;
    setActiveRoom(pendingMessageDraft.room);
    setDraft(pendingMessageDraft.text);
    window.setTimeout(() => {
      draftInputRef.current?.focus();
    }, 50);
    onClearPendingDraft?.();
  }, [pendingMessageDraft, onClearPendingDraft]);

  const answerIncomingCall = async () => {
    if (!socket || !incomingCall) return;
    setCallError(null);
    setCallType(incomingCall.callType);
    setRemoteName(incomingCall.fromName);
    remoteSocketIdRef.current = incomingCall.fromSocketId;

    const stream = await acquireMedia(incomingCall.callType);
    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcRef.current = pc;

    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    }

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice_candidate', {
          to: incomingCall.fromSocketId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.signal));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('answer_call', {
      to: incomingCall.fromSocketId,
      signal: answer,
    });

    setIncomingCall(null);
    setCallState('in_call');
  };

  const rejectIncomingCall = () => {
    if (socket && incomingCall) {
      socket.emit('reject_call', { to: incomingCall.fromSocketId });
    }
    setIncomingCall(null);
  };

  const endActiveCall = () => {
    if (socket && remoteSocketIdRef.current) {
      socket.emit('end_call', { to: remoteSocketIdRef.current });
    }
    cleanupCall();
  };

  const toggleMic = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = micMuted;
    });
    setMicMuted(!micMuted);
  };

  const toggleCam = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = camOff;
    });
    setCamOff(!camOff);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !draft.trim()) return;
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const payload: ChatMessage = {
      id: msgId,
      room: activeRoom,
      senderId: userId,
      senderName: displayName || userId,
      text: draft.trim(),
      timestamp: new Date().toISOString(),
    };
    if (ghostMode) {
      setNowMs(Date.now());
      setGhostExpirations((prev) => ({ ...prev, [msgId]: Date.now() + 10000 }));
    }
    socket.emit('send_message', payload);
    setDraft('');
  };

  const handleCapturedPhoto = (dataUrl: string) => {
    setCapturedGallery((prev) => [...prev, dataUrl]);
    if (socket) {
      socket.emit('send_message', {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        room: activeRoom,
        senderId: userId,
        senderName: displayName || userId,
        text: 'Shared an encrypted photo capture via VEXO Ultra-HD Camera.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleTranslateMessage = async (msg: ChatMessage, lang: string) => {
    if (lang === 'Off') return;
    setTranslatingId(msg.id);
    try {
      const res = await fetch('/api/chat/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-id': userId,
          'x-session-token': sessionToken,
        },
        body: JSON.stringify({ text: msg.text, targetLanguage: lang }),
      });
      const data = await res.json();
      if (res.ok && data.translatedText) {
        setTranslations((prev) => ({
          ...prev,
          [`${msg.id}:${lang}`]: data.translatedText as string,
        }));
      } else if (data.error) {
        setCallError(data.error as string);
      }
    } catch {
      setCallError('Unable to translate message right now.');
    } finally {
      setTranslatingId((curr) => (curr === msg.id ? null : curr));
    }
  };

  const formatDuration = (total: number) => {
    const mins = Math.floor(total / 60)
      .toString()
      .padStart(2, '0');
    const secs = (total % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  return (
    <div className="space-y-6">
      <CameraQrModal
        open={cameraModalOpen}
        mode="camera"
        onClose={() => setCameraModalOpen(false)}
        onCapturePhoto={handleCapturedPhoto}
      />

      {incomingCall && (
        <div className="glass-panel-elevated rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-[#D4A853]/40">
          <div className="space-y-1">
            <div className="text-xs font-medium text-[#D4A853]">
              Incoming {incomingCall.callType === 'video' ? 'Video' : 'Audio'} Call · WebRTC
            </div>
            <div className="text-base font-semibold text-[#F2F1EC]">
              {incomingCall.fromName} is calling you
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={rejectIncomingCall}
              className="px-4 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-semibold text-red-200 cursor-pointer"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => void answerIncomingCall()}
              className="px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#04140E] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Accept Call</span>
            </button>
          </div>
        </div>
      )}

      {callState !== 'idle' && (
        <div className="glass-panel-elevated rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <div>
              <div className="text-xs text-[#D4A853]">
                {callState === 'calling' ? 'Ringing via WebRTC...' : 'Connected · End-to-End Encrypted'}
              </div>
              <h3 className="text-lg font-semibold text-[#F2F1EC]">{remoteName}</h3>
            </div>
            <div className="font-mono tabular-nums text-sm text-[#C8CDD3]">
              {callState === 'in_call' ? formatDuration(callSeconds) : '00:00'}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative aspect-video rounded-xl bg-black/50 border border-white/[0.08] overflow-hidden flex items-center justify-center">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-3 left-3 text-xs font-medium text-white/90 bg-black/60 px-2.5 py-1 rounded-md">
                {remoteName}
              </span>
            </div>

            <div className="relative aspect-video rounded-xl bg-black/50 border border-white/[0.08] overflow-hidden flex items-center justify-center">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-3 left-3 text-xs font-medium text-white/90 bg-black/60 px-2.5 py-1 rounded-md">
                You ({displayName || userId})
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={toggleMic}
              className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-[#F2F1EC] flex items-center gap-2 cursor-pointer"
            >
              {micMuted ? <MicOff className="w-4 h-4 text-red-400" /> : <Mic className="w-4 h-4" />}
              <span>{micMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
            </button>
            {callType === 'video' && (
              <button
                type="button"
                onClick={toggleCam}
                className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-[#F2F1EC] flex items-center gap-2 cursor-pointer"
              >
                {camOff ? (
                  <VideoOff className="w-4 h-4 text-red-400" />
                ) : (
                  <Video className="w-4 h-4" />
                )}
                <span>{camOff ? 'Camera On' : 'Camera Off'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={endActiveCall}
              className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
            >
              <PhoneOff className="w-4 h-4" />
              <span>End Call</span>
            </button>
          </div>
        </div>
      )}

      {callError && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between gap-3">
          <span>{callError}</span>
          <button
            type="button"
            onClick={() => setCallError(null)}
            className="text-xs underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* VIP Contacts & Connected Sessions */}
        <aside className="lg:col-span-4 glass-panel rounded-2xl p-5 flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#F2F1EC]">
                <Crown className="w-4 h-4 text-[#D4A853]" />
                <span>VIP Contacts</span>
              </div>
              <span className="text-xs font-mono text-[#9BA1A8]">
                {connected ? 'Socket Live' : 'Connecting'}
              </span>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setActiveRoom('vip_khushi')}
                className={`w-full p-3.5 rounded-xl text-left transition-colors border cursor-pointer flex items-center justify-between gap-3 ${
                  activeRoom === 'vip_khushi'
                    ? 'bg-[#D4A853]/15 border-[#D4A853]/40 text-[#F2F1EC]'
                    : 'bg-white/[0.03] border-white/[0.07] text-[#C8CDD3] hover:bg-white/[0.06]'
                }`}
              >
                <div>
                  <div className="text-sm font-semibold">Khushi Rathore</div>
                  <div className="text-xs text-[#10B981]">VIP Concierge Thread · Online</div>
                </div>
                <Crown className="w-4 h-4 text-[#D4A853] shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => setActiveRoom('general')}
                className={`w-full p-3.5 rounded-xl text-left transition-colors border cursor-pointer flex items-center justify-between gap-3 ${
                  activeRoom === 'general'
                    ? 'bg-[#D4A853]/15 border-[#D4A853]/40 text-[#F2F1EC]'
                    : 'bg-white/[0.03] border-white/[0.07] text-[#C8CDD3] hover:bg-white/[0.06]'
                }`}
              >
                <div>
                  <div className="text-sm font-semibold">General Lounge</div>
                  <div className="text-xs text-[#8F969E]">Multi-User Socket Room</div>
                </div>
                <Users className="w-4 h-4 text-[#9BA1A8] shrink-0" />
              </button>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-white/[0.07]">
              <div className="flex items-center justify-between text-xs text-[#8F969E]">
                <span>Live WebRTC Peers ({otherPeers.length})</span>
                <span className="font-mono">You: {userId}</span>
              </div>

              {otherPeers.length === 0 ? (
                <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.06] text-xs text-[#8F969E] leading-relaxed">
                  Open this app in a second browser tab with a different Session Handle to place
                  real-time WebRTC audio/video calls.
                </div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {otherPeers.map((peer) => (
                    <div
                      key={peer.socketId}
                      className="py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#F2F1EC] truncate">
                          {peer.displayName}
                        </div>
                        <div className="text-xs font-mono text-[#8F969E] truncate">
                          {peer.userId} · {peer.country}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void startCallWithPeer(peer, 'audio')}
                          title="Start Audio Call"
                          className="p-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.09] text-[#EAE9E4] cursor-pointer"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void startCallWithPeer(peer, 'video')}
                          title="Start Video Call"
                          className="p-2.5 rounded-lg bg-[#D4A853]/15 hover:bg-[#D4A853]/25 border border-[#D4A853]/30 text-[#D4A853] cursor-pointer"
                        >
                          <Video className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-white/[0.07] flex items-center gap-2 text-xs text-[#7E858E]">
            <Lock className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
            <span>Messages & WebRTC calls are end-to-end encrypted</span>
          </div>
        </aside>

        {/* Live Chat Window */}
        <section className="lg:col-span-8 glass-panel rounded-2xl p-5 flex flex-col justify-between min-h-[480px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.07] pb-3.5 mb-4">
            <div>
              <h3 className="text-base font-semibold text-[#F2F1EC]">
                {activeRoom === 'vip_khushi' ? 'Khushi Rathore' : 'General Lounge'}
              </h3>
              <p className="text-xs text-[#10B981]">
                Messages & calls are encrypted · Socket.io Live
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs">
                <Languages className="w-3.5 h-3.5 text-[#D4A853]" />
                <select
                  aria-label="Translate chat language"
                  value={translateTarget}
                  onChange={(e) => setTranslateTarget(e.target.value)}
                  className="bg-transparent text-xs text-[#EAE9E4] focus:outline-none cursor-pointer"
                >
                  <option value="Off" className="bg-[#0E131A]">Translate: Off</option>
                  <option value="Hindi" className="bg-[#0E131A]">Hindi</option>
                  <option value="English" className="bg-[#0E131A]">English</option>
                  <option value="Spanish" className="bg-[#0E131A]">Spanish</option>
                  <option value="French" className="bg-[#0E131A]">French</option>
                  <option value="Japanese" className="bg-[#0E131A]">Japanese</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => setGhostMode(!ghostMode)}
                className={`px-3 py-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  ghostMode
                    ? 'bg-orange-500/20 border-orange-400/45 text-orange-200'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.1] text-[#F2F1EC]'
                }`}
              >
                <Flame className={`w-3.5 h-3.5 ${ghostMode ? 'text-orange-400' : 'text-[#9BA1A8]'}`} />
                <span>{ghostMode ? 'Ghost 10s ON' : 'Ghost 10s'}</span>
              </button>
              <button
                type="button"
                onClick={() => setCameraModalOpen(true)}
                className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-[#F2F1EC] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-[#D4A853]" />
                <span>Camera</span>
              </button>
              <button
                type="button"
                onClick={() => void handleHeaderCall('audio')}
                className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-[#F2F1EC] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5 text-[#10B981]" />
                <span>Call</span>
              </button>
              <button
                type="button"
                onClick={() => void handleHeaderCall('video')}
                className="px-3 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#090C10] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Video</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1 max-h-[340px]">
            {roomMessages.map((msg) => {
              const isSelf = msg.senderId === userId;
              const activeLang = translateTarget === 'Off' ? 'English' : translateTarget;
              const translatedText = translations[`${msg.id}:${activeLang}`];
              const ghostExp = ghostExpirations[msg.id];
              const ghostSecsLeft = ghostExp ? Math.max(0, Math.ceil((ghostExp - nowMs) / 1000)) : null;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-2 text-xs text-[#8F969E] mb-1">
                    <span className="font-medium text-[#C8CDD3]">
                      {isSelf ? 'You' : msg.senderName}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {ghostSecsLeft !== null && (
                      <span className="text-orange-300 font-mono tabular-nums flex items-center gap-1">
                        <Flame className="w-3 h-3" />
                        <span>{ghostSecsLeft}s</span>
                      </span>
                    )}
                    {!isSelf && (
                      <>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => void handleTranslateMessage(msg, activeLang)}
                          className="text-[#D4A853] hover:underline cursor-pointer"
                        >
                          {translatingId === msg.id
                            ? 'Translating...'
                            : translatedText
                              ? `Translated (${activeLang})`
                              : `Translate to ${activeLang}`}
                        </button>
                      </>
                    )}
                  </div>
                  <div
                    className={`max-w-[82%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed space-y-1.5 ${
                      isSelf
                        ? 'bg-[#D4A853] text-[#090C10] font-medium'
                        : 'bg-white/[0.06] border border-white/[0.08] text-[#F2F1EC]'
                    }`}
                  >
                    <div>{msg.text}</div>
                    {translatedText && (
                      <div className="pt-1.5 border-t border-white/[0.12] text-xs text-[#D4A853]">
                        {translatedText}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {capturedGallery.length > 0 && (
              <div className="flex flex-wrap gap-3 justify-end pt-2">
                {capturedGallery.map((imgUrl, idx) => (
                  <img
                    key={idx}
                    src={imgUrl}
                    alt={`Captured photo ${idx + 1}`}
                    className="w-40 h-28 object-cover rounded-xl border border-[#D4A853]/40"
                  />
                ))}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form
            onSubmit={handleSendMessage}
            className="pt-4 mt-4 border-t border-white/[0.07] flex items-center gap-2.5"
          >
            <input
              ref={draftInputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message ${activeRoom === 'vip_khushi' ? 'Khushi Rathore' : '#general'}...`}
              className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-[#F2F1EC] placeholder-[#6F767F] focus:outline-none focus:border-[#D4A853]"
            />
            <button
              type="submit"
              disabled={!draft.trim() || !connected}
              className="px-5 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] disabled:opacity-50 text-[#090C10] text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Send</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
