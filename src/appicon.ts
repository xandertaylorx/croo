/** The app icons the user can choose between. Same frog, only the colours differ (see scripts/make-icon.mjs). */
export type AppIconId = 'green' | 'white' | 'black'

export const APP_ICONS: { id: AppIconId; label: string; file: string }[] = [
  { id: 'green', label: 'Green on black', file: 'icon.png' },
  { id: 'white', label: 'White on black', file: 'icon-white.png' },
  { id: 'black', label: 'Black on white', file: 'icon-light.png' },
]

export const isAppIcon = (id: unknown): id is AppIconId => APP_ICONS.some((i) => i.id === id)
export const iconFile = (id: unknown) => APP_ICONS.find((i) => i.id === id)?.file ?? 'icon.png'
