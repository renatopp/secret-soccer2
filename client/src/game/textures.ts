import * as THREE from 'three'
import type { FieldConfig } from '../net/protocol'
import type { FieldTheme } from '../theme/themes'

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

export function toTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

const FONT = "'Barlow SC', sans-serif"

export function pitchTexture(theme: FieldTheme, f: FieldConfig) {
  const W = 1024
  const H = Math.round((W * f.length) / f.width)
  const [c, x] = canvas(W, H)
  const px = W / f.width
  const bands = 10
  for (let i = 0; i < bands; i++) {
    x.fillStyle = i % 2 ? theme.pA : theme.pB
    x.fillRect(0, (i * H) / bands, W, H / bands + 1)
  }
  x.strokeStyle = theme.line
  x.globalAlpha = 0.85
  x.lineWidth = 8
  const m = 4
  x.strokeRect(m, m, W - 2 * m, H - 2 * m)
  x.beginPath()
  x.moveTo(m, H / 2)
  x.lineTo(W - m, H / 2)
  x.stroke()
  x.beginPath()
  x.arc(W / 2, H / 2, 1.4 * px, 0, Math.PI * 2)
  x.stroke()
  x.beginPath()
  x.arc(W / 2, H / 2, 10, 0, Math.PI * 2)
  x.fillStyle = theme.line
  x.fill()
  const pbw = 5.6 * px
  const pbd = 2.4 * px
  const gbw = 2.8 * px
  const gbd = 1 * px
  x.strokeRect(W / 2 - pbw / 2, m, pbw, pbd)
  x.strokeRect(W / 2 - pbw / 2, H - m - pbd, pbw, pbd)
  x.strokeRect(W / 2 - gbw / 2, m, gbw, gbd)
  x.strokeRect(W / 2 - gbw / 2, H - m - gbd, gbw, gbd)
  return toTexture(c)
}

/** Score painted on the turf (4d): your number left, rival's right. */
export function scoreTexture(mine: number, theirs: number, mineColor: string, theirColor: string, alpha: number) {
  const [c, x] = canvas(1024, 420)
  x.font = `700 400px ${FONT}`
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.globalAlpha = alpha
  x.fillStyle = mineColor
  x.fillText(String(mine), 300, 230)
  x.fillStyle = theirColor
  x.fillText(String(theirs), 724, 230)
  return toTexture(c)
}

/** Top cap of a piece, rotated to match CylinderGeometry cap UVs. */
export function pieceTopTexture(fill: string, ring: string, label: string, fg: string) {
  const [c, x] = canvas(256, 256)
  x.fillStyle = fill
  x.fillRect(0, 0, 256, 256)
  x.beginPath()
  x.arc(128, 128, 116, 0, Math.PI * 2)
  x.lineWidth = 16
  x.strokeStyle = ring
  x.stroke()
  x.font = `700 ${label.length > 2 ? 78 : 96}px ${FONT}`
  x.fillStyle = fg
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.fillText(label, 128, 134)
  const t = toTexture(c)
  t.center.set(0.5, 0.5)
  t.rotation = Math.PI / 2
  return t
}

let glow: THREE.Texture | null = null
export function glowTexture() {
  if (glow) return glow
  const [c, x] = canvas(256, 256)
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.4, 'rgba(255,255,255,.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g
  x.fillRect(0, 0, 256, 256)
  glow = toTexture(c)
  return glow
}

let aim: THREE.Texture | null = null
export function aimTexture() {
  if (aim) return aim
  const [c, x] = canvas(64, 512)
  const g = x.createLinearGradient(0, 512, 0, 0)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.3, 'rgba(255,176,32,1)')
  g.addColorStop(0.75, 'rgba(255,59,59,.9)')
  g.addColorStop(1, 'rgba(255,59,59,0)')
  x.fillStyle = g
  x.beginPath()
  x.moveTo(22, 512)
  x.lineTo(42, 512)
  x.lineTo(64, 0)
  x.lineTo(0, 0)
  x.closePath()
  x.fill()
  aim = toTexture(c)
  return aim
}

let net: THREE.Texture | null = null
export function netTexture() {
  if (net) return net
  const [c, x] = canvas(128, 64)
  x.strokeStyle = 'rgba(255,255,255,.55)'
  x.lineWidth = 2
  for (let i = 0; i <= 128; i += 8) {
    x.beginPath()
    x.moveTo(i, 0)
    x.lineTo(i, 64)
    x.stroke()
  }
  for (let j = 0; j <= 64; j += 8) {
    x.beginPath()
    x.moveTo(0, j)
    x.lineTo(128, j)
    x.stroke()
  }
  net = toTexture(c)
  return net
}

export function skyTexture() {
  const [c, x] = canvas(4, 256)
  const g = x.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, '#5cbcff')
  g.addColorStop(0.6, '#cfeaff')
  g.addColorStop(1, '#ffffff')
  x.fillStyle = g
  x.fillRect(0, 0, 4, 256)
  return toTexture(c)
}
