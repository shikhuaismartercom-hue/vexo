import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, Download, QrCode, X } from 'lucide-react';

interface CameraQrModalProps {
  open: boolean;
  mode: 'camera' | 'qr';
  onClose: () => void;
  onCapturePhoto?: (dataUrl: string) => void;
  onScanQrCode?: (upiId: string) => void;
}

export const CameraQrModal: React.FC<CameraQrModalProps> = ({
  open,
  mode,
  onClose,
  onCapturePhoto,
  onScanQrCode,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [qrInput, setQrInput] = useState('vexo_merchant@upi');

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!open) {
      stopTracks();
      setCapturedUrl(null);
      setCameraError(null);
      return;
    }

    let cancelled = false;
    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera API is unavailable in this browser.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode === 'qr' ? 'environment' : 'user' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setCameraError(
          'Camera access denied or no camera hardware detected. You can still enter a UPI / Merchant QR code manually below.'
        );
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      stopTracks();
    };
  }, [open, mode]);

  if (!open) return null;

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    setCapturedUrl(dataUrl);
  };

  const handleUsePhoto = () => {
    if (capturedUrl && onCapturePhoto) {
      onCapturePhoto(capturedUrl);
      onClose();
    }
  };

  const handleApplyQr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrInput.trim()) return;
    onScanQrCode?.(qrInput.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="glass-panel-elevated rounded-2xl max-w-xl w-full p-6 space-y-5 border-[#D4A853]/35">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-2.5">
            {mode === 'qr' ? (
              <QrCode className="w-4 h-4 text-[#D4A853]" />
            ) : (
              <Camera className="w-4 h-4 text-[#D4A853]" />
            )}
            <h3 className="text-base font-semibold text-[#F2F1EC]">
              VEXO Ultra-HD Live Camera & QR Scanner
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9BA1A8] hover:text-white hover:bg-white/[0.08] cursor-pointer"
            aria-label="Close camera modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-white/[0.12] flex items-center justify-center">
          {capturedUrl ? (
            <img
              src={capturedUrl}
              alt="Captured preview"
              className="w-full h-full object-cover"
            />
          ) : cameraError ? (
            <div className="p-6 text-center text-xs text-[#9BA1A8] max-w-sm leading-relaxed">
              {cameraError}
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {mode === 'qr' && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                >
                  <div className="w-44 h-44 rounded-2xl border-2 border-[#D4A853]/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                </div>
              )}
            </>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />

        {mode === 'qr' && (
          <form onSubmit={handleApplyQr} className="space-y-2.5">
            <label className="block text-xs font-medium text-[#A8AEB5]">
              Detected / Verified UPI or Merchant QR ID
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder="merchant_99@upi"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm font-mono text-[#F2F1EC] focus:outline-none focus:border-[#D4A853]"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#090C10] text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                Use QR for Pay
              </button>
            </div>
          </form>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2.5">
            {!capturedUrl ? (
              <button
                type="button"
                disabled={Boolean(cameraError)}
                onClick={handleCapture}
                className="px-4 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] disabled:opacity-40 text-[#090C10] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Capture Photo</span>
              </button>
            ) : (
              <>
                {onCapturePhoto && (
                  <button
                    type="button"
                    onClick={handleUsePhoto}
                    className="px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#04140E] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Share in Chat</span>
                  </button>
                )}
                <a
                  href={capturedUrl}
                  download={`vexo_capture_${Date.now()}.png`}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-[#F2F1EC] flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save</span>
                </a>
                <button
                  type="button"
                  onClick={() => setCapturedUrl(null)}
                  className="px-3.5 py-2.5 rounded-xl bg-white/[0.05] text-xs text-[#C8CDD3] cursor-pointer"
                >
                  Retake
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-[#EAE9E4] cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
