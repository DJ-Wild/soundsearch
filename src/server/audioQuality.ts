/**
 * SoundSearch Mini App — оригинальные метаданные исходного аудиопотока (без Spotify).
 * YouTube (watch-page adaptive formats + yt-dlp), SoundCloud API transcodings, Яндекс Музыка.
 */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { Platform, SourceQuality } from '../types/music';
import { getSoundCloudClientId } from './musicService';
import { getYandexAudioQuality } from './yandexMusic';

export type { SourceQuality };

const execFileAsync = promisify(execFile);

const cache = new Map<string, { until: number; value: SourceQuality }>();
const inFlight = new Map<string, Promise<SourceQuality>>();
const waiters: Array<() => void> = [];
let active = 0;

const unavailable = (reason: string): SourceQuality => ({ status: 'unknown', reason });

/** Валидация канонического адреса для предотвращения SSRF */
export function canonicalSourceUrl(platform: Platform, url: string): string | null {
  if (typeof url !== 'string' || url.length > 500 || !/^https:\/\//i.test(url)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password || parsed.port) return null;
  const host = parsed.hostname.toLowerCase();

  if (platform === 'youtube') {
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) {
      return null;
    }
    const id =
      host === 'youtu.be'
        ? parsed.pathname.substring(1)
        : parsed.pathname === '/watch'
        ? parsed.searchParams.get('v')
        : parsed.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})\/?$/)?.[1];
    return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
  }

  if (platform === 'soundcloud') {
    if (!['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'].includes(host)) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length !== 2 || parts.some((p) => !/^[a-zA-Z0-9_-]{1,120}$/.test(p))) return null;
    if (['search', 'discover', 'charts', 'you', 'stations'].includes(parts[0].toLowerCase())) return null;
    return `https://soundcloud.com/${parts.join('/')}`;
  }

  return null;
}

function codecLabel(input: unknown): string | undefined {
  if (typeof input !== 'string' || !input.trim() || input === 'none') return undefined;
  const s = input.toLowerCase();
  if (s.includes('opus')) return 'Opus';
  if (s.includes('mp4a') || s.includes('aac')) return 'AAC';
  if (s.includes('mpeg') || s.includes('mp3')) return 'MP3';
  if (s.includes('vorbis')) return 'Vorbis';
  if (s.includes('flac')) return 'FLAC';
  if (s.includes('alac')) return 'ALAC';
  return undefined;
}

export function soundcloudPresetKbps(raw: unknown): number | undefined {
  if (typeof raw !== 'string') return undefined;
  const match = raw.match(/(?:^|[\/_-])(?:aac|mp3|opus)[_-](\d{2,3})k(?:$|[\/_-])/i);
  if (!match) return undefined;
  const n = Number(match[1]);
  return n >= 32 && n <= 512 ? n : undefined;
}

function bitRateKbps(raw: unknown, bps = false): number | undefined {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  const v = bps ? n / 1000 : n;
  return Number.isFinite(v) && v >= 8 && v <= 2000 ? Math.round(v) : undefined;
}

type AudioFormat = Record<string, unknown>;

export function formatQuality(format: AudioFormat, youtube = false): SourceQuality | null {
  const codec = codecLabel(format.acodec) || codecLabel(format.mimeType) || codecLabel(format.mime_type);
  if (!codec) return null;
  const isAudioOnly =
    format.vcodec == null ||
    format.vcodec === 'none' ||
    (typeof format.mimeType === 'string' && format.mimeType.startsWith('audio/'));

  const kbps =
    bitRateKbps(format.abr) ??
    (youtube ? bitRateKbps(format.averageBitrate, true) ?? bitRateKbps(format.bitrate, true) : undefined) ??
    (isAudioOnly ? bitRateKbps(format.tbr) : undefined) ??
    (isAudioOnly ? soundcloudPresetKbps(format.format_id) : undefined);

  return {
    status: 'ok',
    codec,
    ...(kbps === undefined ? {} : { bitrateKbps: kbps, approximate: true }),
  };
}

