import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { FieldConfig, PieceState, TeamInfo, Vec, WallState } from '../net/protocol'
import { shotPlaying, useGame } from '../state/store'
import { pieceColors, type FieldTheme } from '../theme/themes'
import { glowTexture, pieceTopTexture } from './textures'

const HT = 0.24

/** Where a body is right now: shot playback while it runs, otherwise eased toward the snapshot. */
function sample(index: number, fallback: Vec): Vec {
  const { shot } = useGame.getState()
  if (!shot || !shotPlaying(shot)) return fallback
  const t = ((performance.now() - shot.startedAt) / 1000) * shot.fps
  const i = Math.min(Math.floor(t), shot.frames.length - 1)
  const a = shot.frames[i]
  const b = shot.frames[Math.min(i + 1, shot.frames.length - 1)]
  const k = t - i
  return { x: a[index * 2] + (b[index * 2] - a[index * 2]) * k, y: a[index * 2 + 1] + (b[index * 2 + 1] - a[index * 2 + 1]) * k }
}

type ActorsProps = {
  field: FieldConfig
  teams: [TeamInfo, TeamInfo]
  pieces: PieceState[]
  ball: Vec
  wall: WallState | null
  theme: FieldTheme
  flip: boolean
  highlightTeam: number | null
}

export function Actors({ field, teams, pieces, ball, wall, theme, flip, highlightTeam }: ActorsProps) {
  const perTeam = pieces.length / 2
  return (
    <group>
      {pieces.map((p) => (
        <Piece
          key={p.id}
          piece={p}
          field={field}
          team={teams[p.team]}
          index={p.id % perTeam}
          flip={flip}
          glow={highlightTeam === p.team}
        />
      ))}
      <Ball field={field} ball={ball} day={theme.day} />
      {wall && <Wall wall={wall} theme={theme} />}
    </group>
  )
}

function Piece({ piece, field, team, index, flip, glow }: {
  piece: PieceState
  field: FieldConfig
  team: TeamInfo
  index: number
  flip: boolean
  glow: boolean
}) {
  const ref = useRef<THREE.Group>(null)
  const R = field.pieceRadius
  const c = pieceColors(team.skin, index)
  const materials = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ color: c.fill, roughness: 0.35, metalness: 0.25 })
    const top = new THREE.MeshStandardMaterial({ map: pieceTopTexture(c.fill, c.ring, c.label, c.text), roughness: 0.4 })
    return [side, top, side]
  }, [c.fill, c.ring, c.label, c.text])

  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const target = sample(piece.id + 1, piece)
    const tz = -target.y
    if (shotPlaying(useGame.getState().shot)) {
      g.position.set(target.x, 0, tz)
    } else {
      const k = Math.min(1, dt * 8)
      g.position.x += (target.x - g.position.x) * k
      g.position.z += (tz - g.position.z) * k
    }
  })

  return (
    <group ref={ref} position={[piece.x, 0, -piece.y]}>
      {/* Counter-rotate so labels read upright for whichever side is viewing. */}
      <group rotation-y={flip ? Math.PI : 0}>
        <mesh position-y={HT / 2} material={materials} castShadow receiveShadow>
          <cylinderGeometry args={[R, R * 1.04, HT, 48]} />
        </mesh>
        <mesh position-y={HT} rotation-x={Math.PI / 2}>
          <torusGeometry args={[R - 0.01, 0.028, 8, 48]} />
          <meshBasicMaterial color={c.ring} toneMapped={false} />
        </mesh>
      </group>
      {glow && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.015}>
          <planeGeometry args={[1.7, 1.7]} />
          <meshBasicMaterial map={glowTexture()} color={c.fill} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

function Ball({ field, ball, day }: { field: FieldConfig; ball: Vec; day: boolean }) {
  const ref = useRef<THREE.Group>(null)
  const sphere = useRef<THREE.Mesh>(null)
  const r = field.ballRadius
  const axis = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dt) => {
    const g = ref.current
    const s = sphere.current
    if (!g || !s) return
    const target = sample(0, ball)
    const playing = shotPlaying(useGame.getState().shot)
    const nx = playing ? target.x : g.position.x + (target.x - g.position.x) * Math.min(1, dt * 8)
    const nz = playing ? -target.y : g.position.z + (-target.y - g.position.z) * Math.min(1, dt * 8)
    const dx = nx - g.position.x
    const dz = nz - g.position.z
    const dist = Math.hypot(dx, dz)
    if (dist > 1e-5) {
      // Roll: rotate around the axis perpendicular to travel.
      axis.set(dz, 0, -dx).normalize()
      s.rotateOnWorldAxis(axis, dist / r)
    }
    g.position.set(nx, 0, nz)
  })

  return (
    <group ref={ref} position={[ball.x, 0, -ball.y]}>
      <mesh ref={sphere} position-y={r} castShadow>
        <sphereGeometry args={[r, 32, 20]} />
        <meshStandardMaterial color="#ffffff" emissive={day ? '#111111' : '#444444'} roughness={0.3} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
        <planeGeometry args={[1.1, 1.1]} />
        <meshBasicMaterial map={glowTexture()} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

function Wall({ wall, theme }: { wall: WallState; theme: FieldTheme }) {
  const geo = useMemo(() => new THREE.CylinderGeometry(wall.r, wall.r, 0.95, 6, 1, true), [wall.r])
  const edges = useMemo(() => new THREE.EdgesGeometry(geo), [geo])
  const ref = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.25
  })
  return (
    <group position={[wall.x, 0, -wall.y]}>
      <group ref={ref} position-y={0.475}>
        <mesh geometry={geo}>
          <meshBasicMaterial color={theme.hex} transparent opacity={theme.day ? 0.35 : 0.22} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <lineSegments geometry={edges}>
          <lineBasicMaterial color={theme.day ? '#ffffff' : '#b6fff0'} />
        </lineSegments>
      </group>
      <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
        <planeGeometry args={[2.2, 2.2]} />
        <meshBasicMaterial map={glowTexture()} color="#40ffd0" transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}
