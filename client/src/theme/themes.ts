import type { FieldConfig, TeamSkin } from '../net/protocol'

/** Visual-only field theme. Geometry always comes from the server. */
export type FieldTheme = {
  id: string
  name: string
  day: boolean
  bg: string
  fog: number
  /** Turf stripe colors. */
  pA: string
  pB: string
  line: string
  rim: string
  rimBase: string
  stand: string
  crowd: string[]
  ring: string
  hex: string
  superKick: { bg: string; fg: string; shadow: string }
  wall: { bg: string; fg: string; border: string }
  scoreAlpha: number
}

// Palettes lifted from the "Button Brawl - Visual Directions" doc:
// 4d Diegetic Arena (night broadcast) and Round 6 (4d x 3d daylight).
export const FIELD_THEMES: FieldTheme[] = [
  {
    id: 'night',
    name: 'Diegetic Night',
    day: false,
    bg: '#0d0b1f',
    fog: 0.018,
    pA: '#1f4166',
    pB: '#183552',
    line: '#7fd4ff',
    rim: '#7fd4ff',
    rimBase: '#0f0c26',
    stand: '#1a1640',
    crowd: ['#ff3b6b', '#2e6bff', '#ffffff', '#ffb020'],
    ring: '#ffb020',
    hex: '#8cffe6',
    superKick: { bg: '#ff3b3b', fg: '#ffffff', shadow: '#ffb020' },
    wall: { bg: 'rgba(13,11,31,.85)', fg: '#b6fff0', border: '#b6fff0' },
    scoreAlpha: 0.24,
  },
  {
    id: 'day',
    name: 'Daylight Broadcast',
    day: true,
    bg: '#9fd8ff',
    fog: 0.008,
    pA: '#43c262',
    pB: '#36b055',
    line: '#ffffff',
    rim: '#ffffff',
    rimBase: '#f4f7fb',
    stand: '#e4ecf6',
    crowd: ['#ff2649', '#1f5eff', '#ffffff', '#ffd400'],
    ring: '#ffd400',
    hex: '#7ff5e6',
    superKick: { bg: '#ff5a2e', fg: '#ffffff', shadow: '#10213a' },
    wall: { bg: '#ffffff', fg: '#10213a', border: '#10213a' },
    scoreAlpha: 0.28,
  },
  {
    id: 'cyber',
    name: 'Cyber Night',
    day: false,
    bg: '#05040f',
    fog: 0.012,
    pA: '#132a4a',
    pB: '#10233e',
    line: '#00f0ff',
    rim: '#00f0ff',
    rimBase: '#0a0a22',
    stand: '#151233',
    crowd: ['#ff00aa', '#00f0ff', '#ffffff', '#7a5cff'],
    ring: '#ff00aa',
    hex: '#00f0ff',
    superKick: { bg: '#ff00aa', fg: '#ffffff', shadow: '#00f0ff' },
    wall: { bg: 'rgba(5,4,15,.85)', fg: '#00f0ff', border: '#00f0ff' },
    scoreAlpha: 0.22,
  },
]

export type FieldOverrides = Partial<Pick<FieldTheme, 'pA' | 'pB' | 'line' | 'rim' | 'ring'>>

export function resolveTheme(id: string, overrides: FieldOverrides): FieldTheme {
  const base = FIELD_THEMES.find((t) => t.id === id) ?? FIELD_THEMES[0]
  return { ...base, ...overrides }
}

export const TEAM_PRESETS: TeamSkin[] = [
  {
    name: 'RED BOLTS',
    primary: '#2f6bff',
    border: '#ffffff',
    text: '#ffffff',
    pieces: [
      { label: 'OX', name: 'ONYX' },
      { label: 'VT', name: 'VOLT' },
      { label: 'NV', name: 'NOVA' },
      { label: 'BZ', name: 'BLAZE', primary: '#ff3b3b', border: '#fff3c4' },
      { label: 'BS', name: 'BASTION', primary: '#1aa58a', border: '#b6fff0' },
    ],
  },
  {
    name: 'CRYSTAL FC',
    primary: '#2a1030',
    border: '#ff3b6b',
    text: '#ff9bb5',
    pieces: [
      { label: 'GK', name: 'GRANITE' },
      { label: 'RK', name: 'ROOK' },
      { label: 'JX', name: 'JINX' },
      { label: 'ZP', name: 'ZAP' },
      { label: 'KT', name: 'KITE' },
    ],
  },
  {
    name: 'SUNNY SC',
    primary: '#ffffff',
    border: '#e8274b',
    text: '#e8274b',
    pieces: [
      { label: 'SN', name: 'SUNNY' },
      { label: 'RY', name: 'RAY' },
      { label: 'HL', name: 'HALO' },
      { label: 'FL', name: 'FLARE', primary: '#ff5a2e', border: '#ffffff' },
      { label: 'DW', name: 'DAWN', primary: '#00b3a4', border: '#ffffff' },
    ],
  },
]

/** Same defaults as server game.DefaultConfig, used before a match exists (menu preview). */
export const DEFAULT_FIELD: FieldConfig = {
  width: 10,
  length: 15,
  goalWidth: 3,
  goalDepth: 0.8,
  postRadius: 0.06,
  pieceRadius: 0.46,
  ballRadius: 0.2,
  wallRadius: 0.88,
}

export function defaultFormation(field: FieldConfig) {
  const pct = (x: number, y: number) => ({ x: (x / 100 - 0.5) * field.width, y: -(y / 100 - 0.5) * field.length })
  const home = [pct(50, 93), pct(28, 80), pct(72, 80), pct(36, 63), pct(64, 63)]
  return [
    ...home.map((p, i) => ({ id: i, team: 0, ...p })),
    ...home.map((p, i) => ({ id: home.length + i, team: 1, x: -p.x, y: -p.y })),
  ]
}

export function pieceColors(skin: TeamSkin, index: number) {
  const p = skin.pieces[index]
  return {
    fill: p?.primary || skin.primary,
    ring: p?.border || skin.border,
    text: skin.text,
    label: p?.label ?? '',
    name: p?.name ?? '',
  }
}
