import { Router, Request, Response } from 'express';
import { requireApiKey } from './apiAuth';
import {
  db_get_content,
  db_get_structured_content,
  db_upsert_content,
  db_delete_content,
  db_get_available_locales,
} from './contentDb';
import { validateContentPayload } from './contentValidation';

export const contentRouter = Router();

// Protect all /api/v1/content routes with API key authentication
contentRouter.use(requireApiKey);

/**
 * GET /api/v1/content/locales
 * Returns list of distinct locales and their total key counts.
 */
contentRouter.get('/locales', (_req: Request, res: Response) => {
  try {
    const locales = db_get_available_locales();
    res.json({
      success: true,
      total_locales: locales.length,
      locales,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'Database Error',
      message: err?.message || 'Failed to retrieve locales',
    });
  }
});

/**
 * GET /api/v1/content
 * Query parameters:
 *  - locale?: string (e.g., 'ru', 'en')
 *  - namespace?: string (e.g., 'common')
 *  - key?: string (e.g., 'app_title')
 *  - format?: 'tree' | 'flat' (default: 'tree')
 */
contentRouter.get('/', (req: Request, res: Response) => {
  try {
    const locale = typeof req.query.locale === 'string' ? req.query.locale.trim() : undefined;
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace.trim() : undefined;
    const key = typeof req.query.key === 'string' ? req.query.key.trim() : undefined;
    const format = req.query.format === 'flat' ? 'flat' : 'tree';

    if (format === 'flat') {
      const items = db_get_content({ locale, namespace, key });
      res.json({
        success: true,
        format: 'flat',
        filter: { locale: locale || null, namespace: namespace || null, key: key || null },
        total: items.length,
        items,
      });
      return;
    }

    const { tree, locales, namespaces, total } = db_get_structured_content({ locale, namespace });
    res.json({
      success: true,
      format: 'tree',
      filter: { locale: locale || null, namespace: namespace || null },
      locales,
      namespaces,
      total,
      data: tree,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'Database Error',
      message: err?.message || 'Failed to retrieve content',
    });
  }
});

/**
 * PUT /api/v1/content & POST /api/v1/content
 * Upserts translations and content keys into the database.
 * Accepts:
 *  1) Array of items: [{ locale: "ru", namespace: "common", key: "...", value: "..." }]
 *  2) Wrapped items: { items: [...] }
 *  3) Single locale dictionary: { locale: "ru", namespace: "common", content: { key: "value" } }
 *  4) Nested structure: { content: { ru: { common: { key: "value" } } } }
 */
const handleContentSave = (req: Request, res: Response) => {
  try {
    // 1. Strict validation of payload
    const validation = validateContentPayload(req.body);

    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Invalid content payload. See details below.',
        details: validation.errors,
      });
      return;
    }

    // 2. Transactional batch upsert
    const upsertResult = db_upsert_content(validation.items);

    if (!upsertResult.success) {
      res.status(500).json({
        success: false,
        error: 'Database Error',
        message: upsertResult.error || 'Failed to save content items into database',
      });
      return;
    }

    // Collect affected locales
    const affectedLocales = Array.from(new Set(validation.items.map((i) => i.locale))).sort();
    const affectedNamespaces = Array.from(new Set(validation.items.map((i) => i.namespace))).sort();

    res.json({
      success: true,
      message: 'Content successfully saved to database',
      updated_count: upsertResult.count,
      locales: affectedLocales,
      namespaces: affectedNamespaces,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: err?.message || 'Unexpected error while processing content update',
    });
  }
};

contentRouter.put('/', handleContentSave);
contentRouter.post('/', handleContentSave);

/**
 * DELETE /api/v1/content
 * Deletes content by locale, and optionally by namespace and key.
 * Query or body: { locale: string, namespace?: string, key?: string }
 */
contentRouter.delete('/', (req: Request, res: Response) => {
  try {
    const locale = (typeof req.query.locale === 'string' ? req.query.locale : req.body?.locale)?.trim();
    const namespace = (typeof req.query.namespace === 'string' ? req.query.namespace : req.body?.namespace)?.trim();
    const key = (typeof req.query.key === 'string' ? req.query.key : req.body?.key)?.trim();

    if (!locale) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: "Parameter 'locale' is required for deletion.",
      });
      return;
    }

    const result = db_delete_content({ locale, namespace, key });

    res.json({
      success: true,
      message: `Deleted ${result.count} content item(s)`,
      deleted_count: result.count,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'Database Error',
      message: err?.message || 'Failed to delete content',
    });
  }
});
