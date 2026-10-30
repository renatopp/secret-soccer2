package game

import (
	"log"
	"math"
	"math/rand/v2"
	"time"
)

type Phase string

const (
	PhaseStarting  Phase = "starting"
	PhaseAiming    Phase = "aiming"
	PhaseResolving Phase = "resolving"
	PhaseGoal      Phase = "goal"
	PhaseFinished  Phase = "finished"
)

// Seat is one side of a match: a connected player or a bot.
type Seat struct {
	Skin TeamSkin
	Out  Sender // nil for bots
	Bot  *Bot
}

type input struct {
	team  int
	leave bool
	msg   ClientMsg
}

// Match is the authoritative game. All state is owned by the Run goroutine;
// other goroutines talk to it through Submit/Leave.
type Match struct {
	ID    string
	cfg   Config
	seats [2]*Seat
	inbox chan input
	done  chan struct{}
	// OnEnd runs on the match goroutine when the match finishes.
	OnEnd func(m *Match)

	phase     Phase
	phaseEnds time.Time
	turn      int
	round     int
	score     [2]int
	clock     float64
	overtime  bool
	turnLeft  float64
	pieces    []PieceState
	ball      Vec
	powers    [2]Powers
	wall      *WallState
	lastGoal  int
	pendGoal  int
	botShotAt time.Time
}

func NewMatch(id string, cfg Config, home, away *Seat) *Match {
	m := &Match{
		ID:       id,
		cfg:      cfg,
		seats:    [2]*Seat{home, away},
		inbox:    make(chan input, 32),
		done:     make(chan struct{}),
		clock:    cfg.MatchSeconds,
		turn:     rand.IntN(2),
		lastGoal: -1,
		pendGoal: -1,
	}
	for i := range m.powers {
		m.powers[i] = Powers{SuperKick: cfg.SuperKickCharges, Wall: cfg.WallCharges}
	}
	m.resetPositions()
	return m
}

func (m *Match) Done() <-chan struct{} { return m.done }

// Submit forwards a player's message to the match goroutine.
func (m *Match) Submit(team int, msg ClientMsg) {
	select {
	case m.inbox <- input{team: team, msg: msg}:
	case <-m.done:
	}
}

// Leave reports that a player disconnected or quit.
func (m *Match) Leave(team int) {
	select {
	case m.inbox <- input{team: team, leave: true}:
	case <-m.done:
	}
}

func (m *Match) Run() {
	defer close(m.done)

	for team, s := range m.seats {
		if s.Out == nil {
			continue
		}
		s.Out.Send(MatchMsg{
			T: "match", You: team, Field: m.cfg.Field,
			Teams: [2]TeamInfo{{m.seats[0].Skin, m.seats[0].Bot != nil}, {m.seats[1].Skin, m.seats[1].Bot != nil}},
			State: m.snapshot(time.Now()),
		})
	}
	m.setPhase(PhaseStarting, time.Now().Add(m.cfg.StartDelay))

	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()
	last := time.Now()
	for m.phase != PhaseFinished {
		select {
		case in := <-m.inbox:
			m.handle(in, time.Now())
		case now := <-ticker.C:
			dt := now.Sub(last).Seconds()
			last = now
			m.update(now, dt)
		}
	}
}

func (m *Match) handle(in input, now time.Time) {
	if in.leave {
		if m.phase != PhaseFinished {
			m.finish("left", 1-in.team)
		}
		return
	}
	switch in.msg.T {
	case "shoot":
		if m.seats[in.team].Bot == nil {
			m.shoot(in.team, in.msg, now)
		}
	case "leave":
		m.finish("left", 1-in.team)
	}
}

func (m *Match) update(now time.Time, dt float64) {
	switch m.phase {
	case PhaseStarting:
		if !now.Before(m.phaseEnds) {
			m.beginTurn(m.turn, now, false)
		}

	case PhaseAiming:
		m.clock -= dt
		m.turnLeft -= dt
		if m.clock <= 0 {
			m.clockExpired(now)
			return
		}
		if m.turnLeft <= 0 {
			m.beginTurn(1-m.turn, now, true)
			return
		}
		if bot := m.seats[m.turn].Bot; bot != nil && !now.Before(m.botShotAt) {
			m.shoot(m.turn, bot.Decide(m.cfg, m.view()), now)
		}

	case PhaseResolving:
		m.clock -= dt
		if now.Before(m.phaseEnds) {
			return
		}
		if m.pendGoal >= 0 {
			m.score[m.pendGoal]++
			m.lastGoal = m.pendGoal
			m.setPhase(PhaseGoal, now.Add(m.cfg.GoalDelay))
			return
		}
		if m.clock <= 0 {
			m.clockExpired(now)
			return
		}
		m.beginTurn(1-m.turn, now, true)

	case PhaseGoal:
		if now.Before(m.phaseEnds) {
			return
		}
		conceded := 1 - m.pendGoal
		m.pendGoal = -1
		m.wall = nil
		m.resetPositions()
		if m.clock <= 0 {
			m.turn = conceded
			m.clockExpired(now)
			return
		}
		m.beginTurn(conceded, now, true)
	}
}

func (m *Match) clockExpired(now time.Time) {
	if m.score[0] == m.score[1] && !m.overtime {
		m.overtime = true
		m.clock = m.cfg.OvertimeSeconds
		m.beginTurn(1-m.turn, now, true)
		return
	}
	winner := -1
	if m.score[0] > m.score[1] {
		winner = 0
	} else if m.score[1] > m.score[0] {
		winner = 1
	}
	m.finish("time", winner)
}

