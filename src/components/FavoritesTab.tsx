import React, { useState } from 'react';
import {
  Heart,
  Send,
  Trash2,
  Play,
  Pause,
  Music,
  ExternalLink,
  Search,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { Track } from '../types/music';
import { formatDuration, getPlatformMeta } from '../utils/musicLogic';

interface FavoritesTabProps {
  favorites: Track[];
  onRemoveFavorite: (track: Track) => Promise<void>;
  onSendToTelegram: (track: Track) => Promise<boolean>;
  playingTrack: Track | null;
  onPlayToggle: (track: Track, queue?: Track[]) => void;
  onGoToSearch: () => void;
  triggerHaptic: (type?: any) => void;
  isLoggedIn?: boolean;
  onOpenLogin?: () => void;
}

export const FavoritesTab: React.FC<FavoritesTabProps> = ({
  favorites,
  onRemoveFavorite,
  onSendToTelegram,
  playingTrack,
  onPlayToggle,
  onGoToSearch,
  triggerHaptic,
  isLoggedIn = true,
  onOpenLogin,
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [sendingId, setSendingId] = useState<string | number | null>(null);

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col gap-4 md:gap-6 pb-24 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2 drop-shadow-xs">
              <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
              Любимые треки
            </h2>
            <p className="text-xs md:text-sm text-zinc-300 mt-0.5">
              Сохраненная музыка вашего аккаунта
            </p>
          </div>
        </div>

        <div className="text-center py-16 px-6 rounded-3xl bg-white/[0.05] backdrop-blur-2xl border border-white/15 flex flex-col items-center shadow-2xl">
          <div className="w-16 h-16 rounded-3xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-400 mb-4 shadow-lg shadow-rose-500/10">
            <Heart className="w-8 h-8 fill-rose-500/40" />
          </div>
          <h3 className="text-lg md:text-xl font-extrabold text-white">
            Войдите через Telegram
          </h3>
          <p className="text-xs md:text-sm text-zinc-300 max-w-sm mt-2 mb-6 leading-relaxed">
            Чтобы сохранять любимые треки и иметь к ним доступ с любого устройства, войдите через Telegram.
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

  const filtered = favorites.filter((f) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return f.title.toLowerCase().includes(q) || f.artist.toLowerCase().includes(q);
  });

  const handleSend = async (track: Track) => {
    setSendingId(track.id || track.url);
    triggerHaptic('medium');
    try {
      await onSendToTelegram(track);
    } finally {
      setSendingId(null);
    }
  };

  const handleRemove = async (track: Track) => {
    triggerHaptic('light');
    await onRemoveFavorite(track);
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6 pb-24">
      {/* Header with Liquid Glass accent */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2 drop-shadow-xs">
            <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
            Любимые треки
          </h2>
          <p className="text-xs md:text-sm text-zinc-300 mt-0.5">
            Ваша сохраненная коллекция ({favorites.length})
          </p>
        </div>
      </div>

      {favorites.length > 3 && (
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Фильтр по названию или автору..."
            className="w-full bg-black/40 border border-white/15 rounded-2xl pl-10 pr-4 py-2.5 text-xs md:text-sm text-white placeholder:text-zinc-500 focus:outline-hidden focus:border-white/35 transition-all shadow-inner"
          />
        </div>
      )}

      {/* Grid List for PC & Mobile */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filtered.map((track) => {
            const meta = getPlatformMeta(track.platform);
            const isPlaying = playingTrack?.url === track.url;
            const isSending = sendingId === (track.id || track.url);

            return (
              <div
                key={track.id || track.url}
                className="group relative bg-white/[0.06] hover:bg-white/[0.10] backdrop-blur-2xl border border-white/[0.14] hover:border-white/[0.24] rounded-2xl md:rounded-3xl p-3 md:p-4 shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.2),0_10px_30px_rgba(0,0,0,0.5)] flex flex-col gap-3 transition-all duration-300"
              >
                <div className="flex items-center gap-3">
                  <div className="relative w-14 h-14 md:w-16 md:h-16 rounded-xl md:rounded-2xl overflow-hidden bg-zinc-900 border border-white/15 shrink-0 shadow-lg">
                    {track.thumbnail ? (
                      <img
                        src={track.thumbnail}
                        alt={track.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className={`w-full h-full bg-gradient-to-tr ${meta.gradient} flex items-center justify-center`}
                      >
                        <Music className="w-6 h-6 md:w-8 md:h-8 text-white/90" />
                      </div>
                    )}

                    <button
                      onClick={() => onPlayToggle(track, favorites)}
                      className={`absolute inset-0 flex items-center justify-center transition-all ${
                        isPlaying
                          ? 'bg-black/55 opacity-100'
                          : 'bg-black/35 opacity-90 group-hover:opacity-100 hover:bg-black/55'
                      }`}
                      aria-label={isPlaying ? 'Пауза' : 'Слушать'}
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

                  <div className="flex-1 min-w-0 pr-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className={`text-[9.5px] md:text-[10.5px] font-bold uppercase px-2 py-0.5 rounded-full border shadow-xs ${meta.bg}`}
                      >
                        {meta.name}
                      </span>
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

                    <p
                      className="text-xs md:text-sm text-zinc-300 truncate mt-0.5"
                      title={track.artist}
                    >
                      {track.artist}
                    </p>
                  </div>

                  <button
                    onClick={() => handleRemove(track)}
                    className="p-2.5 rounded-xl md:rounded-2xl text-zinc-400 hover:text-rose-400 bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/30 transition-all shrink-0"
                    title="Удалить из любимых"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                  <button
                    onClick={() => handleSend(track)}
                    disabled={isSending}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 md:py-2.5 md:px-4 rounded-xl md:rounded-2xl text-xs md:text-sm font-bold bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-md border border-white/15 active:scale-98 transition-all disabled:opacity-60"
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Отправка...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>В Telegram</span>
                      </>
                    )}
                  </button>

                  <a
                    href={track.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 md:p-2.5 rounded-xl md:rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-zinc-300 hover:text-white transition-colors shrink-0"
                    title="Открыть оригинал"
                  >
                    <ExternalLink className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 px-4 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/10 flex flex-col items-center">
          <div className="w-16 h-16 rounded-3xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-400 mb-4 shadow-lg shadow-rose-500/10">
            <Heart className="w-8 h-8" />
          </div>
          <h3 className="text-base md:text-lg font-bold text-white">
            {filterQuery ? 'Ничего не найдено' : 'Список любимых пуст'}
          </h3>
          <p className="text-xs md:text-sm text-zinc-400 max-w-sm mt-1 mb-5">
            {filterQuery
              ? 'Попробуйте изменить поисковый запрос'
              : 'Добавляйте понравившиеся треки в любимые нажатием на сердечко ❤️'}
          </p>
          {!filterQuery && (
            <button
              onClick={onGoToSearch}
              className="px-5 py-2.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/25 text-white font-bold text-xs md:text-sm transition-all shadow-md active:scale-95 flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-sky-400" />
              <span>Перейти к поиску музыки</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
