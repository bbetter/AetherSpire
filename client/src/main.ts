import { Application } from "pixi.js";
import { createWorld } from "./game/render";
import { connectToServer } from "./net/ws";
import { playFootstep, playPickup, playFixStart, playToolFixStart, playFixComplete, playIssueAlert, playHatchTransition, setSfxVolume, setSfxMuted, isSfxMuted } from "./game/sfx";
import { colorFromId, getAreaName, circleIntersectsRect, findNearestDoor } from "./game/utils";
import type { Issue, GroundInstrument, LayerId } from "@aether-spire/shared";
import { HATCH_DEFINITIONS } from "@aether-spire/shared";
import type { GameState } from "@aether-spire/shared";

(async () => {
const app = new Application();
await app.init({ background: "#0c0f14", resizeTo: window });

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root");

app.canvas.style.display = "block";
app.canvas.style.width = "100%";
app.canvas.style.height = "100%";
root.appendChild(app.canvas);

let world: ReturnType<typeof createWorld> | null = null;

// Player state
let spawn = { x: 1600, y: 1200 };
const player = { x: spawn.x, y: spawn.y, speed: 280 };
let joined = false;
const playerId = crypto.randomUUID();
const keys = new Set<string>();
const DEFAULT_ZOOM = 1.25;
const camera = { x: player.x, y: player.y, zoom: DEFAULT_ZOOM };
let lastMoveSentAt = 0;
let lastPickedUpToolId = "";
let lastPickupAt = 0;

// Issue interaction state
const ISSUE_INTERACT_RANGE = 60;
const INSTRUMENT_PICKUP_RANGE = 40; // Auto-pickup range

interface ContextMenuState {
  visible: boolean;
  issueId: string;
  issue: Issue | null;
  selectedIndex: number;
}
const contextMenu: ContextMenuState = {
  visible: false,
  issueId: "",
  issue: null,
  selectedIndex: 0,
};

interface FixState {
  active: boolean;
  issueId: string;
  startedAt: number;
  durationMs: number;
  label: string;
}
let fixing: FixState | null = null;

let latestState: GameState | null = null;
let gameOver = false;
let gameStarted = false;
let playerName = "";
let currentLayer: LayerId = "deck";

// Room state
let currentRoomCode = "";
let isHost = false;

// Track known issues for detecting new ones
const knownIssueIds = new Set<string>();
let otherLayerPlayerCount = 0;


const issueTypeNames: Record<string, string> = {
  pressure_surge: "Pressure Surge",
  coolant_leak: "Coolant Leak",
  mechanical_drift: "Mechanical Drift",
  capacitor_overload: "Capacitor Overload",
  friction_fire: "Friction Fire",
  control_corruption: "Control Corruption",
};

const issueTypeColors: Record<string, number> = {
  pressure_surge: 0xff6b6b,
  coolant_leak: 0x6aa5ff,
  mechanical_drift: 0xffb24d,
  capacitor_overload: 0xb197fc,
  friction_fire: 0xff9944,
  control_corruption: 0x63e6be,
};

// Track other player positions for minimap
let otherPlayerPositions: { x: number; y: number }[] = [];

// Track stability for warning log messages
let lastStabilityWarning = 100;

// Ping system
const PING_COOLDOWN_MS = 3000; // 3 second cooldown between pings
let lastPingSentAt = 0;

// ── Background Music ──
const bgMusic = new Audio("/music/background.mp3");
bgMusic.loop = true;
bgMusic.volume = 0.3;
let musicStarted = false;

// Footstep throttle
let lastFootstepAt = 0;
const FOOTSTEP_INTERVAL_MS = 280;

// Speed boost after fixing
const SPEED_BOOST_MULTIPLIER = 1.5;
const SPEED_BOOST_DURATION_MS = 2000;
let speedBoostEndAt = 0;

// Hatch transition cooldown
const HATCH_COOLDOWN_MS = 1500;
let hatchCooldownUntil = 0;

// Auto-zoom on game over
const GAME_OVER_ZOOM_TARGET = 0.5;
const GAME_OVER_ZOOM_DURATION_MS = 1500;
let gameOverStartedAt = 0;
let gameOverZoomFrom = DEFAULT_ZOOM;

function startMusic() {
  if (musicStarted) return;
  musicStarted = true;
  bgMusic.play().catch(() => {});
}

const demoState: GameState = {
  matchId: "demo",
  seed: 0,
  phase: "early",
  timeRemainingSec: 7 * 60,  // Updated to 7 minutes to match server
  nextTickAt: Date.now() + 1000,
  stability: 100,
  issues: [],
  teamInventory: [],
  groundInstruments: [],
  hatches: [],
  issuesFixed: 0,
  gameOver: false,
  won: false,
};

function canMoveTo(nx: number, ny: number) {
  const radius = 10;

  // Check hull boundary (ship collision)
  if (!world!.isInsideHull(nx, ny)) return false;

  const walls = world!.getWalls();
  for (const wall of walls) {
    if (circleIntersectsRect(nx, ny, radius, wall)) return false;
  }
  const doors = world!.getDoors();
  for (const door of doors) {
    if (door.open) continue;
    if (circleIntersectsRect(nx, ny, radius, door)) return false;
  }
  return true;
}

function findNearestIssue(): Issue | null {
  if (!latestState) return null;
  let best: Issue | null = null;
  let bestDist = Infinity;
  for (const issue of latestState.issues) {
    if (issue.layer !== currentLayer) continue;
    const isActive = issue.status === "active";
    // Allow joining any in_progress issue we're not already part of
    const isJoinable =
      issue.status === "in_progress" &&
      !issue.fixingBy.includes(playerId);

    if (!isActive && !isJoinable) continue;

    const dx = player.x - issue.x;
    const dy = player.y - issue.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist && dist <= ISSUE_INTERACT_RANGE) {
      best = issue;
      bestDist = dist;
    }
  }
  return best;
}

function findNearestGroundInstrument(): GroundInstrument | null {
  if (!latestState) return null;
  let best: GroundInstrument | null = null;
  let bestDist = Infinity;
  for (const inst of latestState.groundInstruments) {
    if (inst.layer !== currentLayer) continue;
    const dx = player.x - inst.x;
    const dy = player.y - inst.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist && dist <= INSTRUMENT_PICKUP_RANGE) {
      best = inst;
      bestDist = dist;
    }
  }
  return best;
}


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

