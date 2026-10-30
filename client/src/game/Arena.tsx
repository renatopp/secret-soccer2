import { useMemo } from 'react'
import * as THREE from 'three'
import type { FieldConfig } from '../net/protocol'
import type { FieldTheme } from '../theme/themes'
import { glowTexture, netTexture, pitchTexture } from './textures'

type Props = { theme: FieldTheme; field: FieldConfig; goalColors: [string, string] }

/** Pitch, rim walls, goals and stadium. Lives inside the team-oriented group: server (x, y) -> (x, 0, -y). */
export function Arena({ theme, field, goalColors }: Props) {
  const W = field.width
  const H = field.length
  const pitch = useMemo(() => pitchTexture(theme, field), [theme, field])

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={pitch} roughness={0.85} metalness={0} />
      </mesh>
      <Rims theme={theme} field={field} />
      {/* Team 0 defends -Y (z = +H/2), team 1 defends +Y. */}
      <Goal field={field} side={1} color={goalColors[0]} />
      <Goal field={field} side={-1} color={goalColors[1]} />
      <Stands theme={theme} field={field} />
      <Towers theme={theme} field={field} />
    </group>
  )
}

function Rims({ theme, field }: { theme: FieldTheme; field: FieldConfig }) {
  const W = field.width
  const H = field.length
  const gw = field.goalWidth
  const seg = (W - gw) / 2
  const walls: [number, number, number, number][] = [
    [0.22, H + 0.44, -W / 2 - 0.11, 0],
    [0.22, H + 0.44, W / 2 + 0.11, 0],
  ]
  for (const sz of [-1, 1]) {
    walls.push([seg, 0.22, -(gw / 2 + seg / 2), sz * (H / 2 + 0.11)])
    walls.push([seg, 0.22, gw / 2 + seg / 2, sz * (H / 2 + 0.11)])
  }
  return (
    <group>
      {walls.map(([w, d, x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position-y={0.16} castShadow>
            <boxGeometry args={[w, 0.32, d]} />
            <meshStandardMaterial color={theme.rimBase} roughness={0.6} />
          </mesh>
          <mesh position-y={0.3}>
            <boxGeometry args={[w + 0.01, 0.05, d + 0.01]} />
            <meshBasicMaterial color={theme.rim} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Goal({ field, side, color }: { field: FieldConfig; side: number; color: string }) {
  const gw = field.goalWidth
  const depth = field.goalDepth
  const z = side * (field.length / 2)
  const back = side * (field.length / 2 + depth)
  const mid = (z + back) / 2
  const net = netTexture()
  return (
    <group>
      {[-gw / 2, gw / 2].map((x) => (
        <mesh key={x} position={[x, 0.45, z]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 0.9, 12]} />
          <meshStandardMaterial color="#ffffff" emissive="#334455" roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 0.9, z]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.06, 0.06, gw, 12]} />
        <meshStandardMaterial color="#ffffff" emissive="#334455" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.45, back]}>
        <planeGeometry args={[gw, 0.9]} />
        <meshBasicMaterial map={net} transparent side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.9, mid]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[gw, depth]} />
        <meshBasicMaterial map={net} transparent side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * gw) / 2, 0.45, mid]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[depth, 0.9]} />
          <meshBasicMaterial map={net} transparent side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      <mesh position={[0, 0.02, mid]}>
        <boxGeometry args={[gw, 0.04, depth]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
    </group>
  )
}

function Stands({ theme, field }: { theme: FieldTheme; field: FieldConfig }) {
  const W = field.width
  const H = field.length
  const { boxes, crowd } = useMemo(() => {
    const boxes: { size: [number, number, number]; pos: [number, number, number] }[] = []
    const pts: number[] = []
    const cols: number[] = []
    const pal = theme.crowd.map((c) => new THREE.Color(c))
    // Deterministic jitter so the crowd doesn't reshuffle on every theme tweak.
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    const people = (cx: number, cz: number, lx: number, lz: number, y: number, n: number) => {
      for (let k = 0; k < n; k++) {
        const t = rnd() - 0.5
        pts.push(cx + t * lx, y + 0.1 + rnd() * 0.12, cz + t * lz)
        const c = pal[(rnd() * pal.length) | 0]
        const f = 0.5 + rnd() * 0.5
        cols.push(c.r * f, c.g * f, c.b * f)
      }
    }
    for (let i = 0; i < 8; i++) {
      const d = 1.3 + i * 0.75
      const y = 0.4 + i * 0.5
      const len = H + 3 + i * 1.5
      for (const s of [-1, 1]) {
        boxes.push({ size: [0.75, y, len], pos: [s * (W / 2 + d), y / 2, -0.4] })
        people(s * (W / 2 + d), -0.4, 0, len, y, 260)
      }
      const lenx = W + 2 * d + 0.75
      for (const s of [-1, 1]) {
        boxes.push({ size: [lenx, y, 0.75], pos: [0, y / 2, s * (H / 2 + d)] })
        people(0, s * (H / 2 + d), lenx, 0, y, 200)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
    return { boxes, crowd: g }
  }, [theme.crowd, W, H])

  return (
    <group>
      {boxes.map((b, i) => (
        <mesh key={i} position={b.pos} receiveShadow>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color={theme.stand} roughness={0.9} />
        </mesh>
      ))}
      <points geometry={crowd}>
        <pointsMaterial size={0.16} vertexColors />
      </points>
    </group>
  )
}

function Towers({ theme, field }: { theme: FieldTheme; field: FieldConfig }) {
  const spots: [number, number][] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]
  return (
    <group>
      {spots.map(([sx, sz]) => {
        const x = sx * (field.width / 2 + 7.5)
        const z = sz * (field.length / 2 + 3)
        return (
          <group key={`${sx}${sz}`}>
            <mesh position={[x, 5.5, z]}>
              <cylinderGeometry args={[0.15, 0.2, 11, 8]} />
              <meshStandardMaterial color={theme.day ? '#c9d4e2' : '#2a2650'} />
            </mesh>
            <mesh position={[x, 11, z]} rotation-y={Math.atan2(-x, -z)}>
              <boxGeometry args={[1.8, 0.8, 0.2]} />
              <meshBasicMaterial color="#fff6dd" toneMapped={false} />
            </mesh>
            <sprite position={[x, 11, z]} scale={[5, 5, 1]}>
              <spriteMaterial map={glowTexture()} color="#fff0cc" transparent blending={THREE.AdditiveBlending} depthWrite={false} />
            </sprite>
          </group>
        )
      })}
    </group>
  )
}
