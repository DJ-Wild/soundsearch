import { ContentItem } from './contentDb';

export interface ValidationSuccess {
  valid: true;
  items: ContentItem[];
}

export interface ValidationFailure {
  valid: false;
  errors: string[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

// ISO 639-1 / BCP 47 compliant locale regex (e.g. 'ru', 'en', 'es-ES', 'zh-CN', 'uz')
const LOCALE_REGEX = /^[a-z]{2,5}(-[a-zA-Z0-9]{2,8})?$/;

// Alphanumeric namespace identifier with underscores and hyphens (e.g. 'common', 'player', 'header_nav')
const NAMESPACE_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

// Key names: alphanumeric, dots, underscores, dashes (e.g. 'buttons.submit', 'home_title', 'tab-1')
const KEY_REGEX = /^[a-zA-Z0-9_.-]{1,128}$/;

const MAX_VALUE_LENGTH = 20000;
const MAX_BATCH_ITEMS = 2000;

/**
 * Validates a single content key/value entry.
 */
export function validateContentItem(
  item: unknown,
  indexOrPath: string | number
): { valid: true; item: ContentItem } | { valid: false; error: string } {
  if (!item || typeof item !== 'object') {
    return { valid: false, error: `Item at [${indexOrPath}] must be a valid JSON object` };
  }

  const raw = item as Record<string, unknown>;

  // 1. Validate locale
  if (typeof raw.locale !== 'string' || !raw.locale.trim()) {
    return { valid: false, error: `Item at [${indexOrPath}]: missing or invalid 'locale'. Must be a non-empty string.` };
  }
  const locale = raw.locale.trim().toLowerCase();
  if (!LOCALE_REGEX.test(locale)) {
    return {
      valid: false,
      error: `Item at [${indexOrPath}]: invalid locale format '${locale}'. Must match standard 2-5 letter code (e.g., 'ru', 'en', 'es-ES').`,
    };
  }

  // 2. Validate namespace (defaults to 'common')
  let namespace = 'common';
  if (raw.namespace !== undefined) {
    if (typeof raw.namespace !== 'string' || !raw.namespace.trim()) {
      return { valid: false, error: `Item at [${indexOrPath}]: 'namespace' must be a non-empty string if provided.` };
    }
    namespace = raw.namespace.trim();
    if (!NAMESPACE_REGEX.test(namespace)) {
      return {
        valid: false,
        error: `Item at [${indexOrPath}]: invalid namespace '${namespace}'. Allowed characters: letters, numbers, underscores, dashes (1-64 chars).`,
      };
    }
  }

  // 3. Validate key
  if (typeof raw.key !== 'string' || !raw.key.trim()) {
    return { valid: false, error: `Item at [${indexOrPath}]: missing or invalid 'key'. Must be a non-empty string.` };
  }
  const key = raw.key.trim();
  if (!KEY_REGEX.test(key)) {
    return {
      valid: false,
      error: `Item at [${indexOrPath}]: invalid key name '${key}'. Allowed characters: letters, numbers, dots, underscores, dashes (1-128 chars).`,
    };
  }

  // 4. Validate value
  if (raw.value === undefined || raw.value === null) {
    return { valid: false, error: `Item at [${indexOrPath}]: 'value' cannot be null or undefined.` };
  }

  let valueStr = '';
  if (typeof raw.value === 'string') {
    valueStr = raw.value;
  } else if (typeof raw.value === 'number' || typeof raw.value === 'boolean') {
    valueStr = String(raw.value);
  } else {
    return { valid: false, error: `Item at [${indexOrPath}]: 'value' must be a string, number, or boolean.` };
  }

  if (valueStr.includes('\0')) {
    return { valid: false, error: `Item at [${indexOrPath}]: 'value' cannot contain null bytes.` };
  }

  if (valueStr.length > MAX_VALUE_LENGTH) {
    return {
      valid: false,
      error: `Item at [${indexOrPath}]: 'value' exceeds maximum allowed length of ${MAX_VALUE_LENGTH} characters.`,
    };
  }

  return {
    valid: true,
    item: {
      locale,
      namespace,
      key,
      value: valueStr,
    },
  };
}

/**
 * Normalizes and validates incoming translation payloads.
 * Accepts:
 * 1. Array of ContentItem: `[{ locale, namespace, key, value }]`
 * 2. Wrapped array: `{ items: [{ locale, namespace, key, value }] }`
 * 3. Flat locale dictionary: `{ locale: 'ru', namespace?: 'common', content: { key: 'value' } }`
 * 4. Nested tree: `{ content: { ru: { common: { key: 'value' } } } }`
 */
export function validateContentPayload(body: unknown): ValidationResult {
  if (!body || (typeof body !== 'object' && !Array.isArray(body))) {
    return {
      valid: false,
      errors: ['Request body must be a valid JSON object or array.'],
    };
  }

  const errors: string[] = [];
  const normalizedItems: ContentItem[] = [];

  // Case 1: Array of items directly: [...]
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return { valid: false, errors: ['Items array cannot be empty.'] };
    }
    if (body.length > MAX_BATCH_ITEMS) {
      return { valid: false, errors: [`Batch size exceeds limit of ${MAX_BATCH_ITEMS} items.`] };
    }

    body.forEach((item, idx) => {
      const res = validateContentItem(item, idx);
      if (res.valid) {
        normalizedItems.push(res.item);
      } else {
        errors.push(res.error);
      }
    });

    return errors.length > 0 ? { valid: false, errors } : { valid: true, items: normalizedItems };
  }

