import type {
  GameState,
  PlayerState,
  ServerMessage,
  ClientMessage,
  InstrumentType,
  RoomPlayer,
  LayerId,
} from "@aether-spire/shared";

const getWsUrl = () => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${hostname}:8080`;
  }
  return `${protocol}//${window.location.host}`;
};

const WS_URL = getWsUrl();

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface GameOverData {
  won: boolean;
  score: number;
  stars: number;
  issuesFixed: number;
  finalStability: number;
  timeSurvived: number;
}

export interface RoomCallbacks {
  onRoomCreated?: (roomCode: string, players: RoomPlayer[]) => void;
  onRoomJoined?: (roomCode: string, players: RoomPlayer[]) => void;
  onRoomUpdate?: (roomCode: string, players: RoomPlayer[]) => void;
  onRoomError?: (code: string, message: string) => void;
  onGameStarting?: (roomCode: string) => void;
}

export interface PingData {
  playerId: string;
  playerName: string;
  x: number;
  y: number;
  layer: import("@aether-spire/shared").LayerId;
  timestamp: number;
}

export interface HatchData {
  playerId: string;
  hatchId: string;
  toLayer: LayerId;
  toX: number;
  toY: number;
}

export function connectToServer(
  onSnapshot: (state: GameState) => void,
  onStatus?: (status: ConnectionStatus) => void,
  onPlayers?: (players: PlayerState[]) => void,
  onDoors?: (doors: { id: string; open: boolean }[]) => void,
  onGameOver?: (data: GameOverData) => void,
  roomCallbacks?: RoomCallbacks,
  onPing?: (ping: PingData) => void,
  onHatch?: (data: HatchData) => void
) {
  const socket = new WebSocket(WS_URL);
  let isConnected = false;
  const pending: string[] = [];

  socket.addEventListener("open", () => {
    console.log("Connected to server");
    isConnected = true;
    onStatus?.("connected");
    while (pending.length > 0) {
      const next = pending.shift();
      if (next) socket.send(next);
    }
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data) as ServerMessage;
    if (message.type === "snapshot") {
      onSnapshot(message.state);
      return;
    }
    if (message.type === "players") {
      onPlayers?.(message.players);
      return;
    }
    if (message.type === "doors") {
      onDoors?.(message.doors);
      return;
    }
    if (message.type === "game_over") {
      onGameOver?.({
        won: message.won,
        score: message.score,
        stars: message.stars,
        issuesFixed: message.issuesFixed,
        finalStability: message.finalStability,
        timeSurvived: message.timeSurvived,
      });
      return;
    }
    // Room messages
    if (message.type === "room_created") {
      roomCallbacks?.onRoomCreated?.(message.roomCode, message.players);
      return;
    }
    if (message.type === "room_joined") {
      roomCallbacks?.onRoomJoined?.(message.roomCode, message.players);
      return;
    }
    if (message.type === "room_update") {
      roomCallbacks?.onRoomUpdate?.(message.roomCode, message.players);
      return;
    }
    if (message.type === "room_error") {
      roomCallbacks?.onRoomError?.(message.code, message.message);
      return;
    }
    if (message.type === "game_starting") {
      roomCallbacks?.onGameStarting?.(message.roomCode);
      return;
    }
    if (message.type === "ping_location") {
      onPing?.({
        playerId: message.playerId,
        playerName: message.playerName,
        x: message.x,
        y: message.y,
        layer: message.layer,
        timestamp: message.timestamp,
      });
      return;
    }
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
  });

  socket.addEventListener("error", (event) => {
    console.warn("WebSocket error", event);
    onStatus?.("error");
  });

  socket.addEventListener("close", () => {
    console.log("Disconnected from server");
    isConnected = false;
    onStatus?.("disconnected");
  });

  onStatus?.("connecting");

  function send(payload: ClientMessage) {
    const text = JSON.stringify(payload);
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(text);
      return;
    }
    pending.push(text);
  }

  return {
    connected: () => isConnected,
    // Room methods
    createRoom: (playerId: string, playerName: string) => {
      send({ type: "create_room", playerId, playerName });
    },
    joinRoom: (roomCode: string, playerId: string, playerName: string) => {
      send({ type: "join_room", roomCode, playerId, playerName });
    },
    startGame: (roomCode: string, playerId: string) => {
      send({ type: "start_game", roomCode, playerId });
    },
    // Game methods
    join: (matchId: string, playerId: string, name: string) => {
      send({ type: "join", matchId, playerId, name });
    },
    sendMove: (matchId: string, playerId: string, x: number, y: number) => {
      send({ type: "move", matchId, playerId, x, y, sentAt: Date.now() });
    },
    sendDoor: (matchId: string, doorId: string, open: boolean) => {
      send({ type: "door", matchId, doorId, open, sentAt: Date.now() });
    },
    sendStartFix: (
      matchId: string,
      playerId: string,
      issueId: string,
      toolChoice: InstrumentType | "default"
    ) => {
      send({
        type: "start_fix",
        matchId,
        playerId,
        issueId,
        toolChoice,
        sentAt: Date.now(),
      });
    },
    sendCancelFix: (matchId: string, playerId: string) => {
      send({ type: "cancel_fix", matchId, playerId, sentAt: Date.now() });
    },
    sendPickupTool: (matchId: string, playerId: string, instrumentId: string) => {
      send({
        type: "pickup_tool",
        matchId,
        playerId,
        instrumentId,
        sentAt: Date.now(),
      });
    },
    sendPingLocation: (matchId: string, playerId: string, x: number, y: number, layer: import("@aether-spire/shared").LayerId) => {
      send({
        type: "ping_location",
        matchId,
        playerId,
        x,
        y,
        layer,
        sentAt: Date.now(),
      });
    },
    sendUseHatch: (matchId: string, playerId: string, hatchId: string) => {
      send({
        type: "use_hatch",
        matchId,
        playerId,
        hatchId,
        sentAt: Date.now(),
      });
    },
  };
}
