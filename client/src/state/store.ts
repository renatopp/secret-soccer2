import { create } from 'zustand'
import type {
  EndMsg,
  FieldConfig,
  MatchMsg,
  QueueMode,
  ServerMsg,
  ShotMsg,
  Snapshot,
  TeamInfo,
  TeamSkin,
  Vec,
} from '../net/protocol'
import { TEAM_PRESETS, type FieldOverrides } from '../theme/themes'

export type Profile = {
  team: TeamSkin
  fieldTheme: string
  fieldOverrides: FieldOverrides
}

export type ActiveShot = ShotMsg & { startedAt: number }

export type Banner = { text: string; color: string; sub?: string; until: number }

type State = {
  connected: boolean
  screen: 'menu' | 'queue' | 'game'
  profile: Profile
  lastMode: QueueMode

  queue: { mode: QueueMode; botAfter: number; since: number } | null

  you: number
  field: FieldConfig | null
  teams: [TeamInfo, TeamInfo] | null
  snap: Snapshot | null
  snapAt: number
  shot: ActiveShot | null
  end: EndMsg | null
  banner: Banner | null

  selected: number | null
  armed: { superKick: boolean; wall: boolean }
  aim: { dir: Vec; power: number } | null

  setProfile: (p: Partial<Profile>) => void
  setScreen: (s: State['screen']) => void
  setConnected: (c: boolean) => void
  receive: (msg: ServerMsg) => void
  select: (id: number | null) => void
  toggleArmed: (k: 'superKick' | 'wall') => void
  setAim: (a: State['aim']) => void
  resetMatch: () => void
}

const PROFILE_KEY = 'button-brawl.profile'

function loadProfile(): Profile {
  const fallback: Profile = { team: TEAM_PRESETS[0], fieldTheme: 'night', fieldOverrides: {} }
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

const matchReset = {
  queue: null,
  field: null,
  teams: null,
  snap: null,
  shot: null,
  end: null,
  banner: null,
  selected: null,
  armed: { superKick: false, wall: false },
  aim: null,
}

export const useGame = create<State>((set, get) => ({
  connected: false,
  screen: 'menu',
  profile: loadProfile(),
  lastMode: 'bot',
  you: 0,
  snapAt: 0,
  ...matchReset,

  setProfile: (p) => {
    const profile = { ...get().profile, ...p }
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
    set({ profile })
  },
  setScreen: (screen) => set({ screen }),
  setConnected: (connected) => set({ connected }),
  select: (selected) => set({ selected }),
  toggleArmed: (k) => set((s) => ({ armed: { ...s.armed, [k]: !s.armed[k] } })),
  setAim: (aim) => set({ aim }),
  resetMatch: () => set({ ...matchReset, screen: 'menu' }),

  receive: (msg) => {
    const now = performance.now()
    switch (msg.t) {
      case 'queued':
        set({ screen: 'queue', lastMode: msg.mode, queue: { mode: msg.mode, botAfter: msg.botAfter, since: now } })
        break
      case 'match':
        onMatch(msg, now)
        break
      case 'state':
        onState(msg.state, now)
        break
      case 'shot':
        onShot(msg, now)
        break
      case 'end':
        set({ end: msg, aim: null, selected: null })
        break
      case 'error':
        console.warn('server:', msg.message)
        break
    }
  },
}))

function onMatch(msg: MatchMsg, now: number) {
  useGame.setState({
    ...matchReset,
    screen: 'game',
    you: msg.you,
    field: msg.field,
    teams: msg.teams,
    snap: msg.state,
    snapAt: now,
  })
}

function onState(snap: Snapshot, now: number) {
  const s = useGame.getState()
  const prev = s.snap
  const teams = s.teams!
  let banner = s.banner

  if (snap.phase === 'starting') {
    banner = { text: 'KICK OFF', color: '#ffb020', until: now + snap.phaseLeft * 1000 }
  } else if (snap.phase === 'goal' && prev?.phase !== 'goal') {
    const scorer = teams[snap.lastGoal].skin
    banner = { text: 'GOAL!', sub: scorer.name, color: scorer.primary, until: now + snap.phaseLeft * 1000 }
  } else if (snap.overtime && prev && !prev.overtime) {
    banner = { text: 'OVERTIME', sub: 'golden minutes', color: '#ff3b3b', until: now + 2200 }
  } else if (snap.phase === 'aiming' && prev?.phase === 'aiming' && snap.turn !== prev.turn) {
    banner = { text: 'TIME OUT', color: '#8f8ab8', until: now + 1400 }
  }

  let selected = s.selected
  if (snap.phase === 'aiming' && snap.turn === s.you && (prev?.phase !== 'aiming' || prev.turn !== snap.turn)) {
    selected = nearestOwnPiece(snap, s.you)
  }

  useGame.setState({
    snap,
    snapAt: now,
    banner,
    selected,
    armed: snap.turn === s.you && snap.phase === 'aiming' ? s.armed : { superKick: false, wall: false },
  })
}

function onShot(msg: ShotMsg, now: number) {
  const s = useGame.getState()
  if (!s.snap) return
  // The server skips the "resolving" snapshot: the shot already says where everything ends up.
  const last = msg.frames[msg.frames.length - 1]
  const pieces = s.snap.pieces.map((p) => ({ ...p, x: last[2 + p.id * 2], y: last[3 + p.id * 2] }))
  const powers = s.snap.powers.map((p, team) =>
    team === msg.team ? { superKick: p.superKick - (msg.superKick ? 1 : 0), wall: p.wall - (msg.wall ? 1 : 0) } : p,
  ) as Snapshot['powers']
  useGame.setState({
    shot: { ...msg, startedAt: now },
    snap: { ...s.snap, phase: 'resolving', pieces, ball: { x: last[0], y: last[1] }, powers, wall: msg.barrier },
    snapAt: now,
    aim: null,
    armed: { superKick: false, wall: false },
  })
}

export function nearestOwnPiece(snap: Snapshot, team: number): number | null {
  let best: number | null = null
  let bestD = Infinity
  for (const p of snap.pieces) {
    if (p.team !== team) continue
    const d = Math.hypot(p.x - snap.ball.x, p.y - snap.ball.y)
    if (d < bestD) {
      bestD = d
      best = p.id
    }
  }
  return best
}

export function shotPlaying(shot: ActiveShot | null, now = performance.now()) {
  return !!shot && now < shot.startedAt + shot.duration * 1000
}

/** Seconds left on the match clock, extrapolated from the last snapshot. */
export function liveClock(snap: Snapshot, snapAt: number, now = performance.now()) {
  const running = snap.phase === 'aiming' || snap.phase === 'resolving'
  return Math.max(0, snap.clock - (running ? (now - snapAt) / 1000 : 0))
}

export function liveTurnLeft(snap: Snapshot, snapAt: number, now = performance.now()) {
  if (snap.phase !== 'aiming') return 0
  return Math.max(0, snap.turnLeft - (now - snapAt) / 1000)
}
