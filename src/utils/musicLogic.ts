import { Platform, Track } from '../types/music';

/**
 * Detect music platform from URL, matching python bot supported services
 */
export function detectPlatformFromUrl(url: string): Platform | null {
  if (!url || typeof url !== 'string') return null;
  const cleanUrl = url.trim().toLowerCase();

  if (
    cleanUrl.includes('music.yandex') ||
    cleanUrl.includes('yandex.ru') ||
    cleanUrl.includes('yandex.com') ||
    cleanUrl.includes('yandex.by') ||
    cleanUrl.includes('yandex.kz')
  ) {
    return 'yandex';
  }
  if (cleanUrl.includes('spotify.com') || cleanUrl.includes('spotify.')) {
    return 'spotify';
  }
  if (cleanUrl.includes('apple.com') || cleanUrl.includes('music.apple.')) {
    return 'apple';
  }
  if (cleanUrl.includes('soundcloud.com') || cleanUrl.includes('soundcloud.')) {
    return 'soundcloud';
  }
  if (
    cleanUrl.includes('youtube.com') ||
    cleanUrl.includes('youtu.be') ||
    cleanUrl.includes('music.youtube.')
  ) {
    return 'youtube';
  }

  return null;
}

/**
 * Process query matching Python bot:
 * if " - " in query: parts = query.split(" - ", 1); clean_query = f"{parts[0].strip()} {parts[1].strip()}"
 */
export function parseSearchQuery(query: string): {
  cleanQuery: string;
  title: string;
  artist: string;
} {
  const trimmed = (query || '').trim();
  if (!trimmed) {
    return { cleanQuery: '', title: '', artist: '' };
  }

  if (trimmed.includes(' - ')) {
    const parts = trimmed.split(' - ');
    const title = parts[0]?.trim() || '';
    const artist = parts[1]?.trim() || '';
    return {
      cleanQuery: `${title} ${artist}`.trim(),
      title,
      artist,
    };
  }

  return {
    cleanQuery: trimmed,
    title: trimmed,
    artist: '',
  };
}

/**
 * Formats duration in seconds to mm:ss
 */
export function formatDuration(seconds?: number): string {
  if (seconds === undefined || seconds === null || isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Sanitizes and truncates metadata for Telegram buttons & previews
 */
export function sanitizeTrackMetadata(
  title: string,
  artist: string = 'Unknown',
  maxTitleLen = 22,
  maxArtistLen = 15
): { title: string; artist: string; label: string } {
  const safeTitle = (title || 'Без названия').trim();
  const safeArtist = (artist || 'Исполнитель').trim();

  const shortTitle =
    safeTitle.length > maxTitleLen
      ? safeTitle.substring(0, maxTitleLen) + '…'
      : safeTitle;

  const shortArtist =
    safeArtist.length > maxArtistLen
      ? safeArtist.substring(0, maxArtistLen) + '…'
      : safeArtist;

  return {
    title: safeTitle,
    artist: safeArtist,
    label: `🎵 ${shortTitle} - ${shortArtist}`,
  };
}

/**
 * Paginates an array of items (default 5 items per page matching python bot)
 */
export function paginateResults<T>(items: T[], page: number, perPage = 5) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.min(10, Math.ceil(totalItems / perPage)));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const startIdx = safePage * perPage;
  const endIdx = startIdx + perPage;
  const currentItems = items.slice(startIdx, endIdx);

  return {
    items: currentItems,
    page: safePage,
    totalPages,
    totalItems,
    hasPrev: safePage > 0,
    hasNext: safePage < totalPages - 1,
  };
}

/**
 * Platform meta details for UI badges and colors
 */
export function getPlatformMeta(platform: Platform) {
  switch (platform) {
    case 'youtube':
      return {
        name: 'YouTube',
        color: '#FF0000',
        bg: 'bg-red-500/10 text-red-400 border-red-500/20',
        gradient: 'from-red-600 to-rose-700',
      };
    case 'soundcloud':
      return {
        name: 'SoundCloud',
        color: '#FF5500',
        bg: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
        gradient: 'from-orange-500 to-amber-600',
      };
    case 'yandex':
      return {
        name: 'Яндекс Музыка',
        color: '#FFCC00',
        bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        gradient: 'from-amber-500 to-yellow-600',
      };
    case 'spotify':
      return {
        name: 'Spotify',
        color: '#1DB954',
        bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        gradient: 'from-emerald-500 to-teal-600',
      };
    case 'apple':
      return {
        name: 'Apple Music',
        color: '#FC3C44',
        bg: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
        gradient: 'from-pink-500 to-rose-600',
      };
  }
}
