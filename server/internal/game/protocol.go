package game

import (
	"regexp"
	"strings"
)

// ---- Client -> server ----

type ClientMsg struct {
	T string `json:"t"`

	// queue
	Mode string    `json:"mode,omitempty"` // "online" | "bot"
	Team *TeamSkin `json:"team,omitempty"`

	// shoot
	Piece     int     `json:"piece"`
	DX        float64 `json:"dx"`
	DY        float64 `json:"dy"`
	Power     float64 `json:"power"`
	SuperKick bool    `json:"superKick"`
	Wall      bool    `json:"wall"`
}

// ---- Customization ----

type PieceSkin struct {
	Label   string `json:"label"`
	Name    string `json:"name"`
	Primary string `json:"primary,omitempty"` // optional per-piece override
	Border  string `json:"border,omitempty"`
}

type TeamSkin struct {
	Name    string      `json:"name"`
	Primary string      `json:"primary"`
	Border  string      `json:"border"`
	Text    string      `json:"text"`
	Pieces  []PieceSkin `json:"pieces"`
}

var (
	hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	labelRe  = regexp.MustCompile(`[^A-Z0-9]`)
)

func cleanColor(c, def string) string {
	if hexColor.MatchString(c) {
		return strings.ToLower(c)
	}
	return def
}

func cleanText(s string, max int, def string) string {
	s = strings.TrimSpace(s)
	r := []rune(s)
	if len(r) > max {
		r = r[:max]
	}
	if len(r) == 0 {
		return def
	}
	return string(r)
}

// Sanitize makes any client-provided skin safe to broadcast.
func (t *TeamSkin) Sanitize(fallback TeamSkin, pieceCount int) TeamSkin {
	if t == nil {
		t = &fallback
	}
	out := TeamSkin{
		Name:    strings.ToUpper(cleanText(t.Name, 18, fallback.Name)),
		Primary: cleanColor(t.Primary, fallback.Primary),
		Border:  cleanColor(t.Border, fallback.Border),
		Text:    cleanColor(t.Text, fallback.Text),
	}
	for i := 0; i < pieceCount; i++ {
		var src, def PieceSkin
		if i < len(fallback.Pieces) {
			def = fallback.Pieces[i]
		}
		if i < len(t.Pieces) {
			src = t.Pieces[i]
		} else {
			src = def
		}
		label := labelRe.ReplaceAllString(strings.ToUpper(src.Label), "")
		if len(label) > 3 {
			label = label[:3]
		}
		if label == "" {
			label = def.Label
		}
		out.Pieces = append(out.Pieces, PieceSkin{
			Label:   label,
			Name:    strings.ToUpper(cleanText(src.Name, 14, def.Name)),
			Primary: cleanColor(src.Primary, ""),
			Border:  cleanColor(src.Border, ""),
		})
	}
	return out
}

var DefaultSkins = []TeamSkin{
	{Name: "RED BOLTS", Primary: "#2f6bff", Border: "#ffffff", Text: "#ffffff", Pieces: []PieceSkin{
		{Label: "OX", Name: "ONYX"}, {Label: "VT", Name: "VOLT"}, {Label: "NV", Name: "NOVA"},
		{Label: "BZ", Name: "BLAZE", Primary: "#ff3b3b", Border: "#fff3c4"},
		{Label: "BS", Name: "BASTION", Primary: "#1aa58a", Border: "#b6fff0"},
	}},
	{Name: "CRYSTAL FC", Primary: "#2a1030", Border: "#ff3b6b", Text: "#ff9bb5", Pieces: []PieceSkin{
		{Label: "GK", Name: "GRANITE"}, {Label: "RK", Name: "ROOK"}, {Label: "JX", Name: "JINX"},
		{Label: "ZP", Name: "ZAP"}, {Label: "KT", Name: "KITE"},
	}},
}

// ---- Server -> client ----

type Powers struct {
	SuperKick int `json:"superKick"`
	Wall      int `json:"wall"`
}

type WallState struct {
	Team int     `json:"team"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	R    float64 `json:"r"`
}

type TeamInfo struct {
	Skin TeamSkin `json:"skin"`
	Bot  bool     `json:"bot"`
}

type Snapshot struct {
	Phase     string       `json:"phase"`
	Turn      int          `json:"turn"`
	Round     int          `json:"round"`
	Score     [2]int       `json:"score"`
	Clock     float64      `json:"clock"`
	Overtime  bool         `json:"overtime"`
	TurnLeft  float64      `json:"turnLeft"`
	TurnTotal float64      `json:"turnTotal"`
	PhaseLeft float64      `json:"phaseLeft"`
	Pieces    []PieceState `json:"pieces"`
	Ball      Vec          `json:"ball"`
	Powers    [2]Powers    `json:"powers"`
	Wall      *WallState   `json:"wall"`
	LastGoal  int          `json:"lastGoal"`
}

type MatchMsg struct {
	T     string      `json:"t"` // "match"
	You   int         `json:"you"`
	Field FieldConfig `json:"field"`
	Teams [2]TeamInfo `json:"teams"`
	State Snapshot    `json:"state"`
}

type StateMsg struct {
	T     string   `json:"t"` // "state"
	State Snapshot `json:"state"`
}

type ShotMsg struct {
	T         string `json:"t"` // "shot"
	Team      int    `json:"team"`
	Piece     int    `json:"piece"`
	SuperKick bool   `json:"superKick"`
	Wall      bool   `json:"wall"`
	// Barrier active during this shot (just placed or still standing).
	Barrier *WallState `json:"barrier"`
	ShotResult
}

type EndMsg struct {
	T      string `json:"t"` // "end"
	Score  [2]int `json:"score"`
	Winner int    `json:"winner"` // -1 draw
	Reason string `json:"reason"` // "time" | "left"
}

type QueuedMsg struct {
	T        string  `json:"t"` // "queued"
	Mode     string  `json:"mode"`
	BotAfter float64 `json:"botAfter"`
}

type ErrorMsg struct {
	T       string `json:"t"` // "error"
	Message string `json:"message"`
}

// Sender delivers server messages to a connected player.
type Sender interface {
	Send(v any)
}
