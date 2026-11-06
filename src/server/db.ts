import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { FavoriteItem, HistoryItem, Platform } from '../types/music';

const DB_PATH = path.resolve(process.cwd(), 'music_bot.db');

let db: DatabaseSync;

export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    initDb();
  }
  return db;
}

export function getThumbnailForTrackUrl(url: string, platform?: Platform): string {
  if (!url) return '';
  // YouTube video thumbnail
  const ytMatch = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch && ytMatch[1]) {
    return `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg`;
  }
  return '';
}

export function initDb() {
  const database = db || new DatabaseSync(DB_PATH);
  if (!db) db = database;

  // Both Node.js API and Python bot use this SQLite database concurrently.
  database.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');

  // Exact same schema as the Python script + optional columns for artwork and duration
  database.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT,
      artist TEXT,
      url TEXT,
      platform TEXT,
      thumbnail TEXT,
      duration INTEGER,
      UNIQUE(user_id, url)
    );

    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT,
      artist TEXT,
      url TEXT,
      platform TEXT,
      thumbnail TEXT,
      duration INTEGER,
      downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS web_sessions (
      session_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_web_sessions_user ON web_sessions (user_id);

    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      photo_url TEXT,
      auth_date INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Safe migration: Add thumbnail and duration columns if existing db lacks them
  try {
    database.exec('ALTER TABLE history ADD COLUMN thumbnail TEXT');
  } catch {}
  try {
    database.exec('ALTER TABLE history ADD COLUMN duration INTEGER');
  } catch {}
  try {
    database.exec('ALTER TABLE favorites ADD COLUMN thumbnail TEXT');
  } catch {}
  try {
    database.exec('ALTER TABLE favorites ADD COLUMN duration INTEGER');
  } catch {}
}

