import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { FieldConfig, PieceState, Powers, TeamInfo, Vec, WallState } from '../net/protocol'
import { shotPlaying, useGame } from '../state/store'
import type { FieldTheme } from '../theme/themes'
import { Actors } from './Actors'
import { Arena } from './Arena'
import { scoreTexture, skyTexture } from './textures'
import { TurnControls } from './TurnControls'

export type SceneData = {
  field: FieldConfig
  teams: [TeamInfo, TeamInfo]
  you: number
  pieces: PieceState[]
  ball: Vec
  wall: WallState | null
  score: [number, number]
  powers: Powers
  /** Team whose pieces glow (whose turn it is). */
  highlightTeam: number | null
  /** Local player may aim and shoot. */
  canShoot: boolean
}

export function GameView({ theme, data, preview = false }: { theme: FieldTheme; data: SceneData; preview?: boolean }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 38, near: 0.1, far: 300, position: [0, 10.5, 15.5] }}
      gl={{ antialias: true, toneMappingExposure: 1.1 }}
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
    >
      <Scene theme={theme} data={data} preview={preview} />
    </Canvas>
  )
}

function Scene({ theme, data, preview }: { theme: FieldTheme; data: SceneData; preview: boolean }) {
  const { field, teams, you } = data
  const flip = you === 1
  const mine = teams[you].skin
  const theirs = teams[1 - you].skin

  return (
    <>
      <Backdrop theme={theme} />
      <CameraRig field={field} preview={preview} />
      <Lights theme={theme} />

      {/* Team-oriented world: your goal is always at the bottom of the screen. */}
      <group rotation-y={flip ? Math.PI : 0}>
        <Arena theme={theme} field={field} goalColors={[teams[0].skin.primary, teams[1].skin.primary]} />
        <Actors
          field={field}
          teams={teams}
          pieces={data.pieces}
          ball={data.ball}
          wall={data.wall}
          theme={theme}
          flip={flip}
          highlightTeam={data.highlightTeam}
        />
        {!preview && (
          <TurnControls field={field} theme={theme} you={you} pieces={data.pieces} powers={data.powers} active={data.canShoot} />
        )}
      </group>

      <PaintedScore
        field={field}
        mine={data.score[you]}
        theirs={data.score[1 - you]}
        mineColor={scoreColor(mine.primary, mine.border)}
        theirColor={scoreColor(theirs.primary, theirs.border)}
        alpha={theme.scoreAlpha}
      />

      <EffectComposer>
        <Bloom intensity={theme.day ? 0.35 : 0.8} luminanceThreshold={0.75} luminanceSmoothing={0.2} mipmapBlur />
        <Vignette offset={0.3} darkness={theme.day ? 0.25 : 0.55} />
      </EffectComposer>
    </>
  )
}

/** Dark team colors disappear on the turf; fall back to the border color. */
function scoreColor(primary: string, border: string) {
  const c = new THREE.Color(primary)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  return hsl.l < 0.25 ? border : primary
}

function Backdrop({ theme }: { theme: FieldTheme }) {
  const scene = useThree((s) => s.scene)
  const sky = useMemo(() => (theme.day ? skyTexture() : null), [theme.day])
  useEffect(() => {
    scene.background = sky ?? new THREE.Color(theme.bg)
    scene.fog = theme.fog ? new THREE.FogExp2(theme.bg, theme.fog) : null
  }, [scene, sky, theme.bg, theme.fog])
  return null
}

function Lights({ theme }: { theme: FieldTheme }) {
  return (
    <>
      {theme.day ? (
        <hemisphereLight args={['#dff2ff', '#5a7a50', 1.6]} />
      ) : (
        <hemisphereLight args={['#9aa8ff', '#141022', 1.1]} />
      )}
      <directionalLight
        color={theme.day ? '#fff4e0' : '#ffffff'}
        intensity={theme.day ? 2.4 : 1.7}
        position={[4, 14, 7]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-far={40}
        shadow-bias={-0.0005}
      />
    </>
  )
}

/**
 * High TV angle from behind your goal (the design's "broadcast" camera).
 * Widens the FOV on narrow screens so the whole pitch stays in view, and
 * shakes briefly on Super Kick shots.
 */
function CameraRig({ field, preview }: { field: FieldConfig; preview: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const look = useMemo(() => new THREE.Vector3(0, 0, 0.8), [])

  useEffect(() => {
    // 38° fits the 10x15 pitch on landscape screens; below ~1.3 aspect the sides start clipping.
    const aspect = size.width / size.height
    const base = 38 * (field.length / 15)
    const minAspect = 1.3
    const fov =
      aspect >= minAspect
        ? base
        : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) * (minAspect / aspect)))
    camera.fov = Math.min(75, fov)
    camera.updateProjectionMatrix()
  }, [camera, size, field.length])

  useFrame(({ clock }) => {
    const { shot } = useGame.getState()
    let sx = 0
    let sy = 0
    if (preview) {
      // Slow drift so the menu feels alive.
      sx = Math.sin(clock.elapsedTime * 0.25) * 1.2
    } else if (shot?.superKick && shotPlaying(shot)) {
      const t = (performance.now() - shot.startedAt) / 1000
      const amp = Math.max(0, 0.18 - t * 0.3)
      sx = (Math.random() - 0.5) * amp
      sy = (Math.random() - 0.5) * amp
    }
    camera.position.set(sx, 10.5 + sy, 15.5)
    camera.lookAt(look)
  })
  return null
}

function PaintedScore(props: { field: FieldConfig; mine: number; theirs: number; mineColor: string; theirColor: string; alpha: number }) {
  const { field, mine, theirs, mineColor, theirColor, alpha } = props
  const tex = useMemo(() => scoreTexture(mine, theirs, mineColor, theirColor, alpha), [mine, theirs, mineColor, theirColor, alpha])
  const w = field.width
  const h = (w * 420) / 1024
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, -field.length * 0.16]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  )
}