function cancelFix() {
  if (!fixing) return;
  fixing = null;
  world?.setChannelProgress(0, "");
  connection.sendCancelFix("local-match", playerId);
}

function openContextMenu(issue: Issue) {
  contextMenu.visible = true;
  contextMenu.issueId = issue.id;
  contextMenu.issue = issue;
  contextMenu.selectedIndex = 0;
  if (latestState) {
    world?.showContextMenu(issue, latestState.teamInventory, 0);
  }
}

function closeContextMenu() {
  contextMenu.visible = false;
  contextMenu.issue = null;
  world?.hideContextMenu();
}

function confirmContextMenu() {
  if (!contextMenu.issue || !latestState) return;
  const issue = contextMenu.issue;
  const idx = contextMenu.selectedIndex;

  if (idx === 2) {
    // Cancel
    closeContextMenu();
    return;
  }

  if (idx === 1) {
    // Use tool
    const hasTool = latestState.teamInventory.includes(issue.requiredTool);
    if (!hasTool) return; // can't select disabled option
    connection.sendStartFix("local-match", playerId, issue.id, issue.requiredTool);
    fixing = {
      active: true,
      issueId: issue.id,
      startedAt: performance.now(),
      durationMs: issue.fixTimeWithTool * 1000,
      label: `Fixing (${issue.fixTimeWithTool}s)`,
    };
    playToolFixStart();
  } else {
    // Fix manually
    connection.sendStartFix("local-match", playerId, issue.id, "default");
    fixing = {
      active: true,
      issueId: issue.id,
      startedAt: performance.now(),
      durationMs: issue.baseFixTime * 1000,
      label: `Fixing (${issue.baseFixTime}s)`,
    };
    playFixStart();
  }

  closeContextMenu();
}

// ── Start Screen ──

async function initializeGame() {
  if (!world) {
    world = createWorld(app);
    app.stage.addChild(world.container);
    world.setAudioCallbacks(
      (bgm, sfx) => {
        bgMusic.volume = bgm;
        setSfxVolume(sfx);
      },
      (muted) => {
        bgMusic.muted = muted;
        setSfxMuted(muted);
      },
    );
    spawn = world.getSpawnPoint();
    player.x = spawn.x;
    player.y = spawn.y;
    world.setPlayer(player.x, player.y);
    world.setCamera(player.x, player.y);
    world.update(demoState);
    latestState = demoState;
  }

  joined = true;
  world.setPlayerColor(colorFromId(playerId));
  world.setPlayerName(playerName);
  connection.join(currentRoomCode || "local-match", playerId, playerName);
  gameStarted = true;
  startMusic();
  world.addLogEntry(`Welcome, ${playerName}!`, 0x7ee3c2);
  world.addLogEntry("Survive 7 minutes. Fix issues!", 0xcbd3dd); // Updated to 7 minutes
}

const startScreen = createStartScreen({
  onCreateRoom: (name) => {
    playerName = name;
    connection.createRoom(playerId, name);
  },
  onJoinRoom: (name, roomCode) => {
    playerName = name;
    connection.joinRoom(roomCode, playerId, name);
  },
  onStartGame: () => {
    if (currentRoomCode && isHost) {
      connection.startGame(currentRoomCode, playerId);
    }
  },
});

