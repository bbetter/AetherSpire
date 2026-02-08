import type { WebSocket } from "ws";
import type {
  ClientMessage,
  PlayerState,
  ServerErrorMessage,
  ServerMessage,
  InstrumentType,
  LayerId,
} from "@aether-spire/shared";
import { HATCH_DEFINITIONS } from "@aether-spire/shared";
import type { MatchRuntime } from "../match/state.js";
import { calculateScore } from "../match/state.js";
import {
  createRoom,
  joinRoom,
  getRoom,
  getRoomByPlayerId,
  getRoomPlayers,
  removePlayerFromRoom,
  broadcastToRoom,
  broadcastRoomUpdate,
  startGame,
  type Room,
} from "../room/manager.js";

export interface ClientContext {
  socket: WebSocket;
  playerId: string | null;
  roomCode: string | null;
}

// Per-room player tracking
const roomPlayers = new Map<string, Map<string, PlayerState>>();
const roomDoors = new Map<string, Map<string, boolean>>();

function getPlayersForRoom(roomCode: string): Map<string, PlayerState> {
  let players = roomPlayers.get(roomCode);
  if (!players) {
    players = new Map();
    roomPlayers.set(roomCode, players);
  }
  return players;
}

function getDoorsForRoom(roomCode: string): Map<string, boolean> {
  let doors = roomDoors.get(roomCode);
  if (!doors) {
    doors = new Map();
    roomDoors.set(roomCode, doors);
  }
  return doors;
}

const FIX_RANGE = 60;

export function handleClientMessage(
  ctx: ClientContext,
  data: WebSocket.RawData,
  match: MatchRuntime | null,
  clients: Set<ClientContext>
) {
  let message: ClientMessage;
  try {
    message = JSON.parse(data.toString());
  } catch {
    sendError(ctx, "BAD_JSON", "Could not parse message");
    return;
  }

  try {
    // ── Room Management Messages ──
    if (message.type === "create_room") {
      const room = createRoom(message.playerId, message.playerName, ctx.socket);
      ctx.playerId = message.playerId;
      ctx.roomCode = room.code;

      ctx.socket.send(JSON.stringify({
        type: "room_created",
        roomCode: room.code,
        players: getRoomPlayers(room),
      }));
      return;
    }

    if (message.type === "join_room") {
      const room = joinRoom(message.roomCode, message.playerId, message.playerName, ctx.socket);
      if (!room) {
        ctx.socket.send(JSON.stringify({
          type: "room_error",
          code: "ROOM_NOT_FOUND",
          message: "Room not found or game already started",
        }));
        return;
      }

      ctx.playerId = message.playerId;
      ctx.roomCode = room.code;

      ctx.socket.send(JSON.stringify({
        type: "room_joined",
        roomCode: room.code,
        players: getRoomPlayers(room),
      }));

      // Notify others in the room
      broadcastRoomUpdate(room);
      return;
    }

    if (message.type === "start_game") {
      const room = getRoom(message.roomCode);
      if (!room) {
        ctx.socket.send(JSON.stringify({
          type: "room_error",
          code: "ROOM_NOT_FOUND",
          message: "Room not found",
        }));
        return;
      }

      if (room.hostId !== message.playerId) {
        ctx.socket.send(JSON.stringify({
          type: "room_error",
          code: "NOT_HOST",
          message: "Only the host can start the game",
        }));
        return;
      }

      startGame(room);
      return;
    }

    // ── Game Messages (require active room with game) ──
    const room = ctx.roomCode ? getRoom(ctx.roomCode) : null;
    const activeMatch = room?.match || match;
    const roomCode = room?.code || "local";
    const players = getPlayersForRoom(roomCode);
    const doors = getDoorsForRoom(roomCode);

    // Get clients for this room
    const roomClients = room
      ? new Set(Array.from(room.clients.values()).map((c) => ({ socket: c.socket, playerId: c.playerId })))
      : clients;

    if (message.type === "join") {
      ctx.playerId = message.playerId;
      const existing = players.get(message.playerId);
      if (existing) {
        existing.name = message.name;
      } else {
        players.set(message.playerId, {
          playerId: message.playerId,
          name: message.name,
          x: 0,
          y: 0,
          layer: "deck",
        });
      }
      if (activeMatch) {
        activeMatch.playerCount = players.size;
        broadcastPlayers(activeMatch, roomClients as any, players);
        broadcastDoors(roomClients as any, doors);
        broadcastSnapshot(activeMatch, roomClients as any);
      }
      return;
    }

    if (message.type === "ping") {
      ctx.socket.send(
        JSON.stringify({ type: "pong", sentAt: message.sentAt, serverTime: Date.now() })
      );
      return;
    }

    if (message.type === "ping_location") {
      if (!message.playerId) return;
      const playerEntry = players.get(message.playerId);
      const playerName = playerEntry?.name || "Unknown";

      // Broadcast ping to all players in the room/match
      const pingMessage = {
        type: "ping_location",
        playerId: message.playerId,
        playerName,
        x: message.x,
        y: message.y,
        layer: message.layer || playerEntry?.layer || "deck",
        timestamp: Date.now(),
      };
      const text = JSON.stringify(pingMessage);
      for (const client of roomClients) {
        try {
          (client as any).socket.send(text);
        } catch {
          // Client may have disconnected
        }
      }
      return;
    }

    if (message.type === "move") {
      if (!message.playerId) return;
      if (!activeMatch) return;

      const entry = players.get(message.playerId);
      let moved = false;
      if (entry) {
        const dx = message.x - entry.x;
        const dy = message.y - entry.y;
        moved = dx * dx + dy * dy > 1;
        entry.x = message.x;
        entry.y = message.y;
      } else {
        players.set(message.playerId, {
          playerId: message.playerId,
          name: message.playerId,
          x: message.x,
          y: message.y,
          layer: "deck",
        });
      }

      // Only cancel fix if the player actually moved AND fix hasn't elapsed
      if (moved) {
        const fix = activeMatch.fixProgress.get(message.playerId);
        if (fix) {
          const now = Date.now();
          const elapsed = now - fix.startedAt;
          // If the fix duration has already passed, don't cancel — let checkFixCompletions handle it
          if (elapsed < fix.durationMs) {
            const issue = activeMatch.state.issues.find((i) => i.id === fix.issueId);
            if (issue && issue.status === "in_progress") {
              issue.fixingBy = issue.fixingBy.filter((id) => id !== message.playerId);
              if (issue.fixingBy.length === 0) {
                issue.status = "active";
                issue.fixStartedAt = undefined;
                issue.fixDurationMs = undefined;
              }
            }
            activeMatch.fixProgress.delete(message.playerId);
            broadcastSnapshot(activeMatch, roomClients as any);
          }
        }
      }

      broadcastPlayers(activeMatch, roomClients as any, players);
      return;
    }

    if (message.type === "door") {
      doors.set(message.doorId, message.open);
      broadcastDoors(roomClients as any, doors);
      return;
    }

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
        const dx = playerEntry.x - hatch.posA.x;
        const dy = playerEntry.y - hatch.posA.y;
        if (dx * dx + dy * dy > FIX_RANGE * FIX_RANGE) return;
      } else if (playerEntry.layer === hatch.layerB) {
        toLayer = hatch.layerA;
        toX = hatch.posA.x;
        toY = hatch.posA.y;
        const dx = playerEntry.x - hatch.posB.x;
        const dy = playerEntry.y - hatch.posB.y;
        if (dx * dx + dy * dy > FIX_RANGE * FIX_RANGE) return;
      } else {
        return;
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

    if (message.type === "start_fix") {
      if (!message.playerId) return;
      if (!activeMatch) return;
      if (activeMatch.state.gameOver) return;

      const playerEntry = players.get(message.playerId);
      if (!playerEntry) return;

      if (activeMatch.fixProgress.has(message.playerId)) return;

      const issue = activeMatch.state.issues.find(
        (i) => i.id === message.issueId && (i.status === "active" || i.status === "in_progress")
      );
      if (!issue) return;

      if (issue.status === "in_progress") {
        if (issue.fixingBy.includes(message.playerId)) return;
      }

      const dx = playerEntry.x - issue.x;
      const dy = playerEntry.y - issue.y;
      if (dx * dx + dy * dy > FIX_RANGE * FIX_RANGE) return;

      // Layer check
      if (playerEntry.layer !== issue.layer) return;

      const now = Date.now();

      if (issue.status === "active") {
        // First fixer: normal tool choice flow
        let toolUsed: InstrumentType | null = null;
        let durationMs: number;

        if (message.toolChoice !== "default") {
          const toolType = message.toolChoice as InstrumentType;
          const toolIdx = activeMatch.state.teamInventory.indexOf(toolType);
          if (toolIdx === -1) return;
          if (toolType !== issue.requiredTool) return;

          activeMatch.state.teamInventory.splice(toolIdx, 1);
          toolUsed = toolType;
          durationMs = issue.fixTimeWithTool * 1000;
        } else {
          durationMs = issue.baseFixTime * 1000;
        }

        issue.fixingBy.push(message.playerId);
        issue.status = "in_progress";
        issue.fixStartedAt = now;
        issue.fixDurationMs = durationMs;

        activeMatch.fixProgress.set(message.playerId, {
          playerId: message.playerId,
          issueId: issue.id,
          startedAt: now,
          durationMs,
          toolUsed,
        });
      } else {
        // Helper joining an in_progress issue: apply 40% speed boost
        issue.fixingBy.push(message.playerId);

        const elapsed = now - (issue.fixStartedAt || now);
        const oldRemaining = Math.max(0, (issue.fixDurationMs || 0) - elapsed);
        const newRemaining = oldRemaining * 0.6;
        const newTotalDuration = elapsed + newRemaining;

        issue.fixDurationMs = newTotalDuration;

        // Update all existing fixers' progress to match new duration
        for (const existingFixerId of issue.fixingBy) {
          const existingFix = activeMatch.fixProgress.get(existingFixerId);
          if (existingFix && existingFix.issueId === issue.id) {
            existingFix.durationMs = newTotalDuration;
            existingFix.startedAt = issue.fixStartedAt || now;
          }
        }

        // Add helper's fix progress
        activeMatch.fixProgress.set(message.playerId, {
          playerId: message.playerId,
          issueId: issue.id,
          startedAt: issue.fixStartedAt || now,
          durationMs: newTotalDuration,
          toolUsed: null,
        });
      }

      broadcastSnapshot(activeMatch, roomClients as any);
      return;
    }

    if (message.type === "cancel_fix") {
      if (!message.playerId) return;
      if (!activeMatch) return;

      const fix = activeMatch.fixProgress.get(message.playerId);
      if (!fix) return;

      // Don't cancel if the fix has already elapsed — let checkFixCompletions resolve it
      const now = Date.now();
      if (now - fix.startedAt >= fix.durationMs) return;

      const issue = activeMatch.state.issues.find((i) => i.id === fix.issueId);
      if (issue && issue.status === "in_progress") {
        issue.fixingBy = issue.fixingBy.filter((id) => id !== message.playerId);
        if (issue.fixingBy.length === 0) {
          issue.status = "active";
          issue.fixStartedAt = undefined;
          issue.fixDurationMs = undefined;
        }
      }
      activeMatch.fixProgress.delete(message.playerId);
      broadcastSnapshot(activeMatch, roomClients as any);
      return;
    }

    if (message.type === "pickup_tool") {
      if (!message.playerId) return;
      if (!activeMatch) return;

      const playerEntry = players.get(message.playerId);
      if (!playerEntry) return;

      const instIdx = activeMatch.state.groundInstruments.findIndex(
        (gi) => gi.id === message.instrumentId
      );
      if (instIdx === -1) return;

      const inst = activeMatch.state.groundInstruments[instIdx];

      const dx = playerEntry.x - inst.x;
      const dy = playerEntry.y - inst.y;
      if (dx * dx + dy * dy > FIX_RANGE * FIX_RANGE) return;

      // Layer check
      if (playerEntry.layer !== inst.layer) return;

      activeMatch.state.teamInventory.push(inst.type);
      activeMatch.state.groundInstruments.splice(instIdx, 1);

      broadcastSnapshot(activeMatch, roomClients as any);
      return;
    }

    sendError(ctx, "UNKNOWN", "Unknown message type");
  } catch (error) {
    console.error("Error handling message:", error);
    sendError(ctx, "ERROR", "Internal server error");
  }
}

export function handleClientDisconnect(
  ctx: ClientContext,
  match: MatchRuntime | null,
  clients: Set<ClientContext>
) {
  if (ctx.playerId) {
    // Handle room-based disconnect
    if (ctx.roomCode) {
      const room = getRoom(ctx.roomCode);
      if (room?.match) {
        const fix = room.match.fixProgress.get(ctx.playerId);
        if (fix) {
          const issue = room.match.state.issues.find((i) => i.id === fix.issueId);
          if (issue && issue.status === "in_progress") {
            issue.fixingBy = issue.fixingBy.filter((id) => id !== ctx.playerId);
            if (issue.fixingBy.length === 0) {
              issue.status = "active";
              issue.fixStartedAt = undefined;
              issue.fixDurationMs = undefined;
            }
          }
          room.match.fixProgress.delete(ctx.playerId);
        }
      }
      removePlayerFromRoom(ctx.playerId);
    }

    // Handle legacy local match disconnect
    if (match) {
      const fix = match.fixProgress.get(ctx.playerId);
      if (fix) {
        const issue = match.state.issues.find((i) => i.id === fix.issueId);
        if (issue && issue.status === "in_progress") {
          issue.fixingBy = issue.fixingBy.filter((id) => id !== ctx.playerId);
          if (issue.fixingBy.length === 0) {
            issue.status = "active";
            issue.fixStartedAt = undefined;
            issue.fixDurationMs = undefined;
          }
        }
        match.fixProgress.delete(ctx.playerId);
      }

      const players = getPlayersForRoom("local");
      players.delete(ctx.playerId);
      match.playerCount = players.size;
      broadcastPlayers(match, clients, players);
    }
  }
}

function broadcastPlayers(
  match: MatchRuntime,
  clients: Set<ClientContext>,
  players?: Map<string, PlayerState>
) {
  const playerMap = players || getPlayersForRoom("local");
  const playerList = Array.from(playerMap.values()).map(player => {
    // Add fix progress information to the player state if they are currently fixing
    const fixProgress = match.fixProgress.get(player.playerId);
    if (fixProgress) {
      const issue = match.state.issues.find(i => i.id === fixProgress.issueId);
      if (issue && issue.status === "in_progress") {
        const elapsed = Date.now() - (issue.fixStartedAt || fixProgress.startedAt);
        const progress = Math.min(1, elapsed / (issue.fixDurationMs || fixProgress.durationMs));
        
        return {
          ...player,
          fixProgress: {
            issueId: fixProgress.issueId,
            progress,
            startTime: issue.fixStartedAt || fixProgress.startedAt,
            durationMs: issue.fixDurationMs || fixProgress.durationMs,
            label: fixProgress.toolUsed ? `Fixing with tool (${Math.ceil((issue.fixDurationMs || fixProgress.durationMs) / 1000)}s)` : `Fixing manually (${Math.ceil((issue.fixDurationMs || fixProgress.durationMs) / 1000)}s)`
          }
        };
      }
    }
    // Return player without fix progress if not currently fixing
    return player;
  });
  
  const payload: ServerMessage = {
    type: "players",
    players: playerList,
  };
  const text = JSON.stringify(payload);
  for (const client of clients) {
    try {
      client.socket.send(text);
    } catch {
      // Client may have disconnected
    }
  }
}

export function broadcastSnapshot(match: MatchRuntime, clients: Set<ClientContext>) {
  const payload: ServerMessage = { type: "snapshot", state: match.state };
  const text = JSON.stringify(payload);
  for (const client of clients) {
    try {
      client.socket.send(text);
    } catch {
      // Client may have disconnected
    }
  }
}

export function broadcastGameOver(match: MatchRuntime, clients: Set<ClientContext>) {
  const { score, stars, timeSurvived } = calculateScore(match);
  const payload: ServerMessage = {
    type: "game_over",
    won: match.state.won,
    score,
    stars,
    issuesFixed: match.state.issuesFixed,
    finalStability: Math.round(match.state.stability),
    timeSurvived,
  };
  const text = JSON.stringify(payload);
  for (const client of clients) {
    try {
      client.socket.send(text);
    } catch {
      // Client may have disconnected
    }
  }
}

function broadcastDoors(clients: Set<ClientContext>, doors?: Map<string, boolean>) {
  const doorMap = doors || getDoorsForRoom("local");
  const payload: ServerMessage = {
    type: "doors",
    doors: Array.from(doorMap.entries()).map(([id, open]) => ({ id, open })),
  };
  const text = JSON.stringify(payload);
  for (const client of clients) {
    try {
      client.socket.send(text);
    } catch {
      // Client may have disconnected
    }
  }
}

function sendError(ctx: ClientContext, code: string, message: string) {
  const payload: ServerErrorMessage = { type: "error", code, message };
  try {
    ctx.socket.send(JSON.stringify(payload));
  } catch {
    // Client may have disconnected
  }
}
