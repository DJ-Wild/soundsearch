import React from 'react';
import {
  Play,
  Pause,
  X,
  Volume2,
  VolumeX,
  Music,
  Maximize2,
  SkipBack,
  SkipForward,
  Heart,
  Send,
} from 'lucide-react';
import { Track } from '../types/music';
import { formatDuration, getPlatformMeta } from '../utils/musicLogic';
import { AudioVisualizer } from './AudioVisualizer';

interface AudioPlayerBarProps {
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isMuted: boolean;
  onTogglePlay: (e: React.MouseEvent) => void;
  onToggleMute: (e: React.MouseEvent) => void;
  onSeek: (time: number) => void;
  onClose: (e: React.MouseEvent) => void;
  onOpenFullscreen: () => void;
  onPrevTrack?: () => void;
  onNextTrack?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: (track: Track) => void;
  audioElement?: HTMLAudioElement | null;
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  track,
  isPlaying,
  currentTime,
  duration,
  isMuted,
  onTogglePlay,
  onToggleMute,
  onSeek,
  onClose,
  onOpenFullscreen,
  onPrevTrack,
  onNextTrack,
  isFavorite = false,
  onToggleFavorite,
  audioElement = null,
}) => {
  if (!track) return null;

  const safeDuration =
    duration && !isNaN(duration) && duration > 0 ? duration : track.duration || 180;
  const progressPercent = Math.min(100, Math.max(0, (currentTime / safeDuration) * 100));
  const meta = getPlatformMeta(track.platform);

  return (
    <div className="fixed bottom-[86px] md:bottom-[92px] left-0 right-0 z-30 px-3 md:px-6 select-none pointer-events-none transition-all">
      <div
        onClick={onOpenFullscreen}
        className="max-w-xl md:max-w-5xl mx-auto bg-zinc-950/50 hover:bg-zinc-900/60 border border-white/20 hover:border-white/30 rounded-2xl md:rounded-3xl p-2.5 md:p-3.5 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.35),0_20px_50px_rgba(0,0,0,0.85),0_0_25px_rgba(255,255,255,0.05)] backdrop-blur-3xl pointer-events-auto flex flex-col gap-2 cursor-pointer transition-all duration-300 group"
        title="Нажмите, чтобы открыть плеер на весь экран"
        aria-label="Плеер. Нажмите для открытия полного плеера"
        role="region"
      >
        {/* Main Row */}
        <div className="flex items-center justify-between gap-3 md:gap-6">
          {/* Left: Cover & metadata */}
          <div className="flex items-center gap-3 min-w-0 flex-1 md:flex-initial md:w-72">
            <div className="relative w-11 h-11 md:w-14 md:h-14 rounded-xl md:rounded-2xl overflow-hidden bg-zinc-900/80 border border-white/15 shrink-0 shadow-lg">
              {track.thumbnail ? (
                <img
                  src={track.thumbnail}
                  alt={track.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div
                  className={`w-full h-full bg-gradient-to-tr ${meta.gradient} flex items-center justify-center`}
                >
                  <Music className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
              )}
              {isPlaying && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs md:text-sm font-bold text-white truncate group-hover:text-sky-300 transition-colors drop-shadow-xs">
                  {track.title}
                </h4>
              </div>
              <p className="text-[11px] md:text-xs text-zinc-300 truncate mt-0.5">
                {track.artist}
              </p>
            </div>

            {/* Favorite toggle on desktop player bar */}
            {onToggleFavorite && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(track);
                }}
                className={`hidden md:flex p-2 rounded-xl transition-all ${
                  isFavorite
                    ? 'text-rose-400 bg-rose-500/20'
                    : 'text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
                title={isFavorite ? 'Убрать из любимых' : 'В любимые'}
              >
                <Heart
                  className={`w-4 h-4 ${isFavorite ? 'fill-current text-rose-400' : ''}`}
                />
              </button>
            )}
          </div>

          {/* Center (Desktop Transport Controls & mini-waveform) */}
          <div
            className="hidden md:flex flex-col items-center flex-1 max-w-md gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-4">
              {onPrevTrack && (
                <button
                  onClick={onPrevTrack}
                  className="p-1.5 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 transition-colors active:scale-95"
                  title="Предыдущий трек"
                >
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>
              )}

              <button
                onClick={onTogglePlay}
                className="w-10 h-10 rounded-full bg-white text-zinc-950 flex items-center justify-center shadow-[0_4px_16px_rgba(255,255,255,0.3)] hover:scale-105 active:scale-95 transition-all"
                title={isPlaying ? 'Пауза' : 'Воспроизведение'}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current pl-0.5" />
                )}
              </button>

              {onNextTrack && (
                <button
                  onClick={onNextTrack}
                  className="p-1.5 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 transition-colors active:scale-95"
                  title="Следующий трек"
                >
                  <SkipForward className="w-4 h-4 fill-current" />
                </button>
              )}
            </div>

            {/* Desktop timeline scrubber with mini audio visualizer */}
            <div className="w-full flex items-center gap-2.5">
              <span className="text-[10px] text-zinc-400 font-mono w-8 text-right">
                {formatDuration(currentTime)}
              </span>
              <div className="flex-1 relative flex items-center h-4">
                <input
                  type="range"
                  min={0}
                  max={safeDuration}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => onSeek(Number(e.target.value))}
                  className="w-full h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white hover:accent-sky-300 transition-all shadow-inner"
                  aria-label="Перемотка трека"
                />
              </div>
              <span className="text-[10px] text-zinc-400 font-mono w-8">
                {formatDuration(safeDuration)}
              </span>
            </div>
          </div>

          {/* Right Controls: Volume, Maximize, Close */}
          <div
            className="flex items-center gap-1.5 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Desktop Mini Visualizer Indicator */}
            <div className="hidden lg:block w-20 h-7 rounded-lg overflow-hidden bg-white/5 border border-white/10 px-1">
              <AudioVisualizer
                audioElement={audioElement}
                isPlaying={isPlaying}
                currentTime={currentTime}
                duration={safeDuration}
                strokeColor="rgba(255, 255, 255, 0.75)"
                sensitivity={0.8}
                className="w-full h-full"
              />
            </div>

            {/* Mobile Play/Pause Button */}
            <button
              onClick={onTogglePlay}
              className="md:hidden w-9 h-9 rounded-full bg-white text-zinc-950 flex items-center justify-center shadow-md active:scale-90 transition-transform"
              aria-label={isPlaying ? 'Пауза' : 'Воспроизведение'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current pl-0.5" />
              )}
            </button>

            <button
              onClick={onToggleMute}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
              title={isMuted ? 'Включить звук' : 'Выключить звук'}
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>

            <button
              onClick={onOpenFullscreen}
              className="hidden sm:flex p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Развернуть плеер"
              title="Развернуть плеер на весь экран"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Закрыть плеер"
              title="Закрыть плеер"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile-only Progress scrubber */}
        <div
          className="md:hidden flex items-center gap-2 px-1 pt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[10px] text-zinc-400 font-mono w-7">
            {formatDuration(currentTime)}
          </span>
          <div className="flex-1 relative flex items-center">
            <input
              type="range"
              min={0}
              max={safeDuration}
              step={0.1}
              value={currentTime}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="w-full h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white hover:accent-sky-300"
              aria-label="Перемотка трека"
            />
          </div>
          <span className="text-[10px] text-zinc-400 font-mono w-7 text-right">
            {formatDuration(safeDuration)}
          </span>
        </div>
      </div>
    </div>
  );
};
