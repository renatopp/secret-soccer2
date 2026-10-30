import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { send } from '../net/socket'
import type { FieldConfig, PieceState, Powers, Vec } from '../net/protocol'
import { liveTurnLeft, useGame } from '../state/store'
import type { FieldTheme } from '../theme/themes'
import { aimTexture, glowTexture } from './textures'

const MIN_DRAG = 0.35
const MAX_DRAG = 3.2

type Props = {
  field: FieldConfig
  theme: FieldTheme
  you: number
  pieces: PieceState[]
  powers: Powers
  active: boolean
}

/**
 * Diegetic turn HUD from direction 4d: the ring around the selected piece is the
 * turn timer, the aim trail grows with power, power chips float beside the piece.
 * Coordinates are local to the team-oriented group: server (x, y) -> (x, 0, -y).
 */
export function TurnControls({ field, theme, you, pieces, powers, active }: Props) {
  const selected = useGame((s) => s.selected)
  const aim = useGame((s) => s.aim)
  const armed = useGame((s) => s.armed)
  const flip = you === 1
  const piece = pieces.find((p) => p.id === selected && p.team === you)
  const dragging = useRef<{ id: number; pointer: number } | null>(null)

  const toLocal = (e: ThreeEvent<PointerEvent>): Vec => {
    const p = e.object.parent!.worldToLocal(e.point.clone())
    return { x: p.x, y: -p.z }
  }

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!active) return
    const at = toLocal(e)
    let best: PieceState | undefined
    let bestD = field.pieceRadius * 2.4
    for (const p of pieces) {
      if (p.team !== you) continue
      const d = Math.hypot(p.x - at.x, p.y - at.y)
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    // Forgiving like the old touch input: off-piece drags pull the selected piece.
    const target = best ?? piece
    if (!target) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    useGame.getState().select(target.id)
    dragging.current = { id: target.id, pointer: e.pointerId }
  }

  const pull = (e: ThreeEvent<PointerEvent>) => {
    const d = dragging.current
    const p = d && pieces.find((x) => x.id === d.id)
    if (!p) return null
    const at = toLocal(e)
    const v = { x: p.x - at.x, y: p.y - at.y }
    const len = Math.hypot(v.x, v.y)
    if (len < MIN_DRAG) return null
    return { dir: { x: v.x / len, y: v.y / len }, power: Math.min(1, (len - MIN_DRAG) / (MAX_DRAG - MIN_DRAG)) }
  }

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return
    useGame.getState().setAim(pull(e))
  }

  const onUp = (e: ThreeEvent<PointerEvent>) => {
    const d = dragging.current
    if (!d) return
    const shot = pull(e)
    dragging.current = null
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    const s = useGame.getState()
    s.setAim(null)
    if (!shot || !active) return
    send({ t: 'shoot', piece: d.id, dx: shot.dir.x, dy: shot.dir.y, power: shot.power, superKick: s.armed.superKick, wall: s.armed.wall })
  }

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={0.001} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {active && piece && (
        <group position={[piece.x, 0, -piece.y]}>
          <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
            <planeGeometry args={[2.6, 2.6]} />
            <meshBasicMaterial map={glowTexture()} color={theme.day ? '#ffb000' : '#ff8a20'} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
          <pointLight color="#ffa040" intensity={14} distance={5} decay={1.6} position-y={1} />
          <TimerRing theme={theme} />
          {aim && <AimTrail dir={aim.dir} power={aim.power} superKick={armed.superKick} />}
          <PowerChips theme={theme} powers={powers} armed={armed} flip={flip} />
          <PowerPips power={aim?.power ?? 0} theme={theme} flip={flip} />
        </group>
      )}
    </group>
  )
}

