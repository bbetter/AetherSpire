import type { WebSocket } from "ws";
import type { RoomPlayer, ServerMessage } from "@aether-spire/shared";
import { createMatch, tickMatch, type MatchRuntime } from "../match/state.js";
import { broadcastSnapshot, broadcastGameOver } from "../net/ws.js";

export interface RoomClient {
  socket: WebSocket;
  playerId: string;
  playerName: string;
}

export interface Room {
  code: string;
  hostId: string;
  clients: Map<string, RoomClient>;
  match: MatchRuntime | null;
  gameStarted: boolean;
  tickInterval: ReturnType<typeof setInterval> | null;
  gameOverBroadcasted: boolean;
}

const rooms = new Map<string, Room>();

// Generate a random 4-character room code
function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude similar chars (0/O, 1/I)
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  // Ensure unique
  if (rooms.has(code)) {
    return generateRoomCode();
  }
  return code;
}

export function createRoom(hostId: string, hostName: string, socket: WebSocket): Room {
  const code = generateRoomCode();
  const room: Room = {
    code,
    hostId,
    clients: new Map(),
    match: null,
    gameStarted: false,
    tickInterval: null,
    gameOverBroadcasted: false,
  };

  room.clients.set(hostId, { socket, playerId: hostId, playerName: hostName });
  rooms.set(code, room);

  console.log(`Room ${code} created by ${hostName}`);
  return room;
}

export function joinRoom(
  code: string,
  playerId: string,
  playerName: string,
  socket: WebSocket
): Room | null {
  const room = rooms.get(code.toUpperCase());
  if (!room) return null;
  if (room.gameStarted) return null;
  if (room.clients.size >= 4) return null; // Max 4 players

  room.clients.set(playerId, { socket, playerId, playerName });
  console.log(`${playerName} joined room ${code}`);
  return room;
}

export function getRoom(code: string): Room | null {
  return rooms.get(code.toUpperCase()) || null;
}

export function getRoomByPlayerId(playerId: string): Room | null {
  for (const room of rooms.values()) {
    if (room.clients.has(playerId)) {
      return room;
    }
  }
  return null;
}

export function removePlayerFromRoom(playerId: string): void {
  const room = getRoomByPlayerId(playerId);
  if (!room) return;

  room.clients.delete(playerId);

  // If room is empty, clean it up
  if (room.clients.size === 0) {
    if (room.tickInterval) {
      clearInterval(room.tickInterval);
    }
    rooms.delete(room.code);
    console.log(`Room ${room.code} deleted (empty)`);
    return;
  }

  // If host left, assign new host
  if (room.hostId === playerId) {
    const newHost = room.clients.values().next().value;
    if (newHost) {
      room.hostId = newHost.playerId;
    }
  }

  // Broadcast room update
  broadcastRoomUpdate(room);
}

export function getRoomPlayers(room: Room): RoomPlayer[] {
  const players: RoomPlayer[] = [];
  for (const client of room.clients.values()) {
    players.push({
      playerId: client.playerId,
      name: client.playerName,
      isHost: client.playerId === room.hostId,
    });
  }
  return players;
}

export function broadcastToRoom(room: Room, message: ServerMessage): void {
  const text = JSON.stringify(message);
  for (const client of room.clients.values()) {
    try {
      client.socket.send(text);
    } catch {
      // Client may have disconnected
    }
  }
}

export function broadcastRoomUpdate(room: Room): void {
  broadcastToRoom(room, {
    type: "room_update",
    roomCode: room.code,
    players: getRoomPlayers(room),
  });
}

export function startGame(room: Room): boolean {
  if (room.gameStarted) return false;
  if (room.clients.size < 1) return false;

  room.gameStarted = true;
  room.match = createMatch(room.code);
  room.match.playerCount = room.clients.size;

  // Broadcast game starting
  broadcastToRoom(room, { type: "game_starting", roomCode: room.code });

  // Start tick interval
  room.tickInterval = setInterval(() => {
    if (!room.match) return;

    const wasGameOver = room.match.state.gameOver;
    tickMatch(room.match);

    // Get clients as Set for broadcast functions
    const clientSet = new Set(
      Array.from(room.clients.values()).map((c) => ({
        socket: c.socket,
        playerId: c.playerId,
      }))
    );

    broadcastSnapshot(room.match, clientSet as any);

    if (room.match.state.gameOver && !room.gameOverBroadcasted) {
      broadcastGameOver(room.match, clientSet as any);
      room.gameOverBroadcasted = true;
    }
  }, 1000);

  console.log(`Game started in room ${room.code} with ${room.clients.size} players`);
  return true;
}

export function getAllRooms(): Room[] {
  return Array.from(rooms.values());
}
