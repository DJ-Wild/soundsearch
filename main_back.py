import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
from dotenv import load_dotenv
import telebot
from telebot import types
import yt_dlp
import threading
import http.server
import socketserver
import os

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
YANDEX_TOKEN = os.getenv("YANDEX_TOKEN")

if not BOT_TOKEN:
    raise ValueError("BOT_TOKEN не задан в .env файле!")

bot = telebot.TeleBot(BOT_TOKEN)

DB_PATH = "music_bot.db"

# Состояния пользователей и кэши в оперативной памяти
user_states = {}       # {chat_id: "STATE_NAME"}
user_urls = {}         # {chat_id: "url"}
user_searches = {}     # {chat_id: {"query": str, "platform": str, "page": int, "results": [...]}}
user_selected_track = {} # {chat_id: track_dict}
last_menu_msg = {}     # {chat_id: message_id}


# ==================== РАБОТА С БАЗОЙ ДАННЫХ ====================

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
                downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()

init_db()


def db_add_favorite(user_id, title, artist, url, platform):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR IGNORE INTO favorites (user_id, title, artist, url, platform)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, title, artist, url, platform))
        conn.commit()


def db_remove_favorite(fav_id):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM favorites WHERE id = ?", (fav_id,))
        conn.commit()


def db_get_favorites(user_id):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, title, artist, url, platform FROM favorites WHERE user_id = ? ORDER BY id DESC", (user_id,))
        return cursor.fetchall()


def db_add_history(user_id, title, artist, url, platform):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO history (user_id, title, artist, url, platform)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, title, artist, url, platform))
        conn.commit()


def db_remove_history(hist_id):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM history WHERE id = ?", (hist_id,))
        conn.commit()


