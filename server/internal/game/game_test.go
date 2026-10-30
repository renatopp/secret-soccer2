package game

import (
	"encoding/json"
	"math"
	"sync"
	"testing"
	"time"
)

func TestStraightShotScores(t *testing.T) {
	cfg := DefaultConfig()
	// Piece right behind the ball, shooting at the +Y goal (team 0 attacks +Y).
	pieces := []PieceState{{ID: 0, Team: 0, X: 0, Y: 3}}
	res := Simulate(cfg, pieces, Vec{0, 4}, 0, Vec{0, cfg.Piece.MaxImpulse}, nil)
	if res.Goal != 0 {
		t.Fatalf("expected team 0 goal, got %d (ball %+v)", res.Goal, res.Ball)
	}
	if res.Ball.Y > cfg.Field.Length/2+cfg.Field.GoalDepth {
		t.Fatalf("ball went through the net: %+v", res.Ball)
	}
}

func TestShotStaysInBoundsAndStops(t *testing.T) {
	cfg := DefaultConfig()
	m := NewMatch("t", cfg, &Seat{}, &Seat{})
	f := cfg.Field
	for _, dir := range []Vec{{1, 0}, {-1, .3}, {.2, -1}, {.7, .7}} {
		res := Simulate(cfg, m.pieces, Vec{0, 0}, 3, dir.Norm().Scale(cfg.Piece.MaxImpulse*cfg.SuperKickMultiplier), nil)
		if res.Duration >= cfg.MaxShotSeconds {
			t.Errorf("dir %v: shot never settled", dir)
		}
		for _, p := range res.Pieces {
			if math.Abs(p.X) > f.Width/2 || math.Abs(p.Y) > f.Length/2 {
				t.Errorf("dir %v: piece %d out of bounds at %.2f,%.2f", dir, p.ID, p.X, p.Y)
			}
		}
		if len(res.Frames[0]) != 2+2*len(m.pieces) {
			t.Errorf("frame width %d", len(res.Frames[0]))
		}
	}
}

func TestWallBlocksShot(t *testing.T) {
	cfg := DefaultConfig()
	hl := cfg.Field.Length / 2
	pieces := []PieceState{{ID: 0, Team: 0, X: 0, Y: 3}}
	wall := []Circle{{Vec{0, hl - cfg.WallDistance}, cfg.Field.WallRadius}}
	res := Simulate(cfg, pieces, Vec{0, 4}, 0, Vec{0, cfg.Piece.MaxImpulse}, wall)
	if res.Goal >= 0 {
		t.Fatalf("wall should have blocked the straight shot")
	}
}

func TestSkinSanitize(t *testing.T) {
	in := &TeamSkin{Name: "  my very long team name here  ", Primary: "red", Border: "#ABCDEF",
		Pieces: []PieceSkin{{Label: "z<script>", Name: "x"}}}
	out := in.Sanitize(DefaultSkins[0], 5)
	if out.Primary != DefaultSkins[0].Primary || out.Border != "#abcdef" {
		t.Fatalf("colors not sanitized: %+v", out)
	}
	if len(out.Pieces) != 5 || out.Pieces[0].Label != "ZSC" || len([]rune(out.Name)) > 18 {
		t.Fatalf("bad sanitize: %+v", out)
	}
}

type recorder struct {
	mu   sync.Mutex
	msgs []map[string]any
}

func (r *recorder) Send(v any) {
	b, _ := json.Marshal(v)
	var m map[string]any
	json.Unmarshal(b, &m)
	r.mu.Lock()
	r.msgs = append(r.msgs, m)
	r.mu.Unlock()
}

func TestBotVsBotMatchFinishes(t *testing.T) {
	cfg := DefaultConfig()
	cfg.MatchSeconds, cfg.OvertimeSeconds = 1.5, .5
	cfg.StartDelay, cfg.GoalDelay, cfg.ResolvePadding = 0, 10*time.Millisecond, 0
	cfg.BotDelayMin, cfg.BotDelayMax = 0, time.Millisecond
	cfg.MaxShotSeconds = .5

	rec := &recorder{}
	home := &Seat{Skin: DefaultSkins[0], Out: rec, Bot: NewBot()}
	away := &Seat{Skin: DefaultSkins[1], Bot: NewBot()}
	m := NewMatch("bots", cfg, home, away)
	go m.Run()
	select {
	case <-m.Done():
	case <-time.After(10 * time.Second):
		t.Fatal("match did not finish")
	}

	rec.mu.Lock()
	defer rec.mu.Unlock()
	var shots int
	for _, msg := range rec.msgs {
		if msg["t"] == "shot" {
			shots++
		}
	}
	last := rec.msgs[len(rec.msgs)-1]
	if rec.msgs[0]["t"] != "match" || last["t"] != "end" || shots == 0 {
		t.Fatalf("unexpected flow: first=%v last=%v shots=%d", rec.msgs[0]["t"], last["t"], shots)
	}
}

func TestRejectsShotOutOfTurn(t *testing.T) {
	cfg := DefaultConfig()
	m := NewMatch("t", cfg, &Seat{}, &Seat{})
	now := time.Now()
	m.beginTurn(0, now, false)
	before := append([]PieceState(nil), m.pieces...)
	m.shoot(1, ClientMsg{T: "shoot", Piece: 5, DX: 0, DY: -1, Power: 1}, now)         // wrong team
	m.shoot(0, ClientMsg{T: "shoot", Piece: 5, DX: 0, DY: 1, Power: 1}, now)          // opponent's piece
	m.shoot(0, ClientMsg{T: "shoot", Piece: 0, DX: math.NaN(), DY: 1, Power: 1}, now) // garbage
	if m.phase != PhaseAiming {
		t.Fatalf("invalid shot was accepted, phase=%s", m.phase)
	}
	for i := range before {
		if before[i] != m.pieces[i] {
			t.Fatal("pieces moved")
		}
	}
}
