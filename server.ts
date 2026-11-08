import express, { Request, Response } from 'express';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  initDb,
  db_add_favorite,
  db_remove_favorite,
  db_get_favorites,
  db_remove_history,
  db_clear_history,
  db_get_history,
} from './src/server/db';
import { searchTracks, resolveTrackByUrl, sendTrackToTelegram, streamAudioPipe } from './src/server/musicService';
import { getSourceAudioQuality } from './src/server/audioQuality';
import { paginateResults } from './src/utils/musicLogic';
import { Platform, Track } from './src/types/music';
import { registerAuthRoutes, requireAuth, checkRequestOrigin, AuthenticatedRequest } from './src/server/auth';
import { initContentTable } from './src/server/contentDb';
import { contentRouter } from './src/server/contentRoutes';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Initialize SQLite database
initDb();
initContentTable();

app.use(compression());
app.use(express.json());

let cachedBotInfo: { username: string; firstName: string; timestamp: number } | null = null;
const BOT_INFO_CACHE_TTL = 10 * 60 * 1000;

app.get('/api/config', async (req: Request, res: Response) => {
  const botToken = process.env.BOT_TOKEN;
  const hasBotToken = Boolean(botToken && botToken !== 'MY_BOT_TOKEN');

  let botUsername = 'music_telegram_bot';
  let botFirstName = 'Music Bot';

  if (hasBotToken && botToken) {
    if (cachedBotInfo && Date.now() - cachedBotInfo.timestamp < BOT_INFO_CACHE_TTL) {
      botUsername = cachedBotInfo.username;
      botFirstName = cachedBotInfo.firstName;
    } else {
      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
          signal: AbortSignal.timeout(3000),
        });
        const tgData = (await tgRes.json()) as any;
        if (tgData.ok && tgData.result) {
          botUsername = tgData.result.username || botUsername;
          botFirstName = tgData.result.first_name || botFirstName;
          cachedBotInfo = {
            username: botUsername,
            firstName: botFirstName,
            timestamp: Date.now(),
          };
        }
      } catch (e) {
        console.warn('Telegram getMe timeout or error (using fallback):', e);
      }
    }
  }

  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({
    hasBotToken,
    botUsername,
    botFirstName,
    appUrl: process.env.APP_URL || '',
  });
});

app.use('/api/v1/content', contentRouter);

app.use('/api', checkRequestOrigin);
registerAuthRoutes(app);

// Authenticated routes
app.use('/api/favorites', requireAuth);
app.use('/api/history', requireAuth);
app.use('/api/download-track', requireAuth);
app.use('/api/test-telegram', requireAuth);

// API: Определение оригинального качества и битрейта источника
app.get('/api/audio-quality', async (req: Request, res: Response) => {
  try {
    const { platform, url } = req.query as { platform?: Platform; url?: string };
    if (!platform || !url) {
      res.status(400).json({ status: 'unknown', reason: 'Укажите platform и url' });
      return;
    }
    const quality = await getSourceAudioQuality(platform, url);
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.json(quality);
  } catch (err: any) {
    res.status(500).json({ status: 'unknown', reason: err?.message || 'Ошибка проверки качества' });
  }
});

// API: Search tracks
app.post('/api/search', async (req: Request, res: Response) => {
  try {
    const { query, platform = 'youtube', page = 0 } = req.body;
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Запрос для поиска не указан' });
      return;
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.startsWith('http://') || trimmedQuery.startsWith('https://')) {
      const resolved = await resolveTrackByUrl(trimmedQuery, platform as Platform);
      res.json({
        query: trimmedQuery,
        platform: resolved.platform,
        page: 0,
        totalPages: 1,
        totalResults: 1,
        results: [resolved],
      });
      return;
    }

    const allResults = await searchTracks(trimmedQuery, platform as Platform);
    const paginated = paginateResults(allResults, Number(page) || 0, 5);

    res.json({
      query: trimmedQuery,
      platform,
      page: paginated.page,
      totalPages: paginated.totalPages,
      totalResults: paginated.totalItems,
      results: paginated.items,
    });
  } catch (err: any) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message || 'Ошибка поиска' });
  }
});