// ── Connection ──

const connection = connectToServer(
  (state) => {
    latestState = state;
    if (world) world.update(state);

    // Detect new issues and log them
    for (const issue of state.issues) {
      if (!knownIssueIds.has(issue.id)) {
        knownIssueIds.add(issue.id);
        const areaName = getAreaName(issue.x, issue.y, issue.layer);
        const typeName = issueTypeNames[issue.type] || issue.type;
        const color = issueTypeColors[issue.type] || 0xcbd3dd;
        const layerLabel = issue.layer !== currentLayer ? (issue.layer === "cargo" ? " [Cargo]" : " [Deck]") : "";
        world?.addLogEntry(`${typeName} in ${areaName}${layerLabel}!`, color);
        playIssueAlert();
        // Flash layer card aggressively if issue is on other layer with no players there
        if (issue.layer !== currentLayer && otherLayerPlayerCount === 0) {
          world?.flashLayerCard();
        }
      }
    }

    // Detect fixed issues (no longer in list) and log them
    const currentIds = new Set(state.issues.map((i) => i.id));
    for (const id of knownIssueIds) {
      if (!currentIds.has(id)) {
        knownIssueIds.delete(id);
        world?.addLogEntry("Issue resolved", 0x5fc96b);
      }
    }

    // Update other-layer issue count for minimap card
    const otherCount = state.issues.filter(i => i.layer !== currentLayer && i.status === "active").length;
    world?.setOtherLayerIssueCount(otherCount);

    // Log stability warnings at thresholds
    const thresholds = [50, 30, 15];
    for (const threshold of thresholds) {
      if (state.stability <= threshold && lastStabilityWarning > threshold) {
        const color = threshold <= 15 ? 0xff6b6b : threshold <= 30 ? 0xffb24d : 0xffd93d;
        world?.addLogEntry(`WARNING: Stability at ${Math.round(state.stability)}%!`, color);
        lastStabilityWarning = state.stability;
        break;
      }
    }
    if (state.stability > lastStabilityWarning + 10) {
      lastStabilityWarning = state.stability;
    }

    // Sync fix duration and detect completion
    if (fixing) {
      const fixedIssue = state.issues.find(
        (i) => i.id === fixing!.issueId && i.status === "in_progress"
      );
      if (fixedIssue && fixedIssue.fixStartedAt && fixedIssue.fixDurationMs) {
        // Sync local progress bar with server's authoritative duration
        const serverElapsed = Date.now() - fixedIssue.fixStartedAt;
        const serverRemaining = fixedIssue.fixDurationMs - serverElapsed;
        const localElapsed = performance.now() - fixing.startedAt;
        const newLocalDuration = localElapsed + Math.max(0, serverRemaining);
        if (Math.abs(newLocalDuration - fixing.durationMs) > 200) {
          fixing.durationMs = newLocalDuration;
          const remainSec = Math.ceil(Math.max(0, serverRemaining) / 1000);
          fixing.label = fixedIssue.fixingBy.length >= 2
            ? `Helping (${remainSec}s)`
            : `Fixing (${remainSec}s)`;
        }
      }
      if (!fixedIssue) {
        const wasComplete = performance.now() - fixing.startedAt >= fixing.durationMs;
        fixing = null;
        world?.setChannelProgress(0, "");
        if (wasComplete) {
          playFixComplete();
          speedBoostEndAt = performance.now() + SPEED_BOOST_DURATION_MS;
          world?.addLogEntry("Speed boost!", 0x7ee3c2);
        }
      }
    }
  },
  (status) => {
    startScreen.setStatus(status);
  },
  (players) => {
    const others = players
      .filter((entry) => entry.playerId !== playerId && entry.layer === currentLayer)
      .map((entry) => ({
        playerId: entry.playerId,
        x: entry.x,
        y: entry.y,
        color: colorFromId(entry.playerId),
        name: entry.name,
        fixProgress: entry.fixProgress, // Include fix progress if available
      }));
    otherPlayerPositions = others.map((p) => ({ x: p.x, y: p.y }));
    if (world) {
      world.setOtherPlayers(others);
      // Count players on the other layer for minimap card
      otherLayerPlayerCount = players.filter(
        (entry) => entry.playerId !== playerId && entry.layer !== currentLayer
      ).length;
      world.setOtherLayerPlayerCount(otherLayerPlayerCount);
    }
  },
  (doors) => {
    if (world) world.setDoorsState(doors);
  },
  (gameOverData) => {
    gameOver = true;
    gameOverStartedAt = performance.now();
    gameOverZoomFrom = camera.zoom;
    if (world) world.showResultsScreen(gameOverData);
  },
  // Room callbacks
  {
    onRoomCreated: (roomCode, players) => {
      currentRoomCode = roomCode;
      isHost = true;
      startScreen.showLobby(roomCode, true);
      startScreen.updatePlayers(players.map((p) => ({ name: p.name, isHost: p.isHost })));
    },
    onRoomJoined: (roomCode, players) => {
      currentRoomCode = roomCode;
      const me = players.find((p) => p.playerId === playerId);
      isHost = me?.isHost ?? false;
      startScreen.showLobby(roomCode, isHost);
      startScreen.updatePlayers(players.map((p) => ({ name: p.name, isHost: p.isHost })));
    },
    onRoomUpdate: (roomCode, players) => {
      const me = players.find((p) => p.playerId === playerId);
      isHost = me?.isHost ?? false;
      startScreen.updatePlayers(players.map((p) => ({ name: p.name, isHost: p.isHost })));
    },
    onRoomError: (code, message) => {
      startScreen.showError(message);
    },
    onGameStarting: (roomCode) => {
      startScreen.hide();
      
      // Show loading screen for all players when game is starting
      if (world) {
        const w = world;
        w.showLoadingScreen();
        w.updateLoadingProgress(30, "Loading tool textures...");

        // Preload assets before starting the game
        // Add a timeout to ensure we don't get stuck
        const timeoutPromise = new Promise((resolve) => {
          setTimeout(() => {
            console.log("Asset loading timeout - proceeding anyway");
            resolve(null);
          }, 5000); // 5 second timeout
        });

        // Wait for all assets to load or timeout
        Promise.race([w.preloadAllAssets(), timeoutPromise]).then(async () => {
          w.updateLoadingProgress(60, "Loading textures...");

          w.updateLoadingProgress(80, "Preparing game world...");

          // Small delay to ensure all assets are fully loaded
          await new Promise(resolve => setTimeout(resolve, 200));

          w.updateLoadingProgress(100, "Ready!");
          setTimeout(() => {
            w.hideLoadingScreen();
            initializeGame();
          }, 300);
        });
      } else {
        // If world isn't created yet, just initialize the game
        initializeGame();
      }
    },
  },
  // Ping callback
  (ping) => {
    if (!world) return;
    world.addPing({
      x: ping.x,
      y: ping.y,
      layer: ping.layer,
      playerName: ping.playerName,
      timestamp: ping.timestamp,
      playerId: ping.playerId,
    });
    // Log ping notification (only for other players' pings)
    if (ping.playerId !== playerId) {
      const areaName = getAreaName(ping.x, ping.y, ping.layer);
      const layerLabel = ping.layer !== currentLayer ? (ping.layer === "cargo" ? " [Cargo]" : " [Deck]") : "";
      world.addLogEntry(`${ping.playerName} pinged ${areaName}${layerLabel}`, 0xffdd44);
    }
  },
  // Hatch callback (8th argument)
  (hatchData) => {
    if (!world) return;
    if (hatchData.playerId !== playerId) return;
    playHatchTransition();
    world.startLayerTransition(hatchData.toLayer, hatchData.toX, hatchData.toY);
  }
);

