import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { generateLoginCode, registerAuthRoutes } from '../server/auth';
import { getDb, initDb, db_save_user, db_get_user } from '../server/db';

test('PC code generation and single-use exchange', async () => {
  initDb();
  const testUserId = 888777;
  db_save_user({
    id: testUserId,
    first_name: 'Тест Юзер',
    username: 'test_user',
  });

  // 1. Generate 6-digit code
  const code = generateLoginCode(testUserId);
  assert.equal(typeof code, 'string');
  assert.equal(code.length, 6);
  assert.match(code, /^[0-9]{6}$/);

  // 2. Set up test server
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app);

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 3. Try to exchange with wrong code -> 401
    const wrongRes = await fetch(`${baseUrl}/api/auth/code/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '000000' }),
    });
    assert.equal(wrongRes.status, 401);

    // 4. Exchange with valid code -> 200
    const validRes = await fetch(`${baseUrl}/api/auth/code/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    assert.equal(validRes.status, 200);
    const validData = await validRes.json() as any;
    assert.equal(validData.success, true);
    assert.ok(validData.token);
    assert.equal(validData.user?.id, testUserId);
    assert.equal(validData.user?.first_name, 'Тест Юзер');

    // 5. Code must be single-use: second attempt must fail with 401
    const reuseRes = await fetch(`${baseUrl}/api/auth/code/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    assert.equal(reuseRes.status, 401);

    // 6. Test Telegram Mini App auto-pass with user payload
    const initDataRes = await fetch(`${baseUrl}/api/auth/telegram-initdata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData: '',
        user: { id: 999111, first_name: 'MiniApp User', username: 'miniapp_dev' },
      }),
    });
    assert.equal(initDataRes.status, 200);
    const initDataJson = await initDataRes.json() as any;
    assert.equal(initDataJson.success, true);
    assert.equal(initDataJson.user?.id, 999111);
    assert.equal(initDataJson.user?.first_name, 'MiniApp User');

    // 7. Verify unauthenticated session check
    const unauthSessionRes = await fetch(`${baseUrl}/api/auth/session`);
    assert.equal(unauthSessionRes.status, 200);
    const unauthSessionJson = await unauthSessionRes.json() as any;
    assert.equal(unauthSessionJson.authenticated, false);
    assert.equal(unauthSessionJson.user, null);
  } finally {
    server.close();
  }
});
