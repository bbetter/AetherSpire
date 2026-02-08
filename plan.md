# AetherSpire Redesign - FINAL LOCKED DESIGN (Updated)

## Current Status
**Design Phase**: COMPLETE & REFINED - Ready for implementation

---

## Core Concept

**Single Stability Bar (0-100%)** 
- Starts at 100%, decreases as issues cause damage
- WIN: Survive 10 minutes with Stability > 0%
- LOSE: Stability reaches 0%

**Random Issues Spawn Continuously**
- Spawn rate scales with player count
- Each issue: type, location, fix time, stability reward
- Issues cause accelerating damage if left unfixed

**Team Fixes Issues to Restore Stability**
- Players walk to issues
- Press E to open context menu
- Select fix option (default maintenance or use tool)
- Tool selection consumes that tool from Team Inventory
- On fix: issue removed, stability restored

**Shared Team Inventory (Consumable Tools)**
- 3 tools total: Thermal Regulator, Gear Wrench, Arcane Conduit
- Tools spawn on map, pickup (E) → go to Team Inventory
- When used to fix issue → CONSUMED (removed)
- New tools respawn every 30s if not in inventory
- Creates resource scarcity and strategic decisions

---

## Detailed Systems

### Stability Meter
- Single large bar on left panel
- Green (80-100%), Yellow (40-79%), Red (<40%)
- Decreases as issues age and cause damage
- Restored when issues are fixed

### Issues System

**Spawning**:
```
1 player → 1 issue per 40 seconds
2 players → 1 issue per 25 seconds
3 players → 1 issue per 15 seconds
4 players → 1 issue per 10 seconds
```

**Issue Properties**:
- Type: 5+ types (names TBD based on lore)
- Location: Random position on map
- Fix Time Base: 10-40 seconds (varies by type)
- Fix Time With Tool: 40% faster (60% of base)
- Stability Reward: +2% to +8% (matches difficulty)
- Tool Pairing: Which tool helps this issue (TBD)

**Damage Over Time** (Accelerating):
```
Age 0-10s:    -0.5% per second (total -5%)
Age 10-15s:   -1% per 5-second window
Age 15-20s:   -2% per 5-second window
Age 20-25s:   -3% per 5-second window
Age 25-30s:   -4% per 5-second window
Age 30s+:     -5% per 5-second window (critical)
```

### Team Inventory (Consumable)

**Inventory State**:
- Holds up to 3 tools simultaneously
- Tools in inventory until used
- When used → CONSUMED (removed from game)
- UI shows which tools are available: [✓] or [✗]

**Tool Pickup** (E Key):
1. Walk near tool on ground
2. Press E
3. Tool moves to Team Inventory
4. UI: "Picked up Thermal Regulator"
5. Sync to all clients

**Tool Respawn**:
- Tools respawn on map every 30 seconds
- Only if that tool not currently in inventory
- Spawns in random location (SPAWN_ZONES)
- Creates cycles of abundance/scarcity

### Fix Interaction - Context Menu

**Trigger**: Player presses E near Issue

**Menu Displays**:
```
Issue Name - Fix Options
─────────────────────────
> Default Maintenance (20s)
  Thermal Regulator (12s) [✓]
  Gear Wrench (20s) [✗]
  Arcane Conduit (20s) [✗]
```

**Components**:
- Issue name at top
- "Default Maintenance" option (always available, base time)
- List of all 3 tools with:
  - Tool name
  - Fix time WITH this tool
  - [✓] if in Team Inventory
  - [✗] if NOT available (grayed out)

**Navigation**:
- Arrow keys or WASD (up/down) to highlight
- E key or Enter to confirm selection
- Escape to cancel

**On Selection**:
1. Player selects option
2. If tool selected:
   - Tool removed from Team Inventory immediately
   - Fix begins with faster time
3. If Default Maintenance:
   - No tool used
   - Fix begins with base time
4. Progress bar shows during fix
5. On complete:
   - Issue removed
   - Stability +X% (based on difficulty)

---

## Multiplayer Coordination

**Scaling**: More players = harder (more issues spawn)

**Tool Scarcity Decisions**:
- "Use regulator now or save for worse issue?"
- "Two issues need wrench, which takes priority?"
- Team must coordinate who uses what

**Cooperation Examples**:
- Player 1: "Regulator in inventory?"
- Player 2: "Yeah, go fix the leak. I'll handle alignment without it"
- (30s pass, tool respawns)
- Player 3: "Got a new wrench! Where should I use it?"

---

## Win/Lose Conditions

**WIN**:
- Survive 10 minutes with Stability > 0%
- Score = (Issues Fixed × 2) + Final Stability + Time
- Rating: 1-5 stars

**LOSE**:
- Stability reaches 0% at any point
- Game over, show results screen

---

## What Changes

**REMOVED**:
- Systems (Mana, Gear, Heat)
- Station nodes and actions
- Events system
- Cooldowns
- Individual player inventories

**KEPT**:
- Map layout and rooms
- WASD movement
- Door mechanics
- Multiplayer synchronization
- UI panel system
- Time display

**ADDED**:
- Issues system (spawning, damage, fixing)
- Single Stability meter
- Team Inventory (consumable tools)
- Context menu for fix options
- Win/loss conditions
- Score/results screen

---

## Control Scheme

**WASD**:
- Movement (unchanged)
- Menu navigation (up/down in context menu)

**E Key**:
- Pickup tools from ground → Team Inventory
- Fix nearby issue (opens context menu) OR confirm menu selection
- Cancel menu/current action (Escape also works)

**Escape Key**:
- Cancel context menu
- Exit any interaction

---

