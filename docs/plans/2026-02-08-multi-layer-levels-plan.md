# Multi-Layer Level System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a cargo hold layer below the main deck, accessible via two hatches, with issues spawning on both layers.

**Architecture:** Each layer is a separate world with its own coordinate grid, walls, floors, hull boundary, and spawn zones. The server tracks which layer each player/issue/tool belongs to. The client renders only the active layer and transitions between them with a fade effect.

**Tech Stack:** TypeScript, Pixi.js v8, Express, WebSocket

**Design doc:** `docs/plans/2026-02-08-multi-layer-levels-design.md`

---

### Task 1: Add shared types and constants

**Files:**
- Modify: `shared/src/index.ts`

**Step 1: Add LayerId type and HatchDef interface**

After the `Phase` type (line 11), add:

```typescript
export type LayerId = "deck" | "cargo";

export interface HatchDef {
  id: string;
  layerA: LayerId;
  posA: { x: number; y: number };
  layerB: LayerId;
  posB: { x: number; y: number };
}
```

**Step 2: Add `layer` field to existing interfaces**

In `Issue` (line 15), add after `y: number;`:
```typescript
  layer: LayerId;
```

In `GroundInstrument` (line 32), add after `y: number;`:
```typescript
  layer: LayerId;
```

In `PlayerState` (line 65), add after `y: number;`:
```typescript
  layer: LayerId;
```

**Step 3: Add `hatches` to GameState**

In `GameState` (line 42), add after `groundInstruments`:
```typescript
  hatches: HatchDef[];
```

**Step 4: Add SpawnZone `layer` field and cargo spawn zones**

In `SpawnZone` (line 79), add:
```typescript
  layer: LayerId;
```

Add `layer: "deck"` to every existing entry in `SPAWN_ZONES`.

After the last deck spawn zone, add cargo spawn zones:
```typescript
  // Cargo Hold
  { label: "cargo-fore-center", x: 1600, y: 950, layer: "cargo" },
  { label: "cargo-fore-back", x: 1600, y: 850, layer: "cargo" },
  { label: "cargo-corridor", x: 1600, y: 1200, layer: "cargo" },
  { label: "cargo-aft-center", x: 1600, y: 1450, layer: "cargo" },
  { label: "cargo-aft-back", x: 1600, y: 1550, layer: "cargo" },
```

Note: exact Y values will be refined in Task 5 when cargo geometry is built.

**Step 5: Add hatch-related messages**

After `ClientPingLocationMessage` (line 189), add:

```typescript
export interface ClientUseHatchMessage {
  type: "use_hatch";
  matchId: string;
  playerId: string;
  hatchId: string;
  sentAt: number;
}
```

Add `ClientUseHatchMessage` to the `ClientMessage` union type.

After `ServerPingLocationMessage` (line 290), add:

```typescript
export interface ServerHatchMessage {
  type: "server_hatch";
  playerId: string;
  hatchId: string;
  toLayer: LayerId;
  toX: number;
  toY: number;
}
```

Add `ServerHatchMessage` to the `ServerMessage` union type.

**Step 6: Add HATCH_DEFINITIONS constant**

After SPAWN_ZONES, add:

```typescript
export const HATCH_DEFINITIONS: HatchDef[] = [
  {
    id: "hatch-fore",
    layerA: "deck",
    posA: { x: 1600, y: 780 },  // Fore deck corridor
    layerB: "cargo",
    posB: { x: 1600, y: 950 },  // Fore Storage
  },
  {
    id: "hatch-aft",
    layerA: "deck",
    posA: { x: 1600, y: 1580 }, // Aft deck corridor
    layerB: "cargo",
    posB: { x: 1600, y: 1450 }, // Aft Storage
  },
];
```

**Step 7: Build shared**

Run: `npm run build -w shared`
Expected: compiles cleanly (server/client will have errors until updated)

**Step 8: Commit**

```bash
git add shared/src/index.ts
git commit -m "feat: add LayerId, HatchDef types and cargo spawn zones for multi-layer system"
```

---

### Task 2: Update server — issue spawning with layer awareness

**Files:**
- Modify: `server/src/match/issues.ts`
- Modify: `server/src/match/state.ts`

**Step 1: Update `spawnIssue` to accept and assign a layer**

In `server/src/match/issues.ts`, import `LayerId`:

```typescript
import type { Issue, IssueType, InstrumentType, Phase, LayerId } from "@aether-spire/shared";
```

Change the `spawnIssue` function signature to accept a `layer` parameter:

```typescript
export function spawnIssue(
  rng: () => number,
  now: number,
  phase: Phase = "early",
  playerCount: number = 1,
  layer: LayerId = "deck",
): Issue {
```

