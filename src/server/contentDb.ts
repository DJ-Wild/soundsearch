import { DatabaseSync } from 'node:sqlite';
import { getDb } from './db';

export interface ContentItem {
  locale: string;
  namespace: string;
  key: string;
  value: string;
  updated_at?: string;
}

export interface StructuredContent {
  [locale: string]: {
    [namespace: string]: {
      [key: string]: string;
    };
  };
}

/**
 * Initializes the site_content table and seeds default UI strings if empty.
 */
export function initContentTable(database?: DatabaseSync) {
  const db = database || getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS site_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      locale TEXT NOT NULL,
      namespace TEXT NOT NULL DEFAULT 'common',
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(locale, namespace, key)
    );
    CREATE INDEX IF NOT EXISTS idx_site_content_lookup ON site_content (locale, namespace);
  `);

  seedDefaultContentIfEmpty(db);
}

/**
 * Seeds initial base translations for Russian and English UI strings.
 */
export function seedDefaultContentIfEmpty(db: DatabaseSync) {
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM site_content').get() as { count: number };
    if (row && row.count > 0) {
      return;
    }

    const defaultItems: Omit<ContentItem, 'updated_at'>[] = [
      // Russian (ru)
      { locale: 'ru', namespace: 'common', key: 'app_title', value: 'Telegram Music Bot' },
      { locale: 'ru', namespace: 'common', key: 'search_placeholder', value: 'Поиск трека, артиста или вставьте ссылку...' },
      { locale: 'ru', namespace: 'common', key: 'tab_search', value: 'Поиск' },
      { locale: 'ru', namespace: 'common', key: 'tab_link', value: 'По ссылке' },
      { locale: 'ru', namespace: 'common', key: 'tab_favorites', value: 'Избранное' },
      { locale: 'ru', namespace: 'common', key: 'tab_history', value: 'История' },
      { locale: 'ru', namespace: 'common', key: 'btn_play', value: 'Слушать' },
      { locale: 'ru', namespace: 'common', key: 'btn_download', value: 'Скачать в Telegram' },
      { locale: 'ru', namespace: 'common', key: 'btn_save', value: 'Сохранить' },
      { locale: 'ru', namespace: 'common', key: 'empty_favorites', value: 'Список избранного пуст' },
      { locale: 'ru', namespace: 'common', key: 'empty_history', value: 'История прослушиваний пуста' },
      { locale: 'ru', namespace: 'common', key: 'auth_required', value: 'Для доступа требуется авторизация через Telegram' },

      // English (en)
      { locale: 'en', namespace: 'common', key: 'app_title', value: 'Telegram Music Bot' },
      { locale: 'en', namespace: 'common', key: 'search_placeholder', value: 'Search track, artist or paste link...' },
      { locale: 'en', namespace: 'common', key: 'tab_search', value: 'Search' },
      { locale: 'en', namespace: 'common', key: 'tab_link', value: 'By Link' },
      { locale: 'en', namespace: 'common', key: 'tab_favorites', value: 'Favorites' },
      { locale: 'en', namespace: 'common', key: 'tab_history', value: 'History' },
      { locale: 'en', namespace: 'common', key: 'btn_play', value: 'Play' },
      { locale: 'en', namespace: 'common', key: 'btn_download', value: 'Send to Telegram' },
      { locale: 'en', namespace: 'common', key: 'btn_save', value: 'Save' },
      { locale: 'en', namespace: 'common', key: 'empty_favorites', value: 'No favorites yet' },
      { locale: 'en', namespace: 'common', key: 'empty_history', value: 'Play history is empty' },
      { locale: 'en', namespace: 'common', key: 'auth_required', value: 'Authorization via Telegram is required' },
    ];

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO site_content (locale, namespace, key, value)
      VALUES (?, ?, ?, ?)
    `);

    db.exec('BEGIN TRANSACTION');
    for (const item of defaultItems) {
      insertStmt.run(item.locale, item.namespace, item.key, item.value);
    }
    db.exec('COMMIT');
  } catch (err) {
    console.warn('Could not seed default content:', err);
    try { db.exec('ROLLBACK'); } catch {}
  }
}

