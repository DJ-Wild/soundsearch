import React, { useState, useEffect } from 'react';
import {
  Link as LinkIcon,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  Music,
  ExternalLink,
  Sparkles,
  Heart,
} from 'lucide-react';
import { Track } from '../types/music';
import { detectPlatformFromUrl, getPlatformMeta } from '../utils/musicLogic';

interface LinkDownloadTabProps {
  onSendToTelegram: (track: Track) => Promise<boolean>;
  onToggleFavorite: (track: Track) => void;
  favorites: Track[];
  playingTrack: Track | null;
  onPlayToggle: (track: Track) => void;
  triggerHaptic: (type?: any) => void;
}

export const LinkDownloadTab: React.FC<LinkDownloadTabProps> = ({
  onSendToTelegram,
  onToggleFavorite,
  favorites,
  playingTrack,
  onPlayToggle,
  triggerHaptic,
}) => {
  const [url, setUrl] = useState('');
  const [resolvedTrack, setResolvedTrack] = useState<Track | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [downloadStep, setDownloadStep] = useState<
    'idle' | 'converting' | 'sending' | 'success' | 'error'
  >('idle');
  const [statusMessage, setStatusMessage] = useState('');

  const detectedPlatform = detectPlatformFromUrl(url);
  const currentPlatform = detectedPlatform || 'youtube';

  const resolveUrl = async (inputUrl: string): Promise<Track | null> => {
    const cleanUrl = inputUrl.trim();
    if (!cleanUrl) return null;

    setIsResolving(true);
    setDownloadStep('idle');
    triggerHaptic('light');

    try {
      const res = await fetch('/api/resolve-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: cleanUrl,
        }),
      });

      if (!res.ok) throw new Error('Не удалось получить информацию о треке');
      const data = await res.json();
      if (data.track) {
        setResolvedTrack(data.track);
        return data.track;
      }
    } catch (err: any) {
      setStatusMessage(err.message || 'Ошибка распознавания ссылки');
      setDownloadStep('error');
    } finally {
      setIsResolving(false);
    }
    return null;
  };

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    setResolvedTrack(null);
    setDownloadStep('idle');
  };

  // Auto-resolve when a valid URL is pasted
  useEffect(() => {
    const clean = url.trim();
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      const timer = setTimeout(() => {
        if (!resolvedTrack && !isResolving) {
          resolveUrl(clean);
        }
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [url]);

  const handleSendToTelegram = async () => {
    const cleanUrl = url.trim();
    if (!cleanUrl) return;

    setIsSending(true);
    triggerHaptic('medium');

    setDownloadStep('converting');
    setStatusMessage('⏳ Скачивание и конвертация трека...');

    let trackToSend = resolvedTrack;
    if (!trackToSend) {
      trackToSend = await resolveUrl(cleanUrl);
    }

    if (!trackToSend) {
      trackToSend = {
        title: 'Трек по ссылке',
        artist: currentPlatform.toUpperCase(),
        url: cleanUrl,
        platform: currentPlatform,
      };
    }

    await new Promise((r) => setTimeout(r, 600));

    setDownloadStep('sending');
    setStatusMessage('📤 Отправка трека в Telegram...');

    try {
      const ok = await onSendToTelegram(trackToSend);
      if (ok) {
        setDownloadStep('success');
        setStatusMessage(`✅ Трек «${trackToSend.title}» отправлен в Telegram!`);
        triggerHaptic('success');
      } else {
        setDownloadStep('error');
        setStatusMessage('❌ Не удалось отправить трек в чат');
        triggerHaptic('error');
      }
    } catch (err: any) {
      setDownloadStep('error');
      setStatusMessage(`❌ Ошибка: ${err.message || 'Не удалось отправить'}`);
      triggerHaptic('error');
    } finally {
      setIsSending(false);
    }
  };

  const handlePresetUrl = (presetUrl: string) => {
    setUrl(presetUrl);
    setResolvedTrack(null);
    resolveUrl(presetUrl);
  };

  const platformMeta = getPlatformMeta(currentPlatform);

  return (
    <div className="flex flex-col gap-4 md:gap-6 pb-24">
      {/* Link Input Card with Liquid Glass Design */}
      <div className="bg-white/[0.06] hover:bg-white/[0.08] backdrop-blur-3xl border border-white/[0.16] rounded-3xl p-5 md:p-6 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.25),0_15px_40px_rgba(0,0,0,0.6)] flex flex-col gap-4 transition-all">
        <div>
          <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2 drop-shadow-xs">
            <LinkIcon className="w-5 h-5 text-sky-400" />
            Скачать по ссылке
          </h2>
          <p className="text-xs md:text-sm text-zinc-300 mt-1">
            Вставьте любую ссылку на трек из Яндекс Музыки (например <code className="text-amber-300 bg-white/10 px-1 py-0.5 rounded">/album/.../track/...</code>), SoundCloud, YouTube, Spotify или Apple Music — бот определит площадку автоматически!
          </p>
        </div>

        {/* Auto-detected Platform Indicator Banner */}
        {url.trim() && (
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-black/40 border border-white/15 text-xs text-zinc-300">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse"
              style={{ backgroundColor: platformMeta.color }}
            />
            <span>Определена площадка:</span>
            <span
              className={`font-bold px-2 py-0.5 rounded-md border text-[11px] ${platformMeta.bg}`}
            >
              {platformMeta.name}
            </span>
          </div>
        )}

        {/* URL Input */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <input
              type="url"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://music.yandex.ru/album/.../track/... или https://youtube.com/watch?v=..."
              className="w-full bg-black/40 border border-white/15 focus:border-white/35 rounded-2xl px-4 py-3.5 text-xs md:text-sm text-white placeholder:text-zinc-500 focus:outline-hidden transition-all font-mono shadow-inner"
              aria-label="Ссылка на трек"
            />
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => resolveUrl(url)}
              disabled={isResolving || !url.trim()}
              className="flex-1 py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 disabled:opacity-40 text-xs md:text-sm font-bold text-white transition-all flex items-center justify-center gap-2 active:scale-98 shadow-md"
            >
              {isResolving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                  <span>Распознавание...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-sky-400" />
                  <span>Распознать</span>
                </>
              )}
            </button>

            <button
              onClick={handleSendToTelegram}
              disabled={isSending || !url.trim()}
              className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-40 text-xs md:text-sm font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2 active:scale-98 border border-white/20"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Отправка...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>В Telegram чат</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Example Links */}
        <div className="pt-3 border-t border-white/10">
          <span className="text-[11px] text-zinc-400 uppercase font-bold tracking-wider block mb-2">
            Попробовать с примером:
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                handlePresetUrl(
                  'https://music.yandex.ru/album/38247943/track/142987421?utm_source=desktop&utm_medium=copy_link'
                )
              }
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-xs text-amber-300 font-medium transition-colors"
            >
              Яд В Шее (Яндекс Desktop ссылка)
            </button>
            <button
              onClick={() =>
                handlePresetUrl('https://music.yandex.ru/album/24546419/track/109865181')
              }
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-xs text-amber-300 font-medium transition-colors"
            >
              Kelingan (Яндекс Альбом/Трек)
            </button>
            <button
              onClick={() =>
                handlePresetUrl('https://soundcloud.com/theweeknd/blinding-lights')
              }
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-xs text-orange-300 font-medium transition-colors"
            >
              Blinding Lights (SoundCloud)
            </button>
            <button
              onClick={() =>
                handlePresetUrl('https://www.youtube.com/watch?v=WNadEfGnV04')
              }
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-xs text-rose-300 font-medium transition-colors"
            >
              Дорадура (YouTube)
            </button>
          </div>
        </div>
      </div>

      {/* Progress & Status Message Card */}
      {downloadStep !== 'idle' && (
        <div
          className={`p-4 rounded-2xl md:rounded-3xl border text-xs md:text-sm flex items-center gap-3 transition-all shadow-lg backdrop-blur-xl ${
            downloadStep === 'success'
              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
              : downloadStep === 'error'
              ? 'bg-rose-950/50 border-rose-500/40 text-rose-200'
              : 'bg-sky-950/50 border-sky-500/40 text-sky-200'
          }`}
        >
          {downloadStep === 'converting' || downloadStep === 'sending' ? (
            <Loader2 className="w-4 h-4 animate-spin text-sky-400 shrink-0" />
          ) : downloadStep === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="font-semibold">{statusMessage}</span>
        </div>
      )}

      {/* Recognized Track Card with Liquid Glass Design */}
      {resolvedTrack && (() => {
        const isFav = favorites.some(
          (f) =>
            f.url === resolvedTrack.url ||
            (f.title.toLowerCase() === resolvedTrack.title.toLowerCase() &&
              f.artist.toLowerCase() === resolvedTrack.artist.toLowerCase())
        );
        return (
          <div className="bg-white/[0.08] hover:bg-white/[0.10] backdrop-blur-3xl border border-white/[0.18] rounded-3xl p-5 md:p-6 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.3),0_15px_40px_rgba(0,0,0,0.6)] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                Распознанный трек
              </span>
              <span
                className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border shadow-xs ${platformMeta.bg}`}
              >
                {platformMeta.name}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-18 h-18 md:w-20 md:h-20 rounded-2xl overflow-hidden bg-zinc-900 border border-white/20 shrink-0 relative shadow-lg">
                {resolvedTrack.thumbnail ? (
                  <img
                    src={resolvedTrack.thumbnail}
                    alt={resolvedTrack.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className={`w-full h-full bg-gradient-to-tr ${platformMeta.gradient} flex items-center justify-center`}
                  >
                    <Music className="w-8 h-8 text-white/90" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-base md:text-lg font-extrabold text-white truncate drop-shadow-xs">
                  {resolvedTrack.title}
                </h3>
                <p className="text-xs md:text-sm text-zinc-300 truncate mt-0.5">
                  {resolvedTrack.artist}
                </p>
                <a
                  href={resolvedTrack.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 hover:underline mt-1.5 truncate font-medium"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Открыть источник трека</span>
                </a>
              </div>
            </div>

            {/* Action buttons with Liquid Glass styling */}
            <div className="flex items-center gap-2.5 pt-3 border-t border-white/10 flex-wrap sm:flex-nowrap">
              {resolvedTrack.preview_url ? (
                <button
                  onClick={() => onPlayToggle(resolvedTrack)}
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs md:text-sm font-semibold text-white transition-all shadow-md active:scale-95"
                >
                  {playingTrack?.url === resolvedTrack.url ? (
                    <>
                      <Pause className="w-4 h-4 fill-current text-white" />
                      <span>Пауза</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current pl-0.5" />
                      <span>Слушать</span>
                    </>
                  )}
                </button>
              ) : null}

              <button
                onClick={() => {
                  triggerHaptic('impact');
                  onToggleFavorite(resolvedTrack);
                }}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl border text-xs md:text-sm font-bold transition-all ${
                  isFav
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                    : 'bg-white/10 hover:bg-white/20 border-white/15 text-zinc-300 hover:text-white'
                }`}
                title={isFav ? 'Убрать из любимых' : 'Добавить в любимые'}
              >
                <Heart className={`w-4 h-4 ${isFav ? 'fill-current text-rose-400' : ''}`} />
                <span>{isFav ? 'В любимых' : 'В любимые'}</span>
              </button>

              <button
                onClick={handleSendToTelegram}
                disabled={isSending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-5 rounded-2xl bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-xs md:text-sm font-bold text-white transition-all shadow-lg border border-white/20 active:scale-98"
              >
                <Send className="w-4 h-4" />
                <span>Отправить в Telegram</span>
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