// API: Resolve track metadata from link
app.post('/api/resolve-url', async (req: Request, res: Response) => {
  try {
    const { url, platform } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'URL не указан' });
      return;
    }

    const track = await resolveTrackByUrl(url, platform as Platform);
    res.json({ track });
  } catch (err: any) {
    console.error('Resolve error:', err);
    res.status(500).json({ error: err.message || 'Не удалось распознать трек' });
  }
});

// API: Download track & send to Telegram chat
app.post('/api/download-track', async (req: Request, res: Response) => {
  try {
    const { url, platform = 'youtube', title, artist, preview_url, thumbnail, duration } = req.body;
    const targetChatId = (req as AuthenticatedRequest).authUser!.id;

    let track: Track = {
      title: title || 'Аудиозапись',
      artist: artist || (platform as string).toUpperCase(),
      url: url || 'https://music.youtube.com',
      platform: platform as Platform,
      preview_url: preview_url || '',
      thumbnail: thumbnail || '',
      duration: duration ? Number(duration) : undefined,
    };

    if ((!title || !artist) && url) {
      const resolved = await resolveTrackByUrl(url, platform as Platform);
      track = {
        ...resolved,
        title: title || resolved.title,
        artist: artist || resolved.artist,
        thumbnail: thumbnail || resolved.thumbnail || '',
        duration: duration ? Number(duration) : resolved.duration,
      };
    }

    const sendResult = await sendTrackToTelegram(targetChatId, track);
    res.json(sendResult);
  } catch (err: any) {
    console.error('Download and send error:', err);
    res.status(500).json({ success: false, error: err.message || 'Ошибка при отправке трека' });
  }
});

// API: Favorites
app.get('/api/favorites', (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).authUser!.id;
  const favs = db_get_favorites(userId);
  res.json({ favorites: favs });
});

app.post('/api/favorites', (req: Request, res: Response) => {
  const { title, artist, url, platform = 'youtube', thumbnail, duration } = req.body;
  const user_id = (req as AuthenticatedRequest).authUser!.id;
  if (!title || !url) {
    res.status(400).json({ error: 'Название и URL обязательны' });
    return;
  }
  const ok = db_add_favorite(
    user_id,
    title,
    artist || 'Unknown',
    url,
    platform as Platform,
    thumbnail,
    duration ? Number(duration) : undefined
  );
  res.json({ success: ok });
});

app.delete('/api/favorites/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const ok = db_remove_favorite(id, (req as AuthenticatedRequest).authUser!.id);
  res.json({ success: ok });
});

// API: History
app.get('/api/history', (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).authUser!.id;
  const hist = db_get_history(userId, 50);
  res.json({ history: hist });
});

app.delete('/api/history/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const ok = db_remove_history(id, (req as AuthenticatedRequest).authUser!.id);
  res.json({ success: ok });
});

app.post('/api/history/clear', (req: Request, res: Response) => {
  const ok = db_clear_history((req as AuthenticatedRequest).authUser!.id);
  res.json({ success: ok });
});

// API: Test Telegram connection
app.post('/api/test-telegram', async (req: Request, res: Response) => {
  const chat_id = (req as AuthenticatedRequest).authUser!.id;
  const token = process.env.BOT_TOKEN;
  if (!token || token === 'MY_BOT_TOKEN') {
    res.status(503).json({ success: false, error: 'BOT_TOKEN не настроен' });
    return;
  }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id,
        text: '👋 *Привет из Telegram Mini App!*\nСвязь с ботом успешно проверена.',
        parse_mode: 'Markdown',
      }),
    });
    const data = (await tgRes.json()) as any;
    if (data.ok) {
      res.json({ success: true, message: 'Сообщение успешно отправлено в ваш Telegram!' });
    } else {
      res.json({ success: false, error: data.description });
    }
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: Stream audio
app.get('/api/stream-audio', async (req: Request, res: Response) => {
  try {
    const { url, title, artist, duration } = req.query as Record<string, string>;
    await streamAudioPipe(req, res, {
      url,
      title,
      artist,
      duration: duration ? Number(duration) : undefined,
    });
  } catch (err: any) {
    console.error('Audio stream error:', err);
    if (!res.headersSent) res.status(500).send('Audio stream unavailable');
  }
});

app.use('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ error: `API route ${req.originalUrl} не найден` });
});

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Telegram Music Bot Mini App server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});