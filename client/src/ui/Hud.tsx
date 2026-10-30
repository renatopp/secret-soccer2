import { send } from '../net/socket'
import { liveClock, liveTurnLeft, useGame } from '../state/store'
import type { FieldTheme } from '../theme/themes'
import { queue } from './Menu'
import { useNow } from './useNow'

function mmss(s: number) {
  const t = Math.ceil(s)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** The only on-screen chrome in 4d: a scoreboard strip, top-left. Everything else is in-world. */
export function Hud({ theme }: { theme: FieldTheme }) {
  const now = useNow(200)
  const { snap, snapAt, teams, you, selected, shot } = useGame()
  if (!snap || !teams) return null

  const home = teams[0].skin
  const away = teams[1].skin
  const clock = liveClock(snap, snapAt, now)
  const myTurn = snap.turn === you
  const turnTeam = teams[snap.turn].skin

  let who = ''
  let what = ''
  if (snap.phase === 'starting') {
    who = 'GET'
    what = 'READY'
  } else if (snap.phase === 'aiming') {
    const perTeam = snap.pieces.length / 2
    who = myTurn && selected !== null ? teams[you].skin.pieces[selected % perTeam]?.name ?? 'YOU' : turnTeam.name
    what = `AIMING · ${Math.ceil(liveTurnLeft(snap, snapAt, now))}`
  } else if (snap.phase === 'resolving' && shot) {
    const perTeam = snap.pieces.length / 2
    who = teams[shot.team].skin.pieces[shot.piece % perTeam]?.name ?? ''
    what = shot.superKick ? 'SUPER KICK!' : 'SHOOTS'
  } else if (snap.phase === 'goal') {
    who = 'GOAL'
    what = teams[snap.lastGoal].skin.name
  }

  const leave = () => {
    if (!confirm('Sair da partida? Conta como derrota.')) return
    send({ t: 'leave' })
    useGame.getState().resetMatch()
  }

  return (
    <>
      <div className="hud">
        <span className="hud-line">
          {home.name} {snap.score[0]} – {snap.score[1]} {away.name} · {mmss(clock)}
          {snap.overtime && <b className="ot"> OT</b>}
        </span>
        <span className="hud-big">
          {who} <span style={{ color: theme.ring }}>{what}</span>
        </span>
      </div>
      <button className="leave" onClick={leave}>
        Sair
      </button>
      {snap.phase === 'aiming' && myTurn && <div className="hint">Arraste para trás a partir da peça · solte para chutar</div>}
    </>
  )
}

export function BannerView() {
  const banner = useGame((s) => s.banner)
  const now = useNow(100)
  if (!banner || now > banner.until) return null
  return (
    <div className="banner-wrap">
      <div className="banner" style={{ background: banner.color }}>
        <span>{banner.text}</span>
      </div>
      {banner.sub && <div className="banner-sub">{banner.sub}</div>}
    </div>
  )
}

export function EndScreen() {
  const { end, you, teams, lastMode, connected } = useGame()
  if (!end || !teams) return null
  const mine = end.score[you]
  const theirs = end.score[1 - you]
  let title = 'EMPATE'
  if (end.winner === you) title = 'VITÓRIA'
  else if (end.winner === 1 - you) title = 'DERROTA'
  const sub = end.reason === 'left' ? (end.winner === you ? 'O oponente saiu da partida' : 'Conexão perdida') : 'Fim de jogo'

  return (
    <div className="center-overlay dim">
      <div className="card end">
        <div className="eyebrow">{sub}</div>
        <div className="result" data-r={end.winner === you ? 'win' : end.winner === -1 ? 'draw' : 'loss'}>
          {title}
        </div>
        <div className="final">
          <span>{teams[you].skin.name}</span>
          <b>
            {mine} – {theirs}
          </b>
          <span>{teams[1 - you].skin.name}</span>
        </div>
        <div className="play">
          <button className="btn btn-primary" disabled={!connected} onClick={() => queue(lastMode)}>
            Jogar de novo
          </button>
          <button className="btn" onClick={() => useGame.getState().resetMatch()}>
            Menu
          </button>
        </div>
      </div>
    </div>
  )
}