Filter `SPAWN_ZONES` by layer when picking a zone:

```typescript
  const layerZones = SPAWN_ZONES.filter(z => z.layer === layer);
  const zone = layerZones[Math.floor(rng() * layerZones.length)];
```

Add `layer` to the returned Issue object:

```typescript
    layer,
```

**Step 2: Update `state.ts` — weighted layer spawning**

In `server/src/match/state.ts`, import `LayerId` and `HATCH_DEFINITIONS`:

```typescript
import type { GameState, Phase, GroundInstrument, InstrumentType, LayerId } from "@aether-spire/shared";
import { SPAWN_ZONES, HATCH_DEFINITIONS } from "@aether-spire/shared";
```

In `createMatch`, add `hatches` to the initial state:

```typescript
    hatches: HATCH_DEFINITIONS,
```

Update `groundInstruments` initialization to add `layer: "deck"`:

```typescript
  const groundInstruments: GroundInstrument[] = INSTRUMENT_TYPES.map((type, i) => {
    const deckZones = SPAWN_ZONES.filter(z => z.layer === "deck");
    const zone = deckZones[Math.floor(rng() * deckZones.length)];
    return {
      id: `inst_init_${i}`,
      type,
      x: zone.x + (rng() - 0.5) * 40,
      y: zone.y + (rng() - 0.5) * 40,
      layer: "deck" as LayerId,
      spawnTime: now,
    };
  });
```

Update `spawnIssues` to pick a weighted random layer:

```typescript
function spawnIssues(runtime: MatchRuntime, now: number): void {
  const intervalSec = getSpawnIntervalSec(runtime.playerCount);
  const intervalMs = intervalSec * 1000;
  const elapsed = now - runtime.lastIssueSpawnAt;

  if (elapsed >= intervalMs) {
    // 60% deck, 40% cargo
    const layer: LayerId = runtime.rng() < 0.6 ? "deck" : "cargo";
    const issue = spawnIssue(runtime.rng, now, runtime.state.phase, runtime.playerCount, layer);
    runtime.state.issues.push(issue);
    runtime.lastIssueSpawnAt = now;
  }
}
```

Update `maybeSpawnInstrument` to pick a random layer for tool spawns:

```typescript
    const layer: LayerId = runtime.rng() < 0.7 ? "deck" : "cargo";
    const layerZones = SPAWN_ZONES.filter(z => z.layer === layer);
    const zone = layerZones[Math.floor(runtime.rng() * layerZones.length)];
    runtime.state.groundInstruments.push({
      id: `inst_${now}_${Math.floor(runtime.rng() * 1000)}`,
      type: instrType,
      x: zone.x + (runtime.rng() - 0.5) * 40,
      y: zone.y + (runtime.rng() - 0.5) * 40,
      layer,
      spawnTime: now,
    });
```

**Step 3: Build server**

Run: `npm run build -w server`
Expected: compiles cleanly

**Step 4: Commit**

```bash
git add server/src/match/issues.ts server/src/match/state.ts
git commit -m "feat: layer-aware issue and tool spawning (60/40 deck/cargo weighting)"
```

---

### Task 3: Update server — hatch handler and layer-aware interactions

**Files:**
- Modify: `server/src/net/ws.ts`

**Step 1: Import new types**

Add `LayerId` and `HATCH_DEFINITIONS` to imports:

```typescript
import type {
  ClientMessage,
  PlayerState,
  ServerErrorMessage,
  ServerMessage,
  InstrumentType,
  LayerId,
} from "@aether-spire/shared";
import { HATCH_DEFINITIONS } from "@aether-spire/shared";
```

**Step 2: Set player layer on join**

In the `join` handler (around line 150), when creating a new player:

```typescript
        players.set(message.playerId, {
          playerId: message.playerId,
          name: message.name,
          x: 0,
          y: 0,
          layer: "deck",
        });
```

**Step 3: Add `use_hatch` handler**

After the `door` handler (line 249) and before `start_fix`, add:

```typescript
    if (message.type === "use_hatch") {
      if (!message.playerId) return;
      if (!activeMatch) return;
      if (activeMatch.state.gameOver) return;

      const playerEntry = players.get(message.playerId);
      if (!playerEntry) return;

      const hatch = HATCH_DEFINITIONS.find(h => h.id === message.hatchId);
      if (!hatch) return;

      // Determine which side the player is on
      let toLayer: LayerId;
      let toX: number;
      let toY: number;
      if (playerEntry.layer === hatch.layerA) {
        toLayer = hatch.layerB;
        toX = hatch.posB.x;
        toY = hatch.posB.y;
        // Validate proximity to layerA position
        const dx = playerEntry.x - hatch.posA.x;
        const dy = playerEntry.y - hatch.posA.y;
        if (dx * dx + dy * dy > FIX_RANGE * FIX_RANGE) return;
      } else if (playerEntry.layer === hatch.layerB) {
        toLayer = hatch.layerA;
        toX = hatch.posA.x;
        toY = hatch.posA.y;
        // Validate proximity to layerB position
        const dx = playerEntry.x - hatch.posB.x;
        const dy = playerEntry.y - hatch.posB.y;
        if (dx * dx + dy * dy > FIX_RANGE * FIX_RANGE) return;
      } else {
        return; // Player not on either side of this hatch
      }

      // Cancel any active fix
      const fix = activeMatch.fixProgress.get(message.playerId);
      if (fix) {
        const issue = activeMatch.state.issues.find(i => i.id === fix.issueId);
        if (issue && issue.status === "in_progress") {
          issue.fixingBy = issue.fixingBy.filter(id => id !== message.playerId);
          if (issue.fixingBy.length === 0) {
            issue.status = "active";
            issue.fixStartedAt = undefined;
            issue.fixDurationMs = undefined;
          }
        }
        activeMatch.fixProgress.delete(message.playerId);
      }

      // Move player
      playerEntry.layer = toLayer;
      playerEntry.x = toX;
      playerEntry.y = toY;

      // Send hatch confirmation to the requesting player
      const hatchMsg = JSON.stringify({
        type: "server_hatch",
        playerId: message.playerId,
        hatchId: message.hatchId,
        toLayer,
        toX,
        toY,
      });
      ctx.socket.send(hatchMsg);

      // Broadcast updated positions to all
      broadcastPlayers(activeMatch, roomClients as any, players);
      return;
    }
```

**Step 4: Add layer check to `start_fix`**

After the proximity check (line 273), add a layer check:

```typescript
      // Layer check
      if (playerEntry.layer !== issue.layer) return;
```

**Step 5: Add layer check to `pickup_tool`**

After the proximity check in `pickup_tool` (line 382), add:

```typescript
      // Layer check
      if (playerEntry.layer !== inst.layer) return;
```

**Step 6: Add layer to `move` handler**

In the `move` handler, when updating/creating player entry, preserve the existing layer. No code change needed since `entry.x = message.x` doesn't touch `layer`.

When creating a new player in the move handler (line 211):

```typescript
        players.set(message.playerId, {
          playerId: message.playerId,
          name: message.playerId,
          x: message.x,
          y: message.y,
          layer: "deck",
        });
```

**Step 7: Build server**

Run: `npm run build -w server`
Expected: compiles cleanly

**Step 8: Commit**

```bash
git add server/src/net/ws.ts
git commit -m "feat: add use_hatch handler and layer-aware interaction validation"
```

---

### Task 4: Update client WebSocket — hatch message support

**Files:**
- Modify: `client/src/net/ws.ts`

**Step 1: Import LayerId**

```typescript
import type {
  GameState,
  PlayerState,
  ServerMessage,
  ClientMessage,
  InstrumentType,
  RoomPlayer,
  LayerId,
} from "@aether-spire/shared";
```

**Step 2: Add hatch callback and data type**

After the `PingData` interface (line 49), add:

```typescript
export interface HatchData {
  playerId: string;
  hatchId: string;
  toLayer: LayerId;
  toX: number;
  toY: number;
}
```

**Step 3: Add onHatch callback parameter**

Update `connectToServer` to accept an `onHatch` callback. Add after `onPing`:

```typescript
  onHatch?: (data: HatchData) => void
```

**Step 4: Handle server_hatch message**

After the `ping_location` handler (line 120), add:

```typescript
    if (message.type === "server_hatch") {
      onHatch?.({
        playerId: message.playerId,
        hatchId: message.hatchId,
        toLayer: message.toLayer,
        toX: message.toX,
        toY: message.toY,
      });
      return;
    }
```

**Step 5: Add sendUseHatch method to return object**

In the returned object (line 154), add:

```typescript
    sendUseHatch: (matchId: string, playerId: string, hatchId: string) => {
      send({
        type: "use_hatch",
        matchId,
        playerId,
        hatchId,
        sentAt: Date.now(),
      });
    },
```

**Step 6: Build client (type check)**

Run: `npx tsc --noEmit -p client/tsconfig.json` (or `npm run build -w client`)
Expected: may have errors in main.ts until updated — that's OK, just verify ws.ts is clean.

**Step 7: Commit**

```bash
git add client/src/net/ws.ts
git commit -m "feat: add hatch message support to client WebSocket"
```

