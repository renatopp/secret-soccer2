# Button Brawl (soccer2)

Futebol de botão por turnos, multiplayer online com servidor autoritativo e bots.
Visual baseado na direção **4d · Diegetic Arena** do doc *Button Brawl – Visual Directions*
(HUD dentro do campo: anel = timer do turno, chips de poder flutuando ao lado da peça, placar pintado no gramado).

## Rodando

Pré-requisitos: Go 1.24+ e Node 20+.

```bash
# 1) Servidor (porta 8080)
cd server
go run ./cmd/server

# 2) Cliente em dev (porta 5173, faz proxy de /ws e /api para :8080)
cd client
npm install
npm run dev
```

Abra http://localhost:5173. Para testar o online, abra duas abas e clique **Jogar online** nas duas.
Se ninguém aparecer em 12s, um bot entra (`-bot-wait` muda isso).

Build de produção servido pelo próprio Go:

```bash
cd client && npm run build
cd ../server && go run ./cmd/server -static ../client/dist   # http://localhost:8080
```

Flags do servidor: `-addr :8080`, `-bot-wait 12s`, `-origins "localhost:*,127.0.0.1:*"`, `-static ../client/dist`.

Testes: `cd server && go test ./...` · Type-check do cliente: `cd client && npm run typecheck`.

## Arquitetura

```
server/                     Go — autoritativo
  cmd/server/main.go        HTTP + /ws + /api/config (+ arquivos estáticos)
  internal/game/
    config.go               regras e tuning (90s + 30s prorrogação, turno 15s, massa/drag/impulso do jogo antigo)
    physics.go              física 2D própria (discos, bola, traves, rede, Wall) — 480 Hz, amostrada a 30 fps
    match.go                máquina de estados da partida (uma goroutine por partida)
    bot.go                  bot geométrico (substitui o fuzzy do Unity)
    protocol.go             mensagens JSON + sanitização das skins
  internal/server/server.go websocket (coder/websocket), fila, fallback para bot
client/                     Vite + React + TypeScript
  src/game/                 React Three Fiber: Arena, peças/bola/Wall, HUD diegético, câmera broadcast
  src/state/store.ts        Zustand: estado recebido + playback das jogadas
  src/net/                  protocolo e socket
  src/ui/                   menu (customização), fila, placar, banners, fim de jogo
  src/theme/themes.ts       temas de campo e presets de time
```

### Fluxo de uma jogada

1. Cliente arrasta para trás a partir da peça → envia `shoot {piece, dx, dy, power, superKick, wall}`.
2. Servidor valida (turno, dono da peça, cargas de poder), **simula a jogada inteira** até tudo parar
   (ou um pouco depois do gol) e manda `shot` com todos os frames.
3. Os clientes só reproduzem os frames, interpolando. Não existe física no front nem sincronização de estado.
4. Depois da duração do replay, o servidor manda `state` (próximo turno, gol, prorrogação, fim).

Isso substitui todo o esquema do projeto Unity/Photon (ShadowObjects, ticks, SaveState/ApplyState, sync de relógio).

### Customização

- **Time** (vai para o servidor e o oponente vê): nome, cores primária/borda/texto, e por peça: sigla (até 3), nome e cor de destaque opcional. O servidor sanitiza tudo.
- **Campo** (visual e local): tema (Diegetic Night, Daylight Broadcast, Cyber Night) e cores do gramado, linhas, borda e anel.
  A geometria do campo vem do servidor (`FieldConfig`), então dá para mudar tamanho/gol em `config.go` sem tocar no cliente.

### Poderes

- **SUPER KICK** (2 por partida): impulso ×1.5 e tremida de câmera.
- **WALL** (1 por partida): barreira hexagonal na frente do seu gol, dura até a sua próxima vez de jogar.

Ative o chip antes de soltar o chute.