export function bestQuality(formats: unknown, youtube = false): SourceQuality | null {
  if (!Array.isArray(formats)) return null;
  const qualities = formats
    .filter((f): f is AudioFormat => f && typeof f === 'object' && !Array.isArray(f))
    .filter(
      (f) =>
        f.vcodec === 'none' ||
        (typeof f.mimeType === 'string' && f.mimeType.startsWith('audio/'))
    )
    .map((f) => formatQuality(f, youtube))
    .filter((f): f is SourceQuality => Boolean(f));

  qualities.sort((a, b) => (b.bitrateKbps ?? -1) - (a.bitrateKbps ?? -1));
  return qualities[0] || null;
}

export function readPlayerResponse(html: string): Record<string, unknown> | null {
  const signatures = [/\bvar\s+ytInitialPlayerResponse\s*=\s*/g, /["']ytInitialPlayerResponse["']\s*:\s*/g];
  for (const signature of signatures) {
    const found = signature.exec(html);
    if (!found) continue;
    const from = found.index + found[0].length;
    if (html[from] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = from; i < html.length && i < from + 1_500_000; i++) {
      const c = html[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try {
          return JSON.parse(html.slice(from, i + 1));
        } catch {
          break;
        }
      }
    }
  }
  return null;
}

async function youtubeWatchQuality(url: string): Promise<SourceQuality | null> {
  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(6500),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.8',
      },
    });
    if (!response.ok) return null;
    const player = readPlayerResponse(await response.text());
    const streaming = player?.streamingData as AudioFormat | undefined;
    return bestQuality(streaming?.adaptiveFormats, true);
  } catch {
    return null;
  }
}

function summarizeExtractorError(e: unknown): string {
  const err = e as { code?: string; killed?: boolean; stderr?: string; message?: string };
  const details = String(err?.stderr || err?.message || '');
  if (err?.killed || /timed out|timeout|ETIMEDOUT|SIGKILL/i.test(details)) return 'Превышено время ответа источника';
  if (err?.code === 'ENOENT') return 'На сервере не найден yt-dlp';
  if (/sign in|not a bot|confirm you.re not a bot/i.test(details)) return 'YouTube требует подтверждения с сервера';
  if (/403|HTTP Error 429|too many requests/i.test(details)) return 'Источник ограничил доступ к аудио';
  if (/Unable to download|failed to resolve|network is unreachable/i.test(details)) return 'Нет соединения с источником';
  return 'Сервис не отдал сведения о качестве';
}

async function acquire(): Promise<boolean> {
  if (active < 2) {
    active++;
    return true;
  }
  if (waiters.length >= 20) return false;
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
  return true;
}

function release(): void {
  active--;
  waiters.shift()?.();
}

async function ytdlpQuality(url: string, isYoutube: boolean): Promise<SourceQuality> {
  if (!(await acquire())) return unavailable('Сервер занят проверкой других треков');
  try {
    const local = path.resolve(process.cwd(), 'bin/yt-dlp');
    const executable = fs.existsSync(local) ? local : 'yt-dlp';
    const args = [
      '--dump-single-json',
      '--skip-download',
      '--no-playlist',
      '--no-warnings',
      '--socket-timeout',
      '7',
      '--retries',
      '0',
      '--extractor-retries',
      '0',
      ...(isYoutube ? ['--js-runtimes', 'node'] : []),
      '--format',
      'bestaudio/best',
      '--',
      url,
    ];
    const { stdout } = await execFileAsync(executable, args, {
      timeout: 20000,
      killSignal: 'SIGKILL',
      maxBuffer: 8 * 1024 * 1024,
    });
    const info = JSON.parse(stdout) as AudioFormat;
    if (Array.isArray(info.entries)) return unavailable('Это не отдельный трек');
    const fromSelected = formatQuality(info);
    const fromFormats = bestQuality(info.formats);
    if (fromSelected?.bitrateKbps !== undefined) return fromSelected;
    if (fromFormats?.bitrateKbps !== undefined) return fromFormats;
    if (fromSelected) return fromSelected;
    if (fromFormats) return fromFormats;
    return unavailable('Источник не предоставил сведения об аудиоформате');
  } catch (e) {
    const reason = summarizeExtractorError(e);
    return unavailable(reason);
  } finally {
    release();
  }
}

