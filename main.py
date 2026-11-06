# -*- coding: utf-8 -*-

import html
import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
from urllib.parse import urlparse
from urllib.request import urlretrieve
from dotenv import load_dotenv
import telebot
from telebot import types
import yt_dlp

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
YANDEX_TOKEN = os.getenv("YANDEX_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL", "")  # URL вашего Mini App (если есть)

# Администратор Telegram-бота (только из .env). Если не настроен,
# никому не выдаём административные права.
try:
    ADMIN_ID = int(os.getenv("ADMIN_ID", "0"))
    if ADMIN_ID <= 0:
        ADMIN_ID = 0
except ValueError:
    raise ValueError("ADMIN_ID в .env должен быть числовым Telegram ID")

if not BOT_TOKEN:
    raise ValueError("BOT_TOKEN не задан в .env файле!")

bot = telebot.TeleBot(BOT_TOKEN, parse_mode="HTML")

DB_PATH = "music_bot.db"

# ==================== ПРЕМИУМ ЭМОДЗИ (TELEGRAM PREMIUM EMOJIS) =================== =

CUSTOM_EMOJI_IDS = []

PREMIUM_EMOJIS = {
    "music": "",        # 🎵 Музыка
    "download": "",     # 📥 Скачать
    "search": "",       # 🔍 Поиск
    "heart": "",        # ❤️ Любимое
    "broken_heart": "", # 💔 Удалить из любимых
    "history": "",      # 📜 История
    "trash": "",        # 🗑️ Корзина / очистить
    "arrow_left": "",   # ⬅️ Назад
    "arrow_right": "",  # ➡️ Вперед
    "back": "",         # 🔙 Главное меню
    "sparkles": "",     # ✨ Искры / примеры
    "user": "",         # 👤 Автор
    "clock": "",        # ⏱️ Время / загрузка
    "check": "",        # ✅ Успех
    "cross": "",        # ❌ Ошибка
    "youtube": "",      # 🔴 YouTube
    "soundcloud": "",   # 🟠 SoundCloud
    "yandex": "",       # 🟡 Яндекс Музыка
    "spotify": "",      # 🟢 Spotify
    "apple": "",        # 🟣 Apple Music
    "webapp": "",       # 🌐 Mini App
}

EMOJI_TITLES = {
    "music": "🎵 Музыка (треки, плеер)",
    "download": "📥 Скачать по ссылке",
    "search": "🔍 Поиск треков",
    "heart": "❤️ В любимые",
    "broken_heart": "💔 Убрать из любимых",
    "history": "📜 История скачиваний",
    "trash": "🗑️ Очистить / удалить",
    "arrow_left": "⬅️ Стрелка назад",
    "arrow_right": "➡️ Стрелка вперед",
    "back": "🔙 Кнопка назад / меню",
    "sparkles": "✨ Искры / примеры",
    "user": "👤 Исполнитель",
    "clock": "⏱️ Загрузка / ожидание",
    "check": "✅ Успех",
    "cross": "❌ Ошибка",
    "youtube": "🔴 YouTube",
    "soundcloud": "🟠 SoundCloud",
    "yandex": "🟡 Яндекс Музыка",
    "spotify": "🟢 Spotify",
    "apple": "🟣 Apple Music",
    "webapp": "🌐 Mini App",
}


def pe(key: str, fallback: str = "") -> str:
    """Возвращает <tg-emoji emoji-id="...">fallback</tg-emoji>, если задан ID."""
    emoji_id = PREMIUM_EMOJIS.get(key, "").strip()
    if emoji_id:
        return f'<tg-emoji emoji-id="{emoji_id}">{fallback}</tg-emoji>'
    return fallback

def button_emoji(key: str, fallback: str = "") -> str:
    """InlineKeyboardButton не поддерживает HTML/custom emoji: возвращаем обычный emoji."""
    return fallback


# Состояния пользователей
user_states = {}          # {chat_id: "STATE_NAME"}
user_urls = {}            # {chat_id: "url"}
user_searches = {}        # {chat_id: {"query": str, "platform": str, "page": int, "results": [...]}}
user_selected_track = {}   # {chat_id: track_dict}
last_menu_msg = {}        # {chat_id: message_id}
admin_setting_slot = {}   # {admin_chat_id: "slot_key"}


# ==================== РАБОТА С БАЗОЙ ДАННЫХ =================== =

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        # Таблица любимых треков
        cursor.execute("""
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
            )
        """)
        # Таблица истории скачиваний
        cursor.execute("""
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
            )
        """)
        # Таблица настроек эмодзи
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS emoji_settings (
                key TEXT PRIMARY KEY,
                emoji_id TEXT
            )
        """)
        conn.commit()

        # Миграция колонок
        for table in ["favorites", "history"]:
            for col, col_type in [("thumbnail", "TEXT"), ("duration", "INTEGER")]:
                try:
                    cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")
                    conn.commit()
                except sqlite3.OperationalError:
                    pass

        # Загрузка сохраненных эмодзи в оперативную память
        cursor.execute("SELECT key, emoji_id FROM emoji_settings")
        rows = cursor.fetchall()
        for k, eid in rows:
            if k in PREMIUM_EMOJIS:
                PREMIUM_EMOJIS[k] = str(eid).strip()
        
        refresh_custom_emoji_ids_array()

def refresh_custom_emoji_ids_array():
    global CUSTOM_EMOJI_IDS
    CUSTOM_EMOJI_IDS = [v for v in PREMIUM_EMOJIS.values() if v]

init_db()


def db_save_emoji(key: str, emoji_id: str):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO emoji_settings (key, emoji_id) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET emoji_id = excluded.emoji_id
        """, (key, emoji_id))
        conn.commit()


def db_add_favorite(user_id, title, artist, url, platform, thumbnail=None, duration=None):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO favorites (user_id, title, artist, url, platform, thumbnail, duration)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (user_id, title, artist, url, platform, thumbnail, duration))
        conn.commit()


def db_remove_favorite(fav_id):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM favorites WHERE id = ?", (fav_id,))
        conn.commit()


def db_get_favorites(user_id):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, title, artist, url, platform, thumbnail, duration 
            FROM favorites WHERE user_id = ? ORDER BY id DESC
        """, (user_id,))
        return cursor.fetchall()


def db_add_history(user_id, title, artist, url, platform, thumbnail=None, duration=None):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO history (user_id, title, artist, url, platform, thumbnail, duration)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (user_id, title, artist, url, platform, thumbnail, duration))
        conn.commit()


def db_remove_history(hist_id):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM history WHERE id = ?", (hist_id,))
        conn.commit()


def db_clear_history(user_id):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM history WHERE user_id = ?", (user_id,))
        conn.commit()


def db_get_history(user_id, limit=30):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, title, artist, url, platform, thumbnail, duration, downloaded_at 
            FROM history WHERE user_id = ? 
            ORDER BY id DESC LIMIT ?
        """, (user_id, limit))
        return cursor.fetchall()


# ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =================== =

def detect_platform_from_url(url: str) -> str | None:
    if not url:
        return None
    clean = url.strip().lower()
    if any(k in clean for k in ["music.yandex", "yandex.ru", "yandex.com", "yandex.by", "yandex.kz"]):
        return "yandex"
    if "spotify.com" in clean or "spotify." in clean:
        return "spotify"
    if "apple.com" in clean or "music.apple" in clean:
        return "apple"
    if "soundcloud.com" in clean:
        return "soundcloud"
    if any(k in clean for k in ["youtube.com", "youtu.be", "music.youtube"]):
        return "youtube"
    return None


def format_duration(seconds: int | float | None) -> str:
    if seconds is None or seconds <= 0:
        return ""
    mins = int(seconds) // 60
    secs = int(seconds) % 60
    return f"{mins}:{secs:02d}"


def get_platform_label(platform: str) -> str:
    names = {
        "youtube": f"{pe('youtube', '🔴')} YouTube",
        "soundcloud": f"{pe('soundcloud', '🟠')} SoundCloud",
        "yandex": f"{pe('yandex', '🟡')} Яндекс Музыка",
        "spotify": f"{pe('spotify', '🟢')} Spotify",
        "apple": f"{pe('apple', '🟣')} Apple Music",
    }
    return names.get(platform, platform.capitalize())


def send_clean_menu(chat_id, text, reply_markup=None):
    old_id = last_menu_msg.get(chat_id)
    if old_id:
        try:
            bot.delete_message(chat_id, old_id)
        except Exception:
            pass
    msg = bot.send_message(chat_id, text, reply_markup=reply_markup, parse_mode="HTML")
    last_menu_msg[chat_id] = msg.message_id
    return msg


def get_main_menu_keyboard():
    kb = types.InlineKeyboardMarkup(row_width=2)
    kb.add(
        types.InlineKeyboardButton(f"{button_emoji('download', '📥')} Скачать по ссылке", callback_data="nav:download"),
        types.InlineKeyboardButton(f"{button_emoji('search', '🔍')} Найти трек", callback_data="nav:search"),
        types.InlineKeyboardButton(f"{button_emoji('heart', '❤️')} Любимые", callback_data="nav:favorites"),
        types.InlineKeyboardButton(f"{button_emoji('history', '📜')} История", callback_data="nav:history"),
    )
    if WEBAPP_URL:
        kb.add(types.InlineKeyboardButton(f"{button_emoji('webapp', '🌐')} Открыть Mini App (SoundSearch)", web_app=types.WebAppInfo(url=WEBAPP_URL)))
    return kb


def show_main_menu(chat_id, message_id=None):
    user_states.pop(chat_id, None)
    text = (
        f"🎧 <b>Добро пожаловать в SoundSearch Music Bot!</b>\n\n"
        f"Выберите действие ниже или просто отправьте мне <b>ссылку на трек</b> или <b>название песни</b>."
    )
    kb = get_main_menu_keyboard()
    if message_id:
        try:
            bot.edit_message_text(text, chat_id, message_id, reply_markup=kb, parse_mode="HTML")
            last_menu_msg[chat_id] = message_id
            return
        except Exception:
            pass
    send_clean_menu(chat_id, text, kb)