/**
 * Returns raw items from site_content according to optional filters.
 */
export function db_get_content(filters?: { locale?: string; namespace?: string; key?: string }): ContentItem[] {
  const db = getDb();
  let query = 'SELECT locale, namespace, key, value, updated_at FROM site_content WHERE 1=1';
  const params: string[] = [];

  if (filters?.locale) {
    query += ' AND locale = ?';
    params.push(filters.locale.toLowerCase().trim());
  }

  if (filters?.namespace) {
    query += ' AND namespace = ?';
    params.push(filters.namespace.trim());
  }

  if (filters?.key) {
    query += ' AND key = ?';
    params.push(filters.key.trim());
  }

  query += ' ORDER BY locale ASC, namespace ASC, key ASC';

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((r) => ({
    locale: String(r.locale),
    namespace: String(r.namespace),
    key: String(r.key),
    value: String(r.value),
    updated_at: r.updated_at ? String(r.updated_at) : undefined,
  }));
}

/**
 * Returns content structured as a nested dictionary: { [locale]: { [namespace]: { [key]: value } } }
 */
export function db_get_structured_content(filters?: { locale?: string; namespace?: string }): {
  tree: StructuredContent;
  locales: string[];
  namespaces: string[];
  total: number;
} {
  const items = db_get_content(filters);
  const tree: StructuredContent = {};
  const localesSet = new Set<string>();
  const namespacesSet = new Set<string>();

  for (const item of items) {
    localesSet.add(item.locale);
    namespacesSet.add(item.namespace);

    if (!tree[item.locale]) {
      tree[item.locale] = {};
    }
    if (!tree[item.locale][item.namespace]) {
      tree[item.locale][item.namespace] = {};
    }
    tree[item.locale][item.namespace][item.key] = item.value;
  }

  return {
    tree,
    locales: Array.from(localesSet).sort(),
    namespaces: Array.from(namespacesSet).sort(),
    total: items.length,
  };
}

/**
 * Upserts content items into site_content using a database transaction.
 */
export function db_upsert_content(items: ContentItem[]): { success: boolean; count: number; error?: string } {
  if (!items || items.length === 0) {
    return { success: true, count: 0 };
  }

  const db = getDb();
  const upsertStmt = db.prepare(`
    INSERT INTO site_content (locale, namespace, key, value, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(locale, namespace, key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `);

  try {
    db.exec('BEGIN TRANSACTION');
    for (const item of items) {
      upsertStmt.run(
        item.locale.toLowerCase().trim(),
        item.namespace.trim(),
        item.key.trim(),
        item.value
      );
    }
    db.exec('COMMIT');
    return { success: true, count: items.length };
  } catch (err: any) {
    try { db.exec('ROLLBACK'); } catch {}
    console.error('db_upsert_content error:', err);
    return { success: false, count: 0, error: err?.message || 'Database transaction error' };
  }
}

/**
 * Deletes content items matching the specified filters.
 */
export function db_delete_content(filters: { locale: string; namespace?: string; key?: string }): { success: boolean; count: number } {
  const db = getDb();
  let query = 'DELETE FROM site_content WHERE locale = ?';
  const params: string[] = [filters.locale.toLowerCase().trim()];

  if (filters.namespace) {
    query += ' AND namespace = ?';
    params.push(filters.namespace.trim());
  }

  if (filters.key) {
    query += ' AND key = ?';
    params.push(filters.key.trim());
  }

  try {
    const result = db.prepare(query).run(...params);
    return { success: true, count: Number(result.changes) };
  } catch (err) {
    console.error('db_delete_content error:', err);
    return { success: false, count: 0 };
  }
}

/**
 * Returns distinct available locales with count of keys.
 */
export function db_get_available_locales(): { locale: string; count: number }[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT locale, COUNT(*) as count
    FROM site_content
    GROUP BY locale
    ORDER BY locale ASC
  `).all() as any[];

  return rows.map((r) => ({
    locale: String(r.locale),
    count: Number(r.count),
  }));
}
