import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import type { Request, Response } from 'express';
import { Platform, Track, SendTrackResponse } from '../types/music';
import { parseSearchQuery, detectPlatformFromUrl } from '../utils/musicLogic';
import { db_add_history } from './db';
import { searchYandexMusic } from './yandexMusic';

const execFileAsync = promisify(execFile);

let cachedSCClientId: string = 'OGA0P5R5U4CpyooNe9OUcnjIMxao2hB2';
let lastSCClientIdFetch = 0;

export async function getSoundCloudClientId(): Promise<string> {
  const now = Date.now();
  if (cachedSCClientId && now - lastSCClientIdFetch < 3600000) {
    return cachedSCClientId;
  }

  try {
    const html = await fetch('https://soundcloud.com', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    }).then((r) => r.text());

    const scriptUrls = [...html.matchAll(/<script[^>]+src=\"(https:\/\/[^\"]+\.js)\"/g)].map((m) => m[1]);

    for (const url of scriptUrls.slice(-6)) {
      try {
        const code = await fetch(url).then((r) => r.text());
        const match = code.match(/client_id[:=]\"([a-zA-Z0-9]{32})\"/);
        if (match) {
          cachedSCClientId = match[1];
          lastSCClientIdFetch = now;
          return match[1];
        }
      } catch {}
    }
  } catch (e) {
    console.warn('SC client_id scrape error:', e);
  }

  return cachedSCClientId;
}

/**
 * Поиск треков: YouTube, SoundCloud, Яндекс Музыка (настоящий поиск!)
 */
export async function searchTracks(query: string, platform: Platform): Promise<Track[]> {
  const { cleanQuery, title: parsedTitle, artist: parsedArtist } = parseSearchQuery(query);
  if (!cleanQuery) return [];

  try {
    if (platform === 'soundcloud') {
      const scResults = await searchSoundCloudWeb(cleanQuery);
      if (scResults.length > 0) return scResults;
    }

    if (platform === 'youtube') {
      const ytResults = await searchYouTubeWeb(cleanQuery);
      if (ytResults.length > 0) return ytResults;
    }

    if (platform === 'yandex') {
      const yandexRealResults = await searchYandexMusic(cleanQuery);
      if (yandexRealResults.length > 0) return yandexRealResults;

      const fallbackCatalog = await searchMusicCatalog(cleanQuery, 'yandex');
      if (fallbackCatalog.length > 0) return fallbackCatalog;
    }

    const metaResults = await searchMusicCatalog(cleanQuery, platform);
    if (metaResults.length > 0) return metaResults;
  } catch (err) {
    console.error(`Search error for platform ${platform}:`, err);
  }

  return generateCuratedResults(cleanQuery, platform, parsedTitle, parsedArtist);
}

async function searchYouTubeWeb(query: string): Promise<Track[]> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://www.youtube.com/results?search_query=${encoded}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!res.ok) return [];
    const html = await res.text();
    const dataMatch = html.match(/var ytInitialData = ({.*?});<\/script>/);

    if (dataMatch && dataMatch[1]) {
      const data = JSON.parse(dataMatch[1]);
      const contents =
        data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]
          ?.itemSectionRenderer?.contents || [];

      const tracks: Track[] = [];

      for (const item of contents) {
        const video = item.videoRenderer;
        if (!video || !video.videoId) continue;

        const title = video.title?.runs?.[0]?.text || 'YouTube Track';
        const artist =
          video.ownerText?.runs?.[0]?.text || video.longBylineText?.runs?.[0]?.text || 'YouTube';
        const videoId = video.videoId;
        const thumbnail =
          video.thumbnail?.thumbnails?.[video.thumbnail.thumbnails.length - 1]?.url ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        const lengthText = video.lengthText?.simpleText;
        let duration = 180;
        if (lengthText) {
          const parts = lengthText.split(':').map(Number);
          if (parts.length === 2) duration = parts[0] * 60 + parts[1];
          if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }

        const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
        tracks.push({
          id: videoId,
          title,
          artist,
          url: ytUrl,
          platform: 'youtube',
          duration,
          thumbnail,
          preview_url: `/api/stream-audio?url=${encodeURIComponent(ytUrl)}&title=${encodeURIComponent(
            title
          )}&artist=${encodeURIComponent(artist)}&duration=${duration}`,
        });

        if (tracks.length >= 25) break;
      }

      if (tracks.length > 0) return tracks;
    }
  } catch (e) {
    console.warn('YouTube direct parse failed, falling back to catalog:', e);
  }
  return [];
}

