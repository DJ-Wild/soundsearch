import React, { useState } from 'react';
import {
  History,
  Send,
  Trash2,
  Play,
  Pause,
  Music,
  ExternalLink,
  Calendar,
  AlertTriangle,
  Heart,
  Loader2,
  Check,
} from 'lucide-react';
import { Track } from '../types/music';
import { formatDuration, getPlatformMeta } from '../utils/musicLogic';

interface HistoryTabProps {
  history: Track[];
  onRemoveHistory: (track: Track) => Promise<void>;
  onClearHistory: () => Promise<void>;
  onSendToTelegram: (track: Track) => Promise<boolean>;
  playingTrack: Track | null;
  onPlayToggle: (track: Track, queue?: Track[]) => void;
  onGoToSearch: () => void;
  triggerHaptic: (type?: any) => void;
  favorites?: Track[];
  onToggleFavorite?: (track: Track) => void;
  isLoggedIn?: boolean;
  onOpenLogin?: () => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  history,
  onRemoveHistory,
  onClearHistory,
  onSendToTelegram,
  playingTrack,
  onPlayToggle,
  onGoToSearch,
  triggerHaptic,
  favorites = [],
  onToggleFavorite,
  isLoggedIn = true,
  onOpenLogin,
}) => {
  const [sendingId, setSendingId] = useState<string | number | null>(null);
  const [justSentId, setJustSentId] = useState<string | number | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col gap-4 pb-24 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-zinc-100 flex items-center gap-1.5">
              <History className="w-5 h-5 text-sky-400" />
              История скачиваний
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Ваша история отправленных в Telegram треков
            </p>
          </div>
        </div>

        <div className="text-center py-16 px-6 rounded-3xl bg-white/[0.05] backdrop-blur-2xl border border-white/15 flex flex-col items-center shadow-2xl">
          <div className="w-16 h-16 rounded-3xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-sky-400 mb-4 shadow-lg shadow-sky-500/10">
            <History className="w-8 h-8" />
          </div>
          <h3 className="text-lg md:text-xl font-extrabold text-white">
            Войдите через Telegram
          </h3>
          <p className="text-xs md:text-sm text-zinc-300 max-w-sm mt-2 mb-6 leading-relaxed">
            История сохраняет все треки, которые вы отправляете в Telegram чат, чтобы их можно было легко найти и послушать снова.
          </p>
          <button
            onClick={onOpenLogin}
            className="px-6 py-3 rounded-full bg-[#24A1DE] hover:bg-[#1F93CC] text-white font-bold text-xs md:text-sm transition-all shadow-lg shadow-sky-500/25 active:scale-95 flex items-center gap-2 cursor-pointer"
          >
            <Send className="w-4 h-4 fill-white text-white -rotate-12" />
            <span>Войти через Telegram</span>
          </button>
        </div>
      </div>
    );
  }

  const getTrackCover = (track: Track): string => {
    if (track.thumbnail) return track.thumbnail;
    const ytMatch = track.url?.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch && ytMatch[1]) {
      return `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg`;
    }
    return '';
  };

  const handleSend = async (track: Track, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const trackKey = track.id || track.url;
    if (sendingId === trackKey) return;
    setSendingId(trackKey);
    triggerHaptic('medium');
    try {
      const ok = await onSendToTelegram(track);
      if (ok) {
        setJustSentId(trackKey);
        setTimeout(() => setJustSentId(null), 3000);
      }
    } finally {
      setSendingId(null);
    }
  };

  const handleRemove = async (track: Track, e?: React.MouseEvent) => {
    e?.stopPropagation();
    triggerHaptic('light');
    await onRemoveHistory(track);
  };

  const handleClearAll = async () => {
    triggerHaptic('heavy');
    await onClearHistory();
    setShowClearConfirm(false);
  };

  const isFav = (track: Track) => {
    return favorites.some(
      (f) => f.url === track.url || (f.title.toLowerCase() === track.title.toLowerCase() && f.artist.toLowerCase() === track.artist.toLowerCase())
    );
  };

  const formatHistoryDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr.replace(' ', 'T') + 'Z');
      return d.toLocaleDateString('ru-RU', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-zinc-100 flex items-center gap-1.5">
            <History className="w-5 h-5 text-sky-400" />
            История скачиваний
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Всего отправлено треков: {history.length}
          </p>
        </div>

        {history.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="text-[11px] font-medium text-zinc-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Очистить</span>
          </button>
        )}
      </div>

      {/* Clear Confirmation Dialog */}
      {showClearConfirm && (
        <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-700/80 shadow-xl flex flex-col gap-2.5">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
            <AlertTriangle className="w-4 h-4" />
            <span>Очистить историю скачиваний?</span>
          </div>
          <p className="text-xs text-zinc-400">
            Это действие удалит все записи о загрузках из базы данных.
          </p>
          <div className="flex items-center gap-2 justify-end pt-1">
            <button
              onClick={() => setShowClearConfirm(false)}
              className="px-3 py-1.5 rounded-xl bg-zinc-800 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
            >
              Отмена
            </button>
            <button
              onClick={handleClearAll}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white shadow-xs"
            >
              Очистить историю
            </button>
          </div>
        </div>
      )}

      {/* History List */}
      {history.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {history.map((track) => {
            const meta = getPlatformMeta(track.platform);
            const isPlaying = (playingTrack?.url && track.url && playingTrack.url === track.url) ||
              (playingTrack?.title === track.title && playingTrack?.artist === track.artist);
            const trackKey = track.id || track.url;
            const isSending = sendingId === trackKey;
            const justSent = justSentId === trackKey;
            const coverUrl = getTrackCover(track);
            const favorite = isFav(track);

            return (
              <div
                key={trackKey}
                className="group relative bg-white/[0.06] hover:bg-white/[0.10] backdrop-blur-2xl border border-white/[0.14] hover:border-white/[0.24] rounded-2xl md:rounded-3xl p-3 md:p-4 transition-all duration-300 shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.2),0_10px_30px_rgba(0,0,0,0.5)] flex flex-col gap-3"
              >
                <div className="flex items-center gap-3">
                  {/* Cover / Play button thumbnail (like in Search!) */}
                  <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-zinc-800 shrink-0 shadow-md">
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={track.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        onError={(e) => {
                          // Hide broken image so fallback gradient shows
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : null}
                    <div
                      className={`w-full h-full bg-gradient-to-tr ${meta.gradient} flex items-center justify-center ${
                        coverUrl ? 'hidden' : ''
                      }`}
                    >
                      <Music className="w-6 h-6 text-white/90" />
                    </div>

                    {/* Inline play/pause overlay */}
                    <button
                      onClick={() => onPlayToggle(track, history)}
                      className={`absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/60 transition-colors ${
                        isPlaying ? 'opacity-100 bg-black/60' : 'opacity-85 hover:opacity-100'
                      }`}
                      aria-label={isPlaying ? 'Приостановить' : 'Слушать трек'}
                    >
                      {isPlaying ? (
                        <div className="w-7 h-7 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-lg">
                          <Pause className="w-3.5 h-3.5 fill-current" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-white/95 hover:bg-white text-zinc-950 flex items-center justify-center shadow-lg pl-0.5">
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </div>
                      )}
                    </button>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 pr-1">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <span
                        className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md border ${meta.bg}`}
                      >
                        {meta.name}
                      </span>
                      {track.duration ? (
                        <span className="text-[11px] text-zinc-400">
                          {formatDuration(track.duration)}
                        </span>
                      ) : null}
                      {track.downloaded_at && (
                        <span className="text-[10px] text-zinc-500 flex items-center gap-0.5 ml-auto">
                          <Calendar className="w-2.5 h-2.5" />
                          {formatHistoryDate(track.downloaded_at)}
                        </span>
                      )}
                    </div>

                    <h3
                      className="text-sm font-semibold text-zinc-100 truncate leading-snug"
                      title={track.title}
                    >
                      {track.title}
                    </h3>
                    <p className="text-xs text-zinc-400 truncate mt-0.5" title={track.artist}>
                      {track.artist}
                    </p>
                  </div>

                  {/* Right side actions: Favorite toggle & Delete from history */}
                  <div className="flex items-center gap-1 shrink-0">
                    {onToggleFavorite && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerHaptic('selection');
                          onToggleFavorite(track);
                        }}
                        className={`p-2 rounded-xl transition-colors ${
                          favorite
                            ? 'text-rose-500 bg-rose-500/10 hover:bg-rose-500/20'
                            : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
                        }`}
                        aria-label={favorite ? 'Убрать из любимых' : 'Добавить в любимые'}
                      >
                        <Heart
                          className={`w-4 h-4 transition-transform active:scale-125 ${
                            favorite ? 'fill-rose-500 stroke-rose-500' : ''
                          }`}
                        />
                      </button>
                    )}

                    <button
                      onClick={(e) => handleRemove(track, e)}
                      className="p-2 rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Убрать из истории"
                      aria-label="Убрать из истории"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Bottom Actions Row (Matches Search tab!) */}
                <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/60">
                  <button
                    onClick={(e) => handleSend(track, e)}
                    disabled={isSending}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition-all shadow-sm ${
                      justSent
                        ? 'bg-emerald-600 text-white'
                        : isSending
                        ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
                        : 'bg-sky-500 hover:bg-sky-400 text-white active:scale-[0.98]'
                    }`}
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                        <span>Отправка MP3...</span>
                      </>
                    ) : justSent ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span>Отправлено в чат!</span>
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
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
                    title="Открыть оригинал"
                    aria-label="Открыть оригинал трека"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-14 px-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-zinc-400 mb-3">
            <History className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-zinc-200">История скачиваний пуста</h3>
          <p className="text-xs text-zinc-400 max-w-xs mt-1">
            Когда вы отправляете треки в свой Telegram чат, они сохраняются в историю для быстрого повторного скачивания и прослушивания.
          </p>
          <button
            onClick={onGoToSearch}
            className="mt-4 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold shadow-md"
          >
            Найти первый трек
          </button>
        </div>
      )}
    </div>
  );
};
