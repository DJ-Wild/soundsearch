import { useState, useEffect, useCallback } from 'react';
import { TelegramUserInfo } from '../types/music';

export interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  close: () => void;
  initData: string;
  platform?: string;
  initDataUnsafe?: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      is_premium?: boolean;
      photo_url?: string;
    };
    query_id?: string;
    chat?: any;
  };
  themeParams?: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
  };
  colorScheme?: 'light' | 'dark';
  isExpanded?: boolean;
  viewportHeight?: number;
  viewportStableHeight?: number;
  headerColor?: string;
  backgroundColor?: string;
  sendData: (data: string) => void;
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  showAlert: (message: string, callback?: () => void) => void;
  showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
  openLink: (url: string) => void;
  openTelegramLink: (url: string) => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function useTelegram() {
  const [tg, setTg] = useState<TelegramWebApp | null>(null);
  const [user, setUser] = useState<TelegramUserInfo>({ id: 0, first_name: '' });
  const [isInsideTelegram, setIsInsideTelegram] = useState(false);
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (webApp) {
      setTg(webApp);
      try {
        webApp.ready();
        webApp.expand();
      } catch (e) {
        console.warn('Telegram WebApp init warning:', e);
      }

      // Автоматическое определение среды Telegram WebApp
      const inside = Boolean(
        webApp.initData ||
        webApp.initDataUnsafe?.user ||
        (webApp.platform && webApp.platform !== 'unknown')
      );
      setIsInsideTelegram(inside);

      if (webApp.colorScheme) {
        setColorScheme(webApp.colorScheme);
      }
    }
  }, []);

  const triggerHaptic = useCallback(
    (type: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'selection' = 'light') => {
      try {
        const haptic = tg?.HapticFeedback;
        if (!haptic) return;

        if (type === 'success' || type === 'error') {
          haptic.notificationOccurred(type);
        } else if (type === 'selection') {
          haptic.selectionChanged();
        } else {
          haptic.impactOccurred(type);
        }
      } catch {
        // Haptics optional
      }
    },
    [tg]
  );

  const sendDataToBot = useCallback(
    (data: any) => {
      triggerHaptic('success');
      if (tg?.sendData) {
        tg.sendData(typeof data === 'string' ? data : JSON.stringify(data));
      }
    },
    [tg, triggerHaptic]
  );

  return {
    tg,
    user,
    setUser,
    isInsideTelegram,
    colorScheme,
    triggerHaptic,
    sendDataToBot,
    chatId: user.id,
  };
}