def db_get_history(user_id, limit=30):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, title, artist, url, platform 
            FROM history WHERE user_id = ? 
            ORDER BY id DESC LIMIT ?
        """, (user_id, limit))
        return cursor.fetchall()


# ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ИНТЕРФЕЙСА ====================

def send_clean_menu(chat_id, text, reply_markup=None):
    """Отправляет новое меню, удаляя старое, чтобы не дублировать сообщения в чате."""
    old_id = last_menu_msg.get(chat_id)
    if old_id:
        try:
            bot.delete_message(chat_id, old_id)
        except Exception:
            pass
    msg = bot.send_message(chat_id, text, reply_markup=reply_markup, parse_mode="Markdown")
    last_menu_msg[chat_id] = msg.message_id
    return msg


def get_main_menu_keyboard():
    kb = types.InlineKeyboardMarkup(row_width=2)
    kb.add(
        types.InlineKeyboardButton("📥 Скачать по ссылке", callback_data="nav:download"),
        types.InlineKeyboardButton("🔍 Найти трек", callback_data="nav:search"),
        types.InlineKeyboardButton("❤️ Любимые", callback_data="nav:favorites"),
        types.InlineKeyboardButton("📜 История", callback_data="nav:history"),
    )
    return kb


def show_main_menu(chat_id, message_id=None):
    user_states.pop(chat_id, None)
    text = (
        "👋 **Добро пожаловать в Музыкальный Бот!**\n\n"
        "Выберите действие ниже или просто отправьте мне ссылку/название песни."
    )
    kb = get_main_menu_keyboard()
    if message_id:
        try:
            bot.edit_message_text(text, chat_id, message_id, reply_markup=kb, parse_mode="Markdown")
            last_menu_msg[chat_id] = message_id
            return
        except Exception:
            pass
    send_clean_menu(chat_id, text, kb)


# ==================== ПОИСК ТРЕКОВ ====================

def search_tracks(query: str, platform: str):
    """Ищет треки через yt-dlp или yandex-music."""
    results = []

    # Обработка формата 'название - автор'
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
                    results.append({
                        "title": entry.get("title", "Без названия"),
                        "artist": entry.get("uploader", "YouTube"),
                        "url": entry.get("url") or f"https://www.youtube.com/watch?v={entry.get('id')}",
                        "platform": "youtube",
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
                    })

    elif platform == "yandex":
        from yandex_music import Client
        client = Client(YANDEX_TOKEN).init() if YANDEX_TOKEN else Client().init()
        search_res = client.search(clean_query, type_="track")
        if search_res and search_res.tracks and search_res.tracks.results:
            for track in search_res.tracks.results:
                artists = ", ".join([a.name for a in track.artists]) if track.artists else "Неизвестен"
                track_url = f"https://music.yandex.ru/album/{track.albums[0].id if track.albums else '0'}/track/{track.id}"
                results.append({
                    "title": track.title,
                    "artist": artists,
                    "url": track_url,
                    "platform": "yandex",
                })

    return results


def render_search_page(chat_id, message_id=None):
    search_data = user_searches.get(chat_id)
    if not search_data or not search_data["results"]:
        kb = types.InlineKeyboardMarkup()
        kb.add(types.InlineKeyboardButton("🔙 Главное меню", callback_data="nav:menu"))
        bot.edit_message_text("Ничего не найдено 😔", chat_id, message_id, reply_markup=kb)
        return

    page = search_data["page"]
    results = search_data["results"]
    per_page = 5
    total_pages = min(10, (len(results) + per_page - 1) // per_page)
    start_idx = page * per_page
    end_idx = start_idx + per_page
    current_items = results[start_idx:end_idx]

    kb = types.InlineKeyboardMarkup()

    # Кнопки найденных треков: "Название - Автор"
    for i, item in enumerate(current_items):
        btn_idx = start_idx + i
        title = item["title"][:22]
        artist = item["artist"][:15]
        btn_text = f"🎵 {title} - {artist}"
        kb.add(types.InlineKeyboardButton(btn_text, callback_data=f"sel_search:{btn_idx}"))

    # Навигационные кнопки
    nav_row = []
    if page > 0:
        nav_row.append(types.InlineKeyboardButton("⬅️ Назад", callback_data="page:prev"))
    nav_row.append(types.InlineKeyboardButton(f"Стр. {page + 1}/{total_pages}", callback_data="noop"))
    if page < total_pages - 1:
        nav_row.append(types.InlineKeyboardButton("Вперед ➡️", callback_data="page:next"))
    kb.row(*nav_row)

    kb.add(types.InlineKeyboardButton("🔙 Главное меню", callback_data="nav:menu"))

    text = f"🔎 Результаты по запросу: *{search_data['query']}*\nПлощадка: *{search_data['platform'].capitalize()}*"
    if message_id:
        bot.edit_message_text(text, chat_id, message_id, reply_markup=kb, parse_mode="Markdown")
    else:
        send_clean_menu(chat_id, text, kb)


# ==================== ДВИЖОК СКАЧИВАНИЯ ====================

def download_audio_file(url: str, platform: str, output_dir: str) -> str:
    if platform in ["youtube", "soundcloud"]:
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": os.path.join(output_dir, "%(title)s.%(ext)s"),
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            base_name, _ = os.path.splitext(filename)
            return f"{base_name}.mp3"

    elif platform in ["spotify", "apple"]:
        cmd = ["spotdl", "download", url, "--output", output_dir, "--format", "mp3"]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"spotdl error: {res.stderr}")
        files = [os.path.join(output_dir, f) for f in os.listdir(output_dir) if f.endswith(".mp3")]
        if not files:
            raise FileNotFoundError("Файл не найден.")
        return files[0]

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
        return path

    raise ValueError("Неподдерживаемая площадка")


def execute_download(chat_id, url, platform, title=None, artist=None):
    """Скачивает трек, отправляет аудиофайл, добавляет в историю и возвращает в меню."""
    status_msg = bot.send_message(chat_id, "⏳ Скачивание и конвертация трека...")
    temp_dir = tempfile.mkdtemp()

    try:
        file_path = download_audio_file(url, platform, temp_dir)

        if os.path.getsize(file_path) > 50 * 1024 * 1024:
            bot.edit_message_text("❌ Файл превышает лимит отправки Telegram (50 МБ).", chat_id, status_msg.message_id)
            return

        bot.edit_message_text("📤 Отправка трека в Telegram...", chat_id, status_msg.message_id)

        # Извлекаем красивое имя из файла, если не было передано
        if not title:
            base_file = os.path.splitext(os.path.basename(file_path))[0]
            title = base_file

        with open(file_path, "rb") as audio:
            bot.send_audio(chat_id, audio, title=title, performer=artist)

        # Записываем в историю
        db_add_history(chat_id, title, artist or platform.capitalize(), url, platform)

        bot.delete_message(chat_id, status_msg.message_id)

    except Exception as e:
        bot.edit_message_text(f"❌ Ошибка загрузки: {str(e)[:150]}", chat_id, status_msg.message_id)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
        # После отправки трека возвращаем чистое меню
        show_main_menu(chat_id)


# ==================== ОБРАБОТЧИКИ КОМАНД И ТЕКСТА ====================

@bot.message_handler(commands=["start", "menu"])
def cmd_start(message: types.Message):
    show_main_menu(message.chat.id)


@bot.message_handler(commands=["download"])
def cmd_download(message: types.Message):
    user_states[message.chat.id] = "WAITING_URL"
    kb = types.InlineKeyboardMarkup()
    kb.add(types.InlineKeyboardButton("🔙 Назад", callback_data="nav:menu"))
    send_clean_menu(
        message.chat.id,
        "Пришлите ссылку на трек с любой из поддерживаемых платформ:\n"
        "(Яндекс Музыка, Spotify, Apple Music, YouTube, SoundCloud)",
        kb,
    )


@bot.message_handler(commands=["search"])
def cmd_search(message: types.Message):
    user_states[message.chat.id] = "WAITING_SEARCH"
    kb = types.InlineKeyboardMarkup()
    kb.add(types.InlineKeyboardButton("🔙 Назад", callback_data="nav:menu"))
    send_clean_menu(
        message.chat.id,
        "Пришлите название трека (можно в формате: `Название - Автор`):",
        kb,
    )


@bot.message_handler(commands=["love"])
def cmd_love(message: types.Message):
    show_favorites_list(message.chat.id)


@bot.message_handler(commands=["history"])
def cmd_history(message: types.Message):
    show_history_list(message.chat.id)


@bot.message_handler(func=lambda msg: True)
def handle_text_input(message: types.Message):
    chat_id = message.chat.id
    text = message.text.strip()

    # Удаляем сообщение пользователя, чтобы чат оставался чистым
    try:
        bot.delete_message(chat_id, message.message_id)
    except Exception:
        pass

    # Если прислана ссылка — переходим к скачиванию
    if re.match(r"^https?://", text, re.IGNORECASE):
        user_urls[chat_id] = text
        ask_platform_for_download(chat_id)
        return

    # Если находились в состоянии ожидания ссылки, но это не ссылка
    state = user_states.get(chat_id)
    if state == "WAITING_URL":
        bot.send_message(chat_id, "⚠️ Это не ссылка. Отправьте ссылку формата https://...")
        return

    # В любых других случаях (или по состоянию WAITING_SEARCH) воспринимаем как запрос поиска
    user_searches[chat_id] = {"query": text}
    ask_platform_for_search(chat_id, text)


# ==================== ЭКРАНЫ ДЕЙСТВИЙ (МЕНЮ) ====================

def ask_platform_for_download(chat_id):
    kb = types.InlineKeyboardMarkup(row_width=2)
    kb.add(
        types.InlineKeyboardButton("Яндекс Музыка", callback_data="dl_svc:yandex"),
        types.InlineKeyboardButton("Spotify", callback_data="dl_svc:spotify"),
        types.InlineKeyboardButton("Apple Music", callback_data="dl_svc:apple"),
        types.InlineKeyboardButton("SoundCloud", callback_data="dl_svc:soundcloud"),
        types.InlineKeyboardButton("YouTube", callback_data="dl_svc:youtube"),
    )
    kb.add(types.InlineKeyboardButton("🔙 Главное меню", callback_data="nav:menu"))
    send_clean_menu(chat_id, "Выберите площадку, с которой нужно скачать трек:", kb)


def ask_platform_for_search(chat_id, query):
    kb = types.InlineKeyboardMarkup(row_width=1)
    kb.add(
        types.InlineKeyboardButton("YouTube", callback_data="sr_svc:youtube"),
        types.InlineKeyboardButton("SoundCloud", callback_data="sr_svc:soundcloud"),
        types.InlineKeyboardButton("Яндекс Музыка", callback_data="sr_svc:yandex"),
        types.InlineKeyboardButton("🔙 Главное меню", callback_data="nav:menu"),
    )
    send_clean_menu(chat_id, f"Ищем: *{query}*\nВыберите площадку для поиска:", kb)


def show_favorites_list(chat_id, message_id=None):
    favs = db_get_favorites(chat_id)
    kb = types.InlineKeyboardMarkup()
    if not favs:
        kb.add(types.InlineKeyboardButton("🔙 Главное меню", callback_data="nav:menu"))
        text = "❤️ **Ваши любимые треки пусты.**"
    else:
        text = "❤️ **Ваши любимые треки:**"
        for fav_id, title, artist, _, _ in favs:
            t = title[:20]
            a = (artist or "Unknown")[:15]
            kb.add(types.InlineKeyboardButton(f"🎵 {t} - {a}", callback_data=f"sel_fav:{fav_id}"))
        kb.add(types.InlineKeyboardButton("🔙 Главное меню", callback_data="nav:menu"))

    if message_id:
        bot.edit_message_text(text, chat_id, message_id, reply_markup=kb, parse_mode="Markdown")
    else:
        send_clean_menu(chat_id, text, kb)


def show_history_list(chat_id, message_id=None):
    hist = db_get_history(chat_id)
    kb = types.InlineKeyboardMarkup()
    if not hist:
        kb.add(types.InlineKeyboardButton("🔙 Главное меню", callback_data="nav:menu"))
        text = "📜 **История скачиваний пуста.**"
    else:
        text = "📜 **История загруженных треков:**"
        for hist_id, title, artist, _, _ in hist:
            t = title[:20]
            a = (artist or "Unknown")[:15]
            kb.add(types.InlineKeyboardButton(f"🎵 {t} - {a}", callback_data=f"sel_hist:{hist_id}"))
        kb.add(types.InlineKeyboardButton("🔙 Главное меню", callback_data="nav:menu"))

    if message_id:
        bot.edit_message_text(text, chat_id, message_id, reply_markup=kb, parse_mode="Markdown")
    else:
        send_clean_menu(chat_id, text, kb)


# ==================== CALLBACKS (ОБРАБОТКА НАЖАТИЙ КНОПОК) ====================

@bot.callback_query_handler(func=lambda call: True)
def handle_callbacks(call: types.CallbackQuery):
    chat_id = call.message.chat.id
    data = call.data

    bot.answer_callback_query(call.id)

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

    # --- Выбор площадки для прямого скачивания по ссылке ---
    elif data.startswith("dl_svc:"):
        platform = data.split(":")[1]
        url = user_urls.pop(chat_id, None)
        if not url:
            bot.edit_message_text("Ссылка не найдена, отправьте заново.", chat_id, call.message.message_id)
            return
        bot.delete_message(chat_id, call.message.message_id)
        execute_download(chat_id, url, platform)

    # --- Выбор площадки для поиска ---
    elif data.startswith("sr_svc:"):
        platform = data.split(":")[1]
        search_info = user_searches.get(chat_id)
        if not search_info:
            show_main_menu(chat_id, call.message.message_id)
            return
        bot.edit_message_text("🔎 Поиск треков...", chat_id, call.message.message_id)
        results = search_tracks(search_info["query"], platform)
        user_searches[chat_id] = {
            "query": search_info["query"],
            "platform": platform,
            "page": 0,
            "results": results,
        }
        render_search_page(chat_id, call.message.message_id)

    # --- Перелистывание страниц поиска ---
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
        idx = int(data.split(":")[1])
        track = user_searches[chat_id]["results"][idx]
        user_selected_track[chat_id] = track

        text = (
            f"🎶 **Название:** {track['title']}\n"
            f"👤 **Автор:** {track['artist']}\n"
            f"🏛 **Площадка:** {track['platform'].capitalize()}\n"
            f"🔗 [Ссылка на трек]({track['url']})"
        )
        kb = types.InlineKeyboardMarkup(row_width=2)
        kb.add(
            types.InlineKeyboardButton("📥 Скачать трек", callback_data="act:download_selected"),
            types.InlineKeyboardButton("❤️ В любимые", callback_data="act:add_fav"),
        )
        kb.add(types.InlineKeyboardButton("⬅️ К результатам", callback_data="act:back_search"))
        bot.edit_message_text(text, chat_id, call.message.message_id, reply_markup=kb, parse_mode="Markdown")

    elif data == "act:back_search":
        render_search_page(chat_id, call.message.message_id)

    elif data == "act:download_selected":
        track = user_selected_track.get(chat_id)
        if track:
            bot.delete_message(chat_id, call.message.message_id)
            execute_download(chat_id, track["url"], track["platform"], track["title"], track["artist"])

    elif data == "act:add_fav":
        track = user_selected_track.get(chat_id)
        if track:
            db_add_favorite(chat_id, track["title"], track["artist"], track["url"], track["platform"])
            bot.answer_callback_query(call.id, "Добавлено в Любимые! ❤️")

    # --- Просмотр трека из Любимых ---
    elif data.startswith("sel_fav:"):
        fav_id = int(data.split(":")[1])
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, title, artist, url, platform FROM favorites WHERE id = ?", (fav_id,))
            row = cursor.fetchone()

        if not row:
            show_favorites_list(chat_id, call.message.message_id)
            return

        fid, title, artist, url, platform = row
        user_selected_track[chat_id] = {"title": title, "artist": artist, "url": url, "platform": platform}

        text = (
            f"❤️ **Любимый трек:**\n\n"
            f"🎶 **Название:** {title}\n"
            f"👤 **Автор:** {artist}\n"
            f"🔗 [Ссылка на трек]({url})"
        )
        kb = types.InlineKeyboardMarkup(row_width=1)
        kb.add(
            types.InlineKeyboardButton("📥 Скачать трек", callback_data="act:download_selected"),
            types.InlineKeyboardButton("💔 Убрать из любимых", callback_data=f"del_fav:{fid}"),
            types.InlineKeyboardButton("⬅️ Назад к списку", callback_data="nav:favorites"),
        )
        bot.edit_message_text(text, chat_id, call.message.message_id, reply_markup=kb, parse_mode="Markdown")

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
            cursor.execute("SELECT id, title, artist, url, platform FROM history WHERE id = ?", (hid,))
            row = cursor.fetchone()

        if not row:
            show_history_list(chat_id, call.message.message_id)
            return

        hid, title, artist, url, platform = row
        user_selected_track[chat_id] = {"title": title, "artist": artist, "url": url, "platform": platform}

        text = (
            f"📜 **Трек из истории:**\n\n"
            f"🎶 **Название:** {title}\n"
            f"👤 **Автор:** {artist}\n"
            f"🔗 [Ссылка на трек]({url})"
        )
        kb = types.InlineKeyboardMarkup(row_width=1)
        kb.add(
            types.InlineKeyboardButton("📥 Скачать снова", callback_data="act:download_selected"),
            types.InlineKeyboardButton("🗑 Убрать из недавних", callback_data=f"del_hist:{hid}"),
            types.InlineKeyboardButton("⬅️ Назад к истории", callback_data="nav:history"),
        )
        bot.edit_message_text(text, chat_id, call.message.message_id, reply_markup=kb, parse_mode="Markdown")

    elif data.startswith("del_hist:"):
        hid = int(data.split(":")[1])
        db_remove_history(hid)
        bot.answer_callback_query(call.id, "Удалено из истории!")
        show_history_list(chat_id, call.message.message_id)

    elif data == "noop":
        pass

# Функция запуска HTML-сервера
def run_html_server():
    PORT = 3000
    # Путь к папке, где лежит ваш index.html
    # (по умолчанию — папка бота, можете заменить на конкретный путь, например "/root/danya/soundsearch/public")
    WEB_DIR = os.path.dirname(os.path.abspath(__file__)) 
    os.chdir(WEB_DIR)
    
    Handler = http.server.SimpleHTTPRequestHandler
    # Позволяет повторно использовать порт сразу после перезапуска
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"HTML-сервер запущен на порту {PORT}")
        httpd.serve_forever()

# Запускаем сервер в фоновом потоке, чтобы он не мешал боту
threading.Thread(target=run_html_server, daemon=True).start()

if __name__ == "__main__":
    print("Бот успешно запущен...")
    bot.infinity_polling(skip_pending=True)