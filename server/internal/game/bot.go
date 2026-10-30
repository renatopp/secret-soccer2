package game

import (
	"math"
	"math/rand/v2"
)

type BotView struct {
	Team   int
	Pieces []PieceState
	Ball   Vec
	Powers Powers
	Wall   *WallState
}

// Bot picks shots geometrically: hit the ball from behind so it travels
// towards the opponent goal, with some aim noise and occasional "mistakes"
// (the old fuzzy bot's ignoreClosestChance) so it stays beatable.
type Bot struct {
	AimNoiseDeg  float64
	MistakeRate  float64
	WallChance   float64
	SuperKickMin float64 // alignment needed to spend a Super Kick
}

func NewBot() *Bot {
	return &Bot{AimNoiseDeg: 5, MistakeRate: .15, WallChance: .35, SuperKickMin: .9}
}

func (b *Bot) Decide(cfg Config, v BotView) ClientMsg {
	f := cfg.Field
	attack := -defendSign(v.Team)
	goal := Vec{(rand.Float64() - .5) * f.GoalWidth * .6, attack * f.Length / 2}
	want := goal.Sub(v.Ball).Norm()
	contact := v.Ball.Sub(want.Scale(f.PieceRadius + f.BallRadius))

	type option struct {
		p     PieceState
		dir   Vec
		dist  float64
		align float64
		score float64
	}
	var best *option
	var mine []PieceState
	for _, p := range v.Pieces {
		if p.Team != v.Team {
			continue
		}
		mine = append(mine, p)
		to := contact.Sub(p.Pos())
		dist := to.Len()
		if dist < 1e-6 {
			continue
		}
		dir := to.Scale(1 / dist)
		align := dir.Dot(want)
		score := align*2 - dist*.12
		if blocked(v.Pieces, p, contact, f.PieceRadius) {
			score -= 1.5
		}
		o := option{p, dir, dist, align, score}
		if best == nil || o.score > best.score {
			best = &o
		}
	}
	if len(mine) == 0 {
		return ClientMsg{T: "shoot"}
	}

	if best == nil || best.align < .25 || rand.Float64() < b.MistakeRate {
		// No good angle: just smack the ball with the closest (or a random) piece.
		p := closest(mine, v.Ball)
		if rand.Float64() < b.MistakeRate {
			p = mine[rand.IntN(len(mine))]
		}
		to := v.Ball.Sub(p.Pos())
		best = &option{p: p, dir: to.Norm(), dist: to.Len(), align: 0}
	}

	noise := (rand.Float64()*2 - 1) * b.AimNoiseDeg * math.Pi / 180
	s, c := math.Sincos(noise)
	dir := Vec{best.dir.X*c - best.dir.Y*s, best.dir.X*s + best.dir.Y*c}

	power := math.Min(1, .45+best.dist/7+rand.Float64()*.15)
	ballToGoal := goal.Dist(v.Ball)
	superKick := v.Powers.SuperKick > 0 && best.align > b.SuperKickMin && ballToGoal < f.Length*.55
	if superKick {
		power = 1
	}
	ballInOwnHalf := v.Ball.Y*defendSign(v.Team) > 0
	useWall := v.Powers.Wall > 0 && v.Wall == nil && ballInOwnHalf && rand.Float64() < b.WallChance

	return ClientMsg{T: "shoot", Piece: best.p.ID, DX: dir.X, DY: dir.Y, Power: power, SuperKick: superKick, Wall: useWall}
}

func closest(ps []PieceState, to Vec) PieceState {
	best := ps[0]
	for _, p := range ps[1:] {
		if p.Pos().Dist(to) < best.Pos().Dist(to) {
			best = p
		}
	}
	return best
}

// blocked reports whether another piece sits on the path from p to target.
func blocked(all []PieceState, p PieceState, target Vec, r float64) bool {
	a, ab := p.Pos(), target.Sub(p.Pos())
	l2 := ab.Dot(ab)
	if l2 == 0 {
		return false
	}
	for _, o := range all {
		if o.ID == p.ID {
			continue
		}
		t := math.Max(0, math.Min(1, o.Pos().Sub(a).Dot(ab)/l2))
		if a.Add(ab.Scale(t)).Dist(o.Pos()) < r*2 {
			return true
		}
	}
	return false
}
