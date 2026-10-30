import { useEffect, useMemo } from 'react'
import { GameView, type SceneData } from './game/GameView'
import { connect } from './net/socket'
import type { TeamInfo } from './net/protocol'
import { useGame } from './state/store'
import { DEFAULT_FIELD, TEAM_PRESETS, defaultFormation, resolveTheme } from './theme/themes'
import { BannerView, EndScreen, Hud } from './ui/Hud'
import { Menu, Queue } from './ui/Menu'

export function App() {
  const screen = useGame((s) => s.screen)
  const profile = useGame((s) => s.profile)
  const theme = useMemo(() => resolveTheme(profile.fieldTheme, profile.fieldOverrides), [profile.fieldTheme, profile.fieldOverrides])

  useEffect(connect, [])

  return (
    <div className={`app ${theme.day ? 'day' : 'night'}`}>
      {screen === 'game' ? <Match theme={theme} /> : <Preview theme={theme} />}
      {screen === 'menu' && <Menu />}
      {screen === 'queue' && <Queue />}
    </div>
  )
}

/** Menu background: your customized team lined up against a rival preset. */
function Preview({ theme }: { theme: ReturnType<typeof resolveTheme> }) {
  const team = useGame((s) => s.profile.team)
  const data = useMemo<SceneData>(() => {
    const rival = TEAM_PRESETS.find((p) => p.primary !== team.primary) ?? TEAM_PRESETS[1]
    const teams: [TeamInfo, TeamInfo] = [
      { skin: team, bot: false },
      { skin: rival, bot: true },
    ]
    return {
      field: DEFAULT_FIELD,
      teams,
      you: 0,
      pieces: defaultFormation(DEFAULT_FIELD),
      ball: { x: 0, y: 0 },
      wall: null,
      score: [0, 0],
      powers: { superKick: 0, wall: 0 },
      highlightTeam: 0,
      canShoot: false,
    }
  }, [team])
  return <GameView theme={theme} data={data} preview />
}

function Match({ theme }: { theme: ReturnType<typeof resolveTheme> }) {
  const { field, teams, you, snap, end } = useGame()
  if (!field || !teams || !snap) return null

  const data: SceneData = {
    field,
    teams,
    you,
    pieces: snap.pieces,
    ball: snap.ball,
    wall: snap.wall,
    score: snap.score,
    powers: snap.powers[you],
    highlightTeam: snap.phase === 'aiming' ? snap.turn : null,
    canShoot: !end && snap.phase === 'aiming' && snap.turn === you,
  }

  return (
    <>
      <GameView theme={theme} data={data} />
      <Hud theme={theme} />
      <BannerView />
      <EndScreen />
    </>
  )
}
