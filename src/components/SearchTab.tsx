import React, { useState } from 'react';
import { Search, Loader2, ChevronLeft, ChevronRight, Sparkles, X, Youtube, Music, Radio } from 'lucide-react';
import { Platform, Track } from '../types/music';
import { TrackCard } from './TrackCard';

interface SearchTabProps {
  onSendToTelegram: (track: Track) => Promise<boolean>;
  onToggleFavorite: (track: Track) => void;
  favorites: Track[];
  playingTrack: Track | null;
  onPlayToggle: (track: Track, queue?: Track[]) => void;
  triggerHaptic: (type?: any) => void;
}

export const SearchTab: React.FC<SearchTabProps> = ({
  onSendToTelegram,
  onToggleFavorite,
  favorites,
  playingTrack,
  onPlayToggle,
  triggerHaptic,
}) => {
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<Platform>('youtube');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [results, setResults] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const platforms: { id: Platform; label: string; shortLabel: string; icon: any; color: string }[] = [
    { id: 'youtube', label: 'YouTube', shortLabel: 'YouTube', icon: Youtube, color: 'text-red-400' },
    { id: 'soundcloud', label: 'SoundCloud', shortLabel: 'SoundCloud', icon: Radio, color: 'text-orange-400' },
    { id: 'yandex', label: 'Яндекс Музыка', shortLabel: 'Яндекс', icon: Music, color: 'text-amber-400' },
  ];

  const quickQueries = [
    'Queen - Bohemian Rhapsody',
    'Кино - Группа крови',
    'The Weeknd - Blinding Lights',
    'Miyagi - Captain',
    'Daft Punk - Get Lucky',
  ];

  const handleSearch = async (
    targetPage = 0,
    targetQuery?: string,
    targetPlatform?: Platform
  ) => {
    const q = (targetQuery !== undefined ? targetQuery : query).trim();
    if (!q) return;

    const activePlat = targetPlatform || platform;
    setIsLoading(true);
    setError(null);
    triggerHaptic('light');

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          platform: activePlat,
          page: targetPage,
        }),
      });

      if (!res.ok) {
        throw new Error('Ошибка при выполнении поиска');
      }

      const data = await res.json();
      setResults(data.results || []);
      setPage(data.page || 0);
      setTotalPages(data.totalPages || 1);
      setHasSearched(true);
    } catch (err: any) {
      setError(err.message || 'Не удалось найти треки');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickSearch = (q: string) => {
    setQuery(q);
    handleSearch(0, q, platform);
  };

  const handlePrevPage = () => {
    if (page > 0) {
      triggerHaptic('selection');
      handleSearch(page - 1, query, platform);
    }
  };

  const handleNextPage = () => {
    if (page < totalPages - 1) {
      triggerHaptic('selection');
      handleSearch(page + 1, query, platform);
    }
  };

  const isFavorite = (track: Track) => {
    return favorites.some(
      (f) =>
        f.url === track.url ||
        f.title.toLowerCase() === track.title.toLowerCase()
    );
  };

  return (
    <div className="flex flex-col gap-4 pb-28 animate-fade-in">
      {/* Search Bar & Platform Selector with Liquid Glass Design */}
      <div className="bg-white/[0.06] hover:bg-white/[0.08] backdrop-blur-3xl border border-white/[0.16] rounded-3xl p-4 md:p-6 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.25),0_15px_40px_rgba(0,0,0,0.6)] flex flex-col gap-3.5 transition-all">
        {/* Platform tabs (Immediate platform switch and search) */}
        <div>
          <label className="text-[11px] md:text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2 block">
            Площадка для поиска
          </label>
          <div className="grid grid-cols-3 gap-1 p-1 bg-black/50 rounded-2xl border border-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]">
            {platforms.map((p) => {
              const Icon = p.icon;
              const isSelected = platform === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    const newPlatform = p.id;
                    if (platform === newPlatform && results.length > 0) return;
                    setPlatform(newPlatform);
                    triggerHaptic('selection');
                    const q = query.trim();
                    if (q) {
                      setResults([]);
                      handleSearch(0, q, newPlatform);
                    }
                  }}
                  className={`flex items-center justify-center gap-1.5 h-11 px-2 sm:px-3 rounded-xl text-xs md:text-sm transition-all duration-200 active:scale-95 ${
                    isSelected
                      ? 'bg-gradient-to-b from-white/25 via-white/15 to-white/10 text-white border border-white/40 shadow-[0_4px_20px_rgba(255,255,255,0.18),inset_0_1px_1px_rgba(255,255,255,0.6)] font-extrabold'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 font-semibold'
                  }`}
                  aria-pressed={isSelected}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${p.color}`} />
                  <span className="hidden sm:inline truncate">{p.label}</span>
                  <span className="sm:hidden truncate">{p.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Input box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch(0, query, platform);
          }}
          className="relative flex items-center"
        >
          <div className="absolute left-3.5 text-zinc-400">
            <Search className="w-4 h-4 md:w-5 md:h-5 text-sky-400" />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Название трека или Название - Автор"
            className="w-full bg-black/40 border border-white/15 focus:border-white/35 rounded-2xl pl-10 md:pl-11 pr-24 py-3 text-xs md:text-sm text-white placeholder:text-zinc-500 focus:outline-hidden transition-all shadow-inner"
            aria-label="Поисковый запрос"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-14 text-zinc-400 hover:text-white p-1.5 active:scale-90 transition-transform"
              aria-label="Очистить ввод"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="absolute right-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:scale-95 disabled:opacity-40 text-white font-bold text-xs md:text-sm transition-all flex items-center gap-1.5 shadow-md border border-white/20"
            aria-label="Искать"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <span>Найти</span>
            )}
          </button>
        </form>

        {/* Quick query pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          <span className="text-[10px] text-zinc-500 uppercase font-bold shrink-0 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-sky-400" />
            Примеры:
          </span>
          {quickQueries.map((q) => (
            <button
              key={q}
              onClick={() => handleQuickSearch(q)}
              className="px-2.5 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-zinc-100 transition-all active:scale-95 whitespace-nowrap shrink-0"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Search results header */}
      {hasSearched && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-zinc-400">
            Результаты поиска по запросу{' '}
            <strong className="text-zinc-200">«{query}»</strong>
          </p>
          <span className="text-[11px] text-zinc-400">
            Стр. {page + 1} из {totalPages}
          </span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="flex flex-col gap-2.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-20 bg-zinc-900/60 border border-zinc-800/60 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Results list */}
      {!isLoading && results.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {results.map((track) => (
              <TrackCard
                key={`${track.id || track.url}-${track.platform}`}
                track={track}
                isFavorite={isFavorite(track)}
                isPlaying={playingTrack?.url === track.url}
                onPlayToggle={(t) => onPlayToggle(t, results)}
                onSendToTelegram={onSendToTelegram}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>

          {/* Pagination controls */}
          <div className="flex items-center justify-between pt-2 px-1">
            <button
              onClick={handlePrevPage}
              disabled={page === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold text-white disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all shadow-md"
              aria-label="Предыдущая страница"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Назад</span>
            </button>

            <span className="text-xs text-zinc-300 font-semibold font-mono">
              Стр. {page + 1} из {totalPages}
            </span>

            <button
              onClick={handleNextPage}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold text-white disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all shadow-md"
              aria-label="Следующая страница"
            >
              <span>Вперед</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Empty result state */}
      {!isLoading && hasSearched && results.length === 0 && (
        <div className="text-center py-12 px-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/60">
          <p className="text-zinc-300 text-sm font-semibold">Ничего не найдено 😔</p>
          <p className="text-zinc-500 text-xs mt-1">
            Попробуйте изменить запрос или переключить площадку поиска
          </p>
        </div>
      )}

      {/* Initial welcome state before searching */}
      {!hasSearched && (
        <div className="text-center py-10 px-4 rounded-2xl bg-zinc-900/30 border border-zinc-800/50 flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mb-3">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-zinc-200">
            Поиск музыки по названию или исполнителю
          </h3>
          <p className="text-xs text-zinc-400 max-w-xs mt-1">
            Введите название трека или нажмите на один из примеров выше, чтобы найти и слушать музыку без ограничений.
          </p>
        </div>
      )}
    </div>
  );
};
