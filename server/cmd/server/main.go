package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"soccer2/server/internal/game"
	"soccer2/server/internal/server"
)

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	botWait := flag.Duration("bot-wait", 12*time.Second, "time an online player waits for a human before a bot joins")
	origins := flag.String("origins", "localhost:*,127.0.0.1:*", "comma-separated allowed websocket origins")
	static := flag.String("static", "../client/dist", "built client to serve (skipped if missing)")
	flag.Parse()

	cfg := game.DefaultConfig()
	srv := server.New(server.Options{
		Config:         cfg,
		BotFallback:    *botWait,
		OriginPatterns: strings.Split(*origins, ","),
	})

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", srv.HandleWS)
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"field": cfg.Field, "pieces": len(cfg.Formation), "skins": game.DefaultSkins})
	})
	if st, err := os.Stat(*static); err == nil && st.IsDir() {
		mux.Handle("/", http.FileServer(http.Dir(*static)))
		log.Printf("serving client from %s", *static)
	}

	log.Printf("Button Brawl server listening on %s", *addr)
	log.Fatal(http.ListenAndServe(*addr, mux))
}
