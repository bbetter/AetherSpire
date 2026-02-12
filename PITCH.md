# Aether Spire

**A cooperative real-time survival game where 1-4 players crew a steampunk airship hurtling through hostile skies.**

---

## The Elevator Pitch

Your airship is falling apart. Pressure surges, coolant leaks, electrical fires, and corrupted controls threaten to tear the vessel from the sky. You and your crew have 7 minutes to keep the ship stable or it all comes crashing down.

**Aether Spire** is a browser-based co-op game about frantic teamwork under escalating pressure. No installs. Share a room code. Play.

---

## Core Loop

1. **Issues spawn** across the ship — pressure surges, coolant leaks, mechanical drift, capacitor overloads, friction fires, and control corruption
2. **Each issue drains stability** — slowly at first, then accelerating. Ignore a problem and it snowballs
3. **Players rush to fix issues** — walk up, press E, choose manual repair or use the right tool for a faster fix
4. **Tools are scarce** — only 3 tool types exist (Arcane Conduit, Gear Wrench, Thermal Regulator) in a shared team inventory. Finding and using them strategically is key
5. **Survive 7 minutes** with stability above 0% and you win

---

## What Makes It Fun

### Escalating Tension
Issues don't just do flat damage — they accelerate. A fresh issue drains 0.4%/sec. After 30 seconds unfixed, it's eating 0.8%/sec. Multiple ignored issues compound into a death spiral. The game feels manageable for the first few minutes, then gets frantic.

### Teamwork Without Voice Chat
- **Shared tool inventory** means players naturally specialize: "I'll handle the cargo hold, you stay on deck"
- **Location pings** (Q key) let players silently coordinate — ping an issue to call for help
- **Co-operative fixing** — a second player joining a repair speeds it up, creating spontaneous teamwork moments
- **Speed boosts** after completing a fix reward players who stay active

### The Two-Layer Ship
The airship has two layers connected by hatches:
- **Main Deck** — the sprawling upper level with bridge, cabins, engine room, and corridors
- **Cargo Hold** — a tighter lower level with limited visibility

Issues spawn on both layers (60/40 split). Players must decide: do I stay on deck or drop below? The minimap shows issue counts on the other layer, creating constant awareness tension.

### Accessible by Design
- **Browser-native** — no download, no account. Open URL, enter name, share code, play
- **Keyboard-only controls** — WASD movement, E to interact, Q to ping, M to mute
- **2-minute learning curve** — the game teaches through play. Walk up to glowing issues, fix them, keep the bar green
- **Sessions are 7 minutes** — short enough to play during a break, replayable enough to chase 5 stars

---

## Technical Overview

| Component | Stack |
|---|---|
| Client | Pixi.js v8, Vite, TypeScript |
| Server | Node.js, Express, WebSocket |
| Shared | TypeScript types package (monorepo) |
| Audio | Web Audio API (synthesized SFX), MP3 background music |
| Multiplayer | WebSocket real-time state sync, room codes for matchmaking |

The architecture is a lightweight authoritative server model. The server ticks once per second, spawning issues, applying damage, validating fixes, and broadcasting game state. The client renders at 60fps with smooth interpolation, particle effects, and camera follow.

---

## Visual Style

Steampunk airship aesthetic rendered in top-down 2D:
- Dark sky background with drifting stars and wispy clouds
- Brass-panel UI with rivet details and amber/copper color palette
- Each issue type has distinct particle effects — steam plumes for pressure surges, dripping blue particles for coolant leaks, crackling purple arcs for capacitor overloads, flickering green glitch rectangles for control corruption
- Smooth layer transitions with fade effects when using hatches
- Minimap with real-time player, issue, and camera indicators

---

## Scoring & Replayability

| Metric | Points |
|---|---|
| Issues fixed | 2 per issue |
| Time survived | 1 per second |
| Final stability | 1 per % remaining |

Stars: 5 (500+), 4 (400+), 3 (300+), 2 (150+), 1 (below 150)

The scoring system rewards both survival and active play. Sitting in a corner won't earn stars — you need to fix issues. But reckless play that tanks stability costs points too.

---

## Current State

**Playable.** The game has:
- Full multiplayer with room-based matchmaking (1-4 players)
- Complete ship layout with two layers, doors, and hatch transitions
- 6 issue types with unique particle effects and tool pairings
- Working scoring, game-over screen, and star ratings
- Synthesized sound effects and background music
- Minimap with layer awareness
- Player ping system for coordination
- Asset preloading with loading screen
- Adaptive difficulty scaling based on player count

---

## Future Directions

- **More ship layouts** — different vessels with unique room configurations and hazard distributions
- **Progression system** — unlock cosmetic player appearances or ship skins
- **Role specialization** — optional crew roles (Engineer, Navigator, etc.) with minor perks
- **Environmental hazards** — storm events, turbulence zones, or enemy encounters that create temporary pressure spikes
- **Mobile support** — touch controls for the browser client
- **Leaderboards** — per-ship and global high scores

---

## Target Audience

- Casual co-op fans (Overcooked, Spaceteam, Lethal Company lite)
- Groups looking for quick browser games to play together
- Players who enjoy "controlled chaos" — simple mechanics, emergent teamwork
- The "send a link in Discord and play in 30 seconds" crowd