func (m *Match) beginTurn(team int, now time.Time, advance bool) {
	m.turn = team
	if advance {
		m.round++
	} else if m.round == 0 {
		m.round = 1
	}
	m.turnLeft = m.cfg.TurnSeconds
	// A Wall lasts through the opponent's shot and drops when its owner plays again.
	if m.wall != nil && m.wall.Team == team {
		m.wall = nil
	}
	if m.seats[team].Bot != nil {
		span := m.cfg.BotDelayMax - m.cfg.BotDelayMin
		d := m.cfg.BotDelayMin
		if span > 0 {
			d += time.Duration(rand.Int64N(int64(span)))
		}
		m.botShotAt = now.Add(d)
	}
	m.setPhase(PhaseAiming, time.Time{})
}

func (m *Match) shoot(team int, msg ClientMsg, now time.Time) {
	if m.phase != PhaseAiming || team != m.turn {
		return
	}
	shooter := -1
	for _, p := range m.pieces {
		if p.ID == msg.Piece && p.Team == team {
			shooter = p.ID
		}
	}
	dir := Vec{msg.DX, msg.DY}
	if shooter < 0 || !finite(msg.DX) || !finite(msg.DY) || !finite(msg.Power) || dir.Len() < 1e-6 {
		return
	}
	power := math.Max(0, math.Min(1, msg.Power))

	superKick := msg.SuperKick && m.powers[team].SuperKick > 0
	if superKick {
		m.powers[team].SuperKick--
	}
	useWall := msg.Wall && m.powers[team].Wall > 0
	if useWall {
		m.powers[team].Wall--
		m.wall = &WallState{Team: team, X: 0, Y: defendSign(team) * (m.cfg.Field.Length/2 - m.cfg.WallDistance), R: m.cfg.Field.WallRadius}
	}

	impulse := m.cfg.Piece.MinImpulse + (m.cfg.Piece.MaxImpulse-m.cfg.Piece.MinImpulse)*power
	if superKick {
		impulse *= m.cfg.SuperKickMultiplier
	}
	var obstacles []Circle
	if m.wall != nil {
		obstacles = append(obstacles, Circle{Vec{m.wall.X, m.wall.Y}, m.wall.R})
	}

	res := Simulate(m.cfg, m.pieces, m.ball, shooter, dir.Norm().Scale(impulse), obstacles)
	m.pieces, m.ball, m.pendGoal = res.Pieces, res.Ball, res.Goal

	m.broadcast(ShotMsg{T: "shot", Team: team, Piece: shooter, SuperKick: superKick, Wall: useWall, Barrier: m.wall, ShotResult: res})
	m.setPhase(PhaseResolving, now.Add(time.Duration(res.Duration*float64(time.Second))+m.cfg.ResolvePadding))
}

func (m *Match) finish(reason string, winner int) {
	m.phase = PhaseFinished
	// Release the players before they hear about it, so they can re-queue at once.
	if m.OnEnd != nil {
		m.OnEnd(m)
	}
	m.broadcast(EndMsg{T: "end", Score: m.score, Winner: winner, Reason: reason})
	log.Printf("match %s finished: %v (%s)", m.ID, m.score, reason)
}

func (m *Match) setPhase(p Phase, ends time.Time) {
	m.phase = p
	m.phaseEnds = ends
	// The shot message already carries everything clients need while resolving.
	if p != PhaseResolving {
		m.broadcast(StateMsg{T: "state", State: m.snapshot(time.Now())})
	}
}

func (m *Match) broadcast(v any) {
	for _, s := range m.seats {
		if s.Out != nil {
			s.Out.Send(v)
		}
	}
}

func (m *Match) snapshot(now time.Time) Snapshot {
	left := 0.0
	if !m.phaseEnds.IsZero() {
		left = math.Max(0, m.phaseEnds.Sub(now).Seconds())
	}
	return Snapshot{
		Phase: string(m.phase), Turn: m.turn, Round: m.round, Score: m.score,
		Clock: math.Max(0, m.clock), Overtime: m.overtime,
		TurnLeft: math.Max(0, m.turnLeft), TurnTotal: m.cfg.TurnSeconds, PhaseLeft: left,
		Pieces: append([]PieceState(nil), m.pieces...), Ball: m.ball,
		Powers: m.powers, Wall: m.wall, LastGoal: m.lastGoal,
	}
}

func (m *Match) view() BotView {
	return BotView{Team: m.turn, Pieces: m.pieces, Ball: m.ball, Powers: m.powers[m.turn], Wall: m.wall}
}

func (m *Match) resetPositions() {
	m.pieces = m.pieces[:0]
	n := len(m.cfg.Formation)
	for team := 0; team < 2; team++ {
		for i, p := range m.cfg.Formation {
			if team == 1 {
				p = Vec{-p.X, -p.Y}
			}
			m.pieces = append(m.pieces, PieceState{ID: team*n + i, Team: team, X: p.X, Y: p.Y})
		}
	}
	m.ball = Vec{}
}

// defendSign is the Y sign of the goal a team defends.
func defendSign(team int) float64 {
	if team == 0 {
		return -1
	}
	return 1
}

func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }
