export type Platform = 'youtube' | 'soundcloud' | 'yandex' | 'spotify' | 'apple';

export interface Track {
  id?: string | number;
  title: string;
  artist: string;
  url: string;
  platform: Platform;
  duration?: number;
  thumbnail?: string;
  preview_url?: string;
  downloaded_at?: string;
  is_favorite?: boolean;
}

export interface FavoriteItem {
  id: number;
  user_id: number | string;
  title: string;
  artist: string;
  url: string;
  platform: Platform;
  thumbnail?: string;
  duration?: number;
}

export interface HistoryItem {
  id: number;
  user_id: number | string;
  title: string;
  artist: string;
  url: string;
  platform: Platform;
  thumbnail?: string;
  duration?: number;
  downloaded_at: string;
}

export interface SearchResponse {
  query: string;
  platform: Platform;
  page: number;
  totalPages: number;
  totalResults: number;
  results: Track[];
}

export interface SendTrackResponse {
  success: boolean;
  message: string;
  sentToChat?: string | number;
  track?: Track;
  error?: string;
  audioUrl?: string;
  simulated?: boolean;
}

export interface TelegramUserInfo {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
  auth_date?: number;
  hash?: string;
}

export interface BotConfig {
  hasBotToken: boolean;
  botUsername?: string;
  botFirstName?: string;
  appUrl?: string;
}
