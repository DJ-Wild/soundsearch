import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, Laptop, Copy, Check, X, Send, User } from 'lucide-react';
import { TelegramUserInfo, BotConfig } from '../types/music';

interface TelegramHeaderProps {
  user: TelegramUserInfo;
  botConfig: BotConfig | null;
  onLogout: () => void;
  isInsideTelegram: boolean;
  isLoggedIn: boolean;
  onOpenLogin: () => void;
}

export const TelegramHeader: React.FC<TelegramHeaderProps> = ({
  user,
  onLogout,
  isInsideTelegram,
  isLoggedIn,
  onOpenLogin,
}) => {
  const [pcCode, setPcCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loadingCode, setLoadingCode] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Закрытие модального окна по клавише Escape
  useEffect(() => {
    if (!pcCode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPcCode(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pcCode]);

  const handleGetPcCode = async () => {
    setLoadingCode(true);
    setErrorMsg(null);
    try {
      let token: string | null = null;
      try {
        token = localStorage.getItem('ss_session_token');
      } catch {}

      const res = await fetch('/api/auth/code/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (data.success && data.code) {
        setPcCode(data.code);
      } else {
        setErrorMsg(data.error || 'Не удалось сгенерировать код');
      }
    } catch {
      setErrorMsg('Ошибка связи с сервером');
    } finally {
      setLoadingCode(false);
    }
  };

  const handleCopy = () => {
    if (!pcCode) return;
    navigator.clipboard.writeText(pcCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isActuallyLoggedIn = Boolean(isLoggedIn && user && Number(user.id) > 0 && user.username !== 'web_user');

  return (
    <>
      <header className="w-full bg-white/[0.04] backdrop-blur-3xl border-b border-white/[0.12] px-4 md:px-8 py-3.5 sticky top-0 z-30 select-none shadow-[0_4px_25px_rgba(0,0,0,0.5)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Логотип */}
          <div className="flex items-center gap-3 min-w-0">
            {isActuallyLoggedIn && user.photo_url ? (
              <img
                src={user.photo_url}
                alt={user.first_name || 'User'}
                className="w-9 h-9 md:w-10 md:h-10 rounded-full object-cover ring-2 ring-white/25 shadow-lg shrink-0"
              />
            ) : isActuallyLoggedIn ? (
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-[#24A1DE] flex items-center justify-center font-bold text-white shadow-lg shrink-0">
                {(user.first_name || 'U').charAt(0).toUpperCase()}
              </div>
            ) : (
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-zinc-400 shadow-md shrink-0">
                <User className="w-5 h-5" />
              </div>
            )}
            <div className="truncate">
              <h1 className="text-base md:text-lg font-extrabold text-white tracking-tight leading-none">SoundSearch</h1>
              <p className="text-xs text-zinc-400 truncate mt-1">
                {isActuallyLoggedIn ? (
                  <>
                    <span className="text-emerald-400 font-semibold">●</span> {user.first_name || 'Пользователь'} {user.username ? '@' + user.username : ''}
                  </>
                ) : (
                  'Не авторизован'
                )}
              </p>
            </div>
          </div>

          {/* Кнопки */}
          <div className="flex items-center gap-2 shrink-0">
            {isLoggedIn ? (
              <>
                <button
                  type="button"
                  onClick={handleGetPcCode}
                  disabled={loadingCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#24A1DE]/20 hover:bg-[#24A1DE]/30 text-[#24A1DE] border border-[#24A1DE]/40 text-xs font-bold transition-all active:scale-95 cursor-pointer"
                  title="Получить код для авторизации в программе на ПК"
                >
                  <Laptop className="w-4 h-4" />
                  <span>{loadingCode ? 'Генерация...' : 'Код для ПК'}</span>
                </button>
                {!isInsideTelegram && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-400" />
                    <span className="hidden sm:inline">Выйти</span>
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={onOpenLogin}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#24A1DE] hover:bg-[#1F93CC] text-white text-xs font-bold transition-all active:scale-95 shadow-md cursor-pointer"
              >
                <Send className="w-3 h-3 fill-current -rotate-12" />
                <span>Войти через Telegram</span>
              </button>
            )}
          </div>
        </div>

        {/* Ошибка генерации кода (если возникла) */}
        {errorMsg && (
          <div className="max-w-6xl mx-auto mt-2 p-2 bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-center justify-between">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-zinc-400 hover:text-white cursor-pointer p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </header>

      {/* Модальное окно со сгенерированным кодом для ПК (рендерится через Portal в body для точного центрирования на экране) */}
      {pcCode && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPcCode(null);
          }}
        >
          <div
            className="bg-[#1C2733] border border-white/15 rounded-3xl p-6 sm:p-7 max-w-sm w-full text-center relative shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Кнопка крестика сверху справа в углу */}
            <button
              type="button"
              onClick={() => setPcCode(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-zinc-300 hover:text-white flex items-center justify-center transition-all cursor-pointer border border-white/10 z-20 shadow-md"
              title="Закрыть"
              aria-label="Закрыть окно с кодом"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-[#24A1DE]/20 text-[#24A1DE] flex items-center justify-center mx-auto mb-3 border border-[#24A1DE]/30 shadow-inner">
              <Laptop className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-white mb-1">Код для входа в приложение</h3>
            <p className="text-xs text-zinc-400 mb-4 px-2">
              Введите этот 6-значный код в программе на компьютере:
            </p>

            <div className="bg-black/60 border border-white/20 rounded-2xl py-3.5 px-4 text-3xl font-mono font-extrabold text-white tracking-[8px] mb-4 select-all shadow-inner">
              {pcCode}
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="w-full py-2.5 rounded-xl bg-[#24A1DE] hover:bg-[#1F93CC] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-md cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Скопировано!' : 'Скопировать код'}</span>
            </button>
            <p className="text-[11px] text-zinc-500 mt-3">Код действует в течение 5 минут</p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
