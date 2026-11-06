import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  Send,
  Volume2,
  VolumeX,
  Music,
  ExternalLink,
  Loader2,
  Check,
  Sparkles,
} from 'lucide-react';
import { Track } from '../types/music';
import { formatDuration, getPlatformMeta } from '../utils/musicLogic';
import { AudioVisualizer } from './AudioVisualizer';

interface FullscreenPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onPrevTrack: () => void;
  onNextTrack: () => void;
  isFavorite: boolean;
  onToggleFavorite: (track: Track) => void;
  onSendToTelegram: (track: Track) => Promise<boolean>;
  triggerHaptic: (type?: any) => void;
  audioElement?: HTMLAudioElement | null;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

export const FullscreenPlayerModal: React.FC<FullscreenPlayerModalProps> = ({
  isOpen,
  onClose,
  track,
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onSeek,
  onPrevTrack,
  onNextTrack,
  isFavorite,
  onToggleFavorite,
  onSendToTelegram,
  triggerHaptic,
  audioElement = null,
  isMuted = false,
  onToggleMute,
}) => {
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isAppearing, setIsAppearing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [justSent, setJustSent] = useState(false);

  // Smooth entrance & exit lifecycle
  useEffect(() => {
    let animId: number;
    if (isOpen) {
      setIsRendered(true);
      setIsClosing(false);
      setDragOffsetY(0);
      setIsDragging(false);
      setIsAppearing(true);
      animId = requestAnimationFrame(() => {
        setIsAppearing(false);
      });
    } else {
      setIsRendered(false);
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isOpen]);

  const handleSmoothClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    triggerHaptic('light');
    setTimeout(() => {
      onClose();
      setIsRendered(false);
      setIsClosing(false);
      setDragOffsetY(0);
    }, 280);
  }, [isClosing, onClose, triggerHaptic]);

  if (!isRendered || !track) return null;

  const meta = getPlatformMeta(track.platform);

  // Swipe-down gesture detection on mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isClosing) return;
    setTouchStartY(e.touches[0].clientY);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY === null || isClosing) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY;
    if (diff > 0) {
      // 1:1 tactile downward tracking
      setDragOffsetY(diff);
    } else {
      setDragOffsetY(0);
    }
  };

  const handleTouchEnd = () => {
    if (isClosing) return;
    setIsDragging(false);
    if (dragOffsetY > 75) {
      handleSmoothClose();
    } else {
      setDragOffsetY(0);
    }
    setTouchStartY(null);
  };

  const handleLeftButton = () => {
    triggerHaptic('selection');
    if (currentTime > 3) {
      onSeek(0);
    } else {
      onPrevTrack();
    }
  };

  const handleRightButton = () => {
    triggerHaptic('selection');
    onNextTrack();
  };

  const handleCenterButton = () => {
    triggerHaptic('medium');
    onTogglePlay();
  };

  const handleSend = async () => {
    if (isSending) return;
    setIsSending(true);
    triggerHaptic('medium');
    try {
      const ok = await onSendToTelegram(track);
      if (ok) {
        setJustSent(true);
        setTimeout(() => setJustSent(false), 3000);
      }
    } finally {
      setIsSending(false);
    }
  };

  const safeDuration =
    duration && !isNaN(duration) && duration > 0 ? duration : track.duration || 180;
  const progressPercent = Math.min(100, Math.max(0, (currentTime / safeDuration) * 100));

  const dragProgress = Math.min(1, Math.max(0, dragOffsetY / 350));
  const backdropOpacity = isClosing
    ? 0
    : isAppearing
    ? 0
    : Math.max(0.1, 1 - dragProgress * 0.75);

  let translateY = '0px';
  if (isClosing || isAppearing) {
    translateY = '100%';
  } else if (dragOffsetY > 0) {
    translateY = `${dragOffsetY}px`;
  }

  const sheetTransition = isDragging
    ? 'none'
    : 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s ease-out';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-3xl flex flex-col justify-end md:justify-center items-center select-none overflow-hidden"
      style={{
        opacity: backdropOpacity,
        transition: isDragging ? 'none' : 'opacity 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleSmoothClose();
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Real-time Oscilloscope Audio Visualizer running across full screen behind player modal */}
      {/* Matches user sketch in image_b13299f9.png (Silver/grey dynamic wave moving to sound) */}
      <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center overflow-hidden">
        <AudioVisualizer
          audioElement={audioElement}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={safeDuration}
          strokeColor="rgba(255, 255, 255, 0.98)"
          className="w-full h-full opacity-100"
          sensitivity={1.25}
        />
      </div>

      {/* Ambient background mesh glows for Liquid Glass depth */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div
        style={{
          transform: `translateY(${translateY})`,
          transition: sheetTransition,
          willChange: 'transform',
        }}
        className="w-full max-w-md md:max-w-3xl md:h-[82vh] h-[95vh] sm:h-[90vh] bg-zinc-950/75 backdrop-blur-2xl border border-white/20 rounded-t-[38px] md:rounded-[44px] p-6 md:p-8 flex flex-col justify-between shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.3),0_25px_60px_rgba(0,0,0,0.85),0_0_35px_rgba(255,255,255,0.06)] overflow-y-auto no-scrollbar relative z-10"
      >
        {/* In-Card Bright Dynamic Audio Visualizer (Vivid and smooth on both mobile & PC) */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-90 overflow-hidden">
          <AudioVisualizer
            audioElement={audioElement}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={safeDuration}
            strokeColor="rgba(255, 255, 255, 0.95)"
            className="w-full h-full"
            sensitivity={1.15}
          />
        </div>
        {/* Top Header: Swipe handle / Platform indicator + Close 'X' button */}
        <div className="flex items-center justify-between relative z-10 pt-1 pb-2">
          {/* Mobile swipe indicator handle with smooth dark gradient */}
          <div className="md:hidden absolute left-1/2 -translate-x-1/2 top-0 w-12 h-1 rounded-full bg-gradient-to-r from-zinc-700 via-zinc-500 to-zinc-700" />

          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border shadow-xs ${meta.bg}`}
            >
              {meta.name}
            </span>
            {isPlaying && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-semibold text-emerald-300 border border-white/15">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Воспроизведение
              </span>
            )}
          </div>

          {/* Close button with liquid glass effect */}
          <button
            onClick={handleSmoothClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-zinc-300 hover:text-white flex items-center justify-center transition-all active:scale-95 shadow-md"
            aria-label="Закрыть плеер"
          >
            <X className="w-5 h-5 stroke-[2.2px]" />
          </button>
        </div>

        {/* Content Section: responsive split layout for PC (Desktop), column for Mobile */}
        <div className="flex flex-col md:flex-row md:items-center md:gap-10 my-auto py-2 relative z-10">
          {/* Large Album Artwork with Liquid Glass Frame & Reflection */}
          <div className="flex flex-col items-center justify-center shrink-0">
            <div className="relative w-64 h-64 sm:w-72 sm:h-72 md:w-80 md:h-80 rounded-[32px] overflow-hidden bg-zinc-900/80 border border-white/20 shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),0_20px_50px_rgba(0,0,0,0.85)] group">
              {track.thumbnail ? (
                <img
                  src={track.thumbnail}
                  alt={track.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              ) : (
                <div
                  className={`w-full h-full bg-gradient-to-tr ${meta.gradient} flex items-center justify-center`}
                >
                  <Music className="w-24 h-24 text-white/90" />
                </div>
              )}

              {/* Glossy specular top gradient */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/50 pointer-events-none" />
            </div>
          </div>

          {/* Track Info & Interactive Details (Desktop right column / Mobile center) */}
          <div className="flex-1 min-w-0 flex flex-col justify-center mt-4 md:mt-0 px-2 md:px-0">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="text-left flex-1 min-w-0">
                <h2
                  className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight truncate leading-snug drop-shadow-sm"
                  title={track.title}
                >
                  {track.title}
                </h2>
                <p
                  className="text-sm sm:text-base font-semibold text-zinc-300 truncate mt-1 drop-shadow-xs"
                  title={track.artist}
                >
                  {track.artist}
                </p>
              </div>

              {/* Favorite Heart Button with Liquid Glass Accent */}
              <button
                onClick={() => {
                  triggerHaptic('selection');
                  onToggleFavorite(track);
                }}
                className={`p-3.5 rounded-2xl transition-all shrink-0 active:scale-110 border ${
                  isFavorite
                    ? 'text-rose-400 bg-rose-500/20 border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                    : 'text-zinc-400 bg-white/10 hover:bg-white/20 border-white/15 hover:text-white'
                }`}
                aria-label={isFavorite ? 'Убрать из любимых' : 'В любимые'}
              >
                <Heart
                  className={`w-6 h-6 ${
                    isFavorite ? 'fill-rose-500 stroke-rose-500' : ''
                  }`}
                />
              </button>
            </div>

            {/* Timeline Progress Scrubber with Liquid Glow */}
            <div className="flex flex-col gap-2 mb-6">
              <div className="relative flex items-center">
                <input
                  type="range"
                  min={0}
                  max={safeDuration}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => onSeek(Number(e.target.value))}
                  className="w-full h-2 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white hover:accent-sky-300 transition-all shadow-inner"
                  aria-label="Перемотка трека"
                />
              </div>
              <div className="flex justify-between items-center text-xs text-zinc-300 font-mono px-0.5">
                <span>{formatDuration(currentTime)}</span>
                <span>{formatDuration(safeDuration)}</span>
              </div>
            </div>

            {/* Playback Controls (Matching user specification: Left pill, Center circle, Right pill) */}
            <div className="flex items-center justify-center gap-4 sm:gap-6 mb-4">
              {/* Left Button: Rewind / Previous track */}
              <button
                onClick={handleLeftButton}
                className="w-24 h-14 md:w-28 md:h-15 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 active:scale-95 text-zinc-200 hover:text-white flex items-center justify-center transition-all shadow-lg backdrop-blur-md"
                title="Перемотать в начало / Предыдущий трек"
                aria-label="Предыдущий трек"
              >
                <SkipBack className="w-6 h-6 fill-current" />
              </button>

              {/* Center Button: Circular Play / Pause */}
              <button
                onClick={handleCenterButton}
                className="w-18 h-18 md:w-20 md:h-20 rounded-full bg-gradient-to-b from-white to-zinc-200 hover:from-white hover:to-white text-zinc-950 flex items-center justify-center active:scale-90 transition-transform shadow-[0_8px_25px_rgba(255,255,255,0.35)]"
                title={isPlaying ? 'Пауза' : 'Воспроизведение'}
                aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 fill-current" />
                ) : (
                  <Play className="w-8 h-8 fill-current pl-1" />
                )}
              </button>

              {/* Right Button: Next track */}
              <button
                onClick={handleRightButton}
                className="w-24 h-14 md:w-28 md:h-15 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 active:scale-95 text-zinc-200 hover:text-white flex items-center justify-center transition-all shadow-lg backdrop-blur-md"
                title="Следующий трек"
                aria-label="Следующий трек"
              >
                <SkipForward className="w-6 h-6 fill-current" />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Actions: Send to Telegram & Source Link */}
        <div className="flex items-center gap-2 pt-2 border-t border-white/10 relative z-10">
          <button
            onClick={handleSend}
            disabled={isSending}
            className={`flex-1 py-3 px-4 rounded-2xl text-xs md:text-sm font-bold transition-all shadow-lg flex items-center justify-center gap-2 border border-white/20 ${
              justSent
                ? 'bg-emerald-600 text-white'
                : 'bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white active:scale-98 shadow-[0_4px_20px_rgba(14,165,233,0.35)]'
            }`}
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Отправка в Telegram...</span>
              </>
            ) : justSent ? (
              <>
                <Check className="w-4 h-4" />
                <span>Отправлено в чат Telegram!</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Скачать трек в Telegram</span>
              </>
            )}
          </button>

          {onToggleMute && (
            <button
              onClick={onToggleMute}
              className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-zinc-300 hover:text-white transition-colors"
              title={isMuted ? 'Включить звук' : 'Выключить звук'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
          )}

          <a
            href={track.url}
            target="_blank"
            rel="noreferrer"
            className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-zinc-300 hover:text-white transition-colors"
            title="Открыть оригинал"
            aria-label="Открыть оригинал"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
};
