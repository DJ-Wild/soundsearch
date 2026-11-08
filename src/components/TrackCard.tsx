import React, { useState, useEffect } from 'react';
import { Play, Pause, Heart, Send, ExternalLink, Check, Loader2, Music, Activity } from 'lucide-react';
import { Track, SourceQuality } from '../types/music';
import { formatDuration, getPlatformMeta, sanitizeTrackMetadata } from '../utils/musicLogic';

interface TrackCardProps {
  track: Track;
  isFavorite: boolean;
  isPlaying: boolean;
  onPlayToggle: (track: Track) => void;
  onSendToTelegram: (track: Track) => Promise<boolean>;
  onToggleFavorite: (track: Track) => void;
}

export const TrackCard: React.FC<TrackCardProps> = ({
  track,
  isFavorite,
  isPlaying,
  onPlayToggle,
  onSendToTelegram,
  onToggleFavorite,
}) => {
  const [isSending, setIsSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [quality, setQuality] = useState<SourceQuality | null>(track.quality || null);

  const meta = getPlatformMeta(track.platform);
  const clean = sanitizeTrackMetadata(track.title, track.artist);

  // Фоновая загрузка оригинального качества и кодека источника
  useEffect(() => {
    if (quality || !track.url) return;
    let alive = true;
    const fetchQuality = async () => {
      try {
        const res = await fetch(
          `/api/audio-quality?platform=${encodeURIComponent(track.platform)}&url=${encodeURIComponent(track.url)}`
        );
        if (res.ok) {
          const data = (await res.json()) as SourceQuality;
          if (alive && data.status === 'ok') {
            setQuality(data);
          }
        }
      } catch {}
    };
    fetchQuality();
    return () => {
      alive = false;
    };
  }, [track.url, track.platform, quality]);

  const handleSend = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSending) return;
    setIsSending(true);
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

  const handleFav = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite(track);
  };

  return (
    <div className="group relative bg-white/[0.06] hover:bg-white/[0.10] backdrop-blur-2xl border border-white/[0.14] hover:border-white/[0.24] rounded-2xl md:rounded-3xl p-3 md:p-4 transition-all duration-300 shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.2),0_10px_30px_rgba(0,0,0,0.5)] flex flex-col gap-3">
      {/* Glossy top specular reflection */}
      <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/[0.08] to-transparent rounded-t-2xl md:rounded-t-3xl pointer-events-none" />

      <div className="flex items-center gap-3 relative z-10">
        {/* Cover / Play button thumbnail */}
        <div className="relative w-14 h-14 md:w-16 md:h-16 rounded-xl md:rounded-2xl overflow-hidden bg-zinc-900/80 border border-white/15 shrink-0 shadow-lg">
          {track.thumbnail ? (
            <img
              src={track.thumbnail}
              alt={track.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
          ) : (
            <div className={`w-full h-full bg-gradient-to-tr ${meta.gradient} flex items-center justify-center`}>
              <Music className="w-6 h-6 md:w-8 md:h-8 text-white/90" />
            </div>
          )}

          <button
            onClick={() => onPlayToggle(track)}
            className={`absolute inset-0 flex items-center justify-center transition-all ${
              isPlaying
                ? 'bg-black/55 opacity-100'
                : 'bg-black/35 opacity-90 group-hover:opacity-100 hover:bg-black/55'
            }`}
            aria-label={isPlaying ? 'Приостановить' : 'Слушать превью'}
          >
            {isPlaying ? (
              <div className="w-8 h-8 rounded-full bg-gradient-to-b from-emerald-400 to-teal-500 text-zinc-950 flex items-center justify-center shadow-lg animate-pulse">
                <Pause className="w-4 h-4 fill-current text-white" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-zinc-950 flex items-center justify-center shadow-lg pl-0.5 transition-transform active:scale-90">
                <Play className="w-4 h-4 fill-current" />
              </div>
            )}
          </button>
        </div>

        {/* Track Title, Artist, and Duration + Quality Badge */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span
              className={`text-[9.5px] md:text-[10.5px] font-bold uppercase px-2 py-0.5 rounded-full border shadow-xs ${meta.bg}`}
            >
              {meta.name}
            </span>

            {quality && quality.status === 'ok' && quality.codec && (
              <span
                className="text-[9.5px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-1 shadow-xs"
                title="Оригинальное качество источника"
              >
                <Activity className="w-2.5 h-2.5" />
                {quality.codec} {quality.bitrateKbps ? `${quality.bitrateKbps}k` : ''}
              </span>
            )}

            {track.duration ? (
              <span className="text-[11px] md:text-xs text-zinc-300 font-mono">
                {formatDuration(track.duration)}
              </span>
            ) : null}
          </div>

          <h3
            className="text-sm md:text-base font-bold text-white tracking-tight truncate leading-snug drop-shadow-xs group-hover:text-sky-300 transition-colors"
            title={track.title}
          >
            {track.title}
          </h3>

          <p className="text-xs md:text-sm text-zinc-300 truncate mt-0.5" title={track.artist}>
            {track.artist}
          </p>
        </div>

        {/* Favorite heart button */}
        <button
          onClick={handleFav}
          className={`p-2.5 rounded-xl md:rounded-2xl transition-all shrink-0 border ${
            isFavorite
              ? 'text-rose-400 bg-rose-500/20 border-rose-500/35 shadow-[0_0_12px_rgba(244,63,94,0.25)]'
              : 'text-zinc-400 hover:text-white bg-white/5 hover:bg-white/15 border-white/10'
          }`}
          aria-label={isFavorite ? 'Убрать из любимых' : 'Добавить в любимые'}
        >
          <Heart
            className={`w-5 h-5 transition-transform active:scale-125 ${
              isFavorite ? 'fill-rose-500 stroke-rose-500' : ''
            }`}
          />
        </button>
      </div>

      {/* Action Buttons Row */}
      <div className="flex items-center gap-2 pt-2 border-t border-white/10 relative z-10">
        <button
          onClick={handleSend}
          disabled={isSending}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 md:py-2.5 md:px-4 rounded-xl md:rounded-2xl text-xs md:text-sm font-bold transition-all shadow-md border border-white/15 ${
            justSent
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
              : 'bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white active:scale-[0.98]'
          } disabled:opacity-60`}
          aria-label="Скачать и отправить трек в Telegram"
        >
          {isSending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Отправка в чат...</span>
            </>
          ) : justSent ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Отправлено в Telegram!</span>
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              <span>Скачать в Telegram</span>
            </>
          )}
        </button>

        <a
          href={track.url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 md:p-2.5 rounded-xl md:rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-zinc-300 hover:text-white transition-colors shrink-0"
          title="Открыть оригинал на площадке"
          aria-label="Открыть оригинал"
        >
          <ExternalLink className="w-3.5 h-3.5 md:w-4 md:h-4" />
        </a>
      </div>
    </div>
  );
};