---

### Task 5: Build cargo hold geometry in render.ts

This is the largest task. The cargo hold needs its own walls, floors, doors, hull boundary, and hatches.

**Files:**
- Modify: `client/src/game/render.ts`

**Step 1: Import LayerId**

Add `LayerId` to the import from shared:

```typescript
import type { GameState, Issue, IssueType, InstrumentType, GroundInstrument, LayerId } from "@aether-spire/shared";
```

**Step 2: Create layer data structures**

After the existing `doors` array declaration (line 226), add parallel data structures for cargo:

```typescript
  // ── Layer system ──
  type LayerData = {
    walls: { x: number; y: number; w: number; h: number }[];
    floors: { x: number; y: number; w: number; h: number; color: number }[];
    doors: { id: string; x: number; y: number; w: number; h: number; open: boolean }[];
    hullPoints: { x: number; y: number }[];
    hullCollisionPoints: { x: number; y: number }[];
    spawnPoint: { x: number; y: number };
    worldContainer: Container;
    hatches: { id: string; x: number; y: number }[];
  };

  let currentLayer: LayerId = "deck";
```

**Step 3: Build cargo hold geometry**

After the deck geometry section (after drawShipDetails call, ~line 715), build cargo geometry. Create a new Container for the cargo hold:

```typescript
  // ── Cargo Hold Layer ──
  const cargoWorldContainer = new Container();
  // (we'll add this to worldLayer later, controlled by visibility)

  const cargoWalls: typeof walls = [];
  const cargoFloors: typeof floors = [];
  const cargoDoors: typeof doors = [];

  // Cargo hold dimensions — smaller, centered on same origin
  const cargoW = 600;
  const cargoTotalH = 1000;
  const cargoX = shipCenterX - cargoW / 2;
  const cargoTopY = shipCenterY - cargoTotalH / 2;

  // Fore Storage room
  const foreStorageW = cargoW;
  const foreStorageH = 350;
  const foreStorageX = cargoX;
  const foreStorageY = cargoTopY;
  cargoFloors.push({ x: foreStorageX, y: foreStorageY, w: foreStorageW, h: foreStorageH, color: 0x0e1418 });

  // Walls for fore storage
  cargoWalls.push({ x: foreStorageX, y: foreStorageY, w: foreStorageW, h: wallThickness }); // top
  cargoWalls.push({ x: foreStorageX, y: foreStorageY, w: wallThickness, h: foreStorageH }); // left
  cargoWalls.push({ x: foreStorageX + foreStorageW - wallThickness, y: foreStorageY, w: wallThickness, h: foreStorageH }); // right

  // Door from fore storage to corridor (bottom wall)
  const cargoDoorW = 70;
  const foreDoorX = shipCenterX - cargoDoorW / 2;
  const foreDoorY = foreStorageY + foreStorageH - wallThickness;
  cargoWalls.push({ x: foreStorageX, y: foreDoorY, w: foreDoorX - foreStorageX, h: wallThickness });
  cargoWalls.push({ x: foreDoorX + cargoDoorW, y: foreDoorY, w: foreStorageX + foreStorageW - (foreDoorX + cargoDoorW), h: wallThickness });
  cargoDoors.push({ id: "door-fore-storage", x: foreDoorX, y: foreDoorY, w: cargoDoorW, h: wallThickness, open: false });

  // Central Corridor
  const corridorH = 300;
  const corridorY = foreStorageY + foreStorageH;
  cargoFloors.push({ x: cargoX, y: corridorY, w: cargoW, h: corridorH, color: 0x0c1216 });

  // Corridor side walls
  cargoWalls.push({ x: cargoX, y: corridorY, w: wallThickness, h: corridorH }); // left
  cargoWalls.push({ x: cargoX + cargoW - wallThickness, y: corridorY, w: wallThickness, h: corridorH }); // right

  // Door from corridor to aft storage (bottom wall of corridor)
  const aftDoorX = shipCenterX - cargoDoorW / 2;
  const aftDoorY = corridorY + corridorH - wallThickness;
  cargoWalls.push({ x: cargoX, y: aftDoorY, w: aftDoorX - cargoX, h: wallThickness });
  cargoWalls.push({ x: aftDoorX + cargoDoorW, y: aftDoorY, w: cargoX + cargoW - (aftDoorX + cargoDoorW), h: wallThickness });
  cargoDoors.push({ id: "door-aft-storage", x: aftDoorX, y: aftDoorY, w: cargoDoorW, h: wallThickness, open: false });

  // Aft Storage room
  const aftStorageW = cargoW;
  const aftStorageH = 350;
  const aftStorageX = cargoX;
  const aftStorageY = corridorY + corridorH;
  cargoFloors.push({ x: aftStorageX, y: aftStorageY, w: aftStorageW, h: aftStorageH, color: 0x0e1418 });

  // Walls for aft storage
  cargoWalls.push({ x: aftStorageX, y: aftStorageY + aftStorageH - wallThickness, w: aftStorageW, h: wallThickness }); // bottom
  cargoWalls.push({ x: aftStorageX, y: aftStorageY, w: wallThickness, h: aftStorageH }); // left
  cargoWalls.push({ x: aftStorageX + aftStorageW - wallThickness, y: aftStorageY, w: wallThickness, h: aftStorageH }); // right

  // Cargo hull boundary (simple rectangle)
  const cargoHullPadding = 5;
  const cargoHullPoints: { x: number; y: number }[] = [
    { x: cargoX - cargoHullPadding, y: cargoTopY - cargoHullPadding },
    { x: cargoX + cargoW + cargoHullPadding, y: cargoTopY - cargoHullPadding },
    { x: cargoX + cargoW + cargoHullPadding, y: aftStorageY + aftStorageH + cargoHullPadding },
    { x: cargoX - cargoHullPadding, y: aftStorageY + aftStorageH + cargoHullPadding },
  ];

  const cargoSpawnPoint = { x: shipCenterX, y: foreStorageY + foreStorageH / 2 };

  // Hatch visual markers (on each layer)
  const deckHatches = [
    { id: "hatch-fore", x: 1600, y: 780 },
    { id: "hatch-aft", x: 1600, y: 1580 },
  ];
  const cargoHatches = [
    { id: "hatch-fore", x: 1600, y: foreStorageY + foreStorageH / 2 },
    { id: "hatch-aft", x: 1600, y: aftStorageY + aftStorageH / 2 },
  ];
```

