import type { CSSProperties, ReactElement } from 'react';

/**
 * Icon library — sous-ensemble du design Helvètia (stroke 1.6, viewBox 24×24,
 * lineCap/Join round). Server-safe (rien que du SVG).
 */
export type IconName =
  | 'home'
  | 'users'
  | 'user'
  | 'calendar'
  | 'inbox'
  | 'clock'
  | 'banknote'
  | 'file-text'
  | 'shield'
  | 'search'
  | 'bell'
  | 'chevron-r'
  | 'chevron-l'
  | 'chevron-d'
  | 'plus'
  | 'check'
  | 'x'
  | 'filter'
  | 'download'
  | 'alert'
  | 'info'
  | 'send'
  | 'pen'
  | 'settings'
  | 'refresh'
  | 'map-pin'
  | 'arrow-r'
  | 'arrow-ud'
  | 'bolt'
  | 'briefcase';

interface Props {
  readonly name: IconName;
  readonly size?: number;
  readonly color?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly 'aria-hidden'?: boolean;
}

const PATHS: Record<IconName, ReactElement> = {
  home: (
    <>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 21c0-3.5 3-6 7-6s7 2.5 7 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 21c0-2 1-4 4-4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="1.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  inbox: (
    <>
      <path d="M3 13l3-9h12l3 9" />
      <path d="M3 13v6a1 1 0 001 1h16a1 1 0 001-1v-6" />
      <path d="M3 13h5l1 2h6l1-2h5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  banknote: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="1.5" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9v.01M18 15v.01" />
    </>
  ),
  'file-text': (
    <>
      <path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8z" />
      <path d="M14 3v5h5M8 13h8M8 17h6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z" />
      <path d="M10 21h4" />
    </>
  ),
  'chevron-r': <path d="M9 6l6 6-6 6" />,
  'chevron-l': <path d="M15 6l-6 6 6 6" />,
  'chevron-d': <path d="M6 9l6 6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12l5 5 9-11" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  filter: <path d="M3 5h18l-7 9v6l-4-2v-4z" />,
  download: (
    <>
      <path d="M12 4v12M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 18v.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 8v.01" />
    </>
  ),
  send: <path d="M3 11l18-8-7 18-3-7z" />,
  pen: (
    <>
      <path d="M4 20l4-1L20 7l-3-3L5 16z" />
      <path d="M14 6l3 3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.4.9a7 7 0 00-2.1-1.2L14 3h-4l-.4 2.6a7 7 0 00-2.1 1.2l-2.4-.9-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-.9a7 7 0 002.1 1.2L10 21h4l.4-2.6a7 7 0 002.1-1.2l2.4.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 11-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  'map-pin': (
    <>
      <path d="M12 21s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  'arrow-r': <path d="M5 12h14M14 6l6 6-6 6" />,
  'arrow-ud': <path d="M7 4v16M4 7l3-3 3 3M17 4v16M14 17l3 3 3-3" />,
  bolt: <path d="M13 2L4 14h6l-1 8 9-12h-6z" />,
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="1.5" />
      <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
      <path d="M3 13h18" />
    </>
  ),
};

export function Icon({
  name,
  size = 14,
  color,
  className,
  style,
  'aria-hidden': ariaHidden = true,
}: Props): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden={ariaHidden}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
