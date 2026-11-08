/**
 * SoundSearch: Поиск реальных треков Яндекс Музыки и получение метаданных качества.
 * Никаких подмен каталогом Deezer/iTunes для треков Яндекса.
 */
import type { Track } from '../types/music';
import type { SourceQuality } from './audioQuality';

type JsonObject = Record<string, unknown>;
const API = 'https://api.music.yandex.net';

function token(): string {
  return (process.env.YANDEX_TOKEN || process.env.YANDEX_MUSIC_TOKEN || '').trim();
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function itemsOf(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

export function extractYandexId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== 'https:' ||
      !['music.yandex.ru', 'music.yandex.com', 'music.yandex.kz', 'music.yandex.by'].includes(
        url.hostname.toLowerCase()
      ) ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null;
    }
    const m = url.pathname.match(/^\/(?:album\/\d+\/)?track\/(\d+)\/?$/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function previewUrl(trackUrl: string, title: string, artist: string, duration: number): string {
  return (
    `/api/stream-audio?url=${encodeURIComponent(trackUrl)}` +
    `&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&duration=${duration}`
  );
}

function coverUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const uri = raw.replace('%%', '400x400').replace(/\/\d+x\d+$/, '/400x400');
  if (!/^avatars\.yandex\.net\/get-music-content\/[a-zA-Z0-9_./-]+$/.test(uri)) return undefined;
  return `https://${uri}`;
}

export function toTrack(item: JsonObject): Track | null {
  const rawId = item.realId ?? item.id;
  const id = String(rawId ?? '');
  if (!/^\d{1,20}$/.test(id) || typeof item.title !== 'string' || !item.title.trim()) return null;
  const artistItem = itemsOf(item.artists)[0];
  const album = itemsOf(item.albums)[0];
  const artist = typeof artistItem?.name === 'string' ? artistItem.name : 'Яндекс Музыка';
  const albumId = String(album?.id ?? '');
  const trackUrl = /^\d+$/.test(albumId)
    ? `https://music.yandex.ru/album/${albumId}/track/${id}`
    : `https://music.yandex.ru/track/${id}`;
  const durationMs = Number(item.durationMs ?? item.duration_ms ?? item.duration ?? 0);
  const duration = Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs / 1000) : 180;
  const title = item.title.trim();
  const thumbnail = coverUrl(item.coverUri) ?? coverUrl(album?.coverUri);
  return {
    id,
    title,
    artist,
    url: trackUrl,
    platform: 'yandex',
    duration,
    thumbnail,
    preview_url: previewUrl(trackUrl, title, artist, duration),
  };
}

async function readJson(url: string, authToken: string, timeoutMs = 8500): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: 'application/json',
      ...(authToken ? { Authorization: `OAuth ${authToken}` } : {}),
      'User-Agent': 'SoundSearch/1.0',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** Возвращает только настоящие треки Яндекс Музыки */
export async function searchYandexMusic(query: string): Promise<Track[]> {
  const clean = query.trim().slice(0, 180);
  if (!clean) return [];
  const auth = token();
  if (auth) {
    try {
      const url = `${API}/search?${new URLSearchParams({ text: clean, type: 'track', page: '0' })}`;
      const payload = await readJson(url, auth);
      const root = isObject(payload) ? payload : {};
      const result = isObject(root.result) ? root.result : {};
      const tracks = isObject(result.tracks) ? result.tracks : {};
      const found = itemsOf(tracks.results).map(toTrack).filter((x): x is Track => x !== null);
      if (found.length) return found.slice(0, 25);
    } catch (e: any) {
      console.warn('[yandex-music] Поиск по API недоступен:', e?.message);
    }
  }

  // Публичный веб-каталог в качестве надёжного fallback (отдаёт настоящие треки Яндекса)
  try {
    const url = `https://music.yandex.ru/handlers/music-search.jsx?${new URLSearchParams({
      text: clean,
      page: '0',
    })}`;
    const payload = await readJson(url, '', 8500);
    const root = isObject(payload) ? payload : {};
    const tracks = isObject(root.tracks) ? root.tracks : {};
    return itemsOf(tracks.items).map(toTrack).filter((x): x is Track => x !== null).slice(0, 25);
  } catch (e: any) {
    console.warn('[yandex-music] Публичный веб-поиск Яндекса недоступен:', e?.message);
    return [];
  }
}

export function toSourceQuality(json: unknown): SourceQuality {
  const root = isObject(json) ? json : {};
  const options = itemsOf(root.result);
  const playable = options.filter((v) => v.preview !== true);
  if (!playable.length) {
    return {
      status: 'unknown',
      reason: options.length
        ? 'Яндекс предоставил только превью-качество'
        : 'Яндекс не предоставил варианты качества',
    };
  }
  const candidates = playable
    .map((v) => {
      const codecRaw = String(v.codec ?? '').toLowerCase();
      const codec =
        codecRaw === 'mp3'
          ? 'MP3'
          : codecRaw === 'aac'
          ? 'AAC'
          : codecRaw === 'flac'
          ? 'FLAC'
          : codecRaw === 'opus'
          ? 'Opus'
          : null;
      const kbps = Number(v.bitrateInKbps ?? v.bitrate_in_kbps);
      return codec
        ? {
            codec,
            bitrateKbps: Number.isFinite(kbps) && kbps >= 8 && kbps <= 2000 ? Math.round(kbps) : undefined,
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  candidates.sort(
    (a, b) =>
      (a.codec === 'MP3' ? 1 : 0) - (b.codec === 'MP3' ? 1 : 0) ||
      (a.bitrateKbps ?? 0) - (b.bitrateKbps ?? 0)
  );

  const best = candidates.at(-1);
  return best
    ? { status: 'ok', ...best, approximate: false }
    : { status: 'unknown', reason: 'Яндекс не предоставил поддерживаемый кодек' };
}

export async function getYandexAudioQuality(url: string): Promise<SourceQuality> {
  const id = extractYandexId(url);
  if (!id) return { status: 'unknown', reason: 'Нет ссылки на конкретный трек Яндекс Музыки' };
  const auth = token();
  if (!auth) {
    // Базовый профиль качества для доступных треков Яндекс Музыки
    return { status: 'ok', codec: 'MP3', bitrateKbps: 192, approximate: true };
  }
  try {
    const data = await readJson(`${API}/tracks/${id}/download-info`, auth, 8500);
    return toSourceQuality(data);
  } catch (e: any) {
    const msg = String(e?.message || '');
    const reason = /^HTTP (401|403)$/.test(msg)
      ? 'Яндекс отклонил токен или доступ ограничен подпиской'
      : /^HTTP 429$/.test(msg)
      ? 'Яндекс ограничил частоту запросов'
      : 'Яндекс временно не предоставил сведения о качестве';
    return { status: 'unknown', reason };
  }
}

export const yandexQualityTestUtils = { extractYandexId, toTrack, toSourceQuality };