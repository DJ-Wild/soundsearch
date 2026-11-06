import React from 'react';
import { LogOut, Send, CheckCircle2, Music2 } from 'lucide-react';
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
  botConfig,
  onLogout,
  isInsideTelegram,
  isLoggedIn,
  onOpenLogin,
}) => {
  return (
    <header className="w-full bg-white/[0.04] backdrop-blur-3xl border-b border-white/[0.12] px-4 md:px-8 pt-[max(1rem,env(safe-area-inset-top,1rem))] pb-3.5 select-none transition-all sticky top-0 z-30 shadow-[0_4px_25px_rgba(0,0,0,0.5)]">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Left: Avatar + SoundSearch Brand with Liquid Glass styling */}
        <div className="flex items-center gap-3">
          {user.photo_url ? (
            <img
              src={user.photo_url}
              alt={user.first_name || 'User'}
              className="w-9 h-9 md:w-10 md:h-10 rounded-full object-cover ring-2 ring-white/25 shadow-lg shrink-0"
            />
          ) : (
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-gradient-to-tr from-[#24A1DE] via-blue-600 to-indigo-600 flex items-center justify-center text-xs md:text-sm font-bold text-white uppercase shadow-lg shadow-sky-500/25 shrink-0 border border-white/20">
              {(user.first_name || 'U').charAt(0)}
            </div>
          )}

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base md:text-lg font-extrabold text-white tracking-tight leading-none drop-shadow-xs">
                SoundSearch
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#24A1DE]/20 text-[#24A1DE] border border-[#24A1DE]/30 text-[10px] font-bold">
                <Send className="w-2.5 h-2.5 fill-current -rotate-12" />
                Telegram Music
              </span>
            </div>
            <p className="text-[11px] md:text-xs text-zinc-300 truncate mt-0.5 font-medium">
              {isLoggedIn ? (
                <>
                  <span className="text-emerald-400 font-semibold">●</span> {user.first_name || 'Пользователь'} {user.username ? `@${user.username}` : ''}
                </>
              ) : (
                'Не авторизован'
              )}
            </p>
          </div>
        </div>

        {/* Right: User Authentication controls */}
        <div className="flex items-center gap-2.5">
          {isLoggedIn ? (
            !isInsideTelegram && (
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-zinc-300 hover:text-white transition-all active:scale-95 text-xs font-semibold shadow-sm"
                title="Выйти из текущего аккаунта Telegram"
                aria-label="Выйти из аккаунта"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">Выйти</span>
              </button>
            )
          ) : (
            <button
              onClick={onOpenLogin}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#24A1DE] hover:bg-[#1f93cc] text-white active:scale-95 text-xs font-bold transition-all shadow-md"
            >
              <Send className="w-3.5 h-3.5 fill-current -rotate-12" />
              <span>Войти через Telegram</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
