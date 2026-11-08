import React, { useState } from 'react';
import { Send, ShieldCheck, AlertCircle, Laptop, X, ArrowRight, User } from 'lucide-react';

interface TelegramAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (user: any, token?: string) => void;
  message?: string | null;
  error?: string | null;
  triggerHaptic?: (type?: any) => void;
  botUsername?: string;
}

export const TelegramAuthModal: React.FC<TelegramAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  message,
  error: externalError,
  triggerHaptic,
  botUsername,
}) => {
  const [activeTab, setActiveTab] = useState<'code' | 'telegram'>('code');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCodeSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = code.replace(/\D/g, '').trim();
    if (clean.length < 6) {
      setLocalError('Введите 6 цифр кода');
      triggerHaptic?.('error');
      return;
    }

    setSubmitting(true);
    setLocalError(null);
    try {
      const res = await fetch('/api/auth/code/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: clean }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        triggerHaptic?.('success');
        onSuccess?.(data.user, data.token);
        onClose();
      } else {
        triggerHaptic?.('error');
        setLocalError(data.error || 'Неверный или истекший код');
      }
    } catch {
      triggerHaptic?.('error');
      setLocalError('Ошибка подключения к серверу');
    } finally {
      setSubmitting(false);
    }
  };

  const displayedError = localError || externalError;
  const username = botUsername || 'music_telegram_bot';

  return (
    <div className="fixed inset-0 z-50 bg-[#17212b]/95 backdrop-blur-2xl flex items-center justify-center p-4 select-none animate-fade-in">
      <div className="w-full max-w-sm bg-[#1c2733]/95 border border-white/10 rounded-[32px] p-6 sm:p-7 flex flex-col items-center text-center shadow-[0_25px_60px_rgba(0,0,0,0.8),inset_0_1px_2px_rgba(255,255,255,0.2)] relative">
        {/* Кнопка закрытия */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/10 cursor-pointer"
          title="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Иконка */}
        <div className="relative flex items-center justify-center mb-4 pt-1">
          <div className="w-14 h-14 rounded-full bg-[#24A1DE] flex items-center justify-center shadow-lg z-10 -mr-2.5 border-2 border-[#1c2733]">
            <Send className="w-7 h-7 text-white fill-white -rotate-12 translate-x-0.5 -translate-y-0.5" />
          </div>
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center shadow-lg z-20 border-2 border-[#1c2733]">
            <Laptop className="w-6 h-6 text-white" />
          </div>
        </div>

        <h2 className="text-xl font-bold text-white tracking-tight mb-1">Вход в SoundSearch</h2>
        <p className="text-xs text-zinc-400 leading-relaxed mb-4 max-w-[280px]">
          Авторизуйтесь по 6-значному коду с другого устройства или через Telegram
        </p>

        {/* Информационное сообщение (например: «Войдите для скачивания треков») */}
        {message && (
          <div className="w-full mb-4 p-3 rounded-2xl bg-[#24A1DE]/15 border border-[#24A1DE]/30 text-sky-200 text-xs flex items-center gap-2.5 text-left shadow-sm">
            <Send className="w-4 h-4 text-[#24A1DE] shrink-0 -rotate-12" />
            <span className="font-medium leading-snug">{message}</span>
          </div>
        )}

        {/* Переключатель вкладок */}
        <div className="w-full grid grid-cols-2 bg-black/40 p-1 rounded-2xl mb-5 border border-white/10">
          <button
            onClick={() => { setActiveTab('code'); setLocalError(null); }}
            className={`py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'code' ? 'bg-[#24A1DE] text-white shadow-md' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>По коду</span>
          </button>
          <button
            onClick={() => { setActiveTab('telegram'); setLocalError(null); }}
            className={`py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'telegram' ? 'bg-[#24A1DE] text-white shadow-md' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Send className="w-3.5 h-3.5 fill-current -rotate-12" />
            <span>Telegram</span>
          </button>
        </div>

        {activeTab === 'code' ? (
          <form onSubmit={handleCodeSubmit} className="w-full flex flex-col gap-3">
            <p className="text-[11px] text-zinc-400 text-left">
              1. Нажмите «Код для ПК» на авторизованном устройстве.<br />
              2. Введите полученный 6-значный код:
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full bg-black/50 border border-white/20 rounded-2xl py-3 px-4 text-2xl font-mono font-extrabold text-center text-white tracking-[6px] focus:outline-none focus:border-[#24A1DE] focus:ring-1 focus:ring-[#24A1DE] transition-all"
              autoFocus
            />

            <button
              type="submit"
              disabled={submitting || code.length < 6}
              className="w-full py-3 px-5 rounded-2xl bg-[#24A1DE] hover:bg-[#1f93cc] disabled:opacity-50 text-white font-bold text-xs transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2 mt-1 cursor-pointer"
            >
              <span>{submitting ? 'Проверка...' : 'Войти по коду'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-[11px] text-emerald-400/90 text-center mt-1">
              ⚡ Моментальный вход без VPN и блокировок
            </p>
          </form>
        ) : (
          <div className="w-full flex flex-col gap-2.5">
            <a
              href={`https://t.me/${username}?start=app`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => triggerHaptic?.('medium')}
              className="w-full py-3.5 px-6 rounded-2xl bg-[#24A1DE] hover:bg-[#1f93cc] active:scale-[0.98] text-white font-bold text-xs transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send className="w-4 h-4 fill-white text-white -rotate-12" />
              <span>Открыть в приложении Telegram</span>
            </a>

            <a
              href="/api/auth/telegram/start"
              onClick={() => triggerHaptic?.('medium')}
              className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-zinc-300 hover:text-white font-medium text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>Войти через браузер (Telegram Web)</span>
            </a>
            <p className="text-[11px] text-zinc-400 text-center mt-1">
              💡 В приложении Telegram авторизация происходит автоматически
            </p>
          </div>
        )}

        {displayedError && (
          <div className="w-full mt-3 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{displayedError}</span>
          </div>
        )}
      </div>
    </div>
  );
};
