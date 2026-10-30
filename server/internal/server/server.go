package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"

	"soccer2/server/internal/game"
)

type Options struct {
	Config game.Config
	// How long an online player waits for a human before getting a bot.
	BotFallback    time.Duration
	OriginPatterns []string
}

type Server struct {
	opts Options

	mu      sync.Mutex
	waiting *client
	timer   *time.Timer
	seq     atomic.Int64
}

func New(opts Options) *Server { return &Server{opts: opts} }

type client struct {
	srv  *Server
	conn *websocket.Conn
	out  chan []byte
	ctx  context.Context
	stop context.CancelFunc

	mu    sync.Mutex
	match *game.Match
	team  int
	skin  game.TeamSkin
}

func (c *client) Send(v any) {
	b, err := json.Marshal(v)
	if err != nil {
		log.Printf("marshal: %v", err)
		return
	}
	select {
	case c.out <- b:
	default:
		// Client is not keeping up; drop it rather than stall the match.
		c.stop()
	}
}

func (c *client) setMatch(m *game.Match, team int) {
	c.mu.Lock()
	c.match, c.team = m, team
	c.mu.Unlock()
}

func (c *client) current() (*game.Match, int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.match, c.team
}

// HandleWS upgrades the connection and runs the client's read/write loops.
func (s *Server) HandleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: s.opts.OriginPatterns})
	if err != nil {
		return
	}
	ctx, cancel := context.WithCancel(r.Context())
	c := &client{srv: s, conn: conn, out: make(chan []byte, 64), ctx: ctx, stop: cancel}
	defer func() {
		cancel()
		s.dequeue(c)
		if m, team := c.current(); m != nil {
			m.Leave(team)
		}
		conn.CloseNow()
	}()

	go c.writeLoop()
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return
		}
		var msg game.ClientMsg
		if err := json.Unmarshal(data, &msg); err != nil {
			c.Send(game.ErrorMsg{T: "error", Message: "bad message"})
			continue
		}
		s.route(c, msg)
	}
}

func (c *client) writeLoop() {
	ping := time.NewTicker(20 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-c.ctx.Done():
			return
		case b := <-c.out:
			wctx, cancel := context.WithTimeout(c.ctx, 5*time.Second)
			err := c.conn.Write(wctx, websocket.MessageText, b)
			cancel()
			if err != nil {
				c.stop()
				return
			}
		case <-ping.C:
			pctx, cancel := context.WithTimeout(c.ctx, 10*time.Second)
			err := c.conn.Ping(pctx)
			cancel()
			if err != nil {
				c.stop()
				return
			}
		}
	}
}

func (s *Server) route(c *client, msg game.ClientMsg) {
	switch msg.T {
	case "queue":
		if m, _ := c.current(); m != nil {
			c.Send(game.ErrorMsg{T: "error", Message: "already in a match"})
			return
		}
		c.skin = msg.Team.Sanitize(game.DefaultSkins[0], len(s.opts.Config.Formation))
		if msg.Mode == "bot" {
			s.dequeue(c)
			c.Send(game.QueuedMsg{T: "queued", Mode: "bot"})
			s.start(c, nil)
			return
		}
		s.enqueue(c)
	case "cancel":
		s.dequeue(c)
	case "shoot", "leave":
		if m, team := c.current(); m != nil {
			m.Submit(team, msg)
		}
	case "ping":
		c.Send(map[string]string{"t": "pong"})
	}
}

func (s *Server) enqueue(c *client) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.waiting != nil && s.waiting != c && s.waiting.ctx.Err() == nil {
		other := s.waiting
		s.clearWaitingLocked()
		go s.start(other, c)
		return
	}
	s.clearWaitingLocked()
	s.waiting = c
	c.Send(game.QueuedMsg{T: "queued", Mode: "online", BotAfter: s.opts.BotFallback.Seconds()})
	s.timer = time.AfterFunc(s.opts.BotFallback, func() {
		s.mu.Lock()
		if s.waiting != c {
			s.mu.Unlock()
			return
		}
		s.clearWaitingLocked()
		s.mu.Unlock()
		s.start(c, nil)
	})
}

func (s *Server) dequeue(c *client) {
	s.mu.Lock()
	if s.waiting == c {
		s.clearWaitingLocked()
	}
	s.mu.Unlock()
}

func (s *Server) clearWaitingLocked() {
	if s.timer != nil {
		s.timer.Stop()
		s.timer = nil
	}
	s.waiting = nil
}

// start creates a match. A nil away client means "play against a bot".
func (s *Server) start(home, away *client) {
	if home.ctx.Err() != nil {
		if away != nil {
			s.enqueue(away)
		}
		return
	}
	cfg := s.opts.Config
	homeSeat := &game.Seat{Skin: home.skin, Out: home}
	var awaySeat *game.Seat
	if away != nil {
		awaySeat = &game.Seat{Skin: away.skin, Out: away}
	} else {
		awaySeat = &game.Seat{Skin: botSkin(home.skin), Bot: game.NewBot()}
	}
	if awaySeat.Skin.Primary == homeSeat.Skin.Primary {
		// Keep teams readable when both players picked the same colors.
		awaySeat.Skin = botSkin(homeSeat.Skin)
		if away != nil {
			awaySeat.Skin.Name = away.skin.Name
		}
	}

	id := fmt.Sprintf("m%d", s.seq.Add(1))
	m := game.NewMatch(id, cfg, homeSeat, awaySeat)
	home.setMatch(m, 0)
	if away != nil {
		away.setMatch(m, 1)
	}
	m.OnEnd = func(*game.Match) {
		home.setMatch(nil, 0)
		if away != nil {
			away.setMatch(nil, 0)
		}
	}
	log.Printf("match %s started (bot=%v)", id, away == nil)
	go m.Run()
}

func botSkin(opponent game.TeamSkin) game.TeamSkin {
	n := len(opponent.Pieces)
	for _, s := range game.DefaultSkins {
		if s.Primary != opponent.Primary {
			return s.Sanitize(s, n)
		}
	}
	return game.DefaultSkins[1].Sanitize(game.DefaultSkins[1], n)
}