**Step 4: Draw cargo hold visuals**

Build the cargo hold container with its own background, floors, walls, doors. Add a darker tint overlay for the industrial feel. Draw hatch markers on both layers (a trapdoor/grate graphic).

Create functions `drawCargoFloors()`, `drawCargoWalls()`, `drawCargoDoors()` mirroring the deck equivalents but operating on the cargo arrays and cargo container.

Also draw hatch markers on the deck layer (grate icons at hatch positions).

**Step 5: Make getWalls/getDoors/isInsideHull layer-aware**

Replace the simple `getWalls()` / `getDoors()` / `isInsideHull()`:

```typescript
  function getWalls(layer?: LayerId) {
    return (layer || currentLayer) === "cargo" ? cargoWalls : walls;
  }

  function getDoors(layer?: LayerId) {
    return (layer || currentLayer) === "cargo" ? cargoDoors : doors;
  }

  function isInsideHull(px: number, py: number, layer?: LayerId): boolean {
    const l = layer || currentLayer;
    if (l === "cargo") {
      // Simple rectangle check for cargo
      return px >= cargoX && px <= cargoX + cargoW &&
             py >= cargoTopY && py <= aftStorageY + aftStorageH;
    }
    // Original hull polygon check for deck
    const points = hullCollisionPoints;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x, yi = points[i].y;
      const xj = points[j].x, yj = points[j].y;
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  function getSpawnPoint(layer?: LayerId) {
    const l = layer || currentLayer;
    return l === "cargo"
      ? { x: cargoSpawnPoint.x, y: cargoSpawnPoint.y }
      : { x: spawnPoint.x, y: spawnPoint.y };
  }
```

**Step 6: Add layer switching and fade transition**

Add a fade overlay to the UI layer:

```typescript
  // ── Fade Overlay (for layer transitions) ──
  const fadeOverlay = new Graphics();
  fadeOverlay.rect(0, 0, 4000, 3000);
  fadeOverlay.fill({ color: 0x000000 });
  fadeOverlay.alpha = 0;
  fadeOverlay.visible = false;
  uiLayer.addChild(fadeOverlay);

  let fadeState: "none" | "fading_out" | "fading_in" = "none";
  let fadeStartedAt = 0;
  const FADE_DURATION = 300; // ms per direction
  let pendingLayerSwitch: { layer: LayerId; x: number; y: number } | null = null;

  function startLayerTransition(toLayer: LayerId, toX: number, toY: number) {
    if (fadeState !== "none") return;
    pendingLayerSwitch = { layer: toLayer, x: toX, y: toY };
    fadeState = "fading_out";
    fadeStartedAt = performance.now();
    fadeOverlay.visible = true;
    fadeOverlay.alpha = 0;
  }

  function tickFade(): { switched: boolean; toLayer?: LayerId; toX?: number; toY?: number } {
    if (fadeState === "none") return { switched: false };

    const elapsed = performance.now() - fadeStartedAt;

    if (fadeState === "fading_out") {
      const t = Math.min(1, elapsed / FADE_DURATION);
      fadeOverlay.alpha = t;
      if (t >= 1 && pendingLayerSwitch) {
        // At peak black — do the swap
        const { layer, x, y } = pendingLayerSwitch;
        currentLayer = layer;

        // Toggle visibility of world containers
        // (deck geometry is always in worldLayer; cargo is toggled)
        // We'll manage this via visibility of sub-containers
        setLayerVisibility(layer);

        fadeState = "fading_in";
        fadeStartedAt = performance.now();
        const result = { switched: true, toLayer: layer, toX: x, toY: y };
        pendingLayerSwitch = null;
        return result;
      }
    }

    if (fadeState === "fading_in") {
      const t = Math.min(1, elapsed / FADE_DURATION);
      fadeOverlay.alpha = 1 - t;
      if (t >= 1) {
        fadeOverlay.alpha = 0;
        fadeOverlay.visible = false;
        fadeState = "none";
      }
    }

    return { switched: false };
  }
```

**Step 7: Add layer visibility management**

Add containers for deck-specific and cargo-specific geometry. The background (sky, stars, clouds, city) stays visible always. Deck-specific layers (hull, floors, walls, doors, details, core) and cargo-specific layers swap visibility.

```typescript
  // Group deck-specific graphics
  const deckGeomContainer = new Container();
  // Move existing geometry layers into this container
  // (hullLayer, floorFallback, floorLayer, wallLayer, doorLayer, core, warningRing, detailsLayer)
  // Then add deckGeomContainer to worldLayer where hullLayer was

  // Group cargo-specific graphics
  const cargoGeomContainer = new Container();
  cargoGeomContainer.visible = false;
  // Build cargo graphics inside this container

  function setLayerVisibility(layer: LayerId) {
    deckGeomContainer.visible = layer === "deck";
    cargoGeomContainer.visible = layer === "cargo";
  }
```

**Step 8: Add setDoorsState for cargo doors**

Update `setDoorsState` to check both door arrays:

```typescript
  function setDoorsState(updates: { id: string; open: boolean }[]) {
    updates.forEach((upd) => {
      let door = doors.find((entry) => entry.id === upd.id);
      if (!door) door = cargoDoors.find((entry) => entry.id === upd.id);
      if (!door) return;
      door.open = upd.open;
    });
    drawDoors();
    drawCargoDoors();
  }
```

**Step 9: Add getHatches method and getCurrentLayer**

```typescript
  function getHatches() {
    return currentLayer === "deck" ? deckHatches : cargoHatches;
  }

  function getCurrentLayer(): LayerId {
    return currentLayer;
  }
```

**Step 10: Export new methods from return object**

Add to the return object:

```typescript
    getHatches,
    getCurrentLayer,
    startLayerTransition,
    tickFade,
```

**Step 11: Update minimap with layer cards**

Below the minimap, add a small "card" for each non-current layer. The card shows the layer name and a red dot if there are active issues on that layer.

Add a tracking variable:

```typescript
  let otherLayerIssueCount = 0;

  function setOtherLayerIssueCount(count: number) {
    otherLayerIssueCount = count;
  }
```

In `updateMinimap()` or `drawMinimapStatic()`, draw a small card below the minimap:

```typescript
  // Layer card (drawn during updateMinimap)
  const layerCardGfx = new Graphics();
  minimapContainer.addChild(layerCardGfx);

  // In updateMinimap:
  function drawLayerCard() {
    layerCardGfx.clear();
    const cardX = 0;
    const cardY = MINIMAP_H + 4;
    const cardW = MINIMAP_W;
    const cardH = 20;

    layerCardGfx.roundRect(cardX, cardY, cardW, cardH, 3);
    layerCardGfx.fill({ color: SP.darkBg, alpha: 0.85 });
    layerCardGfx.stroke({ color: SP.brass, width: 1, alpha: 0.5 });

    // Label
    const label = currentLayer === "deck" ? "Cargo Hold" : "Main Deck";
    // (Use a persistent Text or draw with graphics)

    // Notification dot
    if (otherLayerIssueCount > 0) {
      layerCardGfx.circle(cardX + cardW - 10, cardY + cardH / 2, 4);
      layerCardGfx.fill({ color: 0xff4444 });
    }
  }
```

Export `setOtherLayerIssueCount` from return object.

**Step 12: Build client**

Run: `npm run build -w client`
Expected: may still have errors in main.ts — focus on render.ts compiling.