// ── Game Loop ──

app.ticker.add((ticker) => {
  if (!world || !gameStarted || !latestState) return;

  const delta = ticker.deltaTime;
  const dt = (Number.isFinite(delta) && delta > 0 ? delta : 1) / 60;

  // Decrement time locally for smooth countdown
  latestState.timeRemainingSec = Math.max(0, latestState.timeRemainingSec - dt);
  world.updateMeta(latestState);

  if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) {
    player.x = spawn.x;
    player.y = spawn.y;
  }
  if (!Number.isFinite(camera.x) || !Number.isFinite(camera.y)) {
    camera.x = player.x;
    camera.y = player.y;
  }

  // Fix progress
  if (fixing) {
    const elapsed = performance.now() - fixing.startedAt;
    const progress = Math.min(1, elapsed / fixing.durationMs);
    world.setChannelProgress(progress, fixing.label);

    if (progress >= 1) {
      // Timer done — show full bar but keep fixing state locked until server confirms
      // (server will remove the issue from state, which clears fixing via the state callback)
      world.setChannelProgress(1, "Completing...");
    }
  } else if (!contextMenu.visible && !gameOver) {
    // Movement (only when not fixing, not in context menu, not game over)
    let vx = 0;
    let vy = 0;
    if (keys.has("KeyW")) vy -= 1;
    if (keys.has("KeyS")) vy += 1;
    if (keys.has("KeyA")) vx -= 1;
    if (keys.has("KeyD")) vx += 1;
    if (vx !== 0 || vy !== 0) {
      // Set direction based on strongest axis
      if (Math.abs(vy) >= Math.abs(vx)) {
        world.setPlayerDirection(vy < 0 ? "up" : "down");
      } else {
        world.setPlayerDirection(vx < 0 ? "left" : "right");
      }
      world.setPlayerWalking(true);

      // Footstep SFX (throttled)
      const footNow = performance.now();
      if (footNow - lastFootstepAt > FOOTSTEP_INTERVAL_MS) {
        lastFootstepAt = footNow;
        playFootstep();
      }

      const len = Math.hypot(vx, vy) || 1;
      const boosted = performance.now() < speedBoostEndAt;
      const speed = player.speed * (boosted ? SPEED_BOOST_MULTIPLIER : 1);
      const stepX = (vx / len) * speed * dt;
      const stepY = (vy / len) * speed * dt;
      const nextX = player.x + stepX;
      const nextY = player.y + stepY;
      if (canMoveTo(nextX, player.y)) player.x = nextX;
      if (canMoveTo(player.x, nextY)) player.y = nextY;
    } else {
      world.setPlayerWalking(false);
    }
  }

  const padding = 20;
  const maxX = world.worldWidth - padding;
  const maxY = world.worldHeight - padding;
  player.x = Math.max(padding, Math.min(maxX, player.x));
  player.y = Math.max(padding, Math.min(maxY, player.y));
  world.setPlayer(player.x, player.y);

  camera.x += (player.x - camera.x) * Math.min(1, dt * 6);
  camera.y += (player.y - camera.y) * Math.min(1, dt * 6);
  camera.x = Math.max(0, Math.min(world.worldWidth, camera.x));
  camera.y = Math.max(0, Math.min(world.worldHeight, camera.y));

  // Smooth zoom out on game over
  if (gameOver && gameOverStartedAt > 0) {
    const elapsed = performance.now() - gameOverStartedAt;
    const t = Math.min(1, elapsed / GAME_OVER_ZOOM_DURATION_MS);
    const eased = 1 - (1 - t) * (1 - t); // ease-out quadratic
    camera.zoom = gameOverZoomFrom + (GAME_OVER_ZOOM_TARGET - gameOverZoomFrom) * eased;
  }

  world.setCamera(camera.x, camera.y);
  world.setZoom(camera.zoom);
  world.tickOtherPlayers(dt);

  // Update minimap
  world.setMinimapPlayer(player.x, player.y);
  world.setMinimapIssues(latestState.issues.filter(i => i.layer === currentLayer));
  world.setMinimapOtherPlayers(otherPlayerPositions);
  world.setMinimapCamera(camera.x, camera.y);
  world.updateMinimap();

  // Update pings
  world.updatePings();

  // Update animated clouds (parallax effect)
  world.updateClouds();

  // Update issue particle effects
  world.updateIssueParticles();

  // Update visual effects (shake, flash, dust)
  world.tickEffects(dt);

  // Layer transition fade
  const fadeResult = world.tickFade();
  if (fadeResult.switched) {
    currentLayer = fadeResult.toLayer!;
    player.x = fadeResult.toX!;
    player.y = fadeResult.toY!;
    camera.x = player.x;
    camera.y = player.y;
    world.setPlayer(player.x, player.y);
    hatchCooldownUntil = performance.now() + HATCH_COOLDOWN_MS;
    const layerName = currentLayer === "deck" ? "Main Deck" : "Cargo Hold";
    world.addLogEntry(`Entered ${layerName}`, 0x7ee3c2);
  }

  // Auto-pickup ground instruments on proximity
  const now = performance.now();
  if (!gameOver && !fixing && now - lastPickupAt > 500) {
    const nearInst = findNearestGroundInstrument();
    if (nearInst && nearInst.id !== lastPickedUpToolId) {
      const toolName = nearInst.type.replace(/_/g, " ");
      world.addLogEntry(`Picked up ${toolName}`, 0x7ee3c2);
      connection.sendPickupTool("local-match", playerId, nearInst.id);
      lastPickedUpToolId = nearInst.id;
      lastPickupAt = now;
      playPickup();
    }
  }

  // Interaction hints
  if (!contextMenu.visible && !fixing && !gameOver) {
    const nearIssue = findNearestIssue();
    const nearDoor = findNearestDoor(world.getDoors(), player.x, player.y);

    if (nearIssue) {
      const isJoining = nearIssue.status === "in_progress";
      const action = isJoining ? "Help fix" : "Fix issue";
      world.setInteractionText(`[E] ${action}: ${nearIssue.type.replace(/_/g, " ")}`);
    } else if (nearDoor && nearDoor.dist <= 60) {
      world.setInteractionText(`[E] ${nearDoor.open ? "Close" : "Open"} door`);
    } else {
      const nearHatch = findNearestHatch();
      if (nearHatch && nearHatch.dist <= 60) {
        const targetLayer = currentLayer === "deck" ? "Cargo Hold" : "Main Deck";
        world.setInteractionText(`[E] Go to ${targetLayer}`);
      } else {
        world.setInteractionText("");
      }
    }
  } else if (fixing) {
    world.setInteractionText("[ESC] Cancel fix | [WASD] Cancel & move");
  } else if (contextMenu.visible) {
    world.setInteractionText("[W/S] Navigate | [E] Confirm | [ESC] Cancel");
  }

  if (joined && !fixing) {
    const now = performance.now();
    if (now - lastMoveSentAt > 50) {
      lastMoveSentAt = now;
      connection.sendMove("local-match", playerId, player.x, player.y);
    }
  }
});

