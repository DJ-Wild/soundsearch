import React, { useState } from 'react';
import {
  X,
  Send,
  Check,
  Copy,
  Bot,
  User,
  ShieldCheck,
  ExternalLink,
  Loader2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { TelegramUserInfo, BotConfig } from '../types/music';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: TelegramUserInfo;
  onUpdateUserId: (newId: string | number) => void;
  botConfig: BotConfig | null;
  triggerHaptic: (type?: any) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateUserId,
  botConfig,
  triggerHaptic,
}) => {
  const [customChatId, setCustomChatId] = useState(String(user.id || '10001'));
  const [customBotToken, setCustomBotToken] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (!isOpen) return null;

  const handleSaveChatId = () => {
    const trimmed = customChatId.trim();
    if (trimmed) {
      onUpdateUserId(trimmed);
      localStorage.setItem('tg_custom_chat_id', trimmed);
      triggerHaptic('success');
    }
  };

  const handleTestMessage = async () => {
    setIsTesting(true);
    setTestResult(null);
    triggerHaptic('light');

    try {
      const res = await fetch('/api/test-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: customChatId,
          bot_token: customBotToken || undefined,
        }),
      });
      const data = await res.json();
      setTestResult({
        success: Boolean(data.success),
        message: data.message || data.error || 'Результат получен',
      });
      triggerHaptic(data.success ? 'success' : 'error');
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Ошибка подключения к серверу',
      });
      triggerHaptic('error');
    } finally {
      setIsTesting(false);
    }
  };

  const copyAppUrl = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    triggerHaptic('selection');
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100 leading-none">
                Настройки Telegram & Бота
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Конфигурация Mini App и отправки треков
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Telegram User Card */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white uppercase">
              {(user.first_name || 'U').charAt(0)}
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-200">
                {user.first_name || 'Telegram User'} {user.last_name || ''}
              </p>
              <p className="text-[11px] text-zinc-500">
                {user.username ? `@${user.username}` : `ID: ${user.id}`}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            Активен
          </span>
        </div>

        {/* Target Telegram Chat ID */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
            <span>Telegram Chat ID для отправки треков:</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customChatId}
              onChange={(e) => setCustomChatId(e.target.value)}
              placeholder="Ваш chat_id в Telegram"
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-hidden focus:border-sky-500"
            />
            <button
              onClick={handleSaveChatId}
              className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition-colors"
            >
              Сохранить
            </button>
          </div>
          <p className="text-[10px] text-zinc-500">
            В Telegram WebApp ваш Chat ID определяется автоматически.
          </p>
        </div>

        {/* Telegram Bot Token (Optional override / env status) */}
        <div className="flex flex-col gap-1.5 pt-2 border-t border-zinc-800/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300">
              Статус Telegram Bot:
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                botConfig?.hasBotToken
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}
            >
              {botConfig?.hasBotToken ? 'Токен активен' : 'Режим симуляции / Тест'}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={handleTestMessage}
              disabled={isTesting}
              className="w-full py-2 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-1.5"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Отправка теста...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Проверить отправку в Telegram</span>
                </>
              )}
            </button>
          </div>

          {testResult && (
            <div
              className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 mt-1 ${
                testResult.success
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              }`}
            >
              {testResult.success ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span className="leading-tight">{testResult.message}</span>
            </div>
          )}
        </div>

        {/* BotFather Instructions */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-300 flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
              Как добавить в своего бота
            </span>
            <button
              onClick={copyAppUrl}
              className="text-[11px] text-sky-400 hover:underline flex items-center gap-1 font-medium"
            >
              {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedUrl ? 'Скопировано!' : 'Скопировать URL'}</span>
            </button>
          </div>
          <ol className="text-[11px] text-zinc-400 space-y-1 pl-4 list-decimal leading-relaxed">
            <li>Откройте бота <code className="text-sky-300">@BotFather</code> в Telegram.</li>
            <li>Отправьте команду <code className="text-sky-300">/setmenubutton</code> и выберите вашего бота.</li>
            <li>Отправьте этот WebApp URL и название кнопки (например «🎵 Музыка»).</li>
            <li>Готово! В вашем боте появится меню с этим Mini App.</li>
          </ol>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition-colors"
        >
          Готово
        </button>
      </div>
    </div>
  );
};