  const obj = body as Record<string, unknown>;

  // Case 2: Object with "items" array: { items: [...] }
  if (Array.isArray(obj.items)) {
    if (obj.items.length === 0) {
      return { valid: false, errors: ["'items' array cannot be empty."] };
    }
    if (obj.items.length > MAX_BATCH_ITEMS) {
      return { valid: false, errors: [`Batch size exceeds limit of ${MAX_BATCH_ITEMS} items.`] };
    }

    obj.items.forEach((item, idx) => {
      const res = validateContentItem(item, `items[${idx}]`);
      if (res.valid) {
        normalizedItems.push(res.item);
      } else {
        errors.push(res.error);
      }
    });

    return errors.length > 0 ? { valid: false, errors } : { valid: true, items: normalizedItems };
  }

  // Case 3: Flat dictionary with explicit locale:
  // { locale: 'ru', namespace?: 'common', content: { 'app_title': '...' } }
  if (typeof obj.locale === 'string' && obj.content && typeof obj.content === 'object' && !Array.isArray(obj.content)) {
    const locale = obj.locale.trim().toLowerCase();
    const namespace = typeof obj.namespace === 'string' && obj.namespace.trim() ? obj.namespace.trim() : 'common';
    const dict = obj.content as Record<string, unknown>;
    const keys = Object.keys(dict);

    if (keys.length === 0) {
      return { valid: false, errors: ["'content' object cannot be empty."] };
    }
    if (keys.length > MAX_BATCH_ITEMS) {
      return { valid: false, errors: [`Batch size exceeds limit of ${MAX_BATCH_ITEMS} items.`] };
    }

    for (const k of keys) {
      const res = validateContentItem(
        { locale, namespace, key: k, value: dict[k] },
        `content.${k}`
      );
      if (res.valid) {
        normalizedItems.push(res.item);
      } else {
        errors.push(res.error);
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true, items: normalizedItems };
  }

  // Case 4: Nested tree format:
  // { content: { ru: { common: { app_title: '...' } } } }
  // or { translations: { ru: { common: { app_title: '...' } } } }
  const treeSource = (obj.content || obj.translations) as Record<string, unknown> | undefined;
  if (treeSource && typeof treeSource === 'object' && !Array.isArray(treeSource)) {
    const locales = Object.keys(treeSource);
    if (locales.length === 0) {
      return { valid: false, errors: ['Translations structure cannot be empty.'] };
    }

    for (const loc of locales) {
      const namespaces = treeSource[loc];
      if (!namespaces || typeof namespaces !== 'object' || Array.isArray(namespaces)) {
        errors.push(`Invalid namespaces object for locale '${loc}'. Expected dictionary of namespaces.`);
        continue;
      }

      for (const ns of Object.keys(namespaces as Record<string, unknown>)) {
        const keyMap = (namespaces as Record<string, unknown>)[ns];
        if (!keyMap || typeof keyMap !== 'object' || Array.isArray(keyMap)) {
          errors.push(`Invalid keys dictionary for locale '${loc}', namespace '${ns}'.`);
          continue;
        }

        for (const k of Object.keys(keyMap as Record<string, unknown>)) {
          const val = (keyMap as Record<string, unknown>)[k];
          const res = validateContentItem(
            { locale: loc, namespace: ns, key: k, value: val },
            `${loc}.${ns}.${k}`
          );
          if (res.valid) {
            normalizedItems.push(res.item);
          } else {
            errors.push(res.error);
          }

          if (normalizedItems.length + errors.length > MAX_BATCH_ITEMS) {
            return { valid: false, errors: [`Batch size exceeds limit of ${MAX_BATCH_ITEMS} items.`] };
          }
        }
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true, items: normalizedItems };
  }

  return {
    valid: false,
    errors: [
      'Unrecognized payload format. Supported formats: ' +
      '1) Array of items `[{ locale, namespace, key, value }]`, ' +
      '2) `{ items: [...] }`, ' +
      '3) `{ locale: "ru", namespace: "common", content: { key: "value" } }`, ' +
      '4) `{ content: { ru: { common: { key: "value" } } } }`',
    ],
  };
}
