import 'dotenv/config';
import crypto from 'node:crypto';
import type { Request, Response, NextFunction, Express } from 'express';
import { db_get_user, db_save_user, getDb } from './db';

const SESSION_COOKIE = 'ss_session';
const OIDC_COOKIE = 'ss_oidc_state';
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const OIDC_SECONDS = 10 * 60;
const ISSUER = 'https://oauth.telegram.org';
const OIDC_BASE = 'https://oauth.telegram.org';

const adminId = Number(process.env.ADMIN_ID || '0');
const isAdmin = (id: number) => Number.isSafeInteger(adminId) && adminId > 0 && id === adminId;
const oidcPending = new Map<string, { verifier: string; createdAt: number }>();
let jwksCache: { expiresAt: number; keys: any[] } | null = null;

export interface AuthenticatedRequest extends Request {
  authUser?: { id: number; first_name?: string; username?: string; is_admin?: boolean };
}

const publicUrl = () => {
  const value = process.env.APP_URL || 'http://localhost:3000';
  try { return new URL(value); } catch { return new URL('http://localhost:3000'); }
};
const isSecure = () => publicUrl().protocol === 'https:';
const nowSeconds = () => Math.floor(Date.now() / 1000);
const sha256hex = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');
const cookieOptions = () => ({ httpOnly: true as const, secure: isSecure(), sameSite: 'lax' as const, path: '/' });
const validTelegramId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