// ── Input ──

window.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  keys.add(event.code);

  if (gameOver) {
    if (event.code === "KeyR") {
      window.location.reload();
    }
    return;
  }

  // Movement while fixing → cancel fix
  if (
    fixing &&
    (event.code === "KeyW" || event.code === "KeyA" || event.code === "KeyS" || event.code === "KeyD")
  ) {
    cancelFix();
    return;
  }

  // Context menu navigation
  if (contextMenu.visible) {
    if (event.code === "KeyW" || event.code === "ArrowUp") {
      contextMenu.selectedIndex = Math.max(0, contextMenu.selectedIndex - 1);
      // Skip disabled tool option
      if (contextMenu.selectedIndex === 1 && contextMenu.issue && latestState) {
        const hasTool = latestState.teamInventory.includes(contextMenu.issue.requiredTool);
        if (!hasTool) contextMenu.selectedIndex = 0;
      }
      if (contextMenu.issue && latestState) {
        world?.showContextMenu(contextMenu.issue, latestState.teamInventory, contextMenu.selectedIndex);
      }
      return;
    }
    if (event.code === "KeyS" || event.code === "ArrowDown") {
      contextMenu.selectedIndex = Math.min(2, contextMenu.selectedIndex + 1);
      // Skip disabled tool option
      if (contextMenu.selectedIndex === 1 && contextMenu.issue && latestState) {
        const hasTool = latestState.teamInventory.includes(contextMenu.issue.requiredTool);
        if (!hasTool) contextMenu.selectedIndex = 2;
      }
      if (contextMenu.issue && latestState) {
        world?.showContextMenu(contextMenu.issue, latestState.teamInventory, contextMenu.selectedIndex);
      }
      return;
    }
    if (event.code === "KeyE" || event.code === "Enter") {
      confirmContextMenu();
      return;
    }
    if (event.code === "Escape") {
      closeContextMenu();
      return;
    }
    return; // block all other input while menu open
  }

  // Escape to cancel fix
  if (event.code === "Escape" && fixing) {
    cancelFix();
    return;
  }

  // E key: interact
  if (event.code === "KeyE" && !fixing) {
    if (!gameStarted) return;

    // Priority 1: Nearby issue
    const nearIssue = findNearestIssue();
    if (nearIssue) {
      if (nearIssue.status === "in_progress") {
        // Auto-join: skip context menu, help directly
        connection.sendStartFix("local-match", playerId, nearIssue.id, "default");
        const now = Date.now();
        const elapsed = now - (nearIssue.fixStartedAt || now);
        const remaining = Math.max(0, (nearIssue.fixDurationMs || 0) - elapsed);
        const boostedRemaining = remaining * 0.6;
        fixing = {
          active: true,
          issueId: nearIssue.id,
          startedAt: performance.now(),
          durationMs: boostedRemaining,
          label: "Helping fix...",
        };
        playFixStart();
      } else {
        openContextMenu(nearIssue);
      }
      return;
    }

    // Priority 2: Open/close door
    if (world) {
      const doors = world.getDoors();
      const nearDoor = findNearestDoor(doors, player.x, player.y);
      if (nearDoor && nearDoor.dist <= 60) {
        connection.sendDoor("local-match", nearDoor.id, !nearDoor.open);
        return;
      }

      // Priority 3: Use hatch (layer transition)
      const nearHatch = findNearestHatch();
      if (nearHatch && nearHatch.dist <= 60 && performance.now() >= hatchCooldownUntil) {
        connection.sendUseHatch("local-match", playerId, nearHatch.id);
        return;
      }
    }
    return;
  }

  if (event.code === "F1") {
    event.preventDefault();
    camera.zoom = DEFAULT_ZOOM;
    camera.x = player.x;
    camera.y = player.y;
    return;
  }

  // M key: Toggle mute all
  if (event.code === "KeyM") {
    world?.toggleAudioMute();
    return;
  }

  // Q key: Ping current location
  if (event.code === "KeyQ" && !fixing && !contextMenu.visible && gameStarted) {
    const now = performance.now();
    if (now - lastPingSentAt < PING_COOLDOWN_MS) return; // Cooldown check
    lastPingSentAt = now;
    connection.sendPingLocation("local-match", playerId, player.x, player.y, currentLayer);
    return;
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("blur", () => {
  keys.clear();
});

window.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const zoomSpeed = 0.1;
    const direction = event.deltaY < 0 ? 1 : -1;
    camera.zoom = Math.max(0.8, Math.min(2.5, camera.zoom + direction * zoomSpeed));
  },
  { passive: false }
);

