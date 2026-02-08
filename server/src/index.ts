import { createServer } from "http";
import { WebSocketServer } from "ws";
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createMatch, tickMatch } from "./match/state.js";
import {
  handleClientMessage,
  ClientContext,
  handleClientDisconnect,
  broadcastSnapshot,
  broadcastGameOver,
} from "./net/ws.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = Number(process.env.PORT || 8080);
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Serve maps directory
const mapsPath = join(__dirname, "../../server/public/maps");
app.use("/maps", express.static(mapsPath));

// Serve static client files
const clientPath = join(__dirname, "../../client/dist");
app.use(express.static(clientPath));
app.get(/.*/i, (req, res) => {
  res.sendFile(join(clientPath, "index.html"));
});

// Legacy local match for backwards compatibility
const localMatch = createMatch("local-match");
const clients = new Set<ClientContext>();

wss.on("connection", (socket) => {
  const ctx: ClientContext = { socket, playerId: null, roomCode: null };
  clients.add(ctx);

  socket.on("message", (data) => {
    // Pass local match for backwards compatibility, but room handling is inside handleClientMessage
    handleClientMessage(ctx, data, localMatch, clients);
  });

  socket.on("close", () => {
    clients.delete(ctx);
    handleClientDisconnect(ctx, localMatch, clients);
  });
});

// Legacy local match tick (for when no rooms are used)
let gameOverBroadcasted = false;

setInterval(() => {
  // Only tick local match if there are players using it
  const localClients = Array.from(clients).filter((c) => !c.roomCode);
  if (localClients.length > 0) {
    const wasGameOver = localMatch.state.gameOver;
    tickMatch(localMatch);

    const localClientSet = new Set(localClients);
    broadcastSnapshot(localMatch, localClientSet as Set<ClientContext>);

    if (localMatch.state.gameOver && !gameOverBroadcasted) {
      broadcastGameOver(localMatch, localClientSet as Set<ClientContext>);
      gameOverBroadcasted = true;
    }
  }
}, 1000);

server.listen(PORT, () => {
  console.log(`Aether Spire server listening on :${PORT}`);
});
