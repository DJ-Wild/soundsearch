<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ec74c586-3cb2-4995-8cd0-1566bf4fab5c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## Защищённый вход через Telegram в браузере

**Внимание:** прежний вход по произвольному Telegram ID, никнейму или телефону был небезопасен.
Этот проект теперь использует Telegram OIDC (Authorization Code + PKCE), проверку подписи
`id_token` по публичным ключам Telegram, привязку к Telegram ID и серверную SQLite-сессию
(HttpOnly, SameSite=Lax, Secure при HTTPS). Mini App проверяет подлинный `initData` HMAC.
Все `/api/*` кроме конфигурации, входа и проверки текущей сессии требуют авторизации.
Избранное и история привязаны к ID из серверной сессии, а не к параметрам браузера.

### Перед запуском

1. В `@BotFather` выберите **именно SoundSearch-бота** → **Login Widget / Web Login**.
   В Allowed URLs добавьте сайт и URL callback для вашего HTTPS-домена, например:
   - `https://music.example.com`
   - `https://music.example.com/api/auth/telegram/callback`
   Скопируйте Client ID и Client Secret. Если в BotFather есть выбор алгоритма,
   оставьте стандартный **RS256**.
2. В существующем `.env` в корне проекта добавьте `APP_URL`,
   `TELEGRAM_CLIENT_ID`, `TELEGRAM_CLIENT_SECRET`, `ALLOWED_TELEGRAM_IDS` из `.env.example`.
   Не заменяйте и не публикуйте ваш `BOT_TOKEN`. Пустой список ID запрещает всем вход.
3. Требуется **Node.js 22+** (`node:sqlite`) и HTTPS reverse proxy.
   Один Node-сервер обслуживает и `/api/`, и скомпилированный React.
   Python `main.py` теперь запускает только Telegram-бота (без HTTP-сервера),
   чтобы не было незащищённого статического сайта на том же порту.

### Установка и проверка

```bash
cd /root/danya/soundsearch
node -v                 # v22+
npm ci                  # установка пакетов, в том числе devDependences для tsx
npm run lint            # проверка TypeScript
npm run build           # пересобрать dist, обязательно!
NODE_ENV=production PORT=3000 npm run start
```

В отдельном терминале запустите Python-бота своим существующим способом
(например, через systemd). Важно, чтобы **старый** Python `main.py` был
перезапущен: иначе он может продолжить слушать 3000 порт.

Пример nginx для сайта `music.example.com` (используйте свой существующий HTTPS vhost):

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
}
```

Проверки после запуска:

```bash
curl -i http://127.0.0.1:3000/api/auth/session     # 200 + authenticated:false
curl -i http://127.0.0.1:3000/api/favorites        # 401 без cookie
curl -i http://127.0.0.1:3000/api/auth/telegram/start  # 302 к oauth.telegram.org/auth
ss -ltnp | grep ':3000'  # должен слушать Node, а не старый Python
```

Управление доступом: измените `ALLOWED_TELEGRAM_IDS` в `.env` и перезапустите
Node-процесс. Удалённый ID сразу теряет доступ к API. Неподтверждённые ID не
добавляются в БД. Сессия сохраняется между перезапусками, пока не истекут
30 дней или пользователь не нажмёт «Выйти».

Разработчики: https://core.telegram.org/bots/telegram-login