window.addEventListener("resize", () => {
  if (world) world.onResize();
});

// ── Start Screen UI ──

interface LobbyCallbacks {
  onCreateRoom: (name: string) => void;
  onJoinRoom: (name: string, roomCode: string) => void;
  onStartGame: () => void;
}

// ── Loading Screen is handled by PixiJS renderer ──

function createStartScreen(callbacks: LobbyCallbacks) {
  const overlay = document.createElement("div");
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.background = "rgba(8, 10, 14, 0.85)";
  overlay.style.zIndex = "30";

  const panel = document.createElement("div");
  panel.style.width = "380px";
  panel.style.padding = "18px";
  panel.style.background = "rgba(12, 16, 22, 0.98)";
  panel.style.border = "1px solid #2a3b47";
  panel.style.fontFamily = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  panel.style.color = "#e6e6e6";
  overlay.appendChild(panel);

  const titleEl = document.createElement("div");
  titleEl.textContent = "Aether Spire";
  titleEl.style.fontSize = "22px";
  titleEl.style.fontWeight = "bold";
  titleEl.style.marginBottom = "12px";
  panel.appendChild(titleEl);

  const status = document.createElement("div");
  status.textContent = "Status: connecting";
  status.style.fontSize = "13px";
  status.style.marginBottom = "16px";
  status.style.color = "#9fb3c8";
  panel.appendChild(status);

  // ── Main Menu View ──
  const mainMenu = document.createElement("div");
  panel.appendChild(mainMenu);

  const nameLabel = document.createElement("div");
  nameLabel.textContent = "Your Name";
  nameLabel.style.marginBottom = "6px";
  mainMenu.appendChild(nameLabel);

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Enter your name";
  nameInput.style.width = "100%";
  nameInput.style.marginBottom = "14px";
  nameInput.style.padding = "8px";
  nameInput.style.background = "#0f141b";
  nameInput.style.border = "1px solid #2a3b47";
  nameInput.style.color = "#e6e6e6";
  nameInput.style.boxSizing = "border-box";
  mainMenu.appendChild(nameInput);

  const buttonStyle = `
    width: 100%;
    padding: 10px;
    margin-bottom: 8px;
    background: #1a2a35;
    border: 1px solid #2a3b47;
    color: #e6e6e6;
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
  `;

  const createRoomBtn = document.createElement("button");
  createRoomBtn.textContent = "Create Room";
  createRoomBtn.style.cssText = buttonStyle;
  createRoomBtn.disabled = true;
  mainMenu.appendChild(createRoomBtn);

  const separator = document.createElement("div");
  separator.style.display = "flex";
  separator.style.alignItems = "center";
  separator.style.margin = "12px 0";
  separator.innerHTML = '<div style="flex:1;height:1px;background:#2a3b47"></div><span style="padding:0 12px;color:#666">or</span><div style="flex:1;height:1px;background:#2a3b47"></div>';
  mainMenu.appendChild(separator);

  const joinLabel = document.createElement("div");
  joinLabel.textContent = "Join Room";
  joinLabel.style.marginBottom = "6px";
  mainMenu.appendChild(joinLabel);

  const joinRow = document.createElement("div");
  joinRow.style.display = "flex";
  joinRow.style.gap = "8px";
  mainMenu.appendChild(joinRow);

  const roomCodeInput = document.createElement("input");
  roomCodeInput.type = "text";
  roomCodeInput.placeholder = "Room code";
  roomCodeInput.style.flex = "1";
  roomCodeInput.style.padding = "8px";
  roomCodeInput.style.background = "#0f141b";
  roomCodeInput.style.border = "1px solid #2a3b47";
  roomCodeInput.style.color = "#e6e6e6";
  roomCodeInput.style.textTransform = "uppercase";
  roomCodeInput.maxLength = 4;
  joinRow.appendChild(roomCodeInput);

  const joinRoomBtn = document.createElement("button");
  joinRoomBtn.textContent = "Join";
  joinRoomBtn.style.padding = "8px 16px";
  joinRoomBtn.style.background = "#1a2a35";
  joinRoomBtn.style.border = "1px solid #2a3b47";
  joinRoomBtn.style.color = "#e6e6e6";
  joinRoomBtn.style.cursor = "pointer";
  joinRoomBtn.disabled = true;
  joinRow.appendChild(joinRoomBtn);

  const errorMsg = document.createElement("div");
  errorMsg.style.color = "#ffa8a8";
  errorMsg.style.fontSize = "13px";
  errorMsg.style.marginTop = "8px";
  errorMsg.style.display = "none";
  mainMenu.appendChild(errorMsg);

  // ── Lobby View ──
  const lobbyView = document.createElement("div");
  lobbyView.style.display = "none";
  panel.appendChild(lobbyView);

  const roomCodeDisplay = document.createElement("div");
  roomCodeDisplay.style.fontSize = "28px";
  roomCodeDisplay.style.fontWeight = "bold";
  roomCodeDisplay.style.textAlign = "center";
  roomCodeDisplay.style.marginBottom = "8px";
  roomCodeDisplay.style.letterSpacing = "8px";
  roomCodeDisplay.style.color = "#7ee3c2";
  lobbyView.appendChild(roomCodeDisplay);

  const roomCodeLabel = document.createElement("div");
  roomCodeLabel.textContent = "Share this code with friends";
  roomCodeLabel.style.fontSize = "12px";
  roomCodeLabel.style.textAlign = "center";
  roomCodeLabel.style.color = "#888";
  roomCodeLabel.style.marginBottom = "16px";
  lobbyView.appendChild(roomCodeLabel);

  const playersLabel = document.createElement("div");
  playersLabel.textContent = "Players";
  playersLabel.style.marginBottom = "8px";
  lobbyView.appendChild(playersLabel);

  const playersList = document.createElement("div");
  playersList.style.marginBottom = "16px";
  playersList.style.padding = "8px";
  playersList.style.background = "#0f141b";
  playersList.style.border = "1px solid #2a3b47";
  playersList.style.minHeight = "60px";
  lobbyView.appendChild(playersList);

  const startGameBtn = document.createElement("button");
  startGameBtn.textContent = "Start Game";
  startGameBtn.style.cssText = buttonStyle;
  startGameBtn.style.background = "#1a3a2a";
  startGameBtn.style.borderColor = "#2a5a47";
  lobbyView.appendChild(startGameBtn);

  const waitingMsg = document.createElement("div");
  waitingMsg.textContent = "Waiting for host to start...";
  waitingMsg.style.textAlign = "center";
  waitingMsg.style.color = "#9fb3c8";
  waitingMsg.style.fontSize = "13px";
  waitingMsg.style.display = "none";
  lobbyView.appendChild(waitingMsg);

  // ── Event Handlers ──
  nameInput.addEventListener("input", () => {
    const hasName = nameInput.value.trim().length > 0;
    createRoomBtn.disabled = !hasName;
    joinRoomBtn.disabled = !hasName || roomCodeInput.value.trim().length < 4;
  });

  roomCodeInput.addEventListener("input", () => {
    roomCodeInput.value = roomCodeInput.value.toUpperCase();
    const hasName = nameInput.value.trim().length > 0;
    joinRoomBtn.disabled = !hasName || roomCodeInput.value.trim().length < 4;
  });

  createRoomBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name) return;
    errorMsg.style.display = "none";
    callbacks.onCreateRoom(name);
  });

  joinRoomBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    const code = roomCodeInput.value.trim();
    if (!name || code.length < 4) return;
    errorMsg.style.display = "none";
    callbacks.onJoinRoom(name, code);
  });

  startGameBtn.addEventListener("click", () => {
    callbacks.onStartGame();
  });

  document.body.appendChild(overlay);

  return {
    setStatus: (state: string) => {
      status.textContent = `Status: ${state}`;
      if (state === "connected") {
        status.style.color = "#8ce99a";
      } else if (state === "error") {
        status.style.color = "#ffa8a8";
      } else {
        status.style.color = "#9fb3c8";
      }
    },
    showLobby: (roomCode: string, isHost: boolean) => {
      mainMenu.style.display = "none";
      lobbyView.style.display = "block";
      roomCodeDisplay.textContent = roomCode;
      startGameBtn.style.display = isHost ? "block" : "none";
      waitingMsg.style.display = isHost ? "none" : "block";
    },
    updatePlayers: (players: { name: string; isHost: boolean }[]) => {
      playersList.innerHTML = players
        .map(
          (p) =>
            `<div style="padding:4px 0;${p.isHost ? "color:#7ee3c2" : ""}">${p.name}${p.isHost ? " (Host)" : ""}</div>`
        )
        .join("");
    },
    showError: (message: string) => {
      errorMsg.textContent = message;
      errorMsg.style.display = "block";
    },
    hide: () => {
      overlay.style.display = "none";
    },
    getName: () => nameInput.value.trim(),
  };
}

})();
