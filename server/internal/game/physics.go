package game

import "math"

type Vec struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

func (a Vec) Add(b Vec) Vec       { return Vec{a.X + b.X, a.Y + b.Y} }
func (a Vec) Sub(b Vec) Vec       { return Vec{a.X - b.X, a.Y - b.Y} }
func (a Vec) Scale(s float64) Vec { return Vec{a.X * s, a.Y * s} }
func (a Vec) Dot(b Vec) float64   { return a.X*b.X + a.Y*b.Y }
func (a Vec) Len() float64        { return math.Hypot(a.X, a.Y) }
func (a Vec) Dist(b Vec) float64  { return a.Sub(b).Len() }
func (a Vec) Norm() Vec {
	l := a.Len()
	if l == 0 {
		return Vec{}
	}
	return a.Scale(1 / l)
}

// Circle is a static obstacle (goal posts, Wall power).
type Circle struct {
	Pos Vec
	R   float64
}

type PieceState struct {
	ID   int     `json:"id"`
	Team int     `json:"team"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
}

func (p PieceState) Pos() Vec { return Vec{p.X, p.Y} }

type ShotResult struct {
	FPS      int         `json:"fps"`
	Frames   [][]float64 `json:"frames"`
	Goal     int         `json:"goal"` // team that scored, -1 if none
	Duration float64     `json:"duration"`

	Pieces []PieceState `json:"-"`
	Ball   Vec          `json:"-"`
}

const (
	frameHz  = 30
	stepHz   = 480
	subSteps = stepHz / frameHz
)

type body struct {
	pos, vel Vec
	r        float64
	invMass  float64
	drag     float64
	isBall   bool
}

// Simulate runs a whole shot to rest (or until shortly after a goal) and
// returns the sampled frames. Each frame is [ballX, ballY, p0X, p0Y, ...]
// following the order of pieces.
func Simulate(cfg Config, pieces []PieceState, ball Vec, shooter int, impulse Vec, obstacles []Circle) ShotResult {
	f := cfg.Field
	bodies := make([]*body, 0, len(pieces)+1)
	bodies = append(bodies, &body{pos: ball, r: f.BallRadius, invMass: 1 / cfg.Ball.Mass, drag: cfg.Ball.Drag, isBall: true})
	for _, p := range pieces {
		b := &body{pos: p.Pos(), r: f.PieceRadius, invMass: 1 / cfg.Piece.Mass, drag: cfg.Piece.Drag}
		if p.ID == shooter {
			b.vel = impulse.Scale(b.invMass)
		}
		bodies = append(bodies, b)
	}

	static := append([]Circle{}, obstacles...)
	hw, hl, gw2 := f.Width/2, f.Length/2, f.GoalWidth/2
	for _, sx := range []float64{-1, 1} {
		for _, sy := range []float64{-1, 1} {
			static = append(static, Circle{Vec{sx * gw2, sy * hl}, f.PostRadius})
		}
	}

	res := ShotResult{FPS: frameHz, Goal: -1}
	record := func() {
		fr := make([]float64, 0, len(bodies)*2)
		for _, b := range bodies {
			fr = append(fr, round3(b.pos.X), round3(b.pos.Y))
		}
		res.Frames = append(res.Frames, fr)
	}
	record()

	dt := 1.0 / stepHz
	maxFrames := int(cfg.MaxShotSeconds * frameHz)
	afterGoal := int(cfg.AfterGoalSecs * frameHz)
	goalFrame := -1
	for frame := 1; frame <= maxFrames; frame++ {
		for s := 0; s < subSteps; s++ {
			step(cfg, bodies, static, dt, hw, hl, gw2)
		}
		record()

		if res.Goal < 0 {
			by := bodies[0].pos.Y
			if by > hl+f.BallRadius {
				res.Goal, goalFrame = 0, frame
			} else if by < -hl-f.BallRadius {
				res.Goal, goalFrame = 1, frame
			}
		}
		if goalFrame >= 0 && frame-goalFrame >= afterGoal {
			break
		}
		if allStopped(bodies) {
			break
		}
	}

	res.Duration = float64(len(res.Frames)-1) / frameHz
	res.Ball = bodies[0].pos
	res.Pieces = make([]PieceState, len(pieces))
	for i, p := range pieces {
		p.X, p.Y = bodies[i+1].pos.X, bodies[i+1].pos.Y
		res.Pieces[i] = p
	}
	return res
}

func step(cfg Config, bodies []*body, static []Circle, dt, hw, hl, gw2 float64) {
	for _, b := range bodies {
		b.pos = b.pos.Add(b.vel.Scale(dt))
		// Same linear damping model as Box2D/Unity Rigidbody2D.drag.
		b.vel = b.vel.Scale(1 / (1 + dt*b.drag))
	}

	e := cfg.BodyRestitution
	for i := 0; i < len(bodies); i++ {
		a := bodies[i]
		for j := i + 1; j < len(bodies); j++ {
			collide(a, bodies[j], e)
		}
		for _, c := range static {
			collideStatic(a, c, cfg.WallRestitution)
		}
		bounds(cfg, a, hw, hl, gw2)
	}

	for _, b := range bodies {
		if b.vel.Len() < cfg.StopSpeed {
			b.vel = Vec{}
		}
	}
}

func collide(a, b *body, e float64) {
	d := b.pos.Sub(a.pos)
	dist := d.Len()
	overlap := a.r + b.r - dist
	if overlap <= 0 {
		return
	}
	n := Vec{1, 0}
	if dist > 1e-9 {
		n = d.Scale(1 / dist)
	}
	inv := a.invMass + b.invMass
	a.pos = a.pos.Sub(n.Scale(overlap * a.invMass / inv))
	b.pos = b.pos.Add(n.Scale(overlap * b.invMass / inv))

	vn := b.vel.Sub(a.vel).Dot(n)
	if vn >= 0 {
		return
	}
	j := -(1 + e) * vn / inv
	a.vel = a.vel.Sub(n.Scale(j * a.invMass))
	b.vel = b.vel.Add(n.Scale(j * b.invMass))
}

func collideStatic(b *body, c Circle, e float64) {
	d := b.pos.Sub(c.Pos)
	dist := d.Len()
	overlap := b.r + c.R - dist
	if overlap <= 0 {
		return
	}
	n := Vec{0, 1}
	if dist > 1e-9 {
		n = d.Scale(1 / dist)
	}
	b.pos = b.pos.Add(n.Scale(overlap))
	if vn := b.vel.Dot(n); vn < 0 {
		b.vel = b.vel.Sub(n.Scale((1 + e) * vn))
	}
}

// bounds keeps bodies on the pitch. Only the ball may enter the goals.
func bounds(cfg Config, b *body, hw, hl, gw2 float64) {
	e, r := cfg.WallRestitution, b.r
	if b.isBall && math.Abs(b.pos.Y) > hl {
		// Inside a goal box: side nets and back net.
		back := hl + cfg.Field.GoalDepth
		clampAxis(&b.pos.X, &b.vel.X, -gw2+r, gw2-r, e)
		clampAxis(&b.pos.Y, &b.vel.Y, -back+r, back-r, e)
		return
	}
	clampAxis(&b.pos.X, &b.vel.X, -hw+r, hw-r, e)
	if !b.isBall || math.Abs(b.pos.X) > gw2 {
		clampAxis(&b.pos.Y, &b.vel.Y, -hl+r, hl-r, e)
	}
}

func clampAxis(p, v *float64, lo, hi, e float64) {
	if *p < lo {
		*p = lo
		if *v < 0 {
			*v = -*v * e
		}
	} else if *p > hi {
		*p = hi
		if *v > 0 {
			*v = -*v * e
		}
	}
}

func allStopped(bodies []*body) bool {
	for _, b := range bodies {
		if b.vel.X != 0 || b.vel.Y != 0 {
			return false
		}
	}
	return true
}

func round3(v float64) float64 { return math.Round(v*1000) / 1000 }