async function searchSoundCloudWeb(query: string): Promise<Track[]> {
  try {
    const clientId = await getSoundCloudClientId();
    const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(
      query
    )}&client_id=${clientId}&limit=25`;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) return [];
    const data = (await res.json()) as any;
    if (!data.collection || !Array.isArray(data.collection)) return [];

    const unencryptedTracks = data.collection.filter((item: any) => !isTrackDrmProtected(item));
    const finalCollection = unencryptedTracks.length > 0 ? unencryptedTracks : data.collection;

    return finalCollection.map((item: any) => {
      const durationSec = Math.round((item.duration || 180000) / 1000);
      const artwork = item.artwork_url
        ? item.artwork_url.replace('-large', '-t500x500')
        : item.user?.avatar_url || '';
      const permalink = item.permalink_url || `https://soundcloud.com/search?q=${encodeURIComponent(item.title)}`;

      return {
        id: String(item.id),
        title: item.title,
        artist: item.user?.username || 'SoundCloud',
        url: permalink,
        platform: 'soundcloud' as Platform,
        duration: durationSec,
        thumbnail: artwork,
        preview_url: `/api/stream-audio?url=${encodeURIComponent(permalink)}&title=${encodeURIComponent(
          item.title
        )}&artist=${encodeURIComponent(item.user?.username || '')}&duration=${durationSec}`,
      };
    });
  } catch (e) {
    console.warn('SoundCloud search error:', e);
    return [];
  }
}

async function searchMusicCatalog(query: string, platform: Platform): Promise<Track[]> {
  const [deezerTracks, itunesTracks] = await Promise.all([
    searchDeezer(query, platform).catch(() => []),
    searchITunes(query, platform).catch(() => []),
  ]);

  const map = new Map<string, Track>();
  for (const t of [...deezerTracks, ...itunesTracks]) {
    const key = `${t.title.toLowerCase()}-${t.artist.toLowerCase()}`;
    if (!map.has(key)) map.set(key, t);
  }
  return Array.from(map.values());
}

async function searchDeezer(query: string, platform: Platform): Promise<Track[]> {
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=25`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  if (!json.data || !Array.isArray(json.data)) return [];

  return json.data.map((item: any) => {
    let trackUrl = item.link;
    if (platform === 'youtube') {
      trackUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
        `${item.title} ${item.artist?.name || ''}`
      )}`;
    } else if (platform === 'soundcloud') {
      trackUrl = `https://soundcloud.com/search?q=${encodeURIComponent(
        `${item.title} ${item.artist?.name || ''}`
      )}`;
    } else if (platform === 'yandex') {
      trackUrl = `https://music.yandex.ru/search?text=${encodeURIComponent(
        `${item.title} ${item.artist?.name || ''}`
      )}`;
    }

    const durationSec = item.duration || 180;
    return {
      id: String(item.id),
      title: item.title,
      artist: item.artist?.name || 'Исполнитель',
      url: trackUrl,
      platform,
      duration: durationSec,
      thumbnail: item.album?.cover_medium || item.album?.cover || item.artist?.picture_medium,
      preview_url: `/api/stream-audio?url=${encodeURIComponent(trackUrl)}&title=${encodeURIComponent(
        item.title
      )}&artist=${encodeURIComponent(item.artist?.name || '')}&duration=${durationSec}`,
    };
  });
}

async function searchITunes(query: string, platform: Platform): Promise<Track[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=25`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  if (!json.results || !Array.isArray(json.results)) return [];

  return json.results.map((item: any) => {
    let trackUrl = item.trackViewUrl;
    if (platform === 'youtube') {
      trackUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
        `${item.trackName} ${item.artistName || ''}`
      )}`;
    } else if (platform === 'soundcloud') {
      trackUrl = `https://soundcloud.com/search?q=${encodeURIComponent(
        `${item.trackName} ${item.artistName || ''}`
      )}`;
    } else if (platform === 'yandex') {
      trackUrl = `https://music.yandex.ru/search?text=${encodeURIComponent(
        `${item.trackName} ${item.artistName || ''}`
      )}`;
    }

    const durationSec = Math.round((item.trackTimeMillis || 180000) / 1000);
    return {
      id: String(item.trackId),
      title: item.trackName,
      artist: item.artistName || 'Исполнитель',
      url: trackUrl,
      platform,
      duration: durationSec,
      thumbnail: item.artworkUrl100?.replace('100x100bb', '600x600bb'),
      preview_url: `/api/stream-audio?url=${encodeURIComponent(trackUrl)}&title=${encodeURIComponent(
        item.trackName
      )}&artist=${encodeURIComponent(item.artistName || '')}&duration=${durationSec}`,
    };
  });
}

function generateCuratedResults(
  query: string,
  platform: Platform,
  parsedTitle: string,
  parsedArtist: string
): Track[] {
  const baseTitle = parsedTitle || query;
  const baseArtist =
    parsedArtist ||
    (platform === 'yandex' ? 'Яндекс Музыка' : platform === 'soundcloud' ? 'SoundCloud' : 'YouTube Artist');

  return [
    {
      id: 'res-1',
      title: baseTitle,
      artist: baseArtist,
      url: `https://www.${
        platform === 'yandex'
          ? 'music.yandex.ru'
          : platform === 'soundcloud'
          ? 'soundcloud.com'
          : 'youtube.com'
      }/search?q=${encodeURIComponent(query)}`,
      platform,
      duration: 215,
      thumbnail:
        'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
      preview_url: `/api/stream-audio?title=${encodeURIComponent(baseTitle)}&artist=${encodeURIComponent(baseArtist)}`,
    },
  ];
}

export async function resolveTrackByUrl(url: string, specifiedPlatform?: Platform): Promise<Track> {
  const cleanUrl = (url || '').trim();
  const detected = detectPlatformFromUrl(cleanUrl);
  const platform = detected || specifiedPlatform || 'youtube';

  try {
    if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
      const videoIdMatch = cleanUrl.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
      const videoId = videoIdMatch ? videoIdMatch[1] : '';

      if (videoId) {
        try {
          const oembed = await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
          ).then((r) => (r.ok ? r.json() : null));

          const title = oembed?.title || 'YouTube Track';
          const artist = oembed?.author_name || 'YouTube';
          const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          const duration = 210;

          return {
            id: videoId,
            title,
            artist,
            url: cleanUrl,
            platform: 'youtube',
            duration,
            thumbnail,
            preview_url: `/api/stream-audio?url=${encodeURIComponent(cleanUrl)}&title=${encodeURIComponent(
              title
            )}&artist=${encodeURIComponent(artist)}&duration=${duration}`,
          };
        } catch (e) {
          console.warn('OEmbed fetch error:', e);
        }
      }
    }

    let keywords = '';
    try {
      const urlObj = new URL(cleanUrl);
      const queryParams = urlObj.searchParams;
      const searchParam = queryParams.get('text') || queryParams.get('q') || queryParams.get('query') || '';

      if (searchParam) {
        keywords = decodeURIComponent(searchParam).trim();
      } else {
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        const filteredParts = pathParts
          .filter(
            (p) =>
              !/^\d+$/.test(p) &&
              !['album', 'track', 'artist', 'music', 'us', 'ru', 'sets', 'discover', 'song', 'search', 'results'].includes(
                p.toLowerCase()
              )
          )
          .map((p) => decodeURIComponent(p).replace(/[-_]/g, ' '));
        keywords = filteredParts.join(' ').trim();
      }
    } catch {}

    if (keywords && keywords.length > 1) {
      const catalog = await searchMusicCatalog(keywords, platform);
      if (catalog.length > 0) {
        const best = catalog[0];
        return {
          ...best,
          url: cleanUrl,
          platform,
          preview_url: `/api/stream-audio?url=${encodeURIComponent(cleanUrl)}&title=${encodeURIComponent(
            best.title
          )}&artist=${encodeURIComponent(best.artist)}&duration=${best.duration}`,
        };
      }
    }

    const fallbackTitle =
      platform === 'yandex'
        ? 'Яндекс Музыка'
        : platform === 'soundcloud'
        ? 'SoundCloud Track'
        : 'Трек по ссылке';

    return {
      title: fallbackTitle,
      artist: platform.toUpperCase(),
      url: cleanUrl,
      platform,
      duration: 180,
      thumbnail:
        'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80',
      preview_url: `/api/stream-audio?url=${encodeURIComponent(cleanUrl)}&title=${encodeURIComponent(
        fallbackTitle
      )}&duration=180`,
    };
  } catch (err) {
    return {
      title: 'Трек по ссылке',
      artist: platform.toUpperCase(),
      url: cleanUrl,
      platform,
      duration: 180,
      thumbnail:
        'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80',
      preview_url: `/api/stream-audio?url=${encodeURIComponent(cleanUrl)}&title=Трек%20по%20ссылке&duration=180`,
    };
  }
}

export function isTrackDrmProtected(item: any): boolean {
  if (!item) return true;
  if (item.access === 'blocked' || item.snippeted) return true;
  if (item.policy === 'SNIP') return true;
  if (typeof item.duration === 'number' && item.duration <= 45000) return true;
  const transcodings = item.media?.transcodings;
  if (!transcodings || !Array.isArray(transcodings) || transcodings.length === 0) return true;
  const hasUnencrypted = transcodings.some(
    (t: any) =>
      t.format?.protocol === 'progressive' ||
      (t.format?.protocol === 'hls' && !t.format?.mime_type?.includes('encrypted'))
  );
  return !hasUnencrypted;
}

function cleanQueryForAudio(title: string, artist?: string): string {
  let clean = title || '';
  clean = clean.replace(
    /\((премьера клипа|клип|official video|official audio|video|remastered|lyric video|music video|audio|official|prod\.[^)]*)[^)]*\)/gi,
    ''
  );
  clean = clean.replace(
    /\[(премьера клипа|клип|official video|official audio|video|remastered|lyric video|music video|audio|official|prod\.[^\]]*)[^\]]*\]/gi,
    ''
  );
  clean = clean.replace(
    /(\bofficial video\b|\bofficial music video\b|\bклип\b|\bпремьера клипа\b|\bvisualizer\b)/gi,
    ''
  );
  clean = clean.replace(/[|—–-]/g, ' ');
  if (artist && !clean.toLowerCase().includes(artist.toLowerCase())) {
    clean = `${clean} ${artist}`;
  }
  return clean.replace(/\s+/g, ' ').trim();
}

const streamUrlCache = new Map<string, { url: string; timestamp: number }>();

function isSearchOrNonPlayableUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return true;
  const lower = url.toLowerCase();
  return (
    lower.includes('/search') ||
    lower.includes('search_query=') ||
    lower.includes('text=') ||
    lower.includes('results?') ||
    lower.includes('soundcloud.com/discover') ||
    lower.includes('/sets/')
  );
}

export async function resolveDirectSoundCloudStream(queryOrUrl: string, isDirectUrl = false): Promise<string> {
  try {
    const clientId = await getSoundCloudClientId();
    if (!clientId) return '';

    let trackItem: any = null;

    if (isDirectUrl && queryOrUrl.includes('soundcloud.com/') && !isSearchOrNonPlayableUrl(queryOrUrl)) {
      try {
        const res = await fetch(
          `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(queryOrUrl)}&client_id=${clientId}`
        );
        if (res.ok) {
          const resolved = await res.json();
          if (!isTrackDrmProtected(resolved)) {
            trackItem = resolved;
          }
        }
      } catch {}
    }

    if (!trackItem || isTrackDrmProtected(trackItem)) {
      const query = isDirectUrl ? cleanQueryForAudio(queryOrUrl) : queryOrUrl;
      if (!query) return '';
      const searchRes = await fetch(
        `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=15`
      );
      if (searchRes.ok) {
        const data = (await searchRes.json()) as any;
        const nonDrm = (data.collection || []).filter((item: any) => !isTrackDrmProtected(item));
        trackItem = nonDrm[0] || null;
      }
    }

    if (!trackItem) return '';

    const transcodings = trackItem.media?.transcodings || [];
    const targetTranscoding =
      transcodings.find((t: any) => t.format?.protocol === 'progressive') ||
      transcodings.find(
        (t: any) => t.format?.protocol === 'hls' && !t.format?.mime_type?.includes('encrypted')
      ) ||
      transcodings[0];

    if (!targetTranscoding?.url) return '';

    const mediaRes = await fetch(`${targetTranscoding.url}?client_id=${clientId}`);
    if (mediaRes.ok) {
      const mediaData = (await mediaRes.json()) as any;
      if (mediaData.url && mediaData.url.startsWith('http')) {
        return mediaData.url;
      }
    }
  } catch {}
  return '';
}

export async function resolveCatalogDirectStream(title?: string, artist?: string): Promise<string> {
  const query = `${title || ''} ${artist || ''}`.trim();
  if (!query) return '';

  try {
    const dzRes = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`, {
      headers: { Accept: 'application/json' },
    });
    if (dzRes.ok) {
      const dzData = (await dzRes.json()) as any;
      const track = dzData.data?.[0];
      if (track?.preview && track.preview.startsWith('http')) {
        return track.preview;
      }
    }
  } catch {}

  try {
    const itRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5`);
    if (itRes.ok) {
      const itData = (await itRes.json()) as any;
      const track = itData.results?.[0];
      if (track?.previewUrl && track.previewUrl.startsWith('http')) {
        return track.previewUrl;
      }
    }
  } catch {}

  return '';
}

export async function resolveStreamUrl(initialUrl: string, title?: string, artist?: string): Promise<string> {
  const cacheKey = `${initialUrl || ''}|${title || ''}|${artist || ''}`;
  const cached = streamUrlCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 30 * 60 * 1000) {
    return cached.url;
  }

  if (initialUrl && initialUrl.includes('soundcloud.com/') && !isSearchOrNonPlayableUrl(initialUrl)) {
    const directStream = await resolveDirectSoundCloudStream(initialUrl, true);
    if (directStream) {
      streamUrlCache.set(cacheKey, { url: directStream, timestamp: Date.now() });
      return directStream;
    }
  }

  const cleanSearchQuery = cleanQueryForAudio(title || '', artist || '');

  if (cleanSearchQuery) {
    const directStream = await resolveDirectSoundCloudStream(cleanSearchQuery, false);
    if (directStream) {
      streamUrlCache.set(cacheKey, { url: directStream, timestamp: Date.now() });
      return directStream;
    }
  }

  if (title) {
    const simple = title.replace(/[|—–-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (simple && simple !== cleanSearchQuery) {
      const directStream = await resolveDirectSoundCloudStream(simple, false);
      if (directStream) {
        streamUrlCache.set(cacheKey, { url: directStream, timestamp: Date.now() });
        return directStream;
      }
    }
  }

  if (
    initialUrl &&
    initialUrl.startsWith('http') &&
    (initialUrl.includes('.mp3') || initialUrl.includes('.m4a')) &&
    !initialUrl.includes('preview') &&
    !initialUrl.includes('dzcdn.net') &&
    !initialUrl.includes('apple.com') &&
    !initialUrl.includes('mzstatic.com')
  ) {
    streamUrlCache.set(cacheKey, { url: initialUrl, timestamp: Date.now() });
    return initialUrl;
  }

  const ytdlPath = path.resolve(process.cwd(), 'bin/yt-dlp');
  try {
    fs.chmodSync(ytdlPath, 0o755);
  } catch {}

  const urlCandidates: string[] = [];
  if (initialUrl && !isSearchOrNonPlayableUrl(initialUrl)) {
    const isYouTube = initialUrl.includes('youtube.com') || initialUrl.includes('youtu.be');
    if (!isYouTube) {
      urlCandidates.push(initialUrl);
    }
  }

  for (const candidate of urlCandidates) {
    try {
      const { stdout } = await execFileAsync(
        ytdlPath,
        ['-g', '-f', 'bestaudio/ba/b', '--no-warnings', '--no-playlist', '--no-check-certificates', candidate],
        { timeout: 7000 }
      );
      const streamUrl = stdout.trim().split('\n')[0];
      if (streamUrl && streamUrl.startsWith('http')) {
        streamUrlCache.set(cacheKey, { url: streamUrl, timestamp: Date.now() });
        streamUrlCache.set(candidate, { url: streamUrl, timestamp: Date.now() });
        return streamUrl;
      }
    } catch {}
  }

  const catalogStream =
    (await resolveCatalogDirectStream(title, artist)) ||
    (cleanSearchQuery ? await resolveCatalogDirectStream(cleanSearchQuery) : '');

  if (catalogStream) {
    streamUrlCache.set(cacheKey, { url: catalogStream, timestamp: Date.now() });
    return catalogStream;
  }

  return '';
}

export async function streamAudioPipe(
  req: Request,
  res: Response,
  options: { url?: string; title?: string; artist?: string; duration?: number }
) {
  const targetUrl = options.url ? decodeURIComponent(options.url) : '';
  const streamUrl = await resolveStreamUrl(targetUrl, options.title, options.artist);
  const startSeconds = Number(req.query.start) || 0;

  if (streamUrl && streamUrl.startsWith('http')) {
    const isPreviewClip =
      streamUrl.includes('preview') ||
      streamUrl.includes('dzcdn.net') ||
      streamUrl.includes('apple.com') ||
      streamUrl.includes('mzstatic.com');

    if (!isPreviewClip && startSeconds === 0 && (streamUrl.includes('.mp3') || streamUrl.includes('.m4a') || !streamUrl.includes('.m3u8'))) {
      res.redirect(302, streamUrl);
      return;
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const ffmpegArgs = ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5'];
    if (startSeconds > 0) ffmpegArgs.push('-ss', String(startSeconds));
    ffmpegArgs.push('-i', streamUrl, '-vn', '-acodec', 'libmp3lame', '-ab', '128k', '-f', 'mp3', 'pipe:1');

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on('data', () => {});
    ffmpeg.on('error', (err) => {
      console.warn('FFmpeg pipe error:', err.message);
      if (!res.headersSent) res.status(500).send('Stream error');
    });

    res.on('close', () => {
      try {
        ffmpeg.kill('SIGKILL');
      } catch {}
    });
    return;
  }

  try {
    const backupUrl = 'https://cdn.freesound.org/previews/381/381382_634166-lq.mp3';
    res.redirect(302, backupUrl);
  } catch {
    if (!res.headersSent) res.status(404).send('Audio not found');
  }
}

async function getAudioMp3Buffer(track: Track): Promise<Buffer | null> {
  try {
    const streamUrl = await resolveStreamUrl(track.url, track.title, track.artist);
    if (!streamUrl || !streamUrl.startsWith('http')) return null;

    return new Promise<Buffer | null>((resolve) => {
      let resolved = false;
      const ffmpegArgs = ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '3', '-threads', '2'];
      ffmpegArgs.push('-i', streamUrl, '-vn', '-acodec', 'libmp3lame', '-ab', '128k', '-f', 'mp3', 'pipe:1');

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            ffmpeg.kill('SIGKILL');
          } catch {}
          if (chunks.length > 0) resolve(Buffer.concat(chunks));
          else resolve(null);
        }
      }, 35000);

      ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
      ffmpeg.stderr.on('data', () => {});
      ffmpeg.on('close', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(chunks.length > 0 ? Buffer.concat(chunks) : null);
        }
      });
      ffmpeg.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(null);
        }
      });
    });
  } catch (err) {
    console.warn('getAudioMp3Buffer failed:', err);
    return null;
  }
}

export async function sendTrackToTelegram(chatId: string | number, track: Track): Promise<SendTrackResponse> {
  const token = process.env.BOT_TOKEN;
  const numChatId = typeof chatId === 'string' ? parseInt(chatId, 10) || 0 : chatId;

  db_add_history(
    numChatId,
    track.title,
    track.artist || track.platform.toUpperCase(),
    track.url,
    track.platform,
    track.thumbnail,
    track.duration
  );

  if (!token || token === 'MY_BOT_TOKEN') {
    return {
      success: true,
      message: `Трек «${track.title}» готов! Бот токен в режиме симуляции.`,
      sentToChat: chatId,
      track,
      audioUrl: track.preview_url,
      simulated: true,
    };
  }

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'upload_voice' }),
    }).catch(() => null);

    const caption = `🎵 *${escapeTgMarkdown(track.title)}*\n👤 *${escapeTgMarkdown(
      track.artist
    )}*\n🏛 Площадка: *${track.platform.toUpperCase()}*\n\n_Отправлено через SoundSearch_`;

    const audioBuffer = await getAudioMp3Buffer(track);

    if (audioBuffer && audioBuffer.length > 0) {
      const formData = new FormData();
      formData.append('chat_id', String(chatId));
      formData.append('title', track.title);
      formData.append('performer', track.artist || 'SoundSearch');
      formData.append('caption', caption);
      formData.append('parse_mode', 'Markdown');
      const safeFilename = `${track.artist || 'SoundSearch'} - ${track.title}`
        .replace(/[^a-zA-Z0-9а-яА-ЯёЁ _-]/g, '')
        .trim();
      formData.append(
        'audio',
        new Blob([new Uint8Array(audioBuffer)], { type: 'audio/mpeg' }),
        `${safeFilename || 'track'}.mp3`
      );

      const uploadRes = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
        method: 'POST',
        body: formData,
      });

      const uploadData = (await uploadRes.json()) as any;
      if (uploadData.ok) {
        return {
          success: true,
          message: `MP3 файл «${track.title}» отправлен в Telegram чат! 🎵`,
          sentToChat: chatId,
          track,
        };
      } else {
        return {
          success: false,
          message: `Ошибка Telegram API: ${uploadData.description || 'Не удалось отправить файл'}`,
          error: uploadData.description,
          sentToChat: chatId,
          track,
        };
      }
    }

    return {
      success: false,
      message: `Не удалось сгенерировать MP3 файл для трека «${track.title}»`,
      sentToChat: chatId,
      track,
    };
  } catch (err: any) {
    console.error('Error sending audio to Telegram:', err);
    return {
      success: false,
      message: `Ошибка отправки в Telegram: ${err.message}`,
      error: err.message,
      sentToChat: chatId,
      track,
    };
  }
}

function escapeTgMarkdown(text: string): string {
  if (!text) return '';
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}