**Step 13: Commit**

```bash
git add client/src/game/render.ts
git commit -m "feat: add cargo hold geometry, layer switching, fade transition, minimap layer cards"
```

---

### Task 6: Update main.ts — layer-aware game loop and hatch interaction

**Files:**
- Modify: `client/src/main.ts`

**Step 1: Import LayerId and add state tracking**

```typescript
import type { Issue, GroundInstrument, LayerId } from "@aether-spire/shared";
import { HATCH_DEFINITIONS } from "@aether-spire/shared";
```

Add state variable:

```typescript
let currentLayer: LayerId = "deck";
```

**Step 2: Add hatch-finding function**

After `findNearestDoor` (line 266):

```typescript
function findNearestHatch(): { id: string; x: number; y: number; dist: number } | null {
  if (!world) return null;
  const hatches = world.getHatches();
  let best: { id: string; x: number; y: number; dist: number } | null = null;
  for (const hatch of hatches) {
    const dx = player.x - hatch.x;
    const dy = player.y - hatch.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (!best || dist < best.dist) {
      best = { ...hatch, dist };
    }
  }
  return best;
}
```

**Step 3: Add hatch interaction to E key handler**

In the E key handler (line 786), after the door interaction (Priority 2), add Priority 3 — hatch:

```typescript
    // Priority 3: Use hatch (layer transition)
    if (world) {
      const nearHatch = findNearestHatch();
      if (nearHatch && nearHatch.dist <= 60) {
        connection.sendUseHatch("local-match", playerId, nearHatch.id);
      }
    }
```

**Step 4: Add hatch callback to connectToServer**

Pass a hatch callback as the last argument to `connectToServer`:

```typescript
  // Hatch callback
  (hatchData) => {
    if (!world) return;
    if (hatchData.playerId !== playerId) return;

    // Start the fade transition
    world.startLayerTransition(hatchData.toLayer, hatchData.toX, hatchData.toY);
  }
```

**Step 5: Tick the fade in game loop**

In the game loop (after `world.tickEffects(dt)`, around line 671), add:

```typescript
    // Layer transition fade
    const fadeResult = world.tickFade();
    if (fadeResult.switched) {
      currentLayer = fadeResult.toLayer!;
      player.x = fadeResult.toX!;
      player.y = fadeResult.toY!;
      camera.x = player.x;
      camera.y = player.y;
      world.setPlayer(player.x, player.y);
      // Log the transition
      const layerName = currentLayer === "deck" ? "Main Deck" : "Cargo Hold";
      world.addLogEntry(`Entered ${layerName}`, 0x7ee3c2);
    }
```

**Step 6: Filter issues and tools by layer in snapshot callback**

In the snapshot callback (line 385), when detecting new issues, filter by current layer for log messages but still track all:

No filtering needed for knownIssueIds — that tracks all issues regardless of layer. But we should show the layer name in the log message:

```typescript
        const layerLabel = issue.layer === "deck" ? "" : " [Cargo]";
        world?.addLogEntry(`${typeName} in ${areaName}${layerLabel}!`, color);
```

**Step 7: Filter findNearestIssue by layer**

Update `findNearestIssue` to only find issues on the current layer:

```typescript
function findNearestIssue(): Issue | null {
  if (!latestState) return null;
  let best: Issue | null = null;
  let bestDist = Infinity;
  for (const issue of latestState.issues) {
    if (issue.layer !== currentLayer) continue; // Layer filter
    // ... rest unchanged
```

**Step 8: Filter findNearestGroundInstrument by layer**

```typescript
function findNearestGroundInstrument(): GroundInstrument | null {
  if (!latestState) return null;
  let best: GroundInstrument | null = null;
  let bestDist = Infinity;
  for (const inst of latestState.groundInstruments) {
    if (inst.layer !== currentLayer) continue; // Layer filter
    // ... rest unchanged
```

**Step 9: Update interaction hints with hatch**

In the interaction hint section (line 688), after the door hint, add hatch hint:

```typescript
    } else {
      const nearHatch = findNearestHatch();
      if (nearHatch && nearHatch.dist <= 60) {
        const targetLayer = currentLayer === "deck" ? "Cargo Hold" : "Main Deck";
        world.setInteractionText(`[E] Go to ${targetLayer}`);
      } else {
        world.setInteractionText("");
      }
    }
```

**Step 10: Track other-layer issue count for minimap card**

In the snapshot callback, count issues on the non-current layer:

```typescript
    // Update other layer issue count for minimap
    const otherCount = state.issues.filter(i => i.layer !== currentLayer && i.status === "active").length;
    world?.setOtherLayerIssueCount(otherCount);
```