# ==================== УПРАВЛЕНИЕ ПРЕМИУМ ЭМОДЗИ (/setemoji) =================== =

def get_setemoji_keyboard():
    kb = types.InlineKeyboardMarkup(row_width=1)
    for key, title in EMOJI_TITLES.items():
        curr_id = PREMIUM_EMOJIS.get(key, "")
        status = f"✅ {curr_id[:6]}…" if curr_id else "❌ не задан"
        kb.add(types.InlineKeyboardButton(f"{title} | {status}", callback_data=f"admin_em:{key}"))
    kb.add(types.InlineKeyboardButton("❌ Закрыть панель", callback_data="admin_em:close"))
    return kb


@bot.message_handler(commands=["setemoji"])
def cmd_setemoji(message: types.Message):
    if message.from_user.id != ADMIN_ID:
        return

    text = (
        f"⚙️ <b>Панель управления Premium Emoji</b>\n\n"
        f"Выберите элемент, для которого хотите назначить или изменить эмодзи:\n"
        f"<i>Всего активных эмодзи в массиве: {len(CUSTOM_EMOJI_IDS)}</i>"
    )
    bot.send_message(message.chat.id, text, reply_markup=get_setemoji_keyboard(), parse_mode="HTML")


# ==================== ПОИСК ТРЕКОВ =================== =

