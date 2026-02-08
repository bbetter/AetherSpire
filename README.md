# AetherSpire

Cooperative multiplayer airship survival game. 1-4 players work together to keep a steampunk airship stable for 7 minutes by fixing spawning issues across two layers (main deck and cargo hold).

## Quick Start

```bash
npm install
npm run build
npm run dev          # server :8080 + client :5173
```

Open `http://localhost:5173` in your browser. Create a room, share the code, and start the game.

## Project Structure

```
aether-spire/
  shared/            Types, constants, map loader (no runtime deps)
  server/            Express + WebSocket game server
  client/            Pixi.js v8 browser client (Vite)
  docs/              Design documents and architecture
```

See [docs/architecture.md](docs/architecture.md) for detailed architecture documentation.

## Scripts

| Command            | Description                        |
|--------------------|------------------------------------|
| `npm run dev`      | Start server + client in dev mode  |
| `npm run build`    | Build shared -> server -> client   |
| `npm test`         | Run all tests (Vitest)             |
| `npm run test:watch` | Run tests in watch mode          |

## Game Rules

- **Goal**: Survive 7 minutes with stability above 0%
- **Issues**: Spawn continuously across deck and cargo hold, deal accelerating damage if unfixed
- **Fixing**: Walk to an issue, press E, choose manual fix or use a matching tool (faster)
- **Tools**: Shared team inventory (max 3), tools spawn on the ground and are consumed on use
- **Layers**: Main deck and cargo hold connected by 2 hatches (press E to transition)
- **Scoring**: `issuesFixed * 2 + timeSurvived + finalStability` — 5 stars at 500+

## Tech Stack

- **Server**: Node.js, Express 5, ws (WebSocket)
- **Client**: Pixi.js v8, Vite 5, Web Audio API (synthesized SFX)
- **Shared**: TypeScript types and constants
- **Tests**: Vitest