**Step 11: Update SHIP_AREAS with cargo areas**

Add cargo hold areas to the SHIP_AREAS array:

```typescript
const CARGO_AREAS = [
  { x: 1600, y: 950, label: "Fore Storage" },
  { x: 1600, y: 1200, label: "Cargo Corridor" },
  { x: 1600, y: 1450, label: "Aft Storage" },
];
```

Update `getAreaName` to check cargo areas when on cargo layer:

```typescript
function getAreaName(x: number, y: number): string {
  const areas = currentLayer === "cargo" ? CARGO_AREAS : SHIP_AREAS;
  // ... rest same
```

**Step 12: Filter other players by layer**

In the players callback, filter `others` by layer:

```typescript
    const others = players
      .filter((entry) => entry.playerId !== playerId && entry.layer === currentLayer)
      .map(...)
```

And for minimap, show all players but only use same-layer for otherPlayerPositions:

```typescript
    otherPlayerPositions = others.map((p) => ({ x: p.x, y: p.y }));
```

**Step 13: Build everything**

Run: `npm run build`
Expected: full build passes

**Step 14: Commit**

```bash
git add client/src/main.ts
git commit -m "feat: layer-aware game loop, hatch interaction, fade transitions, entity filtering"
```

---

### Task 7: Update render.ts issue/tool rendering to filter by layer

**Files:**
- Modify: `client/src/game/render.ts`

**Step 1: Filter issues by layer in `update()` function**

The `update(state)` function currently renders all issues. It needs to only render issues on the current layer. Find where issues are iterated in the update function and add:

```typescript
const visibleIssues = state.issues.filter(i => i.layer === currentLayer);
```

Use `visibleIssues` instead of `state.issues` when creating/updating issue emitters and rendering.

**Step 2: Filter ground instruments by layer**

Similarly, filter `state.groundInstruments` by current layer when rendering tool sprites:

```typescript
const visibleInstruments = state.groundInstruments.filter(i => i.layer === currentLayer);
```

**Step 3: Build and test**

Run: `npm run build`
Expected: full build passes

**Step 4: Commit**

```bash
git add client/src/game/render.ts
git commit -m "feat: filter issue and tool rendering by active layer"
```

---

### Task 8: Integration testing and polish

**Files:**
- All modified files (manual testing)

**Step 1: Start dev servers**

Run server and client dev servers. Open browser, create a room, start game.

**Step 2: Verify deck gameplay unchanged**

- Walk around deck, fix issues, pick up tools
- Doors work normally
- Issues spawn and damage stability
- Minimap shows deck layout

**Step 3: Test hatch interaction**

- Walk to fore deck corridor (y~780)
- See "[E] Go to Cargo Hold" hint
- Press E
- Verify fade to black, then appear in cargo hold
- Verify cargo hold geometry renders (rooms, corridor, doors)
- Verify can walk around cargo hold

**Step 4: Test cargo hold gameplay**

- Wait for issues to spawn in cargo hold
- Fix an issue in cargo hold
- Pick up a tool in cargo hold
- Open/close cargo doors

**Step 5: Test return to deck**

- Walk to hatch in cargo hold
- Press E
- Verify fade back to main deck
- Verify position is at the corresponding deck hatch

**Step 6: Test minimap layer card**

- On deck, verify "Cargo Hold" card appears below minimap
- If issues exist in cargo, verify red dot on the card
- Switch to cargo, verify "Main Deck" card with dot if deck has issues

**Step 7: Test multiplayer**

- Open two browser tabs
- Both join same room
- One player goes to cargo, other stays on deck
- Verify players can't see each other across layers
- Verify issues on both layers damage stability

**Step 8: Fix any issues found during testing**

**Step 9: Final commit**

```bash
git add -A
git commit -m "feat: multi-layer level system — cargo hold with hatches, fade transitions, layer-aware gameplay"
```

---

## Summary

| Task | Description | Key files |
|------|-------------|-----------|
| 1 | Shared types (LayerId, HatchDef, messages, spawn zones) | `shared/src/index.ts` |
| 2 | Server issue/tool spawning with layer weighting | `server/src/match/issues.ts`, `state.ts` |
| 3 | Server hatch handler + layer-aware interactions | `server/src/net/ws.ts` |
| 4 | Client WebSocket hatch message support | `client/src/net/ws.ts` |
| 5 | Cargo hold geometry, fade transition, minimap cards | `client/src/game/render.ts` |
| 6 | Game loop: hatch interaction, entity filtering, area names | `client/src/main.ts` |
| 7 | Render issue/tool filtering by layer | `client/src/game/render.ts` |
| 8 | Integration testing and polish | All files |
