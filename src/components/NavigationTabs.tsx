import React from 'react';
import { Search, Link2, Heart, Clock } from 'lucide-react';

export type TabType = 'search' | 'link' | 'favorites' | 'history' | 'settings';

interface NavigationTabsProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  favoritesCount: number;
  historyCount: number;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  activeTab,
  onChangeTab,
  favoritesCount,
  historyCount,
}) => {
  const tabs = [
    {
      id: 'search' as TabType,
      label: 'Поиск',
      icon: Search,
    },
    {
      id: 'link' as TabType,
      label: 'Ссылка',
      icon: Link2,
    },
    {
      id: 'favorites' as TabType,
      label: 'Любимые',
      icon: Heart,
      badge: favoritesCount > 0 ? favoritesCount : null,
      badgeColor: 'bg-rose-500 text-white',
    },
    {
      id: 'history' as TabType,
      label: 'История',
      icon: Clock,
      badge: historyCount > 0 ? historyCount : null,
      badgeColor: 'bg-zinc-600 text-zinc-100',
    },
  ];

  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeTab)
  );

  return (
    <nav
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-md md:max-w-lg select-none pointer-events-none"
      aria-label="Основная навигация"
    >
      {/* Floating Liquid Glass Dock */}
      <div className="relative pointer-events-auto bg-zinc-950/85 backdrop-blur-3xl border border-white/[0.22] rounded-full p-1 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.35),inset_0_-1px_1px_rgba(0,0,0,0.5),0_20px_50px_rgba(0,0,0,0.9),0_0_30px_rgba(255,255,255,0.06)] flex items-center justify-between transition-all">
        {/* Animated Liquid Glass Active Tab Pill - Fills full dock height flush with no empty gutters */}
        <div
          className="absolute top-1 bottom-1 rounded-full bg-gradient-to-b from-white/35 via-white/20 to-white/10 backdrop-blur-2xl border border-white/50 shadow-[0_4px_24px_rgba(255,255,255,0.3),inset_0_1px_1.5px_rgba(255,255,255,0.8)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            left: `calc(${activeIndex * 25}% + 2px)`,
            width: 'calc(25% - 4px)',
          }}
        />

        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              className={`relative z-10 flex items-center justify-center gap-1.5 flex-1 h-10 px-2 rounded-full transition-all duration-200 text-xs active:scale-95 ${
                isActive
                  ? 'text-white font-extrabold drop-shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 font-semibold'
              }`}
              aria-label={tab.label}
              aria-pressed={isActive}
            >
              <div className="relative flex items-center justify-center shrink-0">
                <Icon
                  className={`w-4 h-4 transition-transform duration-200 ${
                    isActive
                      ? 'stroke-[2.6px] scale-105 text-white'
                      : 'stroke-[1.9px] text-zinc-400'
                  }`}
                />
                {tab.badge !== null && tab.badge !== undefined && (
                  <span
                    className={`absolute -top-1 -right-2 text-[8.5px] min-w-3.5 h-3.5 px-0.5 rounded-full flex items-center justify-center font-bold transition-transform duration-200 ${
                      isActive ? 'bg-zinc-900/90 text-white border border-white/25' : tab.badgeColor
                    }`}
                  >
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] sm:text-xs tracking-tight leading-none truncate select-none">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
