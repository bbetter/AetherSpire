# Multi-Layer Level System Design

## Overview

Add a cargo hold layer below the main deck, accessible via two hatches (fore and aft). Each layer is a separate world with its own geometry, spawn zones, and doors. Issues spawn on both layers and all damage stability regardless of player location.

## Data Model

### New types (`shared/src/index.ts`)

```typescript
type LayerId = "deck" | "cargo";

interface HatchDef {
  id: string;           // e.g. "hatch-fore", "hatch-aft"
  layerA: LayerId;
  posA: { x: number; y: number };
  layerB: LayerId;
  posB: { x: number; y: number };
}
```

### Modified types

- `PlayerState` — add `layer: LayerId` (default `"deck"`)
- `Issue` — add `layer: LayerId`
- `ToolOnGround` — add `layer: LayerId`
- `GameState` — add `hatches: HatchDef[]`
- `SpawnZoneId` — add cargo zone IDs

### New messages

| Message | Direction | Fields |
|---|---|---|
| `ClientHatchMessage` | Client→Server | `type: "use_hatch"`, `matchId`, `hatchId`, `sentAt` |
| `ServerHatchMessage` | Server→Client | `type: "server_hatch"`, `playerId`, `hatchId`, `toLayer`, `toX`, `toY` |

## Cargo Hold Layout

Dimensions: ~1800x1200, centered on (1600, 1200). Smaller than main deck — industrial, darker palette.

### Rooms

```
  [Fore Storage ~500x400]
         |
  [-- Central Corridor ~600x150 --]
         |
  [Aft Storage ~500x400]
```

- **Fore Storage** — accessed from fore hatch. Crates, supplies.
- **Aft Storage** — accessed from aft hatch. Machinery, pipes.
- **Central Corridor** — narrow passage connecting the two rooms.

### Doors

- `door-fore-storage` — between corridor and fore storage
- `door-aft-storage` — between corridor and aft storage

### Hatch Placement

| Hatch | Main Deck Position | Cargo Hold Position |
|---|---|---|
| `hatch-fore` | Fore deck corridor (between bridge and hub) | Fore Storage room |
| `hatch-aft` | Aft deck corridor (between hub and engine) | Aft Storage room |

### Spawn Zones (5 total)

`cargo-fore-center`, `cargo-fore-back`, `cargo-corridor`, `cargo-aft-center`, `cargo-aft-back`

## Layer Transition (Client)

1. Player presses E within 60px of a hatch
2. Client sends `use_hatch` message to server
3. Server validates proximity + correct layer, updates player state
4. Server sends `server_hatch` to the player (and broadcasts updated position to others)
5. Client plays fade transition:
   - Fade to black: 300ms (alpha 0→1)
   - At full black: swap world container, reposition player, update `currentLayer`
   - Fade in: 300ms (alpha 1→0)

## Client Rendering

### World containers

Two Pixi `Container`s built at game start:
- `worldContainerDeck` — existing ship geometry
- `worldContainerCargo` — cargo hold geometry (darker tint, industrial colors)

Only the active layer's container is visible. Background (sky, stars, clouds) persists across transitions.

### Layer-aware functions

- `getWalls(layer)` — returns wall set for specified layer
- `getDoors(layer)` — returns door set for specified layer
- `isInsideHull(x, y, layer)` — hull boundary check for specified layer
- `getSpawnPoint(layer)` — spawn point for specified layer

### Fade overlay

Full-screen black `Graphics` rectangle on top of everything. Animated via requestAnimationFrame — no tween library needed.

### Minimap layer cards

- Minimap shows current layer only
- Below the minimap, stacked small "cards" for other layers
- Each card: labeled rectangle (e.g. "Cargo Hold")
- Red notification dot if unresolved issues exist on that layer
- Informational only — not interactive

## Server Changes

### Player layer tracking

- `PlayerState.layer` set to `"deck"` on join
- Updated on successful hatch use

### Layer-aware validation

All interaction handlers gain a layer check:
- `start_fix` — player and issue must share layer
- `cancel_fix` — same
- `pickup_tool` — player and tool must share layer
- `door` — player and door must share layer

### Issue spawning

- `spawnIssue` selects from all spawn zones across both layers
- Weighting: ~60% deck, ~40% cargo (configurable)
- All issues damage stability regardless of layer — ignoring cargo hold has consequences

### Movement broadcast

- Server broadcasts all player positions to all clients (no change)
- Client filters rendering by `entity.layer === currentLayer`
- Players on different layers are invisible (not dimmed)

## Files to Modify

### `shared/src/index.ts`
- Add `LayerId`, `HatchDef`
- Add `layer` field to `PlayerState`, `Issue`, `ToolOnGround`
- Add `hatches` to `GameState`
- Add `ClientHatchMessage`, `ServerHatchMessage`
- Add cargo spawn zone IDs

### `server/src/match/state.ts`
- Define hatch definitions
- Initialize `player.layer = "deck"` on join
- Weighted issue spawning across layers

### `server/src/match/issues.ts`
- `spawnIssue` picks from both layers' spawn zones

### `server/src/net/ws.ts`
- Add `use_hatch` handler
- Add layer checks to `start_fix`, `cancel_fix`, `pickup_tool`, `door`

### `client/src/game/render.ts`
- Extract deck building into `buildDeckLayer()`
- Add `buildCargoLayer()` with new geometry
- Layer-aware `getWalls()`, `getDoors()`, `isInsideHull()`
- Fade overlay and transition animation
- Minimap layer cards with notification dots

### `client/src/main.ts`
- Track `currentLayer: LayerId`
- Hatch interaction on E press
- `canMoveTo` uses current layer's walls/hull
- Filter visible issues, tools, players by layer
- Handle `server_hatch` message — trigger fade + container swap

### `client/src/net/ws.ts`
- Add `useHatch(hatchId)` send method
- Handle incoming `server_hatch` message

## Out of Scope

- Additional layers (observation deck, etc.)
- Layer-specific issue types
- Layer-specific ambient audio
