import React from 'react';

export const TelegramWallpaperBackground: React.FC = () => {
  // Collection of musical & aesthetic SVG doodle icons in authentic Telegram pattern style
  return (
    <div className="fixed inset-0 pointer-events-none -z-20 overflow-hidden select-none">
      {/* Deep atmospheric cosmic radial gradient base */}
      <div className="absolute inset-0 bg-[#07090f] bg-radial from-[#0d1527]/90 via-[#080d19]/95 to-[#05070c]" />

      {/* Ambient soft blurred light orbs for depth */}
      <div className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full bg-sky-500/[0.07] blur-[150px]" />
      <div className="absolute top-1/2 -right-32 w-[650px] h-[650px] rounded-full bg-indigo-500/[0.06] blur-[170px]" />
      <div className="absolute -bottom-32 left-1/3 w-[600px] h-[600px] rounded-full bg-blue-600/[0.05] blur-[160px]" />

      {/* Telegram-style Scattered Doodle Wallpaper Pattern */}
      {/* Rendered as subtle, translucent vector line-art icons at 6-8% opacity */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.065] text-white"
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
      >
        <defs>
          <pattern
            id="telegram-music-pattern"
            width="280"
            height="280"
            patternUnits="userSpaceOnUse"
          >
            {/* Headphones */}
            <g transform="translate(30, 30) scale(1.1) rotate(-12)">
              <path
                d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5a9 9 0 0 1 18 0v5a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>

            {/* Eighth Note 🎵 */}
            <g transform="translate(140, 25) scale(1) rotate(15)">
              <path
                d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>

            {/* Sparkle Star ✨ */}
            <g transform="translate(230, 45) scale(0.9) rotate(5)">
              <path
                d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </g>

            {/* Vinyl Record 💿 */}
            <g transform="translate(45, 150) scale(1) rotate(20)">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="12" cy="12" r="1" fill="currentColor" />
            </g>

            {/* Sound Wave / Oscilloscope 〰️ */}
            <g transform="translate(125, 120) scale(1) rotate(-8)">
              <path
                d="M2 12h3l3-8 4 16 3-10 3 5 3-3h3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>

            {/* Lightning Bolt ⚡ */}
            <g transform="translate(230, 140) scale(0.95) rotate(-15)">
              <path
                d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>

            {/* Music Equalizer Bars */}
            <g transform="translate(150, 210) scale(1.1) rotate(6)">
              <path
                d="M4 18v-4M8 18V7M12 18v-7M16 18v-9M20 18v-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </g>

            {/* Cassette Tape / Music Player */}
            <g transform="translate(35, 235) scale(0.9) rotate(-10)">
              <rect x="2" y="4" width="20" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="7" cy="11.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="17" cy="11.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7 13.5h10" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </g>

            {/* Paper Plane / Telegram symbol */}
            <g transform="translate(225, 230) scale(0.85) rotate(18)">
              <path
                d="m22 2-7 20-4-9-9-4Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M22 2 11 13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#telegram-music-pattern)" />
      </svg>
    </div>
  );
};