async function soundcloudApiQuality(url: string): Promise<SourceQuality | null> {
  try {
    const clientId = await getSoundCloudClientId();
    if (!clientId) return null;
    const response = await fetch(
      `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${encodeURIComponent(clientId)}`,
      { signal: AbortSignal.timeout(6500), headers: { Accept: 'application/json' } }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown>;
    const media = data.media as Record<string, unknown> | undefined;
    const transcodings = Array.isArray(media?.transcodings) ? (media.transcodings as AudioFormat[]) : [];
    const qualities = transcodings
      .filter((item) => item.snipped !== true && item.quality !== 'preview')
      .map((item) => {
        const f = item.format && typeof item.format === 'object' ? (item.format as AudioFormat) : {};
        const codec = codecLabel(f.mime_type) || codecLabel(f.mimeType) || codecLabel(item.preset);
        if (!codec) return null;
        const bitrate =
          bitRateKbps(item.bitrate, true) ??
          bitRateKbps(item.abr) ??
          bitRateKbps(item.bitrate_kbps) ??
          soundcloudPresetKbps(item.preset) ??
          soundcloudPresetKbps(item.url);
        return {
          status: 'ok' as const,
          codec,
          ...(bitrate ? { bitrateKbps: bitrate, approximate: true } : {}),
        };
      })
      .filter((v): v is NonNullable<typeof v> => Boolean(v));

    qualities.sort((a, b) => (b.bitrateKbps ?? -1) - (a.bitrateKbps ?? -1));
    return qualities[0] ?? null;
  } catch {
    return null;
  }
}

async function inspect(platform: Platform, url: string): Promise<SourceQuality> {
  if (platform === 'youtube') {
    const watch = await youtubeWatchQuality(url);
    if (watch) return watch;
    return ytdlpQuality(url, true);
  }
  if (platform === 'soundcloud') {
    const api = await soundcloudApiQuality(url);
    if (api?.bitrateKbps !== undefined) return api;
    const extracted = await ytdlpQuality(url, false);
    if (extracted.status === 'ok' && extracted.bitrateKbps !== undefined) return extracted;
    return api ?? extracted;
  }
  if (platform === 'yandex') {
    return getYandexAudioQuality(url);
  }
  return unavailable('Площадка не предоставляет битрейт в поисковой выдаче');
}

/** 30 минут положительный кеш; 2 минуты отрицательный кеш */
export async function getSourceAudioQuality(platform: Platform, url: string): Promise<SourceQuality> {
  const safeUrl = platform === 'yandex' ? url : canonicalSourceUrl(platform, url);
  if (!safeUrl) return unavailable('Результат содержит ссылку на поиск, а не на аудиотрек');

  const cached = cache.get(safeUrl);
  if (cached && cached.until > Date.now()) return cached.value;

  const existing = inFlight.get(safeUrl);
  if (existing) return existing;

  const job = inspect(platform, safeUrl)
    .then((value) => {
      cache.set(safeUrl, { value, until: Date.now() + (value.status === 'ok' ? 30 * 60_000 : 120_000) });
      if (cache.size > 500) {
        for (const [k, item] of cache) if (item.until < Date.now() || cache.size > 500) cache.delete(k);
      }
      return value;
    })
    .finally(() => inFlight.delete(safeUrl));

  inFlight.set(safeUrl, job);
  return job;
}

export const audioQualityTestUtils = {
  readPlayerResponse,
  bestQuality,
  formatQuality,
  canonicalSourceUrl,
  soundcloudPresetKbps,
};