## Implementation Roadmap (8-9 Hours)

### Phase 1: Data Structure & Spawning (2 hours)
- [ ] Define Issue interface
- [ ] Replace GameState.systems with issues: Issue[]
- [ ] Add stability: number to GameState
- [ ] Add teamInventory: InstrumentType[] to GameState
- [ ] Implement issue spawn logic (scales with playerCount)
- [ ] Network sync issues and inventory

### Phase 2: Rendering (1.5 hours)
- [ ] Render issue markers on map
- [ ] Replace 3-bar system with single Stability bar
- [ ] Add Team Inventory display on left panel
- [ ] Show context menu UI
- [ ] Color Stability bar (green/yellow/red)

### Phase 3: Context Menu & Fix Mechanics (2 hours)
- [ ] Context menu appears on E press
- [ ] Menu navigation (arrow keys/WASD)
- [ ] Menu selection confirmation
- [ ] Progress bar during fix
- [ ] Tool consumption on selection
- [ ] Remove issue on complete
- [ ] Restore stability on fix

### Phase 4: Damage System (1.5 hours)
- [ ] Track issue spawn time
- [ ] Calculate age-based damage per tick
- [ ] Apply accelerating damage thresholds
- [ ] Update Stability meter
- [ ] Check lose condition (Stability = 0%)

### Phase 5: Win/Lose & Scoring (1.5 hours)
- [ ] Win condition check (10 min survived)
- [ ] Results screen display
- [ ] Score calculation
- [ ] Star rating system
- [ ] Restart/exit buttons

---

## Design Details

### Issue Types (TBD - Waiting for Lore)
5+ types with different characteristics:
- Type 1: 10s fix, +2% reward, uses Tool A
- Type 2: 15s fix, +4% reward, uses Tool B
- Type 3: 20s fix, +5% reward, uses Tool C
- Type 4: 30s fix, +7% reward, uses Tool A
- Type 5: 40s fix, +8% reward, uses Tool B

Real names/descriptions TBD.

### Tool-Issue Pairings (TBD)
- Thermal Regulator: Helps certain issue types (40% faster)
- Gear Wrench: Helps certain issue types (40% faster)
- Arcane Conduit: Helps certain issue types (40% faster)

Each tool benefits 1-2 issue types.

### Score Formula
```
Base Score = Issues Fixed × 2
Time Bonus = Time Survived in Seconds
Stability Bonus = Final Stability Value
Final Score = Base Score + Time Bonus + Stability Bonus

5 Stars: 400+ points
4 Stars: 300-399 points
3 Stars: 200-299 points
2 Stars: 100-199 points
1 Star: <100 points
```

---

## Data Structures

```typescript
interface Issue {
  id: string
  type: IssueType
  x: number
  y: number
  spawnTime: number
  baseFixTime: number        // without tool
  fixTimeWithTool: number    // with matching tool
  requiredTool: InstrumentType
  stabilityReward: number
  status: "active" | "in_progress" | "fixed"
}

interface GameState {
  stability: number          // 0-100
  issues: Issue[]
  teamInventory: InstrumentType[]
  phase: "early" | "mid" | "crisis" | "final"
  timeRemainingSec: number
  nextDamageAt: number
  nextIssueAt: number
  issuesFixed: number        // for scoring
}

interface GroundInstrument {
  id: string
  type: InstrumentType
  x: number
  y: number
  spawnTime: number
}
```

---

## UI Mockups

**Left Panel**:
```
Phase: early
Time: 9:30
Stability: 72% [████████░░]

Team Inventory:
  [✓] Thermal Regulator
  [✓] Gear Wrench
  [✗] Arcane Conduit
```

**Context Menu (When Pressing E at Issue)**:
```
Power Surge - Fix Options
─────────────────────────
> Default Maintenance (20s)
  Thermal Regulator (12s) [✓]
  Gear Wrench (20s) [✗]
  Arcane Conduit (20s) [✗]

Use arrows/WASD to select, E to confirm
```

**During Fix**:
```
Fixing with Thermal Regulator
████████░░ 8 seconds remaining
```

**Results Screen**:
```
VICTORY!
Time Survived: 10:00 ✓
Final Stability: 45%
Issues Fixed: 23
Score: 356 ⭐⭐⭐⭐

[Restart Game] [Return to Lobby]
```

---

## Known Unknowns

1. **Issue Names & Descriptions**: Pending game lore
2. **Tool-Issue Pairings**: Which tool helps which issue?
3. **Visual Style**: How do issues appear on map?
4. **Sound Design**: SFX for issue spawn, fix, completion
5. **Difficulty Modes**: Easy/Normal/Hard variants?
6. **Special Interactions**: Bonuses for multi-player fixes?

---

## Balance Knobs (For Testing)

- Issue spawn rate (currently per-player-count)
- Issue damage per window (currently -1% to -5%)
- Tool speed bonus (currently -40% fix time)
- Stability rewards (currently +2% to +8%)
- Tool respawn timer (currently 30 seconds)
- Match duration (currently 10 minutes)

---

## Success Criteria

- [x] Design locked with all mechanics specified
- [ ] Data structures implemented
- [ ] Rendering updated with new UI
- [ ] Context menu working
- [ ] Fix mechanics functional
- [ ] Damage system working
- [ ] Win/loss states implemented
- [ ] Multiplayer sync verified
- [ ] Playtesting complete
- [ ] Balance tuned

---

## Next Steps

1. **Develop Lore**: Define issue types, names, and descriptions
2. **Determine Tool Pairings**: Which tools help which issues?
3. **Visual Design**: How do issues appear? (icons, particles, colors?)
4. **Begin Implementation**: Start with Phase 1
