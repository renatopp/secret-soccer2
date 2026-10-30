package game

import "time"

// FieldConfig is the playable geometry. Units match the client scene
// (1 unit = 1 Three.js unit). Team 0 defends -Y and attacks +Y.
type FieldConfig struct {
	Width       float64 `json:"width"`
	Length      float64 `json:"length"`
	GoalWidth   float64 `json:"goalWidth"`
	GoalDepth   float64 `json:"goalDepth"`
	PostRadius  float64 `json:"postRadius"`
	PieceRadius float64 `json:"pieceRadius"`
	BallRadius  float64 `json:"ballRadius"`
	WallRadius  float64 `json:"wallRadius"`
}

type BodyParams struct {
	Mass       float64
	Drag       float64
	MinImpulse float64
	MaxImpulse float64
}

type Config struct {
	Field FieldConfig

	MatchSeconds    float64
	OvertimeSeconds float64
	TurnSeconds     float64

	StartDelay     time.Duration
	GoalDelay      time.Duration
	ResolvePadding time.Duration
	BotDelayMin    time.Duration
	BotDelayMax    time.Duration

	Piece BodyParams
	Ball  BodyParams

	BodyRestitution float64
	WallRestitution float64
	StopSpeed       float64
	MaxShotSeconds  float64
	AfterGoalSecs   float64

	SuperKickMultiplier float64
	SuperKickCharges    int
	WallCharges         int
	// Distance from the defended goal line to the Wall barrier center.
	WallDistance float64

	// Kickoff formation for team 0, in field coordinates (y < 0).
	// Team 1 uses the point-mirrored positions.
	Formation []Vec
}

// DefaultConfig mirrors the old Unity tuning (mass/drag/impulse, 90s match,
// 30s overtime, 15s turns) on the 10x15 pitch from the visual direction.
func DefaultConfig() Config {
	const w, l = 10.0, 15.0
	// Percent positions taken from the "4d" mock (x%, y% from the top).
	pct := func(x, y float64) Vec { return Vec{(x/100 - .5) * w, -(y/100 - .5) * l} }
	return Config{
		Field: FieldConfig{
			Width: w, Length: l, GoalWidth: 3, GoalDepth: .8, PostRadius: .06,
			PieceRadius: .46, BallRadius: .2, WallRadius: .88,
		},
		MatchSeconds:    90,
		OvertimeSeconds: 30,
		TurnSeconds:     15,

		StartDelay:     2500 * time.Millisecond,
		GoalDelay:      2800 * time.Millisecond,
		ResolvePadding: 450 * time.Millisecond,
		BotDelayMin:    700 * time.Millisecond,
		BotDelayMax:    1900 * time.Millisecond,

		Piece: BodyParams{Mass: 2, Drag: 4.5, MinImpulse: 10, MaxImpulse: 60},
		Ball:  BodyParams{Mass: .8, Drag: 2.25},

		BodyRestitution: .88,
		WallRestitution: .62,
		StopSpeed:       .05,
		MaxShotSeconds:  9,
		AfterGoalSecs:   .7,

		SuperKickMultiplier: 1.5,
		SuperKickCharges:    2,
		WallCharges:         1,
		WallDistance:        1.9,

		Formation: []Vec{
			pct(50, 93), // keeper
			pct(28, 80),
			pct(72, 80),
			pct(36, 63),
			pct(64, 63),
		},
	}
}