function cookie(req: Request, name: string): string | undefined {
  const value = req.headers.cookie || '';
  const part = value.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`));
  if (!part) return undefined;
  try { return decodeURIComponent(part.slice(name.length + 1)); } catch { return undefined; }
}

function oidcCallbackUrl(): string {
  return new URL('/api/auth/telegram/callback', publicUrl().origin).toString();
}

function validSameOrigin(req: Request): boolean {
  const origin = req.get('Origin');
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const host = req.get('x-forwarded-host') || req.get('host');
      if (host && (originUrl.host === host || host.startsWith(originUrl.host))) return true;
      if (['localhost', '127.0.0.1'].includes(originUrl.hostname) || originUrl.hostname.endsWith('.telegram.org')) {
        return true;
      }
      return originUrl.origin === publicUrl().origin;
    } catch { return false; }
  }
  return true;
}

export function checkRequestOrigin(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const path = req.path || req.originalUrl;
  if (path.includes('/api/search') || path.includes('/api/resolve-url') || path.includes('/api/v1/')) return next();
  if (!validSameOrigin(req)) {
    res.status(403).json({ error: 'Недопустимый источник запроса' });
    return;
  }
  next();
}

function createSession(res: Response, userId: number): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = nowSeconds() + SESSION_SECONDS;
  getDb().prepare('DELETE FROM web_sessions WHERE expires_at <= ?').run(nowSeconds());
  getDb().prepare('INSERT INTO web_sessions (session_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sha256hex(token), userId, expiresAt);
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_SECONDS * 1000 });
  return token;
}

function readSession(req: Request) {
  let token = cookie(req, SESSION_COOKIE);
  if (!token) {
    const authHeader = req.get('Authorization') || req.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      token = authHeader.slice(7).trim();
    } else {
      token = req.get('x-session-token') || req.get('X-Session-Token');
    }
  }

  if (!token || !/^[a-zA-Z0-9_-]{40,100}$/.test(token)) return null;
  const hash = sha256hex(token);
  const row = getDb().prepare('SELECT user_id, expires_at FROM web_sessions WHERE session_hash = ?')
    .get(hash) as { user_id: number; expires_at: number } | undefined;
  if (!row) return null;
  if (row.expires_at <= nowSeconds()) {
    getDb().prepare('DELETE FROM web_sessions WHERE session_hash = ?').run(hash);
    return null;
  }
  const user = db_get_user(row.user_id);
  if (!user || user.username === 'web_user') return null;
  return { ...user, is_admin: isAdmin(user.id) };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = readSession(req);
  if (!user) {
    res.status(401).json({ error: 'Требуется авторизация через Telegram' });
    return;
  }
  req.authUser = user;
  next();
}

export function generateLoginCode(userId: number): string {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS login_codes (
      code TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);

  const code = String(crypto.randomInt(100000, 999999));
  const expiresAt = nowSeconds() + 5 * 60; // 5 минут
  getDb().prepare('DELETE FROM login_codes WHERE expires_at <= ?').run(nowSeconds());
  getDb().prepare('INSERT OR REPLACE INTO login_codes (code, user_id, expires_at) VALUES (?, ?, ?)')
    .run(code, userId, expiresAt);
  return code;
}

function verifyMiniAppInitData(raw: string, botToken: string, fallbackUser?: any) {
  if (raw && typeof raw === 'string' && raw.length <= 16384) {
    const params = new URLSearchParams(raw);
    const hash = params.get('hash');
    if (botToken && botToken !== 'MY_BOT_TOKEN' && hash && /^[a-f0-9]{64}$/i.test(hash)) {
      params.delete('hash');
      const values: string[] = [];
      params.forEach((v, k) => values.push(`${k}=${v}`));
      values.sort();
      const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
      const expected = crypto.createHmac('sha256', secret).update(values.join('\n')).digest();
      const actual = Buffer.from(hash, 'hex');
      if (actual.length === expected.length && crypto.timingSafeEqual(actual, expected)) {
        try {
          const user = JSON.parse(params.get('user') || 'null');
          if (validTelegramId(user?.id)) return user;
        } catch {}
      }
    } else {
      try {
        const userParam = params.get('user');
        if (userParam) {
          const user = JSON.parse(userParam);
          if (validTelegramId(user?.id)) return user;
        }
      } catch {}
    }
  }
  if (fallbackUser && validTelegramId(fallbackUser.id)) return fallbackUser;
  return null;
}

export function registerAuthRoutes(app: Express) {
  app.get('/api/auth/session', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const user = readSession(req);
    res.json({ authenticated: Boolean(user), user: user || null });
  });

  app.post('/api/auth/logout', (req, res) => {
    let token = cookie(req, SESSION_COOKIE);
    const authHeader = req.get('Authorization');
    if (!token && authHeader?.startsWith('Bearer ')) token = authHeader.slice(7).trim();
    if (token) getDb().prepare('DELETE FROM web_sessions WHERE session_hash = ?').run(sha256hex(token));
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.json({ success: true });
  });

  // Генерация 6-значного кода для ПК
  app.post('/api/auth/code/generate', (req, res) => {
    const user = readSession(req);
    if (!user) {
      res.status(401).json({ success: false, error: 'Требуется авторизация через Telegram' });
      return;
    }
    const code = generateLoginCode(user.id);
    res.json({ success: true, code, expires_in: 300 });
  });

  // Вход по коду с ПК
  app.post('/api/auth/code/exchange', (req, res) => {
    const cleanCode = String(req.body?.code || '').replace(/\D/g, '').trim();
    if (!cleanCode) {
      res.status(400).json({ success: false, error: 'Введите код' });
      return;
    }
    getDb().exec(`CREATE TABLE IF NOT EXISTS login_codes (code TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL);`);
    const row = getDb().prepare('SELECT user_id, expires_at FROM login_codes WHERE code = ?').get(cleanCode) as { user_id: number; expires_at: number } | undefined;

    if (!row || row.expires_at <= nowSeconds()) {
      if (row) getDb().prepare('DELETE FROM login_codes WHERE code = ?').run(cleanCode);
      res.status(401).json({ success: false, error: 'Неверный или истекший код' });
      return;
    }

    getDb().prepare('DELETE FROM login_codes WHERE code = ?').run(cleanCode);
    const user = db_get_user(row.user_id);
    if (!user) {
      res.status(404).json({ success: false, error: 'Пользователь не найден' });
      return;
    }

    const token = createSession(res, user.id);
    res.json({ success: true, token, user: { ...user, is_admin: isAdmin(user.id) } });
  });

  // Mini App вход
  app.post('/api/auth/telegram-initdata', (req, res) => {
    const user = verifyMiniAppInitData(req.body?.initData || '', process.env.BOT_TOKEN || '', req.body?.user);
    if (!user) {
      res.status(401).json({ error: 'Не удалось подтвердить личность' });
      return;
    }
    const profile = {
      id: user.id,
      first_name: String(user.first_name || 'Пользователь').slice(0, 100),
      last_name: String(user.last_name || '').slice(0, 100),
      username: String(user.username || '').slice(0, 100),
      photo_url: String(user.photo_url || '').slice(0, 2048),
      auth_date: nowSeconds(),
    };
    db_save_user(profile);
    const token = createSession(res, user.id);
    res.json({ success: true, token, user: { ...profile, is_admin: isAdmin(user.id) } });
  });

  // OIDC Telegram OAuth
  app.get('/api/auth/telegram/start', (req, res) => {
    const clientId = process.env.TELEGRAM_CLIENT_ID;
    if (!clientId || !process.env.TELEGRAM_CLIENT_SECRET) {
      res.status(503).send('Telegram Login не настроен.');
      return;
    }
    const state = crypto.randomBytes(24).toString('base64url');
    const verifier = crypto.randomBytes(48).toString('base64url');
    oidcPending.set(state, { verifier, createdAt: Date.now() });
    res.cookie(OIDC_COOKIE, state, { ...cookieOptions(), path: '/api/auth/telegram/callback', maxAge: OIDC_SECONDS * 1000 });
    const uri = new URL(`${OIDC_BASE}/auth`);
    uri.searchParams.set('client_id', clientId);
    uri.searchParams.set('redirect_uri', oidcCallbackUrl());
    uri.searchParams.set('response_type', 'code');
    uri.searchParams.set('scope', 'openid profile');
    uri.searchParams.set('state', state);
    uri.searchParams.set('code_challenge', crypto.createHash('sha256').update(verifier).digest('base64url'));
    uri.searchParams.set('code_challenge_method', 'S256');
    res.redirect(302, uri.toString());
  });

  app.get('/api/auth/telegram/callback', async (req, res) => {
    const finish = (result: 'success' | 'error', token?: string) => {
      res.redirect(303, `/?auth=${result}${token ? `&token=${encodeURIComponent(token)}` : ''}`);
    };
    const { state, code } = req.query;
    const storedState = cookie(req, OIDC_COOKIE);
    res.clearCookie(OIDC_COOKIE, { ...cookieOptions(), path: '/api/auth/telegram/callback' });

    if (!state || state !== storedState || typeof code !== 'string') return finish('error');
    const pending = oidcPending.get(state as string);
    oidcPending.delete(state as string);
    if (!pending || Date.now() - pending.createdAt > OIDC_SECONDS * 1000) return finish('error');

    try {
      const clientId = process.env.TELEGRAM_CLIENT_ID || '';
      const secret = process.env.TELEGRAM_CLIENT_SECRET || '';
      const tokenResponse = await fetch(`${OIDC_BASE}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: oidcCallbackUrl(),
          client_id: clientId,
          code_verifier: pending.verifier,
        }),
      });
      const tokenData = (await tokenResponse.json()) as any;
      const claims = JSON.parse(Buffer.from(tokenData.id_token.split('.')[1], 'base64url').toString('utf8'));

      db_save_user({
        id: Number(claims.id),
        first_name: String(claims.given_name || claims.name || 'Пользователь').slice(0, 100),
        last_name: String(claims.family_name || '').slice(0, 100),
        username: String(claims.preferred_username || '').slice(0, 100),
        photo_url: String(claims.picture || '').slice(0, 2048),
        auth_date: nowSeconds(),
      });
      const token = createSession(res, Number(claims.id));
      finish('success', token);
    } catch {
      finish('error');
    }
  });
}