/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TelegramHeader } from './components/TelegramHeader';
import { NavigationTabs, TabType } from './components/NavigationTabs';
import { SearchTab } from './components/SearchTab';
import { LinkDownloadTab } from './components/LinkDownloadTab';
import { FavoritesTab } from './components/FavoritesTab';
import { HistoryTab } from './components/HistoryTab';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { FullscreenPlayerModal } from './components/FullscreenPlayerModal';
import { TelegramAuthModal } from './components/TelegramAuthModal';
import { TelegramWallpaperBackground } from './components/TelegramWallpaperBackground';
import { useTelegram } from './hooks/useTelegram';
import { Track, BotConfig, TelegramUserInfo } from './types/music';
import { Check, AlertCircle } from 'lucide-react';

export default function App() {
  const {
    user,
    setUser,
    isInsideTelegram,
    triggerHaptic,
    sendDataToBot,
  } = useTelegram();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabType>('search');
  const [botConfig, setBotConfig] = useState<BotConfig | null>(null);
  const [favorites, setFavorites] = useState<Track[]>([]);
  const [history, setHistory] = useState<Track[]>([]);

  // Audio Playback & Streaming State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingTrack, setPlayingTrack] = useState<Track | null>(null);
  const [playlistQueue, setPlaylistQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(180);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreenPlayerOpen, setIsFullscreenPlayerOpen] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null
  );

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' = 'success') => {
      setToast({ message, type });
      setTimeout(() => {
        setToast((current) => (current?.message === message ? null : current));
      }, 4000);
    },
    []
  );

  // The server-issued HttpOnly session cookie is the ONLY browser identity.
  // Mini App initData must be independently verified by the backend.
  useEffect(() => {
    let alive = true;
    const bootstrap = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const status = params.get('auth');
        if (status) {
          window.history.replaceState(null, '', window.location.pathname + window.location.hash);
          if (status === 'error') setAuthError('Не удалось подтвердить вход в Telegram. Попробуйте ещё раз.');
        }
        const initData = window.Telegram?.WebApp?.initData;
        if (initData) {
          const response = await fetch('/api/auth/telegram-initdata', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin', body: JSON.stringify({ initData }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || 'Telegram Mini App: доступ запрещён');
        }
        const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) throw new Error('Не удалось проверить сессию');
        const payload = await response.json();
        if (!alive) return;
        if (payload.authenticated && payload.user?.id) {
          setUser(payload.user);
          setIsLoggedIn(true);
          setIsAuthModalOpen(false);
        } else {
          setIsAuthModalOpen(true);
        }
      } catch (err: any) {
        if (!alive) return;
        setAuthError(err?.message || 'Ошибка авторизации');
        setIsAuthModalOpen(true);
      }
    };
    bootstrap();
    return () => { alive = false; };
  }, [setUser]);

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      const cfgRes = await fetch('/api/config');
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setBotConfig(cfg);
      }

      if (isLoggedIn && user.id) {
        const favRes = await fetch(`/api/favorites?user_id=${user.id}`);
        if (favRes.ok) {
          const favData = await favRes.json();
          setFavorites(favData.favorites || []);
        }

        const histRes = await fetch(`/api/history?user_id=${user.id}`);
        if (histRes.ok) {
          const histData = await histRes.json();
          setHistory(histData.history || []);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch initial data:', err);
    }
  }, [user.id, isLoggedIn]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Logout revokes the server-side session; deleting localStorage is not authentication.
  const handleLogout = async () => {
    triggerHaptic('medium');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Logout failed');
    } catch { showToast('Не удалось завершить сессию на сервере', 'error'); return; }
    audioRef.current?.pause();
    setUser({ id: 0, first_name: 'Пользователь' });
    setFavorites([]);
    setHistory([]);
    setIsLoggedIn(false);
    setIsAuthModalOpen(true);
    showToast('Вы вышли из аккаунта Telegram', 'success');
  };

  // Audio streaming URL resolver ensuring full-length playback
  const getStreamUrlForTrack = (track: Track): string => {
    const trackDur = track.duration && track.duration > 0 ? track.duration : 180;
    if (track.preview_url && track.preview_url.startsWith('/api/stream-audio')) {
      if (!track.preview_url.includes('duration=')) {
        const sep = track.preview_url.includes('?') ? '&' : '?';
        return `${track.preview_url}${sep}duration=${trackDur}`;
      }
      return track.preview_url;
    }
    // Only use direct link if it is not a 30-second preview snippet
    if (
      track.preview_url &&
      track.preview_url.startsWith('http') &&
      !track.preview_url.includes('preview') &&
      !track.preview_url.includes('dzcdn.net') &&
      !track.preview_url.includes('apple.com') &&
      !track.preview_url.includes('mzstatic.com')
    ) {
      return track.preview_url;
    }
    return `/api/stream-audio?url=${encodeURIComponent(track.url)}&title=${encodeURIComponent(
      track.title
    )}&artist=${encodeURIComponent(track.artist)}&duration=${trackDur}`;
  };

  // Play a track and set queue
  const playTrack = (track: Track, newQueue?: Track[]) => {
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }

    const queue = newQueue && newQueue.length > 0 ? newQueue : playlistQueue;
    if (queue && queue.length > 0) {
      setPlaylistQueue(queue);
      const idx = queue.findIndex(
        (t) => (t.url && track.url && t.url === track.url) || t.title === track.title
      );
      setCurrentIndex(idx !== -1 ? idx : 0);
    }

    setPlayingTrack(track);
    const fullDur = track.duration && track.duration > 0 ? track.duration : 180;
    setDuration(fullDur);
    const streamUrl = getStreamUrlForTrack(track);

    if (audioRef.current) {
      audioRef.current.src = streamUrl;
      audioRef.current.load();
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => {
          console.warn('Autoplay error:', e);
          setIsPlaying(false);
        });
    }
  };

  const handlePlayToggle = (track: Track, newQueue?: Track[]) => {
    triggerHaptic('selection');
    if (newQueue && newQueue.length > 0) {
      setPlaylistQueue(newQueue);
      const idx = newQueue.findIndex(
        (t) => (t.url && track.url && t.url === track.url) || t.title === track.title
      );
      if (idx !== -1) setCurrentIndex(idx);
    }

    if (playingTrack?.url === track.url) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        audioRef.current
          ?.play()
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
      }
    } else {
      playTrack(track, newQueue);
    }
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    if (!audioRef.current) return;
    try {
      const canNativeSeek =
        audioRef.current.seekable &&
        audioRef.current.seekable.length > 0 &&
        time <= audioRef.current.seekable.end(0);

      if (canNativeSeek) {
        audioRef.current.currentTime = time;
      } else if (playingTrack) {
        const baseStream = getStreamUrlForTrack(playingTrack);
        const cleanBase = baseStream.replace(/([?&])start=\d+(&|$)/, '$1').replace(/[?&]$/, '');
        const newSep = cleanBase.includes('?') ? '&' : '?';
        audioRef.current.src = `${cleanBase}${newSep}start=${Math.floor(time)}`;
        audioRef.current.load();
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {});
      }
    } catch {
      audioRef.current.currentTime = time;
    }
  };

  const handleToggleMute = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handlePrevTrack = () => {
    triggerHaptic('selection');
    if (currentTime > 3) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      setCurrentTime(0);
      return;
    }

    const queue = playlistQueue;
    if (queue.length > 0) {
      const prevIdx = (currentIndex - 1 + queue.length) % queue.length;
      setCurrentIndex(prevIdx);
      const prevTrack = queue[prevIdx];
      if (prevTrack) playTrack(prevTrack, queue);
    }
  };

  const handleNextTrack = () => {
    triggerHaptic('selection');
    const queue = playlistQueue;
    if (queue.length > 0) {
      const nextIdx = (currentIndex + 1) % queue.length;
      setCurrentIndex(nextIdx);
      const nextTrack = queue[nextIdx];
      if (nextTrack) playTrack(nextTrack, queue);
    }
  };

  const handleSendToTelegram = async (track: Track): Promise<boolean> => {
    triggerHaptic('medium');
    try {
      const res = await fetch('/api/download-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: track.url,
          platform: track.platform,
          title: track.title,
          artist: track.artist,
          user_id: user.id,
          chat_id: user.id,
          preview_url: track.preview_url,
          thumbnail: track.thumbnail,
          duration: track.duration,
        }),
      });

      const data = await res.json();

      if (data.success) {
        triggerHaptic('success');
        showToast(data.message || `Трек «${track.title}» отправлен в Telegram!`);

        sendDataToBot({
          action: 'track_downloaded',
          title: track.title,
          artist: track.artist,
          url: track.url,
          platform: track.platform,
        });

        // Refresh history
        const histRes = await fetch(`/api/history?user_id=${user.id}`);
        if (histRes.ok) {
          const histData = await histRes.json();
          setHistory(histData.history || []);
        }

        return true;
      } else {
        triggerHaptic('error');
        showToast(data.message || data.error || 'Ошибка при отправке трека', 'error');
        return false;
      }
    } catch (err: any) {
      triggerHaptic('error');
      showToast(err.message || 'Ошибка сети при отправке', 'error');
      return false;
    }
  };

  const handleToggleFavorite = async (track: Track) => {
    const existing = favorites.find(
      (f) => f.url === track.url || (f.title === track.title && f.artist === track.artist)
    );

    if (existing && existing.id) {
      await handleRemoveFavorite(existing);
    } else {
      triggerHaptic('success');
      try {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            title: track.title,
            artist: track.artist,
            url: track.url,
            platform: track.platform,
            thumbnail: track.thumbnail,
            duration: track.duration,
          }),
        });

        if (res.ok) {
          showToast(`«${track.title}» добавлен в любимые! ❤️`);
          const favRes = await fetch(`/api/favorites?user_id=${user.id}`);
          if (favRes.ok) {
            const favData = await favRes.json();
            setFavorites(favData.favorites || []);
          }
        }
      } catch (e) {
        console.error('Failed to add favorite:', e);
      }
    }
  };

  const handleRemoveFavorite = async (track: Track) => {
    triggerHaptic('light');
    if (!track.id) return;
    try {
      const res = await fetch(`/api/favorites/${track.id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Удалено из любимых');
        setFavorites((prev) => prev.filter((f) => f.id !== track.id));
      }
    } catch (e) {
      console.error('Failed to remove favorite:', e);
    }
  };

  const handleRemoveHistory = async (track: Track) => {
    triggerHaptic('light');
    if (!track.id) return;
    try {
      const res = await fetch(`/api/history/${track.id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Удалено из недавних');
        setHistory((prev) => prev.filter((h) => h.id !== track.id));
      }
    } catch (e) {
      console.error('Failed to remove history:', e);
    }
  };

  const handleClearHistory = async () => {
    try {
      const res = await fetch('/api/history/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
      if (res.ok) {
        showToast('История скачиваний очищена');
        setHistory([]);
      }
    } catch (e) {
      console.error('Failed to clear history:', e);
    }
  };

  const isFavorite = (track: Track) => {
    return favorites.some(
      (f) => f.url === track.url || f.title.toLowerCase() === track.title.toLowerCase()
    );
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-zinc-100 flex flex-col font-sans selection:bg-sky-500/30 selection:text-sky-200 relative overflow-x-hidden">
      {/* Telegram Wallpaper Background with subtle music doodles & atmospheric gradients */}
      <TelegramWallpaperBackground />

      {/* Hidden global audio element */}
      <audio
        ref={audioRef}
        preload="auto"
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
            if (
              audioRef.current.duration &&
              !isNaN(audioRef.current.duration) &&
              isFinite(audioRef.current.duration) &&
              audioRef.current.duration > 40
            ) {
              setDuration(audioRef.current.duration);
            }
          }
        }}
        onLoadedMetadata={() => {
          if (
            audioRef.current?.duration &&
            !isNaN(audioRef.current.duration) &&
            isFinite(audioRef.current.duration) &&
            audioRef.current.duration > 0
          ) {
            if (
              audioRef.current.duration > 40 ||
              !playingTrack?.duration ||
              playingTrack.duration <= 30
            ) {
              setDuration(audioRef.current.duration);
            }
          }
        }}
        onEnded={() => {
          if (currentTime >= duration - 2 || duration <= 30) {
            handleNextTrack();
          } else {
            audioRef.current?.play().catch(() => {});
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={(e) => {
          console.warn('Audio playback error:', e);
          setIsPlaying(false);
        }}
      />

      {/* Top Header with Liquid Glass styling */}
      <TelegramHeader
        user={user}
        botConfig={botConfig}
        onLogout={handleLogout}
        isInsideTelegram={isInsideTelegram}
        isLoggedIn={isLoggedIn}
        onOpenLogin={() => setIsAuthModalOpen(true)}
      />

      {/* Main Tab Content - expanded responsive layout for PC & mobile */}
      <main className="flex-1 max-w-xl md:max-w-5xl lg:max-w-6xl w-full mx-auto px-4 md:px-8 pt-4 pb-52 transition-all">
        {activeTab === 'search' && (
          <SearchTab
            onSendToTelegram={handleSendToTelegram}
            onToggleFavorite={handleToggleFavorite}
            favorites={favorites}
            playingTrack={playingTrack}
            onPlayToggle={(t, q) => handlePlayToggle(t, q)}
            triggerHaptic={triggerHaptic}
          />
        )}

        {activeTab === 'link' && (
          <LinkDownloadTab
            onSendToTelegram={handleSendToTelegram}
            onToggleFavorite={handleToggleFavorite}
            favorites={favorites}
            playingTrack={playingTrack}
            onPlayToggle={(t) => handlePlayToggle(t, [t])}
            triggerHaptic={triggerHaptic}
          />
        )}

        {activeTab === 'favorites' && (
          <FavoritesTab
            favorites={favorites}
            onRemoveFavorite={handleRemoveFavorite}
            onSendToTelegram={handleSendToTelegram}
            playingTrack={playingTrack}
            onPlayToggle={(track: Track, queue?: Track[]) =>
              handlePlayToggle(track, queue || favorites)
            }
            onGoToSearch={() => setActiveTab('search')}
            triggerHaptic={triggerHaptic}
          />
        )}

        {activeTab === 'history' && (
          <HistoryTab
            history={history}
            onRemoveHistory={handleRemoveHistory}
            onClearHistory={handleClearHistory}
            onSendToTelegram={handleSendToTelegram}
            playingTrack={playingTrack}
            onPlayToggle={(track: Track, queue?: Track[]) =>
              handlePlayToggle(track, queue || history)
            }
            onGoToSearch={() => setActiveTab('search')}
            triggerHaptic={triggerHaptic}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
          />
        )}
      </main>

      {/* Mini Player Bar (Adapted for PC & Mobile with Liquid Glass and Live Visualizer) */}
      {playingTrack && (
        <AudioPlayerBar
          track={playingTrack}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          isMuted={isMuted}
          onTogglePlay={(e) => {
            e.stopPropagation();
            if (playingTrack) handlePlayToggle(playingTrack);
          }}
          onToggleMute={handleToggleMute}
          onSeek={handleSeek}
          onPrevTrack={handlePrevTrack}
          onNextTrack={handleNextTrack}
          isFavorite={playingTrack ? isFavorite(playingTrack) : false}
          onToggleFavorite={handleToggleFavorite}
          audioElement={audioRef.current}
          onClose={(e) => {
            e.stopPropagation();
            if (audioRef.current) audioRef.current.pause();
            setIsPlaying(false);
            setPlayingTrack(null);
          }}
          onOpenFullscreen={() => {
            triggerHaptic('medium');
            setIsFullscreenPlayerOpen(true);
          }}
        />
      )}

      {/* Fullscreen Player Modal (With Real Dynamic Audio Visualizer wave from image_b13299f9.png) */}
      <FullscreenPlayerModal
        isOpen={isFullscreenPlayerOpen}
        onClose={() => setIsFullscreenPlayerOpen(false)}
        track={playingTrack}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        onTogglePlay={() => {
          if (playingTrack) handlePlayToggle(playingTrack);
        }}
        onSeek={handleSeek}
        onPrevTrack={handlePrevTrack}
        onNextTrack={handleNextTrack}
        isFavorite={playingTrack ? isFavorite(playingTrack) : false}
        onToggleFavorite={handleToggleFavorite}
        onSendToTelegram={handleSendToTelegram}
        triggerHaptic={triggerHaptic}
        audioElement={audioRef.current}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
      />

      {/* Floating Liquid Glass Bottom Navigation Dock */}
      <NavigationTabs
        activeTab={activeTab}
        onChangeTab={(t) => {
          triggerHaptic('selection');
          setActiveTab(t);
        }}
        favoritesCount={favorites.length}
        historyCount={history.length}
      />

      {/* Telegram Mandatory Authentication Modal (Matching user screenshot image.png) */}
      <TelegramAuthModal
        isOpen={isAuthModalOpen}
        error={authError}
        triggerHaptic={triggerHaptic}
      />

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[90%] px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-2xl border text-xs font-semibold flex items-center gap-2.5 ${
            toast.type === 'success'
              ? 'bg-zinc-950/90 border-emerald-500/40 text-emerald-200 shadow-emerald-950/30'
              : 'bg-zinc-950/90 border-rose-500/40 text-rose-200 shadow-rose-950/30'
          }`}
          role="status"
        >
          {toast.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="flex-1 leading-snug">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
