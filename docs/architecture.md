# Architecture

## Monorepo Layout

Three npm workspaces sharing a root `package.json`:

- **shared/** (`@aether-spire/shared`) — Types (`GameState`, `Issue`, `PlayerState`, all message interfaces), constants (`SPAWN_ZONES`, `HATCH_DEFINITIONS`, `CORE_POS`), `validateMapLayout`. No runtime dependencies. Uses `moduleResolution: "Bundler"`.

- **server/** (`@aether-spire/server`) — Express HTTP + WebSocket server. Uses `moduleResolution: "NodeNext"` (requires `.js` import extensions). Dependencies: `express`, `ws`, `@aether-spire/shared`.

- **client/** (`@aether-spire/client`) — Pixi.js v8 browser app bundled by Vite. Uses `moduleResolution: "Bundler"`. Dependencies: `pixi.js`, `@aether-spire/shared`.

Build order: `shared` -> `server` -> `client` (each workspace depends on prior).

## Server Modules

```
server/src/
  index.ts              Express server setup, HTTP + WS on port 8080
  match/
    state.ts            MatchRuntime, createMatch, tickMatch (1s game loop)
    issues.ts           ISSUE_DEFINITIONS, spawnIssue, damage calculation
  room/
    manager.ts          Room creation/joining, lobby management, game start
  net/
    ws.ts               WebSocket message handlers (12+ message types)
```

### Key Server Types

- **MatchRuntime** — Holds `GameState`, seeded RNG, fix progress map, spawn timers
- **FixProgress** — Tracks a player's active fix (player ID, issue ID, start time, duration)

## Client Modules

```
client/src/
  main.ts               Game loop, WASD movement, E interaction, input handling
  game/
    render.ts           Pixi.js world rendering, UI panels, minimap, layer system
    sfx.ts              Synthesized sound effects (Web Audio API oscillators + noise)
    utils.ts            Pure utility functions (colorFromId, getAreaName, collision)
  net/
    ws.ts               WebSocket client wrapper with typed send methods
```

## Data Flow

```
Client                          Server
------                          ------
WASD input
  -> sendMove(x, y)    ------> ws.ts: updates PlayerState map
                                -> broadcastPlayers()
  <- "players" msg      <------

E interact
  -> sendStartFix()    ------> ws.ts: validates range + layer + tool
                                -> sets issue status, fixProgress
                                -> broadcastSnapshot()
  <- "snapshot" msg     <------

Every 1s (server tick):
                                tickMatch(runtime):
                                  1. spawnIssues (60% deck, 40% cargo)
                                  2. applyIssueDamage (accelerating)
                                  3. checkFixCompletions
                                  4. maybeSpawnInstrument (70% deck, 30% cargo)
                                  5. updatePhase
                                  6. checkLose (stability <= 0)
                                  7. decrementTime
                                  8. checkWin (time expired, stability > 0)
                                -> broadcastSnapshot()
  <- "snapshot" msg     <------
```

## Game State Model

```
GameState {
  matchId, seed
  stability: 0-100          Single health bar
  timeRemainingSec: 420->0   7-minute countdown
  phase: early|mid|crisis|final
  issues: Issue[]            Active/in-progress problems on the ship
  teamInventory: tool[]      Shared consumable tools (max 3)
  groundInstruments: []      Pickupable tools on the map
  hatches: HatchDef[]        Layer transition points
  issuesFixed: number        Score counter
  gameOver, won              End-state flags
}
```

## Issue Lifecycle

```
spawn -> active -> (player presses E) -> in_progress -> fixed -> removed
                \                                    /
                 damage escalates every 5s while active
```

Damage brackets (per second): 0-10s: 0.4, 10-15s: 0.16, 15-20s: 0.32, 20-25s: 0.48, 25-30s: 0.64, 30s+: 0.8

Six issue types, each requiring a specific tool for faster fixing:
- pressure_surge, friction_fire -> thermal_regulator
- coolant_leak, mechanical_drift -> gear_wrench
- capacitor_overload, control_corruption -> arcane_conduit

## Layer System

Two layers: **deck** (main playable area) and **cargo** (below-deck hold).

- Connected by 2 hatches: fore (y~780/875) and aft (y~1580/1525)
- Players, issues, and tools all belong to a specific layer
- Transition: press E near hatch -> server validates -> 300ms fade out -> swap layer -> 300ms fade in
- Issue spawning: 60% deck, 40% cargo. Tool spawning: 70% deck, 30% cargo
- Minimap shows current layer only, with a layer card showing the other layer's status

## Phases

Game time is divided into phases that affect spawn patterns:

| Phase   | Time Remaining | Description                    |
|---------|----------------|--------------------------------|
| early   | > 5:00         | Gentle start, fewer issues     |
| mid     | 2:30 - 5:00    | Steady pressure                |
| crisis  | 0:30 - 2:30    | High spawn rate                |
| final   | < 0:30         | Last stand                     |

## Scoring

```
score = issuesFixed * 2 + timeSurvived + Math.round(finalStability)
stars: >= 500 -> 5, >= 400 -> 4, >= 300 -> 3, >= 150 -> 2, else -> 1
```

## Testing Strategy

Tests use Vitest with a workspace configuration (3 workspaces: server, shared, client).

- **Unit tests**: Pure functions in `issues.ts` (damage calc, spawn intervals), `state.ts` (RNG, phase lookup, scoring), `utils.ts` (collision, area names)
- **Integration tests**: `tickMatch` with fake timers to verify game loop behavior
- **Constants validation**: Shared `SPAWN_ZONES` and `HATCH_DEFINITIONS` integrity checks
- **Not tested**: Pixi.js rendering (`render.ts`), DOM interaction (`main.ts` game loop), WebSocket handlers (routing logic only — business logic tested via state/issues)

Run all tests: `npm test`