def search_tracks(query: str, platform: str):
    results = []

    if " - " in query:
        parts = query.split(" - ", 1)
        clean_query = f"{parts[0].strip()} {parts[1].strip()}"
    else:
        clean_query = query.strip()

    if platform == "youtube":
        ydl_opts = {
            "quiet": True,
            "extract_flat": True,
            "skip_download": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            res = ydl.extract_info(f"ytsearch50:{clean_query}", download=False)
            for entry in res.get("entries", []):
                if entry:
                    v_id = entry.get("id")
                    dur = entry.get("duration")
                    thumb = entry.get("thumbnail") or (f"https://i.ytimg.com/vi/{v_id}/hqdefault.jpg" if v_id else None)
                    results.append({
                        "title": entry.get("title", "Без названия"),
                        "artist": entry.get("uploader", "YouTube"),
                        "url": entry.get("url") or f"https://www.youtube.com/watch?v={v_id}",
                        "platform": "youtube",
                        "duration": dur,
                        "thumbnail": thumb,
                    })

    elif platform == "soundcloud":
        ydl_opts = {
            "quiet": True,
            "extract_flat": True,
            "skip_download": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            res = ydl.extract_info(f"scsearch50:{clean_query}", download=False)
            for entry in res.get("entries", []):
                if entry:
                    results.append({
                        "title": entry.get("title", "Без названия"),
                        "artist": entry.get("uploader", "SoundCloud"),
                        "url": entry.get("url"),
                        "platform": "soundcloud",
                        "duration": entry.get("duration"),
                        "thumbnail": entry.get("thumbnail"),
                    })

    elif platform == "yandex":
        try:
            from yandex_music import Client
            client = Client(YANDEX_TOKEN).init() if YANDEX_TOKEN else Client().init()
            search_res = client.search(clean_query, type_="track")
            if search_res and search_res.tracks and search_res.tracks.results:
                for track in search_res.tracks.results:
                    artists = ", ".join([a.name for a in track.artists]) if track.artists else "Неизвестен"
                    album_id = track.albums[0].id if track.albums else "0"
                    track_url = f"https://music.yandex.ru/album/{album_id}/track/{track.id}"
                    dur_sec = (track.duration_ms // 1000) if track.duration_ms else None
                    thumb = f"https://{track.cover_uri.replace('%%', '400x400')}" if track.cover_uri else None
                    results.append({
                        "title": track.title,
                        "artist": artists,
                        "url": track_url,
                        "platform": "yandex",
                        "duration": dur_sec,
                        "thumbnail": thumb,
                    })
        except Exception as e:
            print("Yandex Music search error:", e)

    return results


def render_search_page(chat_id, message_id=None):
    search_data = user_searches.get(chat_id)
    if not search_data or not search_data.get("results"):
        kb = types.InlineKeyboardMarkup()
        kb.add(types.InlineKeyboardButton(f"{button_emoji('back', '🔙')} Главное меню", callback_data="nav:menu"))
        bot.edit_message_text(f"{pe('cross', '❌')} Ничего не найдено", chat_id, message_id, reply_markup=kb, parse_mode="HTML")
        return

    page = search_data["page"]
    results = search_data["results"]
    per_page = 5
    total_pages = min(10, (len(results) + per_page - 1) // per_page)
    start_idx = page * per_page
    end_idx = start_idx + per_page
    current_items = results[start_idx:end_idx]

    kb = types.InlineKeyboardMarkup()

    for i, item in enumerate(current_items):
        btn_idx = start_idx + i
        title = item["title"][:22]
        artist = item["artist"][:14]
        dur_str = f" [{format_duration(item.get('duration'))}]" if item.get("duration") else ""
        btn_text = f"🎵 {title} - {artist}{dur_str}"
        kb.add(types.InlineKeyboardButton(btn_text, callback_data=f"sel_search:{btn_idx}"))

    nav_row = []
    if page > 0:
        nav_row.append(types.InlineKeyboardButton(f"{button_emoji('arrow_left', '⬅️')} Назад", callback_data="page:prev"))
    nav_row.append(types.InlineKeyboardButton(f"Стр. {page + 1}/{total_pages}", callback_data="noop"))
    if page < total_pages - 1:
        nav_row.append(types.InlineKeyboardButton(f"Вперед {button_emoji('arrow_right', '➡️')}", callback_data="page:next"))
    kb.row(*nav_row)

    kb.add(types.InlineKeyboardButton(f"{button_emoji('back', '🔙')} Главное меню", callback_data="nav:menu"))

    plat_label = get_platform_label(search_data["platform"])
    query_esc = html.escape(search_data["query"])
    text = (
        f"{pe('search', '🔍')} Результаты по запросу: <b>«{query_esc}»</b>\n"
        f"Площадка: {plat_label}\n"
        f"Всего найдено: <b>{len(results)}</b> треков"
    )

    if message_id:
        bot.edit_message_text(text, chat_id, message_id, reply_markup=kb, parse_mode="HTML")
    else:
        send_clean_menu(chat_id, text, kb)


# ==================== ДВИЖОК СКАЧИВАНИЯ =================== =

def download_audio_file(url: str, platform: str, output_dir: str) -> tuple[str, str | None]:
    thumb_path = None

    if platform in ["youtube", "soundcloud"]:
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": os.path.join(output_dir, "%(title)s.%(ext)s"),
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
            "writethumbnail": True,
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            base_name, _ = os.path.splitext(filename)
            audio_path = f"{base_name}.mp3"

            for ext in [".jpg", ".png", ".webp", ".jpeg"]:
                t_cand = f"{base_name}{ext}"
                if os.path.exists(t_cand):
                    thumb_path = t_cand
                    break

            return audio_path, thumb_path

    elif platform in ["spotify", "apple"]:
        cmd = ["spotdl", "download", url, "--output", output_dir, "--format", "mp3"]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"spotdl error: {res.stderr}")
        files = [os.path.join(output_dir, f) for f in os.listdir(output_dir) if f.endswith(".mp3")]
        if not files:
            raise FileNotFoundError("Файл трека не найден.")
        return files[0], None

    elif platform == "yandex":
        from yandex_music import Client
        client = Client(YANDEX_TOKEN).init() if YANDEX_TOKEN else Client().init()
        match = re.search(r"track/(\d+)", url)
        if not match:
            raise ValueError("ID трека не найден в ссылке.")
        track = client.tracks([match.group(1)])[0]
        artist_name = track.artists[0].name if track.artists else "Artist"
        path = os.path.join(output_dir, f"{artist_name} - {track.title}.mp3")
        track.download(path)

        if track.cover_uri:
            try:
                thumb_path = os.path.join(output_dir, "cover.jpg")
                track.download_cover(thumb_path, size="400x400")
            except Exception:
                thumb_path = None

        return path, thumb_path

    raise ValueError("Неподдерживаемая площадка")


def execute_download(chat_id, url, platform, title=None, artist=None, thumbnail=None, duration=None):
    status_msg = bot.send_message(
        chat_id,
        f"{pe('clock', '⏱️')} <b>Скачивание и конвертация трека...</b>",
        parse_mode="HTML"
    )
    temp_dir = tempfile.mkdtemp()

    try:
        file_path, downloaded_thumb = download_audio_file(url, platform, temp_dir)

        if os.path.getsize(file_path) > 50 * 1024 * 1024:
            bot.edit_message_text(
                f"{pe('cross', '❌')} Файл превышает лимит отправки Telegram (50 МБ).",
                chat_id,
                status_msg.message_id,
                parse_mode="HTML"
            )
            return

        bot.edit_message_text(
            f"{pe('download', '📥')} <b>Отправка трека в Telegram...</b>",
            chat_id,
            status_msg.message_id,
            parse_mode="HTML"
        )

        if not title:
            base_file = os.path.splitext(os.path.basename(file_path))[0]
            title = base_file

        final_thumb_file = None
        if downloaded_thumb and os.path.exists(downloaded_thumb):
            final_thumb_file = open(downloaded_thumb, "rb")
        elif thumbnail and thumbnail.startswith("http"):
            try:
                remote_thumb_path = os.path.join(temp_dir, "remote_thumb.jpg")
                urlretrieve(thumbnail, remote_thumb_path)
                if os.path.exists(remote_thumb_path):
                    final_thumb_file = open(remote_thumb_path, "rb")
            except Exception:
                pass

        try:
            with open(file_path, "rb") as audio:
                caption = (
                    f"{pe('music', '🎵')} <b>{html.escape(title)}</b>\n"
                    f"{pe('user', '👤')} {html.escape(artist or 'Неизвестен')}\n"
                    f"🎧 Площадка: <b>{get_platform_label(platform)}</b>"
                )
                bot.send_audio(
                    chat_id,
                    audio,
                    title=title,
                    performer=artist,
                    duration=int(duration) if duration else None,
                    thumb=final_thumb_file,
                    caption=caption,
                    parse_mode="HTML"
                )
        finally:
            if final_thumb_file:
                final_thumb_file.close()

        db_add_history(chat_id, title, artist or platform.capitalize(), url, platform, thumbnail, duration)
        bot.delete_message(chat_id, status_msg.message_id)

    except Exception as e:
        bot.edit_message_text(
            f"{pe('cross', '❌')} <b>Ошибка загрузки:</b> {html.escape(str(e)[:150])}",
            chat_id,
            status_msg.message_id,
            parse_mode="HTML"
        )
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
        show_main_menu(chat_id)


# ==================== ОБРАБОТЧИКИ КОМАНД И ТЕКСТА =================== =

@bot.message_handler(commands=["start", "menu"])
def cmd_start(message: types.Message):
    show_main_menu(message.chat.id)


@bot.message_handler(commands=["download"])
def cmd_download(message: types.Message):
    user_states[message.chat.id] = "WAITING_URL"
    kb = types.InlineKeyboardMarkup()
    kb.add(types.InlineKeyboardButton(f"{button_emoji('back', '🔙')} Назад", callback_data="nav:menu"))
    send_clean_menu(
        message.chat.id,
        f"{pe('download', '📥')} <b>Пришлите ссылку на трек:</b>\n"
        f"Поддерживаются: Яндекс Музыка, YouTube, SoundCloud, Spotify, Apple Music.\n\n"
        f"<i>Площадка определится автоматически!</i>",
        kb,
    )


@bot.message_handler(commands=["search"])
def cmd_search(message: types.Message):
    user_states[message.chat.id] = "WAITING_SEARCH"
    kb = types.InlineKeyboardMarkup()
    kb.add(types.InlineKeyboardButton(f"{button_emoji('back', '🔙')} Назад", callback_data="nav:menu"))
    send_clean_menu(
        message.chat.id,
        f"{pe('search', '🔍')} <b>Пришлите название трека:</b>\n\n"
        f"{pe('sparkles', '✨')} <i>Примеры для поиска:</i>\n"
        f"• <code>Queen - Bohemian Rhapsody</code>\n"
        f"• <code>Кино - Группа крови</code>\n"
        f"• <code>The Weeknd - Blinding Lights</code>\n"
        f"• <code>Miyagi - Captain</code>",
        kb,
    )


@bot.message_handler(commands=["love", "favorites"])
def cmd_love(message: types.Message):
    show_favorites_list(message.chat.id)


@bot.message_handler(commands=["history"])
def cmd_history(message: types.Message):
    show_history_list(message.chat.id)


@bot.message_handler(commands=["clear_history"])
def cmd_clear_history(message: types.Message):
    db_clear_history(message.chat.id)
    bot.send_message(message.chat.id, f"{pe('trash', '🗑️')} Ваша история скачиваний полностью очищена.")


@bot.message_handler(func=lambda msg: True)
def handle_text_input(message: types.Message):
    chat_id = message.chat.id
    text = message.text.strip() if message.text else ""

    # Проверка: если администратор сейчас задает Premium Emoji
    if message.from_user.id == ADMIN_ID and chat_id in admin_setting_slot:
        slot = admin_setting_slot.pop(chat_id)
        
        # Автоматическое извлечение custom_emoji_id, если отправлен премиум эмодзи
        extracted_id = ""
        if message.entities:
            for ent in message.entities:
                if ent.type == "custom_emoji" and getattr(ent, "custom_emoji_id", None):
                    extracted_id = str(ent.custom_emoji_id).strip()
                    break
        
        if not extracted_id:
            # Если отправлен числовой ID или команда сброса
            if text in ["0", "del", "remove", "сброс"]:
                extracted_id = ""
            elif text.isdigit():
                extracted_id = text
            else:
                bot.send_message(
                    chat_id,
                    f"⚠️ Не удалось распознать ID эмодзи. Отправьте числовой ID (например <code>5368324170671202286</code>) или просто отправьте сам премиум-эмодзи."
                )
                admin_setting_slot[chat_id] = slot
                return

        # Обновляем в словаре, массиве и базе данных
        PREMIUM_EMOJIS[slot] = extracted_id
        db_save_emoji(slot, extracted_id)
        refresh_custom_emoji_ids_array()

        preview = f'<tg-emoji emoji-id="{extracted_id}">⭐</tg-emoji>' if extracted_id else "❌ (стандартный)"
        bot.send_message(
            chat_id,
            f"✅ Слот <b>{EMOJI_TITLES.get(slot, slot)}</b> обновлён!\n"
            f"Новый ID: <code>{extracted_id or 'Сброшен'}</code>\n"
            f"Отображение: {preview}\n\n"
            f"Нажмите /setemoji для продолжения настройки.",
            parse_mode="HTML"
        )
        return

    try:
        bot.delete_message(chat_id, message.message_id)
    except Exception:
        pass

    # Если отправлена ссылка — автоопределение сервиса
    if re.match(r"^https?://", text, re.IGNORECASE):
        user_urls[chat_id] = text
        detected = detect_platform_from_url(text)
        if detected:
            execute_download(chat_id, text, detected)
        else:
            ask_platform_for_download(chat_id)
        return

    state = user_states.get(chat_id)
    if state == "WAITING_URL":
        bot.send_message(chat_id, f"{pe('cross', '❌')} Это не ссылка. Отправьте ссылку, начинающуюся с https://")
        return

    # В остальных случаях производим поиск трека
    user_searches[chat_id] = {"query": text}
    ask_platform_for_search(chat_id, text)


# ==================== ЭКРАНЫ ДЕЙСТВИЙ (МЕНЮ) =================== =

def ask_platform_for_download(chat_id):
    kb = types.InlineKeyboardMarkup(row_width=2)
    kb.add(
        types.InlineKeyboardButton(f"{button_emoji('yandex', '🟡')} Яндекс Музыка", callback_data="dl_svc:yandex"),
        types.InlineKeyboardButton(f"{button_emoji('spotify', '🟢')} Spotify", callback_data="dl_svc:spotify"),
        types.InlineKeyboardButton(f"{button_emoji('apple', '🟣')} Apple Music", callback_data="dl_svc:apple"),
        types.InlineKeyboardButton(f"{button_emoji('soundcloud', '🟠')} SoundCloud", callback_data="dl_svc:soundcloud"),
        types.InlineKeyboardButton(f"{button_emoji('youtube', '🔴')} YouTube", callback_data="dl_svc:youtube"),
    )
    kb.add(types.InlineKeyboardButton(f"{button_emoji('back', '🔙')} Главное меню", callback_data="nav:menu"))
    send_clean_menu(chat_id, f"{pe('download', '📥')} <b>Выберите площадку для скачивания трека:</b>", kb)


def ask_platform_for_search(chat_id, query):
    kb = types.InlineKeyboardMarkup(row_width=1)
    kb.add(
        types.InlineKeyboardButton(f"{button_emoji('youtube', '🔴')} YouTube", callback_data="sr_svc:youtube"),
        types.InlineKeyboardButton(f"{button_emoji('soundcloud', '🟠')} SoundCloud", callback_data="sr_svc:soundcloud"),
        types.InlineKeyboardButton(f"{button_emoji('yandex', '🟡')} Яндекс Музыка", callback_data="sr_svc:yandex"),
        types.InlineKeyboardButton(f"{button_emoji('back', '🔙')} Главное меню", callback_data="nav:menu"),
    )
    query_esc = html.escape(query)
    send_clean_menu(chat_id, f"{pe('search', '🔍')} Ищем: <b>«{query_esc}»</b>\nВыберите площадку для поиска:", kb)


def show_favorites_list(chat_id, message_id=None):
    favs = db_get_favorites(chat_id)
    kb = types.InlineKeyboardMarkup()
    if not favs:
        kb.add(types.InlineKeyboardButton(f"{button_emoji('back', '🔙')} Главное меню", callback_data="nav:menu"))
        text = f"{pe('heart', '❤️')} <b>Ваш список любимых треков пуст.</b>\nДобавляйте треки в избранное во время поиска!"
    else:
        text = f"{pe('heart', '❤️')} <b>Ваши любимые треки ({len(favs)}):</b>"
        for fav_id, title, artist, _, _, _, _ in favs:
            t = title[:20]
            a = (artist or "Unknown")[:14]
            kb.add(types.InlineKeyboardButton(f"⭐ {t} - {a}", callback_data=f"sel_fav:{fav_id}"))
        kb.add(types.InlineKeyboardButton(f"{button_emoji('back', '🔙')} Главное меню", callback_data="nav:menu"))

    if message_id:
        bot.edit_message_text(text, chat_id, message_id, reply_markup=kb, parse_mode="HTML")
    else:
        send_clean_menu(chat_id, text, kb)


def show_history_list(chat_id, message_id=None):
    hist = db_get_history(chat_id)
    kb = types.InlineKeyboardMarkup()
    if not hist:
        kb.add(types.InlineKeyboardButton(f"{button_emoji('back', '🔙')} Главное меню", callback_data="nav:menu"))
        text = f"{pe('history', '📜')} <b>История скачиваний пуста.</b>\nЗдесь будут появляться все скачанные треки."
    else:
        text = f"{pe('history', '📜')} <b>История загрузок ({len(hist)}):</b>"
        for hist_id, title, artist, _, _, _, _, _ in hist:
            t = title[:20]
            a = (artist or "Unknown")[:14]
            kb.add(types.InlineKeyboardButton(f"🎧 {t} - {a}", callback_data=f"sel_hist:{hist_id}"))

        kb.add(types.InlineKeyboardButton(f"{button_emoji('trash', '🗑️')} Очистить всю историю", callback_data="act:clear_all_history"))
        kb.add(types.InlineKeyboardButton(f"{button_emoji('back', '🔙')} Главное меню", callback_data="nav:menu"))

    if message_id:
        bot.edit_message_text(text, chat_id, message_id, reply_markup=kb, parse_mode="HTML")
    else:
        send_clean_menu(chat_id, text, kb)


# ==================== CALLBACKS (ОБРАБОТКА НАЖАТИЙ КНОПОК) =================== =

@bot.callback_query_handler(func=lambda call: True)
def handle_callbacks(call: types.CallbackQuery):
    chat_id = call.message.chat.id
    data = call.data

    bot.answer_callback_query(call.id)

    # --- Управление эмодзи администратором ---
    if data.startswith("admin_em:"):
        if call.from_user.id != ADMIN_ID:
            return
        slot = data.split(":")[1]
        if slot == "close":
            bot.delete_message(chat_id, call.message.message_id)
            return
        admin_setting_slot[chat_id] = slot
        curr_id = PREMIUM_EMOJIS.get(slot, "")
        bot.send_message(
            chat_id,
            f"⚙️ Настройка эмодзи для: <b>{EMOJI_TITLES.get(slot, slot)}</b>\n"
            f"Текущий ID: <code>{curr_id or 'не задан'}</code>\n\n"
            f"✨ <b>Отправьте сюда премиум-эмодзи</b> прямо из клавиатуры Telegram\n"
            f"или пришлите его <b>числовой ID</b> (отправьте <code>0</code>, чтобы сбросить):",
            parse_mode="HTML"
        )
        return

    # --- Главная навигация ---
    if data == "nav:menu":
        show_main_menu(chat_id, call.message.message_id)
    elif data == "nav:download":
        cmd_download(call.message)
    elif data == "nav:search":
        cmd_search(call.message)
    elif data == "nav:favorites":
        show_favorites_list(chat_id, call.message.message_id)
    elif data == "nav:history":
        show_history_list(chat_id, call.message.message_id)

    # --- Выбор сервиса для скачивания по ссылке ---
    elif data.startswith("dl_svc:"):
        platform = data.split(":")[1]
        url = user_urls.pop(chat_id, None)
        if not url:
            bot.edit_message_text(f"{pe('cross', '❌')} Ссылка не найдена, отправьте заново.", chat_id, call.message.message_id, parse_mode="HTML")
            return
        bot.delete_message(chat_id, call.message.message_id)
        execute_download(chat_id, url, platform)

    # --- Выбор сервиса для поиска ---
    elif data.startswith("sr_svc:"):
        platform = data.split(":")[1]
        search_info = user_searches.get(chat_id)
        if not search_info:
            show_main_menu(chat_id, call.message.message_id)
            return
        bot.edit_message_text(f"{pe('search', '🔍')} <b>Поиск треков на {get_platform_label(platform)}...</b>", chat_id, call.message.message_id, parse_mode="HTML")
        results = search_tracks(search_info["query"], platform)
        user_searches[chat_id] = {
            "query": search_info["query"],
            "platform": platform,
            "page": 0,
            "results": results,
        }
        render_search_page(chat_id, call.message.message_id)

    # --- Листание страниц поиска ---
    elif data in ["page:prev", "page:next"]:
        search_data = user_searches.get(chat_id)
        if search_data:
            if data == "page:prev":
                search_data["page"] = max(0, search_data["page"] - 1)
            else:
                search_data["page"] += 1
            render_search_page(chat_id, call.message.message_id)

    # --- Выбор трека из результатов поиска ---
    elif data.startswith("sel_search:"):
        try:
            idx = int(data.split(":")[1])
            track = user_searches[chat_id]["results"][idx]
            user_selected_track[chat_id] = track
        except (KeyError, IndexError, ValueError):
            bot.answer_callback_query(call.id, "Результаты устарели. Выполните поиск заново.")
            show_main_menu(chat_id, call.message.message_id)
            return

        dur_text = f"\n⏱️ <b>Длительность:</b> {format_duration(track.get('duration'))}" if track.get("duration") else ""
        text = (
            f"{pe('music', '🎵')} <b>Название:</b> {html.escape(track['title'])}\n"
            f"{pe('user', '👤')} <b>Автор:</b> {html.escape(track['artist'])}\n"
            f"🎧 <b>Площадка:</b> {get_platform_label(track['platform'])}{dur_text}\n"
            f"🌐 <a href='{track['url']}'>Открыть оригинал трека</a>"
        )
        kb = types.InlineKeyboardMarkup(row_width=2)
        kb.add(
            types.InlineKeyboardButton(f"{button_emoji('download', '📥')} Скачать трек", callback_data="act:download_selected"),
            types.InlineKeyboardButton(f"{button_emoji('heart', '❤️')} В любимые", callback_data="act:add_fav"),
        )
        kb.add(types.InlineKeyboardButton(f"{button_emoji('arrow_left', '⬅️')} К результатам", callback_data="act:back_search"))
        bot.edit_message_text(text, chat_id, call.message.message_id, reply_markup=kb, parse_mode="HTML", disable_web_page_preview=False)

    elif data == "act:back_search":
        render_search_page(chat_id, call.message.message_id)

    elif data == "act:download_selected":
        track = user_selected_track.get(chat_id)
        if track:
            bot.delete_message(chat_id, call.message.message_id)
            execute_download(
                chat_id,
                track["url"],
                track["platform"],
                track["title"],
                track["artist"],
                track.get("thumbnail"),
                track.get("duration")
            )

    elif data == "act:add_fav":
        track = user_selected_track.get(chat_id)
        if track:
            db_add_favorite(
                chat_id,
                track["title"],
                track["artist"],
                track["url"],
                track["platform"],
                track.get("thumbnail"),
                track.get("duration")
            )
            bot.answer_callback_query(call.id, "Добавлено в Любимые! ❤️")

    # --- Просмотр трека из Любимых ---
    elif data.startswith("sel_fav:"):
        fav_id = int(data.split(":")[1])
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, title, artist, url, platform, thumbnail, duration FROM favorites WHERE id = ?", (fav_id,))
            row = cursor.fetchone()

        if not row:
            show_favorites_list(chat_id, call.message.message_id)
            return

        fid, title, artist, url, platform, thumb, dur = row
        user_selected_track[chat_id] = {
            "title": title, "artist": artist, "url": url,
            "platform": platform, "thumbnail": thumb, "duration": dur
        }

        dur_text = f"\n⏱️ <b>Длительность:</b> {format_duration(dur)}" if dur else ""
        text = (
            f"{pe('heart', '❤️')} <b>Любимый трек:</b>\n\n"
            f"{pe('music', '🎵')} <b>Название:</b> {html.escape(title)}\n"
            f"{pe('user', '👤')} <b>Автор:</b> {html.escape(artist)}\n"
            f"🎧 <b>Площадка:</b> {get_platform_label(platform)}{dur_text}\n"
            f"🌐 <a href='{url}'>Ссылка на оригинал</a>"
        )
        kb = types.InlineKeyboardMarkup(row_width=1)
        kb.add(
            types.InlineKeyboardButton(f"{button_emoji('download', '📥')} Скачать аудиозапись", callback_data="act:download_selected"),
            types.InlineKeyboardButton(f"{button_emoji('broken_heart', '💔')} Убрать из любимых", callback_data=f"del_fav:{fid}"),
            types.InlineKeyboardButton(f"{button_emoji('arrow_left', '⬅️')} Назад к списку", callback_data="nav:favorites"),
        )
        bot.edit_message_text(text, chat_id, call.message.message_id, reply_markup=kb, parse_mode="HTML")

    elif data.startswith("del_fav:"):
        fid = int(data.split(":")[1])
        db_remove_favorite(fid)
        bot.answer_callback_query(call.id, "Удалено из любимых!")
        show_favorites_list(chat_id, call.message.message_id)

    # --- Просмотр трека из Истории ---
    elif data.startswith("sel_hist:"):
        hid = int(data.split(":")[1])
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, title, artist, url, platform, thumbnail, duration FROM history WHERE id = ?", (hid,))
            row = cursor.fetchone()

        if not row:
            show_history_list(chat_id, call.message.message_id)
            return

        hid, title, artist, url, platform, thumb, dur = row
        user_selected_track[chat_id] = {
            "title": title, "artist": artist, "url": url,
            "platform": platform, "thumbnail": thumb, "duration": dur
        }

        dur_text = f"\n⏱️ <b>Длительность:</b> {format_duration(dur)}" if dur else ""
        text = (
            f"{pe('history', '📜')} <b>Трек из истории скачиваний:</b>\n\n"
            f"{pe('music', '🎵')} <b>Название:</b> {html.escape(title)}\n"
            f"{pe('user', '👤')} <b>Автор:</b> {html.escape(artist)}\n"
            f"🎧 <b>Площадка:</b> {get_platform_label(platform)}{dur_text}\n"
            f"🌐 <a href='{url}'>Ссылка на оригинал</a>"
        )
        kb = types.InlineKeyboardMarkup(row_width=1)
        kb.add(
            types.InlineKeyboardButton(f"{button_emoji('download', '📥')} Скачать снова в чат", callback_data="act:download_selected"),
            types.InlineKeyboardButton(f"{button_emoji('trash', '🗑️')} Убрать из недавних", callback_data=f"del_hist:{hid}"),
            types.InlineKeyboardButton(f"{button_emoji('arrow_left', '⬅️')} Назад к истории", callback_data="nav:history"),
        )
        bot.edit_message_text(text, chat_id, call.message.message_id, reply_markup=kb, parse_mode="HTML")

    elif data.startswith("del_hist:"):
        hid = int(data.split(":")[1])
        db_remove_history(hid)
        bot.answer_callback_query(call.id, "Удалено из истории!")
        show_history_list(chat_id, call.message.message_id)

    elif data == "act:clear_all_history":
        db_clear_history(chat_id)
        bot.answer_callback_query(call.id, "Вся история очищена!")
        show_history_list(chat_id, call.message.message_id)

    elif data == "noop":
        pass


# Веб-приложение и /api/ обслуживает защищённый Node.js сервер (server.ts).
# Python-бот больше не занимает HTTP-порт — иначе можно обойти проверку входа.
if __name__ == "__main__":
    print("SoundSearch Music Bot успешно запущен...")
    bot.infinity_polling(skip_pending=True)
