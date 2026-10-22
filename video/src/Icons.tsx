// Small stroke icons in the style the app uses.
import React from 'react'

type P = { size?: number; color?: string; stroke?: number; style?: React.CSSProperties }

const Svg: React.FC<P & { children: React.ReactNode }> = ({ size = 18, color = 'currentColor', stroke = 1.8, style, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {children}
  </svg>
)

export const IChat = (p: P) => <Svg {...p}><path d="M5 5h14v10H9l-4 4z" /></Svg>
export const ICode = (p: P) => <Svg {...p}><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12" /></Svg>
export const IPanel = (p: P) => <Svg {...p}><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M10 5v14" /></Svg>
export const IFolder = (p: P) => <Svg {...p}><path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></Svg>
export const IGit = (p: P) => <Svg {...p}><circle cx="7" cy="6" r="2" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="8" r="2" /><path d="M7 8v8M17 10c0 4-6 3-9.5 6.5" /></Svg>
export const IGlobe = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16" /></Svg>
export const ITerm = (p: P) => <Svg {...p}><path d="M5 8l4 4-4 4M12 17h7" /></Svg>
export const IPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
export const IGear = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></Svg>
export const ICheck = (p: P) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>
export const IList = (p: P) => <Svg {...p}><path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" /></Svg>
export const ISearch = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></Svg>
export const IPencil = (p: P) => <Svg {...p}><path d="M15 5l4 4L8 20H4v-4z" /></Svg>
export const IFile = (p: P) => <Svg {...p}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></Svg>
export const IArrowUp = (p: P) => <Svg {...p}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>
export const IShield = (p: P) => <Svg {...p}><path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z" /><path d="M9 12l2 2 4-4" /></Svg>
export const IChevron = (p: P) => <Svg {...p}><path d="M7 10l5 5 5-5" /></Svg>
export const IChevronR = (p: P) => <Svg {...p}><path d="M10 7l5 5-5 5" /></Svg>
export const IX = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>
export const IRefresh = (p: P) => <Svg {...p}><path d="M19 12a7 7 0 1 1-2-4.9M19 4v4h-4" /></Svg>
export const IPush = (p: P) => <Svg {...p}><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></Svg>
export const ITerminalBox = (p: P) => <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 10l3 2-3 2M12 15h4" /></Svg>
export const ISpark = (p: P) => <Svg {...p}><path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z" /></Svg>
export const IBrain = (p: P) => <Svg {...p}><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1" /></Svg>
export const IStop = (p: P) => <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" rx="2.5" fill={p.color ?? 'currentColor'} /></svg>
