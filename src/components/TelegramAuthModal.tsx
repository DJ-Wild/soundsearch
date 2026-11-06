import React from 'react';
import { Send, ShieldCheck, AlertCircle } from 'lucide-react';

interface TelegramAuthModalProps {
  isOpen: boolean;
  error?: string | null;
  triggerHaptic?: (type?: any) => void;
}

// Browser authentication is performed via Telegram's OIDC authorization code + PKCE flow.
// No username/phone shortcuts, local fallbacks, or unverified Telegram IDs.
export const TelegramAuthModal: React.FC<TelegramAuthModalProps> = ({
  isOpen, error, triggerHaptic,
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 bg-[#17212b]/95 backdrop-blur-2xl flex items-center justify-center p-4 select-none animate-fade-in">
      <div className="w-full max-w-sm bg-[#1c2733]/90 border border-white/10 rounded-[32px] p-8 flex flex-col items-center text-center shadow-[0_25px_60px_rgba(0,0,0,0.8),inset_0_1px_2px_rgba(255,255,255,0.2)] relative">
        <div className="relative flex items-center justify-center mb-6 pt-2">
          <div className="w-16 h-16 rounded-full bg-[#24A1DE] flex items-center justify-center shadow-lg z-10 -mr-3 border-2 border-[#1c2733]">
            <Send className="w-8 h-8 text-white fill-white -rotate-12 translate-x-0.5 -translate-y-0.5" />
          </div>
          <div className="w-16 h-16 rounded-full bg-[#E5484D] flex items-center justify-center shadow-lg z-20 border-2 border-[#1c2733]">
            <span className="text-white text-2xl font-bold font-sans">S</span>
          </div>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-2">Вход через Telegram</h1>
        <p className="text-xs sm:text-[13px] text-zinc-400 max-w-[280px] leading-relaxed mb-6">
          Подтвердите вход через Telegram. Ваш личный профиль будет создан автоматически.
        </p>
        <a
          href="/api/auth/telegram/start"
          onClick={() => triggerHaptic?.('medium')}
          className="w-full py-3.5 px-6 rounded-full bg-[#24A1DE] hover:bg-[#1f93cc] active:scale-[0.98] text-white font-semibold text-sm transition-all shadow-lg flex items-center justify-center gap-2.5"
        >
          <Send className="w-4 h-4 fill-white text-white -rotate-12" />
          <span>Продолжить с Telegram</span>
        </a>
        <p className="mt-4 flex items-center gap-1.5 text-[11px] text-zinc-500">
          <ShieldCheck className="w-3.5 h-3.5" /> Официальная защищённая авторизация Telegram
        </p>
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};
