import { useState } from 'react'
import { send } from '../net/socket'
import type { PieceSkin, QueueMode, TeamSkin } from '../net/protocol'
import { useGame } from '../state/store'
import { FIELD_THEMES, TEAM_PRESETS, type FieldOverrides } from '../theme/themes'
import { useNow } from './useNow'

export function queue(mode: QueueMode) {
  send({ t: 'queue', mode, team: useGame.getState().profile.team })
}

export function Menu() {
  const connected = useGame((s) => s.connected)
  const [tab, setTab] = useState<'team' | 'field'>('team')

  return (
    <div className="menu">
      <div className="menu-left">
        <div className="eyebrow">Futebol de botão · arena diegética</div>
        <h1 className="brand">
          Button
          <br />
          Brawl
        </h1>
        <div className="play">
          <button className="btn btn-primary" disabled={!connected} onClick={() => queue('online')}>
            Jogar online
          </button>
          <button className="btn" disabled={!connected} onClick={() => queue('bot')}>
            Contra bot
          </button>
        </div>
        <div className={`status ${connected ? 'ok' : ''}`}>{connected ? 'Servidor conectado' : 'Conectando ao servidor…'}</div>
        <div className="howto">
          Arraste <b>para trás</b> a partir de uma peça sua para mirar e solte para chutar. Ative <b>SUPER KICK</b> ou <b>WALL</b> nos
          chips ao lado da peça antes de soltar.
        </div>
      </div>

      <div className="panel">
        <div className="tabs">
          <button className={tab === 'team' ? 'on' : ''} onClick={() => setTab('team')}>
            Time
          </button>
          <button className={tab === 'field' ? 'on' : ''} onClick={() => setTab('field')}>
            Campo
          </button>
        </div>
        {tab === 'team' ? <TeamEditor /> : <FieldEditor />}
      </div>
    </div>
  )
}

function TeamEditor() {
  const team = useGame((s) => s.profile.team)
  const setProfile = useGame((s) => s.setProfile)
  const update = (patch: Partial<TeamSkin>) => setProfile({ team: { ...team, ...patch } })
  const updatePiece = (i: number, patch: Partial<PieceSkin>) =>
    update({ pieces: team.pieces.map((p, j) => (j === i ? { ...p, ...patch } : p)) })

  return (
    <div className="editor">
      <div className="row presets">
        {TEAM_PRESETS.map((p) => (
          <button key={p.name} className="preset" onClick={() => update(structuredClone(p))} style={{ borderColor: p.border }}>
            <span className="dot" style={{ background: p.primary, borderColor: p.border }} />
            {p.name}
          </button>
        ))}
      </div>

      <label className="field">
        <span>Nome do time</span>
        <input value={team.name} maxLength={18} onChange={(e) => update({ name: e.target.value.toUpperCase() })} />
      </label>

      <div className="row">
        <Color label="Primária" value={team.primary} onChange={(primary) => update({ primary })} />
        <Color label="Borda" value={team.border} onChange={(border) => update({ border })} />
        <Color label="Texto" value={team.text} onChange={(text) => update({ text })} />
      </div>

      <div className="pieces">
        {team.pieces.map((p, i) => {
          const custom = !!p.primary
          return (
            <div className="piece-row" key={i}>
              <div
                className="disc"
                style={{ background: p.primary || team.primary, borderColor: p.border || team.border, color: team.text }}
              >
                {p.label}
              </div>
              <input
                className="label-in"
                value={p.label}
                maxLength={3}
                onChange={(e) => updatePiece(i, { label: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
              />
              <input className="name-in" value={p.name} maxLength={14} onChange={(e) => updatePiece(i, { name: e.target.value.toUpperCase() })} />
              <label className="check" title="Cor própria para esta peça">
                <input
                  type="checkbox"
                  checked={custom}
                  onChange={(e) =>
                    updatePiece(i, e.target.checked ? { primary: '#ff3b3b', border: '#fff3c4' } : { primary: undefined, border: undefined })
                  }
                />
                destaque
              </label>
              {custom && (
                <>
                  <input type="color" value={p.primary} onChange={(e) => updatePiece(i, { primary: e.target.value })} />
                  <input type="color" value={p.border || team.border} onChange={(e) => updatePiece(i, { border: e.target.value })} />
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FieldEditor() {
  const { fieldTheme, fieldOverrides } = useGame((s) => s.profile)
  const setProfile = useGame((s) => s.setProfile)
  const base = FIELD_THEMES.find((t) => t.id === fieldTheme) ?? FIELD_THEMES[0]
  const set = (patch: FieldOverrides) => setProfile({ fieldOverrides: { ...fieldOverrides, ...patch } })

  return (
    <div className="editor">
      <div className="themes">
        {FIELD_THEMES.map((t) => (
          <button
            key={t.id}
            className={`theme ${t.id === fieldTheme ? 'on' : ''}`}
            onClick={() => setProfile({ fieldTheme: t.id, fieldOverrides: {} })}
            style={{ background: `repeating-linear-gradient(0deg, ${t.pA} 0 14px, ${t.pB} 14px 28px)`, borderColor: t.line }}
          >
            <span style={{ background: t.bg }}>{t.name}</span>
          </button>
        ))}
      </div>
      <div className="row">
        <Color label="Gramado A" value={fieldOverrides.pA ?? base.pA} onChange={(pA) => set({ pA })} />
        <Color label="Gramado B" value={fieldOverrides.pB ?? base.pB} onChange={(pB) => set({ pB })} />
      </div>
      <div className="row">
        <Color label="Linhas" value={fieldOverrides.line ?? base.line} onChange={(line) => set({ line })} />
        <Color label="Borda" value={fieldOverrides.rim ?? base.rim} onChange={(rim) => set({ rim })} />
        <Color label="Anel / timer" value={fieldOverrides.ring ?? base.ring} onChange={(ring) => set({ ring })} />
      </div>
      <button className="btn btn-small" onClick={() => setProfile({ fieldOverrides: {} })}>
        Restaurar cores do tema
      </button>
      <p className="note">O campo é visual e local: cada jogador vê o seu tema. Dimensões e física vêm do servidor.</p>
    </div>
  )
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="color">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span>{label}</span>
    </label>
  )
}

export function Queue() {
  const q = useGame((s) => s.queue)
  const now = useNow(250)
  if (!q) return null
  const waited = (now - q.since) / 1000
  const left = Math.max(0, Math.ceil(q.botAfter - waited))
  return (
    <div className="center-overlay">
      <div className="card">
        <div className="eyebrow">{q.mode === 'online' ? 'Matchmaking' : 'Partida rápida'}</div>
        <div className="big">{q.mode === 'online' ? 'Procurando oponente…' : 'Preparando o bot…'}</div>
        {q.mode === 'online' && <div className="muted">Sem oponente em {left}s, um bot entra em campo.</div>}
        <button
          className="btn btn-small"
          onClick={() => {
            send({ t: 'cancel' })
            useGame.getState().resetMatch()
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
