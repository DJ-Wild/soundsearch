import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initContentTable,
  db_get_content,
  db_get_structured_content,
  db_upsert_content,
  db_delete_content,
  db_get_available_locales,
} from '../server/contentDb';
import { validateContentPayload, validateContentItem } from '../server/contentValidation';
import { extractApiKey, safeCompareKeys } from '../server/apiAuth';

test('API key extraction and safe comparison', () => {
  // Test Bearer token extraction
  const reqWithBearer = {
    get: (header: string) => {
      if (header.toLowerCase() === 'authorization') return 'Bearer my-secret-api-key-123';
      return undefined;
    },
  } as any;
  assert.equal(extractApiKey(reqWithBearer), 'my-secret-api-key-123');

  // Test x-api-key extraction
  const reqWithXApiKey = {
    get: (header: string) => {
      if (header.toLowerCase() === 'x-api-key') return 'header-api-key-456';
      return undefined;
    },
  } as any;
  assert.equal(extractApiKey(reqWithXApiKey), 'header-api-key-456');

  // Test missing headers
  const reqEmpty = { get: () => undefined } as any;
  assert.equal(extractApiKey(reqEmpty), null);

  // Test timing-safe comparison
  assert.equal(safeCompareKeys('correct-secret', 'correct-secret'), true);
  assert.equal(safeCompareKeys('wrong-secret', 'correct-secret'), false);
  assert.equal(safeCompareKeys('', 'correct-secret'), false);
  assert.equal(safeCompareKeys('correct-secret', ''), false);
});

test('Content validation rules for items', () => {
  // Valid item
  const valid = validateContentItem(
    { locale: 'ru', namespace: 'common', key: 'welcome_btn', value: 'Войти' },
    0
  );
  assert.equal(valid.valid, true);
  if (valid.valid) {
    assert.equal(valid.item.locale, 'ru');
    assert.equal(valid.item.namespace, 'common');
    assert.equal(valid.item.key, 'welcome_btn');
    assert.equal(valid.item.value, 'Войти');
  }

  // Invalid locale format
  const invalidLocale = validateContentItem(
    { locale: 'invalid-locale-1234567890', namespace: 'common', key: 'key1', value: 'test' },
    0
  );
  assert.equal(invalidLocale.valid, false);

  // Invalid key name with spaces or dangerous characters
  const invalidKey = validateContentItem(
    { locale: 'en', namespace: 'common', key: 'key with spaces!', value: 'test' },
    0
  );
  assert.equal(invalidKey.valid, false);

  // Null byte in value
  const nullByteVal = validateContentItem(
    { locale: 'en', namespace: 'common', key: 'key1', value: 'bad\0value' },
    0
  );
  assert.equal(nullByteVal.valid, false);
});

test('Content validation for multiple payload formats', () => {
  // Format 1: Array of items
  const arrayPayload = [
    { locale: 'ru', namespace: 'common', key: 'header_title', value: 'Музыкальный бот' },
    { locale: 'en', namespace: 'common', key: 'header_title', value: 'Music Bot' },
  ];
  const res1 = validateContentPayload(arrayPayload);
  assert.equal(res1.valid, true);
  if (res1.valid) {
    assert.equal(res1.items.length, 2);
  }

  // Format 2: Wrapped in { items: [...] }
  const wrappedPayload = { items: arrayPayload };
  const res2 = validateContentPayload(wrappedPayload);
  assert.equal(res2.valid, true);

  // Format 3: Dictionary format { locale, content }
  const dictPayload = {
    locale: 'ru',
    namespace: 'player',
    content: {
      btn_next: 'Вперед',
      btn_prev: 'Назад',
    },
  };
  const res3 = validateContentPayload(dictPayload);
  assert.equal(res3.valid, true);
  if (res3.valid) {
    assert.equal(res3.items.length, 2);
    assert.equal(res3.items[0].locale, 'ru');
    assert.equal(res3.items[0].namespace, 'player');
  }

  // Format 4: Nested tree format { content: { ru: { common: { ... } } } }
  const treePayload = {
    content: {
      es: {
        common: {
          app_title: 'Bot de Música',
          btn_play: 'Reproducir',
        },
      },
    },
  };
  const res4 = validateContentPayload(treePayload);
  assert.equal(res4.valid, true);
  if (res4.valid) {
    assert.equal(res4.items.length, 2);
    assert.equal(res4.items[0].locale, 'es');
  }

  // Rejection of invalid payload
  const emptyRes = validateContentPayload({});
  assert.equal(emptyRes.valid, false);
});

