// Mirrors server/internal/game/protocol.go. Team 0 defends -Y, team 1 defends +Y.

export type Vec = { x: number; y: number }

export type PieceSkin = { label: string; name: string; primary?: string; border?: string }

export type TeamSkin = {
  name: string
  primary: string
  border: string
  text: string
  pieces: PieceSkin[]
}

export type FieldConfig = {
  width: number
  length: number
  goalWidth: number
  goalDepth: number
  postRadius: number
  pieceRadius: number
  ballRadius: number
  wallRadius: number
}

export type PieceState = { id: number; team: number; x: number; y: number }
export type Powers = { superKick: number; wall: number }
export type WallState = { team: number; x: number; y: number; r: number }
export type Phase = 'starting' | 'aiming' | 'resolving' | 'goal' | 'finished'

export type Snapshot = {
  phase: Phase
  turn: number
  round: number
  score: [number, number]
  clock: number
  overtime: boolean
  turnLeft: number
  turnTotal: number
  phaseLeft: number
  pieces: PieceState[]
  ball: Vec
  powers: [Powers, Powers]
  wall: WallState | null
  lastGoal: number
}

export type TeamInfo = { skin: TeamSkin; bot: boolean }

export type MatchMsg = { t: 'match'; you: number; field: FieldConfig; teams: [TeamInfo, TeamInfo]; state: Snapshot }
export type StateMsg = { t: 'state'; state: Snapshot }
export type ShotMsg = {
  t: 'shot'
  team: number
  piece: number
  superKick: boolean
  wall: boolean
  barrier: WallState | null
  fps: number
  /** Each frame: [ballX, ballY, piece0X, piece0Y, ...] in piece id order. */
  frames: number[][]
  goal: number
  duration: number
}
export type EndMsg = { t: 'end'; score: [number, number]; winner: number; reason: 'time' | 'left' }
export type QueuedMsg = { t: 'queued'; mode: QueueMode; botAfter: number }
export type ErrorMsg = { t: 'error'; message: string }

export type ServerMsg = MatchMsg | StateMsg | ShotMsg | EndMsg | QueuedMsg | ErrorMsg | { t: 'pong' }

export type QueueMode = 'online' | 'bot'

export type ClientMsg =
  | { t: 'queue'; mode: QueueMode; team: TeamSkin }
  | { t: 'cancel' }
  | { t: 'leave' }
  | { t: 'shoot'; piece: number; dx: number; dy: number; power: number; superKick: boolean; wall: boolean }
