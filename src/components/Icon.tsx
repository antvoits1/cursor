import type { ReactNode } from 'react';

const GLYPHS: Record<string, ReactNode> = {
  call: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  sms: <path d="M4 5h16v12H9l-5 3V5z" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  wa: (
    <>
      <path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.4-4.7a8.5 8.5 0 1 1 16.1-4.1Z" />
      <path d="M8.6 7.8c.3-.5.5-.5.8-.5h.5c.2 0 .4.1.5.4l.8 1.9c.1.3.1.5-.1.7l-.6.7c-.2.2-.2.4-.1.6.5 1 1.2 1.8 2.1 2.4.3.2.5.2.7 0l.8-1c.2-.2.4-.3.7-.2l1.9.9c.3.1.4.3.4.5 0 .3-.1 1-.6 1.5-.5.5-1.3.8-2.1.7-1-.1-2.6-.6-4.3-2.1-2-1.8-3-4-3.1-5-.1-.7.2-1.1.7-1.5Z" />
    </>
  ),
  back: <path d="m15 18-6-6 6-6" />,
  compose: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </>
  ),
  plane: (
    <>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </>
  ),
  pdf: (
    <>
      <path d="M6 2h9l5 5v15H6z" />
      <path d="M14 2v6h6" />
    </>
  ),
  user: (
    <>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  bank: (
    <>
      <rect x="3" y="10" width="18" height="9" />
      <path d="M2 10 12 4l10 6M7 10v9M12 10v9M17 10v9" />
    </>
  ),
  brief: (
    <>
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M9 6V4h6v2M4 11h16" />
    </>
  ),
  activity: <path d="M3 12h4l2-5 4 10 2-5h6" />,
  phone: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M10 5h4M11 18h2" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 6.5-2.6 8.4-3.2 9h18.4c-.6-.6-3.2-2.5-3.2-9Z" />
      <path d="M14.3 20a2.6 2.6 0 0 1-4.6 0" />
    </>
  ),
  filter: <path d="M4 7h16M7 12h10M10 17h4" />,
  leads: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  scanner: (
    <>
      <path d="M7 3h10v4H7zM5 8h14a2 2 0 0 1 2 2v6h-4v5H7v-5H3v-6a2 2 0 0 1 2-2z" />
      <path d="M9 16h6" />
    </>
  ),
  command: (
    <>
      <path d="M12 3 4 7.5 12 12l8-4.5L12 3z" />
      <path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5" />
    </>
  ),
  logo: (
    <>
      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" />
      <line x1="12" y1="22" x2="12" y2="15.5" />
      <line x1="22" y1="8.5" x2="12" y2="15.5" />
      <line x1="2" y1="8.5" x2="12" y2="15.5" />
    </>
  ),
  mic: (
    <>
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
    </>
  ),
  micOff: (
    <>
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 5.12 2.12M15 9.5V5a3 3 0 0 0-5.7-1.3" />
      <path d="M5 11a7 7 0 0 0 12.2 4.7M12 18v4M3 3l18 18" />
    </>
  ),
  keypad: (
    <>
      <circle cx="6" cy="6" r="1" />
      <circle cx="12" cy="6" r="1" />
      <circle cx="18" cy="6" r="1" />
      <circle cx="6" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="18" cy="12" r="1" />
      <circle cx="6" cy="18" r="1" />
      <circle cx="12" cy="18" r="1" />
      <circle cx="18" cy="18" r="1" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  delete: (
    <>
      <path d="M21 6H8l-5 6 5 6h13a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z" />
      <path d="M18 9l-6 6M12 9l6 6" />
    </>
  ),
  phoneOff: (
    <>
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
      <path d="M23 1 1 23" />
    </>
  ),
};

export type IconName = keyof typeof GLYPHS;

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 12, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {GLYPHS[name]}
    </svg>
  );
}
