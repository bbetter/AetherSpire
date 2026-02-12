// ── Issue Types ──────────────────────────────────────────────

export type IssueType =
  | "pressure_surge"
  | "coolant_leak"
  | "mechanical_drift"
  | "capacitor_overload"
  | "friction_fire"
  | "control_corruption";

export type Phase = "early" | "mid" | "crisis" | "final";

export type LayerId = "deck" | "cargo";

export interface HatchDef {
  id: string;
  layerA: LayerId;
  posA: { x: number; y: number };
  layerB: LayerId;
  posB: { x: number; y: number };
}

export type InstrumentType = "arcane_conduit" | "gear_wrench" | "thermal_regulator";

export const ISSUE_DAMAGE_CURVE: { maxAgeSec: number; dps: number }[] = [
  { maxAgeSec: 8, dps: 0.6 },
  { maxAgeSec: 12, dps: 0.25 },
  { maxAgeSec: 16, dps: 0.5 },
  { maxAgeSec: 20, dps: 0.75 },
  { maxAgeSec: Infinity, dps: 1.0 },
];

export function damagePerSecondForAge(ageSec: number): number {
  for (const step of ISSUE_DAMAGE_CURVE) {
    if (ageSec <= step.maxAgeSec) return step.dps;
  }
  return ISSUE_DAMAGE_CURVE[ISSUE_DAMAGE_CURVE.length - 1].dps;
}

export function damagePerSecondForSpawnTime(spawnTime: number, now: number): number {
  const ageSec = (now - spawnTime) / 1000;
  return damagePerSecondForAge(ageSec);
}

export interface Issue {
  id: string;
  type: IssueType;
  x: number;
  y: number;
  layer: LayerId;
  spawnTime: number;
  baseFixTime: number;
  fixTimeWithTool: number;
  requiredTool: InstrumentType;
  stabilityReward: number;
  status: "active" | "in_progress" | "fixed";
  requiredPlayers: number; // Always 1; additional helpers speed up the fix
  fixingBy: string[]; // Array of player IDs currently fixing
  fixStartedAt?: number;
  fixDurationMs?: number;
}

export interface GroundInstrument {
  id: string;
  type: InstrumentType;
  x: number;
  y: number;
  layer: LayerId;
  spawnTime: number;
}

export interface Lockout {
  id: string;
  kind: "door" | "hatch";
  endsAt: number;
}

// ── Game State ───────────────────────────────────────────────

export interface GameState {
  matchId: string;
  seed: number;
  phase: Phase;
  timeRemainingSec: number;
  nextTickAt: number;
  stability: number;
  issues: Issue[];
  teamInventory: InstrumentType[];
  groundInstruments: GroundInstrument[];
  hatches: HatchDef[];
  lockouts: Lockout[];
  issuesFixed: number;
  gameOver: boolean;
  won: boolean;
}

export interface PlayerFixProgress {
  issueId: string;
  progress: number; // 0 to 1
  startTime: number;
  durationMs: number;
  label: string;
}

export interface PlayerState {
  playerId: string;
  name: string;
  x: number;
  y: number;
  layer: LayerId;
  fixProgress?: PlayerFixProgress; // Optional - only when actively fixing
}

// ── World Constants ──────────────────────────────────────────

export const CORE_POS = { x: 1600, y: 1200 };
export const WORLD_W = 3200;
export const WORLD_H = 2400;

export interface SpawnZone {
  label: string;
  x: number;
  y: number;
  layer: LayerId;
}

export const SPAWN_ZONES: SpawnZone[] = [
  // Hub (central mast area) - bigger ship
  { label: "hub-center", x: 1600, y: 1200, layer: "deck" },
  { label: "hub-fore", x: 1600, y: 1050, layer: "deck" },
  { label: "hub-aft", x: 1600, y: 1350, layer: "deck" },
  { label: "hub-port", x: 1450, y: 1200, layer: "deck" },
  { label: "hub-starboard", x: 1750, y: 1200, layer: "deck" },
  // Bridge (bow) - adjusted for bigger ship
  { label: "bridge-helm", x: 1600, y: 380, layer: "deck" },
  { label: "bridge-port", x: 1480, y: 420, layer: "deck" },
  { label: "bridge-starboard", x: 1720, y: 420, layer: "deck" },
  // Port Cabin (left) - adjusted for bigger ship
  { label: "port-cabin-center", x: 1200, y: 1200, layer: "deck" },
  { label: "port-cabin-fore", x: 1200, y: 1100, layer: "deck" },
  { label: "port-cabin-aft", x: 1200, y: 1300, layer: "deck" },
  // Starboard Cabin (right) - adjusted for bigger ship
  { label: "starboard-cabin-center", x: 2000, y: 1200, layer: "deck" },
  { label: "starboard-cabin-fore", x: 2000, y: 1100, layer: "deck" },
  { label: "starboard-cabin-aft", x: 2000, y: 1300, layer: "deck" },
  // Engine Room (stern) - adjusted for bigger ship
  { label: "engine-center", x: 1600, y: 2030, layer: "deck" },
  { label: "engine-port", x: 1480, y: 2030, layer: "deck" },
  { label: "engine-starboard", x: 1720, y: 2030, layer: "deck" },
  // Main Deck corridors - adjusted for bigger ship
  { label: "fore-deck", x: 1600, y: 680, layer: "deck" },
  { label: "aft-deck", x: 1600, y: 1680, layer: "deck" },
  { label: "port-corridor", x: 1320, y: 1200, layer: "deck" },
  { label: "starboard-corridor", x: 1880, y: 1200, layer: "deck" },
  // Cargo Hold
  { label: "cargo-fore-center", x: 1600, y: 875, layer: "cargo" },
  { label: "cargo-fore-back", x: 1600, y: 770, layer: "cargo" },
  { label: "cargo-corridor", x: 1600, y: 1200, layer: "cargo" },
  { label: "cargo-aft-center", x: 1600, y: 1525, layer: "cargo" },
  { label: "cargo-aft-back", x: 1600, y: 1620, layer: "cargo" },
];

export const HATCH_DEFINITIONS: HatchDef[] = [
  {
    id: "hatch-fore",
    layerA: "deck",
    posA: { x: 1600, y: 680 },
    layerB: "cargo",
    posB: { x: 1600, y: 820 },
  },
  {
    id: "hatch-aft",
    layerA: "deck",
    posA: { x: 1600, y: 1720 },
    layerB: "cargo",
    posB: { x: 1600, y: 1600 },
  },
];

// ── Client Messages ──────────────────────────────────────────

export interface ClientJoinMessage {
  type: "join";
  matchId: string;
  playerId: string;
  name: string;
}

export interface ClientMoveMessage {
  type: "move";
  matchId: string;
  playerId: string;
  x: number;
  y: number;
  sentAt: number;
}

export interface ClientDoorMessage {
  type: "door";
  matchId: string;
  doorId: string;
  open: boolean;
  sentAt: number;
}

export interface ClientStartFixMessage {
  type: "start_fix";
  matchId: string;
  playerId: string;
  issueId: string;
  toolChoice: InstrumentType | "default";
  sentAt: number;
}

export interface ClientCancelFixMessage {
  type: "cancel_fix";
  matchId: string;
  playerId: string;
  sentAt: number;
}

export interface ClientPickupToolMessage {
  type: "pickup_tool";
  matchId: string;
  playerId: string;
  instrumentId: string;
  sentAt: number;
}

export interface ClientPingMessage {
  type: "ping";
  sentAt: number;
}

export interface ClientCreateRoomMessage {
  type: "create_room";
  playerId: string;
  playerName: string;
}

export interface ClientJoinRoomMessage {
  type: "join_room";
  roomCode: string;
  playerId: string;
  playerName: string;
}

export interface ClientStartGameMessage {
  type: "start_game";
  roomCode: string;
  playerId: string;
}

export interface ClientPingLocationMessage {
  type: "ping_location";
  matchId: string;
  playerId: string;
  x: number;
  y: number;
  layer: LayerId;
  sentAt: number;
}

export interface ClientUseHatchMessage {
  type: "use_hatch";
  matchId: string;
  playerId: string;
  hatchId: string;
  sentAt: number;
}

export type ClientMessage =
  | ClientJoinMessage
  | ClientMoveMessage
  | ClientDoorMessage
  | ClientStartFixMessage
  | ClientCancelFixMessage
  | ClientPickupToolMessage
  | ClientPingMessage
  | ClientCreateRoomMessage
  | ClientJoinRoomMessage
  | ClientStartGameMessage
  | ClientPingLocationMessage
  | ClientUseHatchMessage;

// ── Server Messages ──────────────────────────────────────────

export interface ServerSnapshotMessage {
  type: "snapshot";
  state: GameState;
}

export interface ServerPlayersMessage {
  type: "players";
  players: PlayerState[];
}

export interface ServerDoorsMessage {
  type: "doors";
  doors: { id: string; open: boolean }[];
}

export interface ServerAlertMessage {
  type: "alert";
  text: string;
}

export interface ServerErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export interface ServerPongMessage {
  type: "pong";
  sentAt: number;
  serverTime: number;
}

export interface ServerGameOverMessage {
  type: "game_over";
  won: boolean;
  score: number;
  stars: number;
  issuesFixed: number;
  finalStability: number;
  timeSurvived: number;
}

export interface RoomPlayer {
  playerId: string;
  name: string;
  isHost: boolean;
}

export interface ServerRoomCreatedMessage {
  type: "room_created";
  roomCode: string;
  players: RoomPlayer[];
}

export interface ServerRoomJoinedMessage {
  type: "room_joined";
  roomCode: string;
  players: RoomPlayer[];
}

export interface ServerRoomUpdateMessage {
  type: "room_update";
  roomCode: string;
  players: RoomPlayer[];
}

export interface ServerRoomErrorMessage {
  type: "room_error";
  code: string;
  message: string;
}

export interface ServerGameStartingMessage {
  type: "game_starting";
  roomCode: string;
}

export interface ServerPingLocationMessage {
  type: "ping_location";
  playerId: string;
  playerName: string;
  x: number;
  y: number;
  layer: LayerId;
  timestamp: number;
}

export interface ServerHatchMessage {
  type: "server_hatch";
  playerId: string;
  hatchId: string;
  toLayer: LayerId;
  toX: number;
  toY: number;
}

export type ServerMessage =
  | ServerSnapshotMessage
  | ServerPlayersMessage
  | ServerDoorsMessage
  | ServerAlertMessage
  | ServerErrorMessage
  | ServerPongMessage
  | ServerGameOverMessage
  | ServerRoomCreatedMessage
  | ServerRoomJoinedMessage
  | ServerRoomUpdateMessage
  | ServerRoomErrorMessage
  | ServerGameStartingMessage
  | ServerPingLocationMessage
  | ServerHatchMessage;

// ── Map Layout ───────────────────────────────────────────────

export interface MapLayout {
  name: string;
  width: number;
  height: number;
  walls: Array<{ x: number; y: number; w: number; h: number }>;
  floors: Array<{ x: number; y: number; w: number; h: number; color: string }>;
  stations: Array<{ id: string; x: number; y: number; type: string }>;
  createdAt: string;
  updatedAt: string;
}