test('Content database CRUD and seeding operations', () => {
  initContentTable();

  // Test seeding worked
  const locales = db_get_available_locales();
  assert.ok(locales.some((l) => l.locale === 'ru'));
  assert.ok(locales.some((l) => l.locale === 'en'));

  // Test structured get
  const structured = db_get_structured_content({ locale: 'ru' });
  assert.ok(structured.tree.ru);
  assert.ok(structured.tree.ru.common);
  assert.ok(structured.tree.ru.common.app_title);

  // Test batch upsert with new test locale 'test-fr'
  const upsertRes = db_upsert_content([
    { locale: 'test-fr', namespace: 'common', key: 'title', value: 'Bonjour' },
    { locale: 'test-fr', namespace: 'common', key: 'goodbye', value: 'Au revoir' },
  ]);
  assert.equal(upsertRes.success, true);
  assert.equal(upsertRes.count, 2);

  // Verify upsert
  const frContent = db_get_content({ locale: 'test-fr' });
  assert.equal(frContent.length, 2);
  const titleItem = frContent.find((i) => i.key === 'title');
  assert.equal(titleItem?.value, 'Bonjour');

  // Test update existing key
  db_upsert_content([
    { locale: 'test-fr', namespace: 'common', key: 'title', value: 'Salut' },
  ]);
  const updatedFr = db_get_content({ locale: 'test-fr', key: 'title' });
  assert.equal(updatedFr[0].value, 'Salut');

  // Test delete
  const delRes = db_delete_content({ locale: 'test-fr' });
  assert.equal(delRes.success, true);
  assert.equal(delRes.count, 2);

  const afterDelete = db_get_content({ locale: 'test-fr' });
  assert.equal(afterDelete.length, 0);
});

test('HTTP integration test for /api/v1/content with auth and validation', async () => {
  const express = (await import('express')).default;
  const { contentRouter } = await import('../server/contentRoutes');

  const testApiKey = 'test-secret-key-987654';
  process.env.ADMIN_API_KEY = testApiKey;

  const app = express();
  app.use(express.json());
  app.use('/api/v1/content', contentRouter);

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1/content`;

  try {
    // 1. Unauthorized request (no API key) -> 401
    const unauthRes = await fetch(baseUrl);
    assert.equal(unauthRes.status, 401);
    const unauthBody = await unauthRes.json() as any;
    assert.equal(unauthBody.success, false);
    assert.equal(unauthBody.error, 'Unauthorized');

    // 2. Unauthorized request (wrong API key) -> 401
    const wrongKeyRes = await fetch(baseUrl, {
      headers: { Authorization: 'Bearer wrong-key' },
    });
    assert.equal(wrongKeyRes.status, 401);

    // 3. Authorized request with Bearer token -> 200
    const authRes = await fetch(baseUrl, {
      headers: { Authorization: `Bearer ${testApiKey}` },
    });
    assert.equal(authRes.status, 200);
    const authBody = await authRes.json() as any;
    assert.equal(authBody.success, true);
    assert.ok(authBody.data);

    // 4. Authorized request with x-api-key header -> 200
    const xKeyRes = await fetch(`${baseUrl}?format=flat`, {
      headers: { 'x-api-key': testApiKey },
    });
    assert.equal(xKeyRes.status, 200);
    const xKeyBody = await xKeyRes.json() as any;
    assert.equal(xKeyBody.success, true);
    assert.equal(xKeyBody.format, 'flat');

    // 5. PUT with validation error -> 400
    const invalidPutRes = await fetch(baseUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testApiKey}`,
      },
      body: JSON.stringify({
        items: [
          { locale: 'invalid_locale_too_long_123', namespace: 'bad', key: 'key', value: 'val' },
        ],
      }),
    });
    assert.equal(invalidPutRes.status, 400);
    const invalidBody = await invalidPutRes.json() as any;
    assert.equal(invalidBody.success, false);
    assert.equal(invalidBody.error, 'Validation Error');
    assert.ok(invalidBody.details.length > 0);

    // 6. PUT with valid payload -> 200
    const validPutRes = await fetch(baseUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testApiKey}`,
      },
      body: JSON.stringify({
        locale: 'de',
        namespace: 'common',
        content: {
          app_title: 'Telegram Musik Bot',
          btn_play: 'Abspielen',
        },
      }),
    });
    assert.equal(validPutRes.status, 200);
    const validPutBody = await validPutRes.json() as any;
    assert.equal(validPutBody.success, true);
    assert.equal(validPutBody.updated_count, 2);

    // 7. Verify updated content via GET
    const verifyRes = await fetch(`${baseUrl}?locale=de`, {
      headers: { Authorization: `Bearer ${testApiKey}` },
    });
    assert.equal(verifyRes.status, 200);
    const verifyBody = await verifyRes.json() as any;
    assert.equal(verifyBody.data.de.common.app_title, 'Telegram Musik Bot');

    // 8. Locales endpoint
    const localesRes = await fetch(`${baseUrl}/locales`, {
      headers: { Authorization: `Bearer ${testApiKey}` },
    });
    assert.equal(localesRes.status, 200);
    const localesBody = await localesRes.json() as any;
    assert.ok(localesBody.locales.some((l: any) => l.locale === 'de'));

    // Clean up test locale
    await fetch(`${baseUrl}?locale=de`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${testApiKey}` },
    });
  } finally {
    server.close();
  }
});
