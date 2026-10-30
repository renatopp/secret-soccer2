import { useGame } from '../state/store'
import type { ClientMsg, ServerMsg } from './protocol'

let ws: WebSocket | null = null
let retry = 0

function url() {
  const override = import.meta.env.VITE_WS_URL as string | undefined
  if (override) return override
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws`
}

export function connect() {
  if (ws && ws.readyState <= WebSocket.OPEN) return
  const sock = new WebSocket(url())
  ws = sock

  sock.onopen = () => {
    retry = 0
    useGame.getState().setConnected(true)
  }
  sock.onmessage = (ev) => {
    try {
      useGame.getState().receive(JSON.parse(ev.data) as ServerMsg)
    } catch (err) {
      console.error('bad server message', err)
    }
  }
  sock.onclose = () => {
    if (ws !== sock) return
    ws = null
    const s = useGame.getState()
    s.setConnected(false)
    // The server ends the match when a socket drops, so there is nothing to resume.
    if (s.screen === 'queue') s.resetMatch()
    if (s.screen === 'game' && !s.end && s.snap) {
      useGame.setState({ end: { t: 'end', score: s.snap.score, winner: -1, reason: 'left' } })
    }
    setTimeout(connect, Math.min(5000, 500 * 2 ** retry++))
  }
}

export function send(msg: ClientMsg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}