const ringShader = {
  vertexShader: /* glsl */ `
    varying vec2 vPos;
    void main() { vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform float progress;
    uniform vec3 color;
    varying vec2 vPos;
    void main() {
      // Clockwise from 12 o'clock as seen from above.
      float a = atan(vPos.x, vPos.y);
      float t = fract(a / 6.2831853 + 1.0);
      if (t > progress) discard;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
}

function TimerRing({ theme }: { theme: FieldTheme }) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(() => ({ progress: { value: 1 }, color: { value: new THREE.Color(theme.ring) } }), [theme.ring])
  useFrame(() => {
    const { snap, snapAt } = useGame.getState()
    if (!mat.current || !snap) return
    const left = liveTurnLeft(snap, snapAt)
    mat.current.uniforms.progress.value = snap.turnTotal ? left / snap.turnTotal : 0
    // Pulse red in the last 4 seconds.
    mat.current.uniforms.color.value.set(left < 4 && Math.floor(left * 4) % 2 === 0 ? '#ff3b3b' : theme.ring)
  })
  return (
    <group rotation-x={-Math.PI / 2}>
      <mesh position-z={0.04}>
        <ringGeometry args={[0.82, 0.98, 96]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.14} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position-z={0.045}>
        <ringGeometry args={[0.82, 0.98, 96]} />
        <shaderMaterial ref={mat} args={[ringShader]} uniforms={uniforms} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  )
}

function AimTrail({ dir, power, superKick }: { dir: Vec; power: number; superKick: boolean }) {
  const L = 1.2 + power * 4.2
  const width = superKick ? 0.8 : 0.55
  // Local frame: direction (x, y) maps to (x, -z).
  const angle = Math.atan2(-dir.x, dir.y)
  return (
    <group rotation-y={angle}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, -(L / 2 + 0.35)]}>
        <planeGeometry args={[width, L]} />
        <meshBasicMaterial map={aimTexture()} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

const chipBase: React.CSSProperties = {
  font: "700 17px/1 'Barlow SC', sans-serif",
  letterSpacing: '.04em',
  padding: '9px 16px',
  transform: 'skewX(-16deg)',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  userSelect: 'none',
  border: '2px solid transparent',
  transition: 'transform .12s, opacity .12s, box-shadow .12s',
}

function PowerChips({ theme, powers, armed, flip }: {
  theme: FieldTheme
  powers: Powers
  armed: { superKick: boolean; wall: boolean }
  flip: boolean
}) {
  const s = flip ? -1 : 1
  const toggle = (k: 'superKick' | 'wall') => (e: React.PointerEvent) => {
    e.stopPropagation()
    useGame.getState().toggleArmed(k)
  }
  const sk = theme.superKick
  const wl = theme.wall
  return (
    <>
      <Html position={[-1.75 * s, 0.75, 0.55 * s]} center zIndexRange={[20, 10]}>
        <div
          onPointerDown={powers.superKick > 0 ? toggle('superKick') : undefined}
          style={{
            ...chipBase,
            background: sk.bg,
            color: sk.fg,
            boxShadow: armed.superKick ? `0 0 0 3px #fff, 6px 6px 0 ${sk.shadow}` : `4px 4px 0 ${sk.shadow}`,
            opacity: powers.superKick > 0 ? 1 : 0.35,
            transform: `skewX(-16deg) scale(${armed.superKick ? 1.12 : 1})`,
          }}
        >
          <span style={{ display: 'inline-block', transform: 'skewX(16deg)' }}>SUPER KICK ×{powers.superKick}</span>
        </div>
      </Html>
      <Html position={[1.55 * s, 0.75, 0.55 * s]} center zIndexRange={[20, 10]}>
        <div
          onPointerDown={powers.wall > 0 ? toggle('wall') : undefined}
          style={{
            ...chipBase,
            background: wl.bg,
            color: wl.fg,
            borderColor: wl.border,
            boxShadow: armed.wall ? `0 0 0 3px ${wl.border}` : 'none',
            opacity: powers.wall > 0 ? 1 : 0.35,
            transform: `skewX(-16deg) scale(${armed.wall ? 1.12 : 1})`,
          }}
        >
          <span style={{ display: 'inline-block', transform: 'skewX(16deg)' }}>WALL ×{powers.wall}</span>
        </div>
      </Html>
    </>
  )
}

/** Five diamonds under the piece that fill with shot power while aiming. */
function PowerPips({ power, theme, flip }: { power: number; theme: FieldTheme; flip: boolean }) {
  const lit = Math.ceil(power * 5 - 0.001)
  const on = theme.day ? '#ff5a2e' : theme.ring
  const off = theme.day ? 'rgba(16,33,58,.25)' : 'rgba(255,255,255,.25)'
  return (
    <Html position={[0, 0.2, 1.25 * (flip ? -1 : 1)]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
      <div style={{ display: 'flex', gap: 7 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ width: 12, height: 12, transform: 'rotate(45deg)', background: i < lit ? on : off }} />
        ))}
      </div>
    </Html>
  )
}