export function db_add_favorite(
  userId: number | string,
  title: string,
  artist: string,
  url: string,
  platform: Platform,
  thumbnail?: string,
  duration?: number
): boolean {
  try {
    const database = getDb();
    const uid = typeof userId === 'string' ? parseInt(userId, 10) || 0 : userId;
    const finalThumb = thumbnail || getThumbnailForTrackUrl(url, platform);
    const stmt = database.prepare(`
      INSERT OR REPLACE INTO favorites (user_id, title, artist, url, platform, thumbnail, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(uid, title, artist || 'Unknown', url, platform, finalThumb || null, duration || null);
    return true;
  } catch (err) {
    console.error('db_add_favorite error:', err);
    return false;
  }
}

export function db_remove_favorite(favId: number, userId: number): boolean {
  try {
    const database = getDb();
    const stmt = database.prepare('DELETE FROM favorites WHERE id = ? AND user_id = ?');
    const result = stmt.run(favId, userId);
    return result.changes > 0;
  } catch (err) {
    console.error('db_remove_favorite error:', err);
    return false;
  }
}

export function db_get_favorites(userId: number | string): FavoriteItem[] {
  try {
    const database = getDb();
    const uid = typeof userId === 'string' ? parseInt(userId, 10) || 0 : userId;
    const stmt = database.prepare(`
      SELECT id, user_id, title, artist, url, platform, thumbnail, duration
      FROM favorites
      WHERE user_id = ?
      ORDER BY id DESC
    `);
    const rows = stmt.all(uid) as any[];
    return rows.map((r) => {
      let thumb = r.thumbnail ? String(r.thumbnail) : '';
      if (!thumb && r.url) {
        thumb = getThumbnailForTrackUrl(String(r.url), r.platform as Platform);
      }
      return {
        id: Number(r.id),
        user_id: Number(r.user_id),
        title: String(r.title),
        artist: String(r.artist),
        url: String(r.url),
        platform: r.platform as Platform,
        thumbnail: thumb,
        duration: r.duration ? Number(r.duration) : undefined,
      };
    });
  } catch (err) {
    console.error('db_get_favorites error:', err);
    return [];
  }
}

export function db_add_history(
  userId: number | string,
  title: string,
  artist: string,
  url: string,
  platform: Platform,
  thumbnail?: string,
  duration?: number
): boolean {
  try {
    const database = getDb();
    const uid = typeof userId === 'string' ? parseInt(userId, 10) || 0 : userId;
    const finalThumb = thumbnail || getThumbnailForTrackUrl(url, platform);
    const stmt = database.prepare(`
      INSERT INTO history (user_id, title, artist, url, platform, thumbnail, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(uid, title, artist || 'Unknown', url, platform, finalThumb || null, duration || null);
    return true;
  } catch (err) {
    console.error('db_add_history error:', err);
    return false;
  }
}

export function db_remove_history(histId: number, userId: number): boolean {
  try {
    const database = getDb();
    const stmt = database.prepare('DELETE FROM history WHERE id = ? AND user_id = ?');
    const result = stmt.run(histId, userId);
    return result.changes > 0;
  } catch (err) {
    console.error('db_remove_history error:', err);
    return false;
  }
}

export function db_clear_history(userId: number | string): boolean {
  try {
    const database = getDb();
    const uid = typeof userId === 'string' ? parseInt(userId, 10) || 0 : userId;
    const stmt = database.prepare('DELETE FROM history WHERE user_id = ?');
    stmt.run(uid);
    return true;
  } catch (err) {
    console.error('db_clear_history error:', err);
    return false;
  }
}

export function db_get_history(userId: number | string, limit = 50): HistoryItem[] {
  try {
    const database = getDb();
    const uid = typeof userId === 'string' ? parseInt(userId, 10) || 0 : userId;
    const stmt = database.prepare(`
      SELECT id, user_id, title, artist, url, platform, thumbnail, duration, downloaded_at
      FROM history
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
    `);
    const rows = stmt.all(uid, limit) as any[];
    return rows.map((r) => {
      let thumb = r.thumbnail ? String(r.thumbnail) : '';
      if (!thumb && r.url) {
        thumb = getThumbnailForTrackUrl(String(r.url), r.platform as Platform);
      }
      return {
        id: Number(r.id),
        user_id: Number(r.user_id),
        title: String(r.title),
        artist: String(r.artist),
        url: String(r.url),
        platform: r.platform as Platform,
        thumbnail: thumb,
        duration: r.duration ? Number(r.duration) : undefined,
        downloaded_at: String(r.downloaded_at),
      };
    });
  } catch (err) {
    console.error('db_get_history error:', err);
    return [];
  }
}

export function db_save_user(user: {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  auth_date?: number;
}): boolean {
  try {
    const database = getDb();
    const stmt = database.prepare(`
      INSERT OR REPLACE INTO users (user_id, username, first_name, last_name, photo_url, auth_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      user.id,
      user.username || '',
      user.first_name || '',
      user.last_name || '',
      user.photo_url || '',
      user.auth_date || Math.floor(Date.now() / 1000)
    );
    return true;
  } catch (err) {
    console.error('db_save_user error:', err);
    return false;
  }
}

export function db_get_user(userId: number | string): any | null {
  try {
    const database = getDb();
    const uid = typeof userId === 'string' ? parseInt(userId, 10) || 0 : userId;
    const stmt = database.prepare(`
      SELECT user_id, username, first_name, last_name, photo_url, auth_date, created_at
      FROM users
      WHERE user_id = ?
    `);
    const row = stmt.get(uid) as any;
    if (!row) return null;
    return {
      id: Number(row.user_id),
      username: row.username ? String(row.username) : undefined,
      first_name: row.first_name ? String(row.first_name) : 'Пользователь',
      last_name: row.last_name ? String(row.last_name) : undefined,
      photo_url: row.photo_url ? String(row.photo_url) : undefined,
      auth_date: row.auth_date ? Number(row.auth_date) : undefined,
    };
  } catch (err) {
    console.error('db_get_user error:', err);
    return null;
  }
}

