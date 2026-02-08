import { Container, Graphics, Text, TilingSprite, Assets, Texture, AnimatedSprite, Rectangle, Sprite } from "pixi.js";
import type { Application } from "pixi.js";
import type { GameState, Issue, IssueType, InstrumentType, GroundInstrument, LayerId } from "@aether-spire/shared";

const instrumentColors: Record<InstrumentType, number> = {
  arcane_conduit: 0x6aa5ff,
  gear_wrench: 0xffb24d,
  thermal_regulator: 0xff6b6b,
};

const instrumentLabels: Record<InstrumentType, string> = {
  arcane_conduit: "Arcane Conduit",
  gear_wrench: "Gear Wrench",
  thermal_regulator: "Thermal Regulator",
};

const issueColors: Record<string, number> = {
  pressure_surge: 0xff6b6b,
  coolant_leak: 0x6aa5ff,
  mechanical_drift: 0xffb24d,
  capacitor_overload: 0xb197fc,
  friction_fire: 0xff9944,
  control_corruption: 0x63e6be,
};

const issueLabels: Record<string, string> = {
  pressure_surge: "Pressure Surge",
  coolant_leak: "Coolant Leak",
  mechanical_drift: "Mech. Drift",
  capacitor_overload: "Cap. Overload",
  friction_fire: "Friction Fire",
  control_corruption: "Ctrl Corrupt",
};

// ── Steampunk UI Palette ──
const UI_FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const UI_FONT_MONO = '"SF Mono", "Cascadia Mono", "Consolas", monospace';

const SP = {
  brass: 0xb8860b,
  copper: 0xcd7f32,
  amber: 0xdaa520,
  gold: 0xffd700,
  darkBg: 0x120e08,
  panelBg: 0x1a1208,
  rivet: 0xd4a844,
  mutedText: 0xc4b89a,
  success: 0x6aad5a,
  danger: 0xcc4433,
};

function drawBrassPanel(gfx: Graphics, x: number, y: number, w: number, h: number, rivets = true) {
  gfx.roundRect(x, y, w, h, 3);
  gfx.fill({ color: SP.darkBg, alpha: 0.92 });
  gfx.roundRect(x, y, w, h, 3);
  gfx.stroke({ color: SP.brass, width: 2 });
  if (rivets) {
    const r = 2.5;
    for (const [rx, ry] of [[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + h - 6], [x + w - 6, y + h - 6]]) {
      gfx.circle(rx, ry, r);
      gfx.fill({ color: SP.rivet });
      gfx.circle(rx, ry, r);
      gfx.stroke({ color: SP.brass, width: 0.5, alpha: 0.6 });
    }
  }
}

// ── Issue Particle System ──

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

type ParticleShape = "circle" | "rect" | "line" | "diamond";
type DirectionPattern = "upward" | "downward" | "radial_out" | "random";

interface IssueParticleConfig {
  colors: number[];
  shape: ParticleShape;
  emitRateBase: number;
  emitRateMax: number;
  lifetimeRange: [number, number];
  speedRange: [number, number];
  sizeRange: [number, number];
  spawnRadiusBase: number;
  spawnRadiusMax: number;
  directionPattern: DirectionPattern;
  alphaRange: [number, number];
  gravity: number;
  fadePattern: "linear" | "ease_out" | "flicker";
}

interface IssueParticle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  alpha: number;
  color: number;
  age: number;
  maxAge: number;
  shape: ParticleShape;
  // For "line" shape (arc endpoint offset)
  lx: number; ly: number;
}

interface IssueEmitter {
  issueId: string;
  issueType: IssueType;
  x: number; y: number;
  spawnTime: number;
  status: "active" | "in_progress" | "fixed";
  requiredPlayers: number;
  fixingBy: string[];
  fixStartedAt?: number;
  fixDurationMs?: number;
  particles: IssueParticle[];
  emitAccumulator: number;
  createdAt: number;
  despawning: boolean;
  despawnStartedAt: number;
}

const ISSUE_PARTICLE_CONFIGS: Record<IssueType, IssueParticleConfig> = {
  pressure_surge: {
    colors: [0xffffff, 0xe8e8e8, 0xdddddd],
    shape: "circle",
    emitRateBase: 14, emitRateMax: 40,
    lifetimeRange: [0.6, 1.4],
    speedRange: [30, 70],
    sizeRange: [3, 7],
    spawnRadiusBase: 12, spawnRadiusMax: 40,
    directionPattern: "upward",
    alphaRange: [0.85, 0],
    gravity: -12,
    fadePattern: "ease_out",
  },
  coolant_leak: {
    colors: [0x6aa5ff, 0x4499ee, 0x99ccff],
    shape: "circle",
    emitRateBase: 10, emitRateMax: 30,
    lifetimeRange: [0.8, 1.6],
    speedRange: [12, 35],
    sizeRange: [2.5, 6],
    spawnRadiusBase: 10, spawnRadiusMax: 35,
    directionPattern: "downward",
    alphaRange: [0.9, 0.15],
    gravity: 25,
    fadePattern: "linear",
  },
  mechanical_drift: {
    colors: [0xffb24d, 0xff8800, 0xffdd88],
    shape: "diamond",
    emitRateBase: 16, emitRateMax: 45,
    lifetimeRange: [0.3, 0.8],
    speedRange: [50, 120],
    sizeRange: [2, 5],
    spawnRadiusBase: 8, spawnRadiusMax: 30,
    directionPattern: "radial_out",
    alphaRange: [1.0, 0],
    gravity: 15,
    fadePattern: "linear",
  },
  capacitor_overload: {
    colors: [0xb197fc, 0xd4c0ff, 0x9966ee],
    shape: "line",
    emitRateBase: 8, emitRateMax: 22,
    lifetimeRange: [0.1, 0.35],
    speedRange: [0, 8],
    sizeRange: [12, 28],
    spawnRadiusBase: 14, spawnRadiusMax: 45,
    directionPattern: "random",
    alphaRange: [1.0, 0],
    gravity: 0,
    fadePattern: "flicker",
  },
  friction_fire: {
    colors: [0xff9944, 0xff4422, 0xffcc44, 0x555555],
    shape: "circle",
    emitRateBase: 14, emitRateMax: 40,
    lifetimeRange: [0.6, 1.4],
    speedRange: [18, 50],
    sizeRange: [2.5, 7],
    spawnRadiusBase: 10, spawnRadiusMax: 35,
    directionPattern: "upward",
    alphaRange: [0.9, 0],
    gravity: -18,
    fadePattern: "ease_out",
  },
  control_corruption: {
    colors: [0x63e6be, 0x44dd99, 0xaaffee],
    shape: "rect",
    emitRateBase: 10, emitRateMax: 30,
    lifetimeRange: [0.15, 0.6],
    speedRange: [25, 65],
    sizeRange: [2, 6],
    spawnRadiusBase: 12, spawnRadiusMax: 38,
    directionPattern: "random",
    alphaRange: [1.0, 0],
    gravity: 0,
    fadePattern: "flicker",
  },
};

const MAX_PARTICLES_PER_EMITTER = 80;

/** Client-side replica of server's calculateDamagePerSecond */
function calculateDrainRate(spawnTime: number, now: number): number {
  const ageSec = (now - spawnTime) / 1000;
  if (ageSec <= 10) return 0.4;
  if (ageSec <= 15) return 0.16;
  if (ageSec <= 20) return 0.32;
  if (ageSec <= 25) return 0.48;
  if (ageSec <= 30) return 0.64;
  return 0.8;
}

export function createWorld(app: Application) {
  const container = new Container();
  const worldLayer = new Container();
  const uiLayer = new Container();
  container.addChild(worldLayer);
  container.addChild(uiLayer);

  const worldWidth = 3200;
  const worldHeight = 2400;
  const walls: { x: number; y: number; w: number; h: number }[] = [];
  const floors: { x: number; y: number; w: number; h: number; color: number }[] = [];
  const doors: { id: string; x: number; y: number; w: number; h: number; open: boolean }[] = [];
  let currentLayer: LayerId = "deck";
  const coreX = worldWidth / 2;
  const coreY = worldHeight / 2;

  // ── Ship dimensions (BIGGER) ──
  const shipCenterX = coreX;
  const shipCenterY = coreY;
  const shipLength = 2100; // bow to stern (was 1800)
  const shipWidthMax = 1100; // at widest point (was 900)
  const bowY = shipCenterY - shipLength / 2; // top
  const sternY = shipCenterY + shipLength / 2; // bottom

  const wallThickness = 12;
  const corridorWidth = 90;

  function addHorizontalCorridor(x1: number, x2: number, y: number, width: number) {
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const half = width / 2;
    floors.push({ x: left, y: y - half, w: right - left, h: width, color: 0x101820 });
  }

  function addVerticalCorridor(x: number, y1: number, y2: number, width: number) {
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);
    const half = width / 2;
    floors.push({ x: x - half, y: top, w: width, h: bottom - top, color: 0x101820 });
  }

  // ── Sky Container (groups all sky/atmosphere layers, hidden in cargo) ──
  const skyContainer = new Container();
  worldLayer.addChild(skyContainer);

  // ── Dark Sky Background ──
  const bg = new Graphics();
  bg.rect(0, 0, worldWidth, worldHeight);
  bg.fill({ color: 0x05070a }); // Very dark blue-black
  skyContainer.addChild(bg);

  // ── Drifting Stars (show ship movement) ──
  const starsLayer = new Graphics();
  skyContainer.addChild(starsLayer);

  interface Star {
    x: number;
    y: number;
    size: number;
    brightness: number;
    speed: number; // Different speeds for depth
    twinkle: number;
  }

  const stars: Star[] = [];

  // Create stars at different depths
  for (let i = 0; i < 150; i++) {
    const depth = Math.random(); // 0 = far (slow), 1 = close (fast)
    stars.push({
      x: Math.random() * worldWidth,
      y: Math.random() * worldHeight,
      size: 0.5 + depth * 1.5,
      brightness: 0.2 + depth * 0.5,
      speed: 15 + depth * 40, // pixels per second
      twinkle: Math.random() * Math.PI * 2,
    });
  }

  // ── Wispy Clouds (atmospheric motion) ──
  const cloudsLayer = new Graphics();
  skyContainer.addChild(cloudsLayer);

  interface Cloud {
    x: number;
    y: number;
    w: number;
    h: number;
    speed: number;
    alpha: number;
  }

  const clouds: Cloud[] = [];

  for (let i = 0; i < 20; i++) {
    clouds.push({
      x: Math.random() * worldWidth,
      y: Math.random() * worldHeight,
      w: 80 + Math.random() * 200,
      h: 20 + Math.random() * 40,
      speed: 30 + Math.random() * 50,
      alpha: 0.02 + Math.random() * 0.04,
    });
  }

  // ── Static Steampunk City Far Below (top-down view) ──
  // Barely visible - just hints of rooftops and warm gas lamp glows
  const cityLayer = new Graphics();
  skyContainer.addChild(cityLayer);

  interface Rooftop {
    x: number;
    y: number;
    w: number;
    h: number;
    hasChimney: boolean;
    hasLight: boolean;
    lightColor: number;
  }

  interface GasLamp {
    x: number;
    y: number;
    flicker: number;
  }

  // Steampunk warm colors - amber, copper, brass tones
  const lampColors = [0xcc7722, 0xaa5511, 0xddaa44, 0x996633, 0xbb8833];

  const rooftops: Rooftop[] = [];
  const gasLamps: GasLamp[] = [];

  // Generate rooftops in a loose grid
  for (let i = 0; i < 120; i++) {
    const w = 15 + Math.random() * 40;
    const h = 15 + Math.random() * 40;
    rooftops.push({
      x: Math.random() * worldWidth,
      y: Math.random() * worldHeight,
      w,
      h,
      hasChimney: Math.random() > 0.6,
      hasLight: Math.random() > 0.7,
      lightColor: lampColors[Math.floor(Math.random() * lampColors.length)],
    });
  }

  // Generate gas lamps along implied streets
  for (let i = 0; i < 80; i++) {
    gasLamps.push({
      x: Math.random() * worldWidth,
      y: Math.random() * worldHeight,
      flicker: Math.random() * Math.PI * 2,
    });
  }

  // Draw static city (called once, updated only for lamp flicker)
  function drawCity() {
    cityLayer.clear();
    const baseAlpha = 0.06; // Very subtle

    // Draw rooftops (barely visible dark shapes)
    rooftops.forEach((roof) => {
      // Rooftop
      cityLayer.rect(roof.x, roof.y, roof.w, roof.h);
      cityLayer.fill({ color: 0x0c0e12, alpha: baseAlpha });

      // Chimney
      if (roof.hasChimney) {
        const cx = roof.x + roof.w * 0.7;
        const cy = roof.y + roof.h * 0.3;
        cityLayer.rect(cx, cy, 4, 4);
        cityLayer.fill({ color: 0x0a0a0e, alpha: baseAlpha * 1.2 });
      }

      // Warm window/skylight glow
      if (roof.hasLight) {
        const lx = roof.x + roof.w * 0.4;
        const ly = roof.y + roof.h * 0.5;
        cityLayer.circle(lx, ly, 2);
        cityLayer.fill({ color: roof.lightColor, alpha: baseAlpha * 2 });
      }
    });
  }

  // Initial draw
  drawCity();

  // Animate only the gas lamp flicker (very subtle)
  const gasLampLayer = new Graphics();
  skyContainer.addChild(gasLampLayer);

  let lastAnimTime = Date.now();

  function updateClouds() {
    const now = Date.now();
    const dt = (now - lastAnimTime) / 1000; // delta time in seconds
    lastAnimTime = now;

    // ── Update and draw stars ──
    starsLayer.clear();
    for (const star of stars) {
      // Move stars downward (ship moving forward = stars drift back)
      star.y += star.speed * dt;

      // Wrap around when star goes off bottom
      if (star.y > worldHeight) {
        star.y = -5;
        star.x = Math.random() * worldWidth;
      }

      // Twinkle effect
      const twinkle = 0.7 + 0.3 * Math.sin(now / 500 + star.twinkle);
      const alpha = star.brightness * twinkle;

      starsLayer.circle(star.x, star.y, star.size);
      starsLayer.fill({ color: 0xffffff, alpha });
    }

    // ── Update and draw clouds ──
    cloudsLayer.clear();
    for (const cloud of clouds) {
      // Move clouds downward
      cloud.y += cloud.speed * dt;

      // Wrap around
      if (cloud.y > worldHeight + cloud.h) {
        cloud.y = -cloud.h - 20;
        cloud.x = Math.random() * worldWidth;
      }

      // Draw wispy cloud (elongated ellipse)
      cloudsLayer.ellipse(cloud.x, cloud.y, cloud.w / 2, cloud.h / 2);
      cloudsLayer.fill({ color: 0x8899aa, alpha: cloud.alpha });
    }

    // ── Gas lamp flicker ──
    gasLampLayer.clear();
    gasLamps.forEach((lamp) => {
      // Subtle warm flicker
      const flicker = 0.6 + 0.4 * Math.sin(now / 400 + lamp.flicker);
      const alpha = 0.03 * flicker; // Very faint

      // Outer glow
      gasLampLayer.circle(lamp.x, lamp.y, 6);
      gasLampLayer.fill({ color: 0xcc8833, alpha: alpha * 0.3 });

      // Inner glow
      gasLampLayer.circle(lamp.x, lamp.y, 2);
      gasLampLayer.fill({ color: 0xffaa44, alpha: alpha });
    });
  }

  // ── Deck Geometry Container (groups all deck-specific layers for layer switching) ──
  const deckGeomContainer = new Container();
  worldLayer.addChild(deckGeomContainer);

  // ── Ship Hull Layer ──
  const hullLayer = new Graphics();
  deckGeomContainer.addChild(hullLayer);

  // Hull outline points (classical ship shape - BIGGER)
  const hullPoints: { x: number; y: number }[] = [
    // Bow (pointed front)
    { x: shipCenterX, y: bowY },
    // Port (left) side going down
    { x: shipCenterX - 250, y: bowY + 180 },
    { x: shipCenterX - 450, y: bowY + 480 },
    { x: shipCenterX - shipWidthMax / 2, y: shipCenterY - 150 },
    { x: shipCenterX - shipWidthMax / 2, y: shipCenterY + 250 },
    { x: shipCenterX - 450, y: sternY - 180 },
    { x: shipCenterX - 350, y: sternY - 60 },
    // Stern (flat back)
    { x: shipCenterX - 300, y: sternY },
    { x: shipCenterX + 300, y: sternY },
    // Starboard (right) side going up
    { x: shipCenterX + 350, y: sternY - 60 },
    { x: shipCenterX + 450, y: sternY - 180 },
    { x: shipCenterX + shipWidthMax / 2, y: shipCenterY + 250 },
    { x: shipCenterX + shipWidthMax / 2, y: shipCenterY - 150 },
    { x: shipCenterX + 450, y: bowY + 480 },
    { x: shipCenterX + 250, y: bowY + 180 },
  ];

  // Hull collision inset (slightly inside the visual hull)
  const hullCollisionInset = 25;
  const hullCollisionPoints: { x: number; y: number }[] = hullPoints.map((p) => {
    const dx = p.x - shipCenterX;
    const dy = p.y - shipCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return { x: p.x, y: p.y + hullCollisionInset };
    const insetX = (dx / dist) * hullCollisionInset;
    const insetY = (dy / dist) * hullCollisionInset;
    return { x: p.x - insetX, y: p.y - insetY };
  });

  // Point-in-polygon test for hull collision
  // Point-in-polygon test helper (reusable)
  function pointInPolygon(px: number, py: number, points: { x: number; y: number }[]): boolean {
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

  function isInsideHull(px: number, py: number, layer?: LayerId): boolean {
    const l = layer || currentLayer;
    if (l === "cargo") {
      return pointInPolygon(px, py, cargoHullCollisionPoints);
    }
    return pointInPolygon(px, py, hullCollisionPoints);
  }

  // Draw hull base (darker wood for hull sides)
  function drawHull() {
    hullLayer.clear();
    hullLayer.moveTo(hullPoints[0].x, hullPoints[0].y);
    for (let i = 1; i < hullPoints.length; i++) {
      hullLayer.lineTo(hullPoints[i].x, hullPoints[i].y);
    }
    hullLayer.closePath();
    hullLayer.fill({ color: 0x2a1a0a }); // Dark wood hull base
    hullLayer.stroke({ color: 0x4a3520, width: 10 }); // Hull edge (thicker for bigger ship)

    // Inner deck area (slightly inset)
    const deckInset = 25;
    hullLayer.moveTo(hullPoints[0].x, hullPoints[0].y + deckInset * 2);
    for (let i = 1; i < hullPoints.length; i++) {
      const dx = hullPoints[i].x - shipCenterX;
      const insetX = dx > 0 ? -deckInset : (dx < 0 ? deckInset : 0);
      const dy = hullPoints[i].y - shipCenterY;
      const insetY = dy > 0 ? -deckInset : (dy < 0 ? deckInset : 0);
      hullLayer.lineTo(hullPoints[i].x + insetX, hullPoints[i].y + insetY);
    }
    hullLayer.closePath();
    hullLayer.stroke({ color: 0x3a2510, width: 4 }); // Deck edge
  }
  drawHull();

  // ── Geometry layers ──
  const floorLayer = new Container(); // Container for tiled floor sprites
  const floorFallback = new Graphics(); // Fallback solid colors until texture loads
  const wallLayer = new Graphics();
  const doorLayer = new Graphics();
  deckGeomContainer.addChild(floorFallback);
  deckGeomContainer.addChild(floorLayer);
  deckGeomContainer.addChild(wallLayer);
  deckGeomContainer.addChild(doorLayer);

  let floorTexture: Texture | null = null;

  // ── Ship Deck Layout (BIGGER rooms) ──

  // Bridge (Bow) - pointed area at front
  const bridgeW = 340;
  const bridgeH = 240;
  const bridgeX = shipCenterX - bridgeW / 2;
  const bridgeY = bowY + 160;
  floors.push({ x: bridgeX, y: bridgeY, w: bridgeW, h: bridgeH, color: 0x121a22 });
  // Bridge walls
  walls.push({ x: bridgeX, y: bridgeY, w: wallThickness, h: bridgeH }); // left
  walls.push({ x: bridgeX + bridgeW - wallThickness, y: bridgeY, w: wallThickness, h: bridgeH }); // right
  walls.push({ x: bridgeX, y: bridgeY, w: bridgeW, h: wallThickness }); // top
  // Bridge door (bottom, toward main deck)
  const bridgeDoorW = 70;
  const bridgeDoorX = shipCenterX - bridgeDoorW / 2;
  const bridgeDoorY = bridgeY + bridgeH - wallThickness;
  walls.push({ x: bridgeX, y: bridgeDoorY, w: bridgeDoorX - bridgeX, h: wallThickness });
  walls.push({ x: bridgeDoorX + bridgeDoorW, y: bridgeDoorY, w: bridgeX + bridgeW - (bridgeDoorX + bridgeDoorW), h: wallThickness });
  doors.push({ id: "door-bridge", x: bridgeDoorX, y: bridgeDoorY, w: bridgeDoorW, h: wallThickness, open: false });

  // Central Hub (around the core/mast)
  const hubW = 420;
  const hubH = 340;
  const hubX = shipCenterX - hubW / 2;
  const hubY = shipCenterY - hubH / 2;
  floors.push({ x: hubX, y: hubY, w: hubW, h: hubH, color: 0x111922 });

  // Corridor from bridge to hub
  addVerticalCorridor(shipCenterX, bridgeY + bridgeH, hubY, corridorWidth);

  // Port Cabin (left side room)
  const cabinW = 300;
  const cabinH = 260;
  const portCabinX = shipCenterX - shipWidthMax / 2 + 80;
  const portCabinY = shipCenterY - cabinH / 2;
  floors.push({ x: portCabinX, y: portCabinY, w: cabinW, h: cabinH, color: 0x121a22 });
  // Port cabin walls
  walls.push({ x: portCabinX, y: portCabinY, w: cabinW, h: wallThickness }); // top
  walls.push({ x: portCabinX, y: portCabinY + cabinH - wallThickness, w: cabinW, h: wallThickness }); // bottom
  walls.push({ x: portCabinX, y: portCabinY, w: wallThickness, h: cabinH }); // left (outer hull)
  // Port cabin door (right side, toward hub)
  const portDoorH = 64;
  const portDoorY = portCabinY + cabinH / 2 - portDoorH / 2;
  const portDoorX = portCabinX + cabinW - wallThickness;
  walls.push({ x: portDoorX, y: portCabinY, w: wallThickness, h: portDoorY - portCabinY });
  walls.push({ x: portDoorX, y: portDoorY + portDoorH, w: wallThickness, h: portCabinY + cabinH - (portDoorY + portDoorH) });
  doors.push({ id: "door-port", x: portDoorX, y: portDoorY, w: wallThickness, h: portDoorH, open: false });

  // Corridor from port cabin to hub
  addHorizontalCorridor(portCabinX + cabinW, hubX, shipCenterY, corridorWidth);

  // Starboard Cabin (right side room)
  const starboardCabinX = shipCenterX + shipWidthMax / 2 - 80 - cabinW;
  const starboardCabinY = shipCenterY - cabinH / 2;
  floors.push({ x: starboardCabinX, y: starboardCabinY, w: cabinW, h: cabinH, color: 0x121a22 });
  // Starboard cabin walls
  walls.push({ x: starboardCabinX, y: starboardCabinY, w: cabinW, h: wallThickness }); // top
  walls.push({ x: starboardCabinX, y: starboardCabinY + cabinH - wallThickness, w: cabinW, h: wallThickness }); // bottom
  walls.push({ x: starboardCabinX + cabinW - wallThickness, y: starboardCabinY, w: wallThickness, h: cabinH }); // right (outer hull)
  // Starboard cabin door (left side, toward hub)
  const starboardDoorY = starboardCabinY + cabinH / 2 - portDoorH / 2;
  walls.push({ x: starboardCabinX, y: starboardCabinY, w: wallThickness, h: starboardDoorY - starboardCabinY });
  walls.push({ x: starboardCabinX, y: starboardDoorY + portDoorH, w: wallThickness, h: starboardCabinY + cabinH - (starboardDoorY + portDoorH) });
  doors.push({ id: "door-starboard", x: starboardCabinX, y: starboardDoorY, w: wallThickness, h: portDoorH, open: false });

  // Corridor from starboard cabin to hub
  addHorizontalCorridor(hubX + hubW, starboardCabinX, shipCenterY, corridorWidth);

  // Engine Room / Stern (spawn area at back)
  const engineW = 400;
  const engineH = 240;
  const engineX = shipCenterX - engineW / 2;
  const engineY = sternY - engineH - 100;
  floors.push({ x: engineX, y: engineY, w: engineW, h: engineH, color: 0x121a22 });
  // Engine room walls
  walls.push({ x: engineX, y: engineY + engineH - wallThickness, w: engineW, h: wallThickness }); // bottom
  walls.push({ x: engineX, y: engineY, w: wallThickness, h: engineH }); // left
  walls.push({ x: engineX + engineW - wallThickness, y: engineY, w: wallThickness, h: engineH }); // right
  // Engine room door (top, toward main deck)
  const engineDoorW = 70;
  const engineDoorX = shipCenterX - engineDoorW / 2;
  walls.push({ x: engineX, y: engineY, w: engineDoorX - engineX, h: wallThickness });
  walls.push({ x: engineDoorX + engineDoorW, y: engineY, w: engineX + engineW - (engineDoorX + engineDoorW), h: wallThickness });
  doors.push({ id: "door-engine", x: engineDoorX, y: engineY, w: engineDoorW, h: wallThickness, open: true });

  // Corridor from hub to engine room
  addVerticalCorridor(shipCenterX, hubY + hubH, engineY, corridorWidth);

  // Main deck area (open space around hub)
  const deckPadding = 50;
  // Forward deck (between bridge and hub)
  floors.push({
    x: shipCenterX - 240,
    y: bridgeY + bridgeH + deckPadding,
    w: 480,
    h: hubY - (bridgeY + bridgeH) - deckPadding * 2,
    color: 0x151d28,
  });
  // Aft deck (between hub and engine)
  floors.push({
    x: shipCenterX - 240,
    y: hubY + hubH + deckPadding,
    w: 480,
    h: engineY - (hubY + hubH) - deckPadding * 2,
    color: 0x151d28,
  });

  // Spawn point (in engine room / stern)
  const spawnPoint = { x: engineX + engineW / 2, y: engineY + engineH / 2 };

  // ── Core (Mast/Crystal) ──
  const core = new Graphics();
  core.circle(coreX, coreY, 60);
  core.fill({ color: 0x1f2c35 });
  core.circle(coreX, coreY, 40);
  core.fill({ color: 0x2a3b47 });
  core.circle(coreX, coreY, 20);
  core.fill({ color: 0x4a6b7a });
  deckGeomContainer.addChild(core);

  const warningRing = new Graphics();
  warningRing.circle(coreX, coreY, 74);
  warningRing.stroke({ color: 0xff6b6b, width: 3, alpha: 0 });
  deckGeomContainer.addChild(warningRing);

  // ── Ship Details ──
  const detailsLayer = new Graphics();
  deckGeomContainer.addChild(detailsLayer);

  function drawShipDetails() {
    detailsLayer.clear();

    // Mast base ring
    detailsLayer.circle(coreX, coreY, 75);
    detailsLayer.stroke({ color: 0x5a4a3a, width: 5 });

    // Railings along deck edges (decorative)
    const railingColor = 0x4a3a2a;

    // Bow railings (adjusted for bigger ship)
    detailsLayer.moveTo(shipCenterX - 220, bowY + 160);
    detailsLayer.lineTo(shipCenterX - 80, bowY + 70);
    detailsLayer.lineTo(shipCenterX + 80, bowY + 70);
    detailsLayer.lineTo(shipCenterX + 220, bowY + 160);
    detailsLayer.stroke({ color: railingColor, width: 4 });

    // Side railings (port)
    detailsLayer.moveTo(portCabinX - 25, portCabinY - 50);
    detailsLayer.lineTo(portCabinX - 25, portCabinY + cabinH + 50);
    detailsLayer.stroke({ color: railingColor, width: 4 });

    // Side railings (starboard)
    detailsLayer.moveTo(starboardCabinX + cabinW + 25, starboardCabinY - 50);
    detailsLayer.lineTo(starboardCabinX + cabinW + 25, starboardCabinY + cabinH + 50);
    detailsLayer.stroke({ color: railingColor, width: 4 });

    // Stern railings
    detailsLayer.moveTo(shipCenterX - 280, sternY - 40);
    detailsLayer.lineTo(shipCenterX + 280, sternY - 40);
    detailsLayer.stroke({ color: railingColor, width: 4 });
  }
  drawShipDetails();

  // ── Cargo Hold Layer ──
  const cargoWalls: typeof walls = [];
  const cargoFloors: typeof floors = [];
  const cargoDoors: typeof doors = [];

  // Cargo dimensions - centered on shipCenterX (1600)
  const cargoW = 600;
  const cargoTotalH = 1000;
  const cargoX = shipCenterX - cargoW / 2; // 1300
  const cargoTopY = shipCenterY - cargoTotalH / 2; // 700

  // Fore Storage room
  const foreStorageH = 350;
  cargoFloors.push({ x: cargoX, y: cargoTopY, w: cargoW, h: foreStorageH, color: 0x0e1418 });
  // Walls: top, left, right
  cargoWalls.push({ x: cargoX, y: cargoTopY, w: cargoW, h: wallThickness });
  cargoWalls.push({ x: cargoX, y: cargoTopY, w: wallThickness, h: foreStorageH });
  cargoWalls.push({ x: cargoX + cargoW - wallThickness, y: cargoTopY, w: wallThickness, h: foreStorageH });
  // Door at bottom of fore storage
  const cargoDoorW = 70;
  const foreDoorX = shipCenterX - cargoDoorW / 2;
  const foreDoorY = cargoTopY + foreStorageH - wallThickness;
  cargoWalls.push({ x: cargoX, y: foreDoorY, w: foreDoorX - cargoX, h: wallThickness });
  cargoWalls.push({ x: foreDoorX + cargoDoorW, y: foreDoorY, w: cargoX + cargoW - (foreDoorX + cargoDoorW), h: wallThickness });
  cargoDoors.push({ id: "door-fore-storage", x: foreDoorX, y: foreDoorY, w: cargoDoorW, h: wallThickness, open: false });

  // Central Corridor
  const corridorH = 300;
  const corridorY = cargoTopY + foreStorageH;
  cargoFloors.push({ x: cargoX, y: corridorY, w: cargoW, h: corridorH, color: 0x0c1216 });
  cargoWalls.push({ x: cargoX, y: corridorY, w: wallThickness, h: corridorH });
  cargoWalls.push({ x: cargoX + cargoW - wallThickness, y: corridorY, w: wallThickness, h: corridorH });
  // Door at bottom of corridor
  const aftDoorX = shipCenterX - cargoDoorW / 2;
  const aftDoorY = corridorY + corridorH - wallThickness;
  cargoWalls.push({ x: cargoX, y: aftDoorY, w: aftDoorX - cargoX, h: wallThickness });
  cargoWalls.push({ x: aftDoorX + cargoDoorW, y: aftDoorY, w: cargoX + cargoW - (aftDoorX + cargoDoorW), h: wallThickness });
  cargoDoors.push({ id: "door-aft-storage", x: aftDoorX, y: aftDoorY, w: cargoDoorW, h: wallThickness, open: false });

  // Aft Storage room
  const aftStorageH = 350;
  const aftStorageY = corridorY + corridorH;
  cargoFloors.push({ x: cargoX, y: aftStorageY, w: cargoW, h: aftStorageH, color: 0x0e1418 });
  cargoWalls.push({ x: cargoX, y: aftStorageY + aftStorageH - wallThickness, w: cargoW, h: wallThickness });
  cargoWalls.push({ x: cargoX, y: aftStorageY, w: wallThickness, h: aftStorageH });
  cargoWalls.push({ x: cargoX + cargoW - wallThickness, y: aftStorageY, w: wallThickness, h: aftStorageH });

  const cargoSpawnPoint = { x: shipCenterX, y: cargoTopY + foreStorageH / 2 };

  // ── Cargo Hull Polygon (barrel/pointed-oval shape) ──
  const cargoHullPoints: { x: number; y: number }[] = [
    // Bow (fore, slightly pointed)
    { x: shipCenterX, y: cargoTopY - 30 },
    // Port side going down
    { x: cargoX - 20, y: cargoTopY + 80 },
    { x: cargoX - 40, y: shipCenterY - 100 },
    { x: cargoX - 40, y: shipCenterY + 100 },
    { x: cargoX - 20, y: aftStorageY + aftStorageH - 80 },
    // Stern (aft, slightly rounded)
    { x: shipCenterX - 100, y: aftStorageY + aftStorageH + 30 },
    { x: shipCenterX + 100, y: aftStorageY + aftStorageH + 30 },
    // Starboard side going up
    { x: cargoX + cargoW + 20, y: aftStorageY + aftStorageH - 80 },
    { x: cargoX + cargoW + 40, y: shipCenterY + 100 },
    { x: cargoX + cargoW + 40, y: shipCenterY - 100 },
    { x: cargoX + cargoW + 20, y: cargoTopY + 80 },
  ];

  // Inset version for collision
  const cargoHullCollisionInset = 20;
  const cargoCenterX = shipCenterX;
  const cargoCenterY = shipCenterY;
  const cargoHullCollisionPoints: { x: number; y: number }[] = cargoHullPoints.map((p) => {
    const dx = p.x - cargoCenterX;
    const dy = p.y - cargoCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return { x: p.x, y: p.y + cargoHullCollisionInset };
    const insetX = (dx / dist) * cargoHullCollisionInset;
    const insetY = (dy / dist) * cargoHullCollisionInset;
    return { x: p.x - insetX, y: p.y - insetY };
  });

  // ── Cargo Visual Container ──
  const cargoGeomContainer = new Container();
  worldLayer.addChild(cargoGeomContainer);
  cargoGeomContainer.visible = false;

  // Cargo background — full world dark interior (visible when sky is hidden)
  const cargoBgGfx = new Graphics();
  cargoBgGfx.rect(0, 0, worldWidth, worldHeight);
  cargoBgGfx.fill({ color: 0x08080c }); // Very dark interior
  // Wooden beam grid (barely visible)
  const beamColor = 0x12100e;
  const beamAlpha = 0.3;
  // Horizontal beams every 200px
  for (let y = 0; y < worldHeight; y += 200) {
    cargoBgGfx.rect(0, y, worldWidth, 4);
    cargoBgGfx.fill({ color: beamColor, alpha: beamAlpha });
  }
  // Vertical beams every 200px
  for (let x = 0; x < worldWidth; x += 200) {
    cargoBgGfx.rect(x, 0, 4, worldHeight);
    cargoBgGfx.fill({ color: beamColor, alpha: beamAlpha });
  }
  // Support strut cross-hatching (very subtle diagonal lines)
  const strutColor = 0x0f0d0b;
  const strutAlpha = 0.15;
  for (let i = -worldHeight; i < worldWidth; i += 400) {
    cargoBgGfx.moveTo(i, 0);
    cargoBgGfx.lineTo(i + worldHeight, worldHeight);
    cargoBgGfx.stroke({ color: strutColor, width: 2, alpha: strutAlpha });
  }
  // Rivet dots at beam intersections
  for (let y = 0; y < worldHeight; y += 200) {
    for (let x = 0; x < worldWidth; x += 200) {
      cargoBgGfx.circle(x + 2, y + 2, 3);
      cargoBgGfx.fill({ color: 0x1a1610, alpha: 0.25 });
    }
  }
  cargoGeomContainer.addChild(cargoBgGfx);

  // Cargo hull fill and outline
  const cargoHullGfx = new Graphics();
  cargoHullGfx.moveTo(cargoHullPoints[0].x, cargoHullPoints[0].y);
  for (let i = 1; i < cargoHullPoints.length; i++) {
    cargoHullGfx.lineTo(cargoHullPoints[i].x, cargoHullPoints[i].y);
  }
  cargoHullGfx.closePath();
  cargoHullGfx.fill({ color: 0x1a100a }); // Dark wood hull base
  cargoHullGfx.stroke({ color: 0x3a2510, width: 6 }); // Hull edge
  cargoGeomContainer.addChild(cargoHullGfx);

  // Cargo floor graphics
  const cargoFloorGfx = new Graphics();
  cargoGeomContainer.addChild(cargoFloorGfx);

  function drawCargoFloors() {
    cargoFloorGfx.clear();
    for (const f of cargoFloors) {
      cargoFloorGfx.rect(f.x, f.y, f.w, f.h);
      cargoFloorGfx.fill({ color: f.color });
    }
  }
  drawCargoFloors();

  // Cargo wall graphics
  const cargoWallGfx = new Graphics();
  cargoGeomContainer.addChild(cargoWallGfx);

  function drawCargoWalls() {
    cargoWallGfx.clear();
    for (const w of cargoWalls) {
      cargoWallGfx.rect(w.x, w.y, w.w, w.h);
    }
    cargoWallGfx.fill({ color: 0x2a3642 });
  }
  drawCargoWalls();

  // Cargo door graphics
  const cargoDoorGfx = new Graphics();
  cargoGeomContainer.addChild(cargoDoorGfx);

  function drawCargoDoors() {
    cargoDoorGfx.clear();
    for (const door of cargoDoors) {
      cargoDoorGfx.rect(door.x, door.y, door.w, door.h);
      cargoDoorGfx.fill({ color: door.open ? 0x2d6a4f : 0x7d2c2c });
    }
  }
  drawCargoDoors();

  // Cargo hull outline (inner deck edge)
  const cargoFrameGfx = new Graphics();
  const cargoInnerInset = 15;
  cargoFrameGfx.moveTo(cargoHullPoints[0].x, cargoHullPoints[0].y + cargoInnerInset * 2);
  for (let i = 1; i < cargoHullPoints.length; i++) {
    const dx = cargoHullPoints[i].x - cargoCenterX;
    const insetX = dx > 0 ? -cargoInnerInset : (dx < 0 ? cargoInnerInset : 0);
    const dy = cargoHullPoints[i].y - cargoCenterY;
    const insetY = dy > 0 ? -cargoInnerInset : (dy < 0 ? cargoInnerInset : 0);
    cargoFrameGfx.lineTo(cargoHullPoints[i].x + insetX, cargoHullPoints[i].y + insetY);
  }
  cargoFrameGfx.closePath();
  cargoFrameGfx.stroke({ color: 0x3a2510, width: 3 });
  cargoGeomContainer.addChild(cargoFrameGfx);

  // ── Hatch Markers on Deck ──
  const deckHatchGfx = new Graphics();
  for (const h of [{ x: 1600, y: 780 }, { x: 1600, y: 1580 }]) {
    deckHatchGfx.rect(h.x - 20, h.y - 20, 40, 40);
    deckHatchGfx.fill({ color: 0x3a2a1a });
    deckHatchGfx.rect(h.x - 20, h.y - 20, 40, 40);
    deckHatchGfx.stroke({ color: 0x5a4a3a, width: 2 });
    // Grid lines
    deckHatchGfx.moveTo(h.x, h.y - 20); deckHatchGfx.lineTo(h.x, h.y + 20);
    deckHatchGfx.moveTo(h.x - 20, h.y); deckHatchGfx.lineTo(h.x + 20, h.y);
    deckHatchGfx.stroke({ color: 0x5a4a3a, width: 1 });
  }
  deckGeomContainer.addChild(deckHatchGfx);

  // ── Decorative Props in Cargo Rooms ──
  const cargoPropsGfx = new Graphics();

  // --- Fore Storage (supplies theme) ---
  // Crate clusters in fore storage (top-left area)
  // Cluster 1: stack of 3 crates near top-left
  const crateColor = 0x2a1f14;
  const crateEdge = 0x3a2a1a;

  // Large crate
  cargoPropsGfx.rect(1330, 730, 36, 36);
  cargoPropsGfx.fill({ color: crateColor });
  cargoPropsGfx.stroke({ color: crateEdge, width: 1.5 });
  // Cross on crate
  cargoPropsGfx.moveTo(1330, 730); cargoPropsGfx.lineTo(1366, 766);
  cargoPropsGfx.moveTo(1366, 730); cargoPropsGfx.lineTo(1330, 766);
  cargoPropsGfx.stroke({ color: crateEdge, width: 0.8 });

  // More crates offset, small ones
  cargoPropsGfx.rect(1370, 738, 24, 24);
  cargoPropsGfx.fill({ color: 0x241a10 });
  cargoPropsGfx.stroke({ color: crateEdge, width: 1 });

  cargoPropsGfx.rect(1340, 770, 28, 28);
  cargoPropsGfx.fill({ color: crateColor });
  cargoPropsGfx.stroke({ color: crateEdge, width: 1 });

  // Cluster 2: near top-right
  cargoPropsGfx.rect(1830, 725, 40, 30);
  cargoPropsGfx.fill({ color: crateColor });
  cargoPropsGfx.stroke({ color: crateEdge, width: 1.5 });
  cargoPropsGfx.rect(1835, 760, 30, 30);
  cargoPropsGfx.fill({ color: 0x241a10 });
  cargoPropsGfx.stroke({ color: crateEdge, width: 1 });

  // Barrels (circles)
  const barrelColor = 0x2e1e12;
  const barrelEdge = 0x4a3520;
  for (const [bx, by] of [[1860, 730], [1845, 770], [1340, 1010]] as const) {
    cargoPropsGfx.circle(bx, by, 10);
    cargoPropsGfx.fill({ color: barrelColor });
    cargoPropsGfx.stroke({ color: barrelEdge, width: 1.5 });
    // Barrel band
    cargoPropsGfx.circle(bx, by, 7);
    cargoPropsGfx.stroke({ color: barrelEdge, width: 0.8 });
  }

  // --- Central Corridor (pipe runs) ---
  // Pipes along corridor walls
  const pipeColor = 0x3a3a40;
  const pipeHighlight = 0x4a4a50;

  // Left wall pipe
  cargoPropsGfx.rect(1316, 1060, 6, 280);
  cargoPropsGfx.fill({ color: pipeColor });
  cargoPropsGfx.rect(1317, 1060, 2, 280);
  cargoPropsGfx.fill({ color: pipeHighlight, alpha: 0.3 });

  // Right wall pipe
  cargoPropsGfx.rect(1878, 1060, 6, 280);
  cargoPropsGfx.fill({ color: pipeColor });
  cargoPropsGfx.rect(1879, 1060, 2, 280);
  cargoPropsGfx.fill({ color: pipeHighlight, alpha: 0.3 });

  // Pipe brackets (small rectangles crossing the pipes)
  for (let y = 1080; y < 1340; y += 60) {
    cargoPropsGfx.rect(1313, y, 12, 4);
    cargoPropsGfx.fill({ color: 0x4a4a50 });
    cargoPropsGfx.rect(1875, y, 12, 4);
    cargoPropsGfx.fill({ color: 0x4a4a50 });
  }

  // --- Aft Storage (machinery theme) ---
  // Machinery block in aft storage (bottom-right)
  cargoPropsGfx.rect(1820, 1380, 50, 60);
  cargoPropsGfx.fill({ color: 0x1a1a22 });
  cargoPropsGfx.stroke({ color: 0x3a3a42, width: 1.5 });
  // Gear shape (octagon-ish)
  cargoPropsGfx.circle(1845, 1410, 15);
  cargoPropsGfx.stroke({ color: 0x4a4a55, width: 2 });
  cargoPropsGfx.circle(1845, 1410, 6);
  cargoPropsGfx.fill({ color: 0x3a3a42 });

  // Another machinery block (bottom-left)
  cargoPropsGfx.rect(1330, 1400, 45, 50);
  cargoPropsGfx.fill({ color: 0x1a1a22 });
  cargoPropsGfx.stroke({ color: 0x3a3a42, width: 1.5 });

  // Chain loops near aft hatch (decorative arcs)
  const chainColor = 0x4a4a50;
  for (const cx of [1570, 1630]) {
    for (let i = 0; i < 5; i++) {
      cargoPropsGfx.circle(cx, 1540 + i * 8, 3);
      cargoPropsGfx.stroke({ color: chainColor, width: 1 });
    }
  }

  // Crates in aft storage too
  cargoPropsGfx.rect(1340, 1640, 32, 32);
  cargoPropsGfx.fill({ color: crateColor });
  cargoPropsGfx.stroke({ color: crateEdge, width: 1 });
  cargoPropsGfx.rect(1820, 1650, 28, 28);
  cargoPropsGfx.fill({ color: 0x241a10 });
  cargoPropsGfx.stroke({ color: crateEdge, width: 1 });

  cargoGeomContainer.addChild(cargoPropsGfx);

  // ── Sky Visible Through Hatch Openings (on cargo layer) ──
  const cargoSkyHatchGfx = new Graphics();
  for (const h of [
    { x: shipCenterX, y: cargoTopY + foreStorageH / 2 },
    { x: shipCenterX, y: aftStorageY + aftStorageH / 2 },
  ]) {
    // Light blue rectangle visible through the hatch above
    cargoSkyHatchGfx.rect(h.x - 16, h.y - 16, 32, 32);
    cargoSkyHatchGfx.fill({ color: 0x0a1525, alpha: 0.6 });
    cargoSkyHatchGfx.rect(h.x - 12, h.y - 12, 24, 24);
    cargoSkyHatchGfx.fill({ color: 0x152540, alpha: 0.4 });
  }
  cargoGeomContainer.addChild(cargoSkyHatchGfx);

  // ── Hatch Markers on Cargo ──
  const cargoHatchGfx = new Graphics();
  for (const h of [
    { x: shipCenterX, y: cargoTopY + foreStorageH / 2 },
    { x: shipCenterX, y: aftStorageY + aftStorageH / 2 },
  ]) {
    cargoHatchGfx.rect(h.x - 20, h.y - 20, 40, 40);
    cargoHatchGfx.fill({ color: 0x3a2a1a });
    cargoHatchGfx.rect(h.x - 20, h.y - 20, 40, 40);
    cargoHatchGfx.stroke({ color: 0x5a4a3a, width: 2 });
    cargoHatchGfx.moveTo(h.x, h.y - 20); cargoHatchGfx.lineTo(h.x, h.y + 20);
    cargoHatchGfx.moveTo(h.x - 20, h.y); cargoHatchGfx.lineTo(h.x + 20, h.y);
    cargoHatchGfx.stroke({ color: 0x5a4a3a, width: 1 });
  }
  cargoGeomContainer.addChild(cargoHatchGfx);

  // ── Ambient Lighting Overlay (cargo hold) ──
  const cargoAmbientGfx = new Graphics();

  // Dim warm lantern glows at key positions
  const lanternPositions = [
    { x: 1600, y: 875 },   // Fore storage center (near hatch)
    { x: 1600, y: 1200 },  // Corridor center
    { x: 1600, y: 1525 },  // Aft storage center (near hatch)
    { x: 1400, y: 875 },   // Fore storage left
    { x: 1800, y: 875 },   // Fore storage right
    { x: 1400, y: 1525 },  // Aft storage left
    { x: 1800, y: 1525 },  // Aft storage right
  ];

  for (const lamp of lanternPositions) {
    // Outer warm glow
    cargoAmbientGfx.circle(lamp.x, lamp.y, 60);
    cargoAmbientGfx.fill({ color: 0xcc8833, alpha: 0.03 });
    // Inner glow
    cargoAmbientGfx.circle(lamp.x, lamp.y, 25);
    cargoAmbientGfx.fill({ color: 0xffaa44, alpha: 0.04 });
    // Core
    cargoAmbientGfx.circle(lamp.x, lamp.y, 4);
    cargoAmbientGfx.fill({ color: 0xffcc66, alpha: 0.15 });
  }

  cargoGeomContainer.addChild(cargoAmbientGfx);

  // ── Hatch Position Arrays ──
  const deckHatches = [
    { id: "hatch-fore", x: 1600, y: 780 },
    { id: "hatch-aft", x: 1600, y: 1580 },
  ];
  const cargoHatches = [
    { id: "hatch-fore", x: shipCenterX, y: cargoTopY + foreStorageH / 2 },
    { id: "hatch-aft", x: shipCenterX, y: aftStorageY + aftStorageH / 2 },
  ];

  // ── Layer Visibility ──
  function setLayerVisibility(layer: LayerId) {
    deckGeomContainer.visible = layer === "deck";
    cargoGeomContainer.visible = layer === "cargo";
    skyContainer.visible = layer === "deck";
  }

  // ── Issues layer ──
  const issuesLayer = new Container();
  worldLayer.addChild(issuesLayer);

  // Particle system sub-layers
  const issueParticlesGfx = new Graphics();
  issuesLayer.addChild(issueParticlesGfx);
  const issueLabelsLayer = new Container();
  issuesLayer.addChild(issueLabelsLayer);

  const issueEmitters = new Map<string, IssueEmitter>();
  let lastIssueParticleTime = Date.now();

  // ── Ground instruments layer ──
  const instrumentsLayer = new Container();
  worldLayer.addChild(instrumentsLayer);

  // ── Pings layer ──
  const pingsLayer = new Container();
  worldLayer.addChild(pingsLayer);

  // ── Loading Screen ──
  const loadingContainer = new Container();
  uiLayer.addChild(loadingContainer);
  loadingContainer.visible = false;

  const loadingBg = new Graphics();
  loadingContainer.addChild(loadingBg);

  const loadingTitle = new Text({
    text: "Aether Spire",
    style: { fill: 0x7ee3c2, fontSize: 24, fontWeight: "bold", fontFamily: UI_FONT }
  });
  loadingTitle.anchor.set(0.5);
  loadingTitle.x = app.screen.width / 2;
  loadingTitle.y = app.screen.height / 2 - 40;
  loadingContainer.addChild(loadingTitle);

  const loadingText = new Text({
    text: "Loading assets...",
    style: { fill: 0xe6e6e6, fontSize: 16, fontFamily: UI_FONT }
  });
  loadingText.anchor.set(0.5);
  loadingText.x = app.screen.width / 2;
  loadingText.y = app.screen.height / 2;
  loadingContainer.addChild(loadingText);

  const loadingProgressBarBg = new Graphics();
  loadingProgressBarBg.x = app.screen.width / 2 - 150;
  loadingProgressBarBg.y = app.screen.height / 2 + 30;
  loadingProgressBarBg.beginFill(0x1a2a35);
  loadingProgressBarBg.drawRoundedRect(0, 0, 300, 6, 3);
  loadingProgressBarBg.endFill();
  loadingContainer.addChild(loadingProgressBarBg);

  const loadingProgressBarFill = new Graphics();
  loadingProgressBarFill.x = app.screen.width / 2 - 150;
  loadingProgressBarFill.y = app.screen.height / 2 + 30;
  loadingContainer.addChild(loadingProgressBarFill);

  function showLoadingScreen() {
    loadingContainer.visible = true;
    // Re-center elements in case of resize
    loadingTitle.x = app.screen.width / 2;
    loadingTitle.y = app.screen.height / 2 - 40;
    loadingText.x = app.screen.width / 2;
    loadingText.y = app.screen.height / 2;
    loadingProgressBarBg.x = app.screen.width / 2 - 150;
    loadingProgressBarBg.y = app.screen.height / 2 + 30;
    loadingProgressBarFill.x = app.screen.width / 2 - 150;
    loadingProgressBarFill.y = app.screen.height / 2 + 30;
  }

  function updateLoadingProgress(percent: number, text: string) {
    loadingText.text = text;
    loadingProgressBarFill.clear();
    loadingProgressBarFill.beginFill(0x7ee3c2);
    loadingProgressBarFill.drawRoundedRect(0, 0, 300 * percent / 100, 6, 3);
    loadingProgressBarFill.endFill();
  }

  function hideLoadingScreen() {
    loadingContainer.visible = false;
  }

  interface ActivePing {
    x: number;
    y: number;
    layer: LayerId;
    playerName: string;
    timestamp: number;
    playerId: string;
  }
  const activePings: ActivePing[] = [];
  const PING_DURATION_MS = 5000; // 5 seconds
  const PING_COLOR = 0xffdd44; // Yellow/gold

  function addPing(ping: ActivePing) {
    // Remove any existing ping from the same player
    const existingIdx = activePings.findIndex((p) => p.playerId === ping.playerId);
    if (existingIdx !== -1) {
      activePings.splice(existingIdx, 1);
    }
    activePings.push(ping);
  }

  function updatePings() {
    pingsLayer.removeChildren();
    const now = Date.now();

    // Remove expired pings
    for (let i = activePings.length - 1; i >= 0; i--) {
      if (now - activePings[i].timestamp > PING_DURATION_MS) {
        activePings.splice(i, 1);
      }
    }

    // Draw active pings (only on current layer)
    for (const ping of activePings) {
      if (ping.layer !== currentLayer) continue;
      const age = now - ping.timestamp;
      const progress = age / PING_DURATION_MS;
      const fadeAlpha = 1 - progress; // Fade out over time

      // Expanding ring animation
      const baseRadius = 20;
      const maxExpandRadius = 40;
      const expandCycle = (age % 1000) / 1000; // 1 second cycle
      const expandRadius = baseRadius + expandCycle * (maxExpandRadius - baseRadius);

      const g = new Graphics();

      // Expanding outer ring (fades as it expands)
      g.circle(0, 0, expandRadius);
      g.stroke({ color: PING_COLOR, width: 2, alpha: fadeAlpha * (1 - expandCycle) * 0.8 });

      // Static inner ring
      g.circle(0, 0, 12);
      g.stroke({ color: PING_COLOR, width: 2, alpha: fadeAlpha * 0.9 });

      // Center dot
      g.circle(0, 0, 4);
      g.fill({ color: PING_COLOR, alpha: fadeAlpha });

      g.x = ping.x;
      g.y = ping.y;
      pingsLayer.addChild(g);

      // Player name label above ping
      const label = new Text({
        text: ping.playerName,
        style: { fill: PING_COLOR, fontSize: 11, fontFamily: UI_FONT },
      });
      label.anchor.set(0.5);
      label.x = ping.x;
      label.y = ping.y - 28;
      label.alpha = fadeAlpha;
      pingsLayer.addChild(label);

      // "PING!" text below
      const pingText = new Text({
        text: "PING!",
        style: { fill: PING_COLOR, fontSize: 12, fontWeight: "bold", fontFamily: UI_FONT },
      });
      pingText.anchor.set(0.5);
      pingText.x = ping.x;
      pingText.y = ping.y + 24;
      pingText.alpha = fadeAlpha * 0.8;
      pingsLayer.addChild(pingText);
    }
  }

  // ── Draw geometry ──
  function drawFloors() {
    // Clear previous
    floorLayer.removeChildren();
    floorFallback.clear();

    if (floorTexture) {
      // Use tiled texture sprites
      floors.forEach((floor) => {
        const tilingSprite = new TilingSprite({
          texture: floorTexture!,
          width: floor.w,
          height: floor.h,
        });
        tilingSprite.x = floor.x;
        tilingSprite.y = floor.y;
        tilingSprite.tileScale.set(1); // 1:1 scale (32px tiles)
        tilingSprite.alpha = 0.85; // Slight transparency to blend with dark theme
        floorLayer.addChild(tilingSprite);
      });
    } else {
      // Fallback to solid colors
      floors.forEach((floor) => {
        floorFallback.rect(floor.x, floor.y, floor.w, floor.h);
        floorFallback.fill({ color: floor.color });
      });
    }
  }

  // Load floor texture asynchronously
  async function loadFloorTexture() {
    try {
      floorTexture = await Assets.load("/sprites/floor.png");
      drawFloors(); // Redraw with texture
    } catch (err) {
      console.warn("Failed to load floor texture, using fallback colors", err);
    }
  }

  // Start loading texture immediately
  loadFloorTexture();

  // ── Tool sprite textures ──
  const toolTextures: Partial<Record<InstrumentType, Texture>> = {};
  const toolIconTextures: Partial<Record<InstrumentType, Texture>> = {};

  async function loadToolTextures() {
    const types: InstrumentType[] = ["thermal_regulator", "gear_wrench", "arcane_conduit"];
    for (const type of types) {
      try {
        toolTextures[type] = await Assets.load(`/sprites/tools/${type}.png`);
        toolIconTextures[type] = await Assets.load(`/sprites/tools/${type}_icon.png`);
      } catch (err) {
        console.warn(`Failed to load tool texture: ${type}`, err);
      }
    }
    // Redraw inventory slots with loaded textures
    updateInventoryIcons();
  }

  loadToolTextures();

  function drawWalls() {
    wallLayer.clear();
    walls.forEach((wall) => {
      wallLayer.rect(wall.x, wall.y, wall.w, wall.h);
    });
    wallLayer.fill({ color: 0x2a3642 });
  }

  function drawDoors() {
    doorLayer.clear();
    doors.forEach((door) => {
      doorLayer.rect(door.x, door.y, door.w, door.h);
      doorLayer.fill({ color: door.open ? 0x2d6a4f : 0x7d2c2c });
    });
  }

  drawFloors();
  drawWalls();
  drawDoors();

  // ── UI: Timer (brass-framed clock) ──
  const timerContainer = new Container();
  timerContainer.x = 16;
  timerContainer.y = 14;
  uiLayer.addChild(timerContainer);

  const timerBg = new Graphics();
  drawBrassPanel(timerBg, 0, 0, 100, 36);
  timerContainer.addChild(timerBg);

  const timerText = new Text({ text: "--:--", style: { fill: SP.amber, fontSize: 18, fontWeight: "bold", fontFamily: UI_FONT_MONO } });
  timerText.anchor.set(0.5);
  timerText.x = 50;
  timerText.y = 18;
  timerContainer.addChild(timerText);

  // ── UI: Stability Bar (brass gauge) ──
  const stabilityContainer = new Container();
  stabilityContainer.x = 16;
  stabilityContainer.y = 58;
  uiLayer.addChild(stabilityContainer);

  const stabilityBarWidth = 220;
  const stabilityBarHeight = 14;
  const stabPanelW = stabilityBarWidth + 76;
  const stabPanelH = 40;

  const stabilityPanelBg = new Graphics();
  drawBrassPanel(stabilityPanelBg, 0, 0, stabPanelW, stabPanelH);
  stabilityContainer.addChild(stabilityPanelBg);

  const stabilityTitle = new Text({
    text: "STABILITY",
    style: { fill: SP.copper, fontSize: 10, fontWeight: "bold", letterSpacing: 2, fontFamily: UI_FONT },
  });
  stabilityTitle.x = 10;
  stabilityTitle.y = 4;
  stabilityContainer.addChild(stabilityTitle);

  const stabilityBg = new Graphics();
  stabilityBg.rect(10, 18, stabilityBarWidth, stabilityBarHeight);
  stabilityBg.fill({ color: SP.darkBg });
  stabilityBg.rect(10, 18, stabilityBarWidth, stabilityBarHeight);
  stabilityBg.stroke({ color: SP.brass, width: 1, alpha: 0.5 });
  stabilityContainer.addChild(stabilityBg);

  const stabilityFill = new Graphics();
  stabilityContainer.addChild(stabilityFill);

  // Stability damage flash overlay
  const stabilityFlash = new Graphics();
  stabilityFlash.rect(10, 18, stabilityBarWidth, stabilityBarHeight);
  stabilityFlash.fill({ color: 0xff4444 });
  stabilityFlash.alpha = 0;
  stabilityContainer.addChild(stabilityFlash);

  let prevStability = 100;
  let stabilityFlashAlpha = 0;

  // Screen shake state
  let shakeIntensity = 0;
  let shakeDecay = 0;

  const stabilityLabel = new Text({
    text: "100%",
    style: { fill: SP.amber, fontSize: 15, fontWeight: "bold", fontFamily: UI_FONT_MONO },
  });
  stabilityLabel.x = stabilityBarWidth + 16;
  stabilityLabel.y = 16;
  stabilityContainer.addChild(stabilityLabel);

  // ── UI: Team Inventory Panel (top-right) ──
  const INVENTORY_W = 180;
  const INVENTORY_PAD = 12;
  const SLOT_SIZE = 36;
  const SLOT_GAP = 8;

  const inventoryContainer = new Container();
  uiLayer.addChild(inventoryContainer);

  const inventoryBg = new Graphics();
  inventoryContainer.addChild(inventoryBg);

  const inventoryTitle = new Text({
    text: "EQUIPMENT",
    style: { fill: SP.copper, fontSize: 11, fontWeight: "bold", letterSpacing: 2, fontFamily: UI_FONT },
  });
  inventoryTitle.x = 8;
  inventoryTitle.y = 6;
  inventoryContainer.addChild(inventoryTitle);

  const ALL_INSTRUMENTS: InstrumentType[] = ["thermal_regulator", "gear_wrench", "arcane_conduit"];

  const instrumentDescriptions: Record<InstrumentType, string> = {
    thermal_regulator: "Fixes Pressure Surge & Friction Fire faster",
    gear_wrench: "Fixes Coolant Leak & Mechanical Drift faster",
    arcane_conduit: "Fixes Capacitor Overload & Control Corruption faster",
  };

  interface InventorySlot {
    container: Container;
    bg: Graphics;
    iconFallback: Graphics;
    iconSprite: Sprite | null;
    type: InstrumentType;
    has: boolean;
    flash: Graphics;
    flashAlpha: number;
  }
  const inventorySlots: InventorySlot[] = [];

  ALL_INSTRUMENTS.forEach((type, i) => {
    const slotContainer = new Container();
    slotContainer.x = 10 + i * (SLOT_SIZE + SLOT_GAP);
    slotContainer.y = 24;
    inventoryContainer.addChild(slotContainer);

    const slotBg = new Graphics();
    slotBg.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 3);
    slotBg.fill({ color: SP.darkBg });
    slotBg.stroke({ color: SP.brass, width: 1, alpha: 0.5 });
    slotContainer.addChild(slotBg);

    // Fallback colored circle (shown until texture loads)
    const iconFallback = new Graphics();
    iconFallback.circle(SLOT_SIZE / 2, SLOT_SIZE / 2, 10);
    iconFallback.fill({ color: instrumentColors[type], alpha: 0.3 });
    slotContainer.addChild(iconFallback);

    // Make slot interactive for hover
    slotContainer.eventMode = "static";
    slotContainer.cursor = "pointer";

    slotContainer.on("pointerenter", () => {
      showInventoryTooltip(type, inventorySlots.find((s) => s.type === type)?.has ?? false);
    });
    slotContainer.on("pointerleave", () => {
      hideInventoryTooltip();
    });

    // Flash overlay for pickup effect
    const slotFlash = new Graphics();
    slotFlash.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 3);
    slotFlash.fill({ color: 0xffffff });
    slotFlash.alpha = 0;
    slotContainer.addChild(slotFlash);

    inventorySlots.push({ container: slotContainer, bg: slotBg, iconFallback, iconSprite: null, type, has: false, flash: slotFlash, flashAlpha: 0 });
  });

  function updateInventoryIcons() {
    for (const slot of inventorySlots) {
      const tex = toolTextures[slot.type];
      if (!tex) continue;
      if (slot.iconSprite) {
        slot.container.removeChild(slot.iconSprite);
      }
      slot.container.removeChild(slot.iconFallback);
      const sprite = new Sprite(tex);
      sprite.width = SLOT_SIZE - 4;
      sprite.height = SLOT_SIZE - 4;
      sprite.x = 2;
      sprite.y = 2;
      sprite.alpha = slot.has ? 1 : 0.3;
      slot.container.addChild(sprite);
      slot.iconSprite = sprite;
    }
  }

  function drawInventoryBg() {
    const h = 24 + SLOT_SIZE + 10;
    inventoryBg.clear();
    drawBrassPanel(inventoryBg, 0, 0, INVENTORY_W, h);
  }
  drawInventoryBg();

  function positionInventory() {
    const screenW = app.renderer.screen.width;
    inventoryContainer.x = screenW - INVENTORY_W - INVENTORY_PAD;
    inventoryContainer.y = INVENTORY_PAD;
  }
  positionInventory();

  // ── Inventory Tooltip ──
  const tooltipContainer = new Container();
  tooltipContainer.visible = false;
  uiLayer.addChild(tooltipContainer);

  const tooltipBg = new Graphics();
  tooltipContainer.addChild(tooltipBg);

  const tooltipTitle = new Text({ text: "", style: { fill: 0xe6e6e6, fontSize: 12, fontWeight: "bold", fontFamily: UI_FONT } });
  tooltipTitle.x = 8;
  tooltipTitle.y = 6;
  tooltipContainer.addChild(tooltipTitle);

  const tooltipDesc = new Text({ text: "", style: { fill: SP.mutedText, fontSize: 11, wordWrap: true, wordWrapWidth: 160, fontFamily: UI_FONT } });
  tooltipDesc.x = 8;
  tooltipDesc.y = 22;
  tooltipContainer.addChild(tooltipDesc);

  const tooltipStatus = new Text({ text: "", style: { fill: 0x888888, fontSize: 11, fontFamily: UI_FONT } });
  tooltipStatus.x = 8;
  tooltipStatus.y = 50;
  tooltipContainer.addChild(tooltipStatus);

  function showInventoryTooltip(type: InstrumentType, has: boolean) {
    tooltipTitle.text = instrumentLabels[type];
    tooltipTitle.style.fill = instrumentColors[type];
    tooltipDesc.text = instrumentDescriptions[type];
    tooltipStatus.text = has ? "In inventory" : "Not collected";
    tooltipStatus.style.fill = has ? SP.success : 0x666666;

    const w = 180;
    const h = 70;
    tooltipBg.clear();
    drawBrassPanel(tooltipBg, 0, 0, w, h, false);

    // Position below inventory panel
    tooltipContainer.x = inventoryContainer.x;
    tooltipContainer.y = inventoryContainer.y + 24 + SLOT_SIZE + 16;
    tooltipContainer.visible = true;
  }

  function hideInventoryTooltip() {
    tooltipContainer.visible = false;
  }

  // ── Player Sprite System ──
  const FRAME_SIZE = 64;
  const FRAME_COLS = 13;
  const WALK_FRAMES = 9; // Frames 0-8 for walk cycle
  const IDLE_FRAMES = 1; // Just frame 0 for idle
  const ANIM_SPEED = 0.15; // Animation speed

  // Direction mapping: LPC uses Up=0, Left=1, Down=2, Right=3
  type Direction = "up" | "down" | "left" | "right";
  const DIR_ROW: Record<Direction, number> = { up: 0, left: 1, down: 2, right: 3 };

  // Player sprite container (holds the animated sprite)
  const playerContainer = new Container();
  worldLayer.addChild(playerContainer);

  // Fallback circle (used until sprites load)
  const playerFallback = new Graphics();
  playerFallback.circle(0, 0, 10);
  playerFallback.fill({ color: 0xe6e6e6 });
  playerFallback.stroke({ color: 0x2a3b47, width: 2 });
  playerContainer.addChild(playerFallback);

  // ── Footstep Dust Particles ──
  const dustLayer = new Container();
  worldLayer.addChild(dustLayer);

  interface DustMote {
    gfx: Graphics;
    life: number;
    maxLife: number;
    vx: number;
    vy: number;
  }
  const dustParticles: DustMote[] = [];
  let lastDustAt = 0;
  const DUST_INTERVAL_MS = 200;

  function spawnDust(x: number, y: number) {
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const gfx = new Graphics();
      const size = 1.5 + Math.random() * 1.5;
      gfx.circle(0, 0, size);
      gfx.fill({ color: 0xc8b898, alpha: 0.5 });
      gfx.x = x + (Math.random() - 0.5) * 8;
      gfx.y = y + 6 + Math.random() * 4;
      dustLayer.addChild(gfx);
      dustParticles.push({
        gfx,
        life: 0,
        maxLife: 0.3 + Math.random() * 0.2,
        vx: (Math.random() - 0.5) * 15,
        vy: -5 - Math.random() * 10,
      });
    }
  }

  function tickDust(dt: number) {
    for (let i = dustParticles.length - 1; i >= 0; i--) {
      const p = dustParticles[i];
      p.life += dt;
      const t = p.life / p.maxLife;
      if (t >= 1) {
        dustLayer.removeChild(p.gfx);
        p.gfx.destroy();
        dustParticles.splice(i, 1);
        continue;
      }
      p.gfx.x += p.vx * dt;
      p.gfx.y += p.vy * dt;
      p.gfx.alpha = 0.5 * (1 - t);
    }
  }

  // Animation state
  let playerAnimatedSprite: AnimatedSprite | null = null;
  let playerWalkFrames: Record<Direction, Texture[]> = { up: [], down: [], left: [], right: [] };
  let playerIdleFrames: Record<Direction, Texture[]> = { up: [], down: [], left: [], right: [] };
  let currentDirection: Direction = "down";
  let isWalking = false;
  let spritesLoaded = false;
  let playerTintColor = 0xffffff; // Default white color

  // Load character sprites
  async function loadCharacterSprites() {
    try {
      const walkTexture = await Assets.load("/sprites/character/standard/walk.png");
      const idleTexture = await Assets.load("/sprites/character/standard/idle.png");

      // Extract frames from walk spritesheet
      const directions: Direction[] = ["up", "left", "down", "right"];
      for (let dirIdx = 0; dirIdx < 4; dirIdx++) {
        const dir = directions[dirIdx];
        playerWalkFrames[dir] = [];
        playerIdleFrames[dir] = [];

        // Walk frames (frames 1-8 for smooth loop, skip frame 0 which is standing)
        for (let frame = 1; frame <= 8; frame++) {
          const rect = new Rectangle(frame * FRAME_SIZE, dirIdx * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE);
          const frameTexture = new Texture({ source: walkTexture.source, frame: rect });
          playerWalkFrames[dir].push(frameTexture);
        }

        // Idle frame (just frame 0)
        const idleRect = new Rectangle(0, dirIdx * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE);
        const idleFrameTexture = new Texture({ source: idleTexture.source, frame: idleRect });
        playerIdleFrames[dir].push(idleFrameTexture);
      }

      // Create animated sprite starting with idle down
      playerAnimatedSprite = new AnimatedSprite(playerIdleFrames.down);
      playerAnimatedSprite.anchor.set(0.5, 0.75); // Anchor at feet
      playerAnimatedSprite.animationSpeed = ANIM_SPEED;
      playerAnimatedSprite.play();
      playerAnimatedSprite.tint = playerTintColor; // Apply initial tint

      // Remove fallback and add animated sprite
      playerContainer.removeChild(playerFallback);
      playerContainer.addChild(playerAnimatedSprite);
      spritesLoaded = true;

      console.log("Character sprites loaded successfully");
    } catch (err) {
      console.warn("Failed to load character sprites, using fallback circle", err);
    }
  }

  // Start loading sprites
  loadCharacterSprites();

  function setPlayerDirection(dir: Direction) {
    if (!spritesLoaded || !playerAnimatedSprite) return;
    if (dir === currentDirection) return;
    currentDirection = dir;
    updatePlayerAnimation();
  }

  function setPlayerWalking(walking: boolean) {
    if (!spritesLoaded || !playerAnimatedSprite) return;
    if (walking === isWalking) return;
    isWalking = walking;
    updatePlayerAnimation();
  }

  function updatePlayerAnimation() {
    if (!playerAnimatedSprite) return;
    const frames = isWalking ? playerWalkFrames[currentDirection] : playerIdleFrames[currentDirection];
    if (frames.length === 0) return;

    playerAnimatedSprite.textures = frames;
    playerAnimatedSprite.animationSpeed = isWalking ? ANIM_SPEED : 0;
    if (isWalking) {
      playerAnimatedSprite.play();
    } else {
      playerAnimatedSprite.gotoAndStop(0);
    }
  }

  const playerLabel = new Text({ text: "", style: { fill: 0xe6e6e6, fontSize: 13, fontWeight: "bold", fontFamily: UI_FONT } });
  playerLabel.anchor.set(0.5);
  worldLayer.addChild(playerLabel);

  // ── Channel/Fix progress bar ──
  const channelBarBg = new Graphics();
  channelBarBg.visible = false;
  worldLayer.addChild(channelBarBg);

  const channelBarFill = new Graphics();
  channelBarFill.visible = false;
  worldLayer.addChild(channelBarFill);

  const channelLabel = new Text({ text: "", style: { fill: 0xe6e6e6, fontSize: 11, fontFamily: UI_FONT } });
  channelLabel.anchor.set(0.5);
  channelLabel.visible = false;
  worldLayer.addChild(channelLabel);

  // ── Other players ──
  const otherPlayers = new Map<
    string,
    {
      sprite: Graphics | AnimatedSprite;
      label: Text;
      progressBarBg: Graphics;
      progressBarFill: Graphics;
      progressLabel: Text;
      x: number;
      y: number;
      startX: number;
      startY: number;
      targetX: number;
      targetY: number;
      t: number;
      isWalking: boolean;
      lastX: number;
      lastY: number;
      lastDirection: Direction;
    }
  >();
  const playersLayer = new Container();
  worldLayer.addChild(playersLayer);

  // ── Interaction text ──
  const interactionBgGfx = new Graphics();
  uiLayer.addChild(interactionBgGfx);
  const interactionText = new Text({ text: "", style: { fill: SP.amber, fontSize: 14, fontWeight: "bold", fontFamily: UI_FONT, wordWrap: true, wordWrapWidth: 500 } });
  interactionText.x = 24;
  interactionText.y = app.renderer.screen.height - 36;
  uiLayer.addChild(interactionText);

  // ── Context menu (overlay) ──
  const contextMenuContainer = new Container();
  contextMenuContainer.visible = false;
  uiLayer.addChild(contextMenuContainer);

  const contextMenuBg = new Graphics();
  contextMenuContainer.addChild(contextMenuBg);

  const contextMenuTitle = new Text({ text: "", style: { fill: SP.copper, fontSize: 15, fontWeight: "bold", fontFamily: UI_FONT, wordWrap: true, wordWrapWidth: 276 } });
  contextMenuTitle.x = 12;
  contextMenuTitle.y = 10;
  contextMenuContainer.addChild(contextMenuTitle);

  const contextMenuItems: Text[] = [];
  for (let i = 0; i < 3; i++) {
    const item = new Text({ text: "", style: { fill: SP.mutedText, fontSize: 13, fontFamily: UI_FONT, wordWrap: true, wordWrapWidth: 276 } });
    item.x = 12;
    item.y = 34 + i * 22;
    contextMenuContainer.addChild(item);
    contextMenuItems.push(item);
  }

  // ── Results screen ──
  const resultsContainer = new Container();
  resultsContainer.visible = false;
  uiLayer.addChild(resultsContainer);

  const resultsBg = new Graphics();
  resultsContainer.addChild(resultsBg);

  const resultsPanel = new Graphics();
  resultsContainer.addChild(resultsPanel);

  const resultsTitle = new Text({ text: "", style: { fill: SP.amber, fontSize: 28, fontWeight: "bold", fontFamily: UI_FONT } });
  resultsTitle.anchor.set(0.5);
  resultsContainer.addChild(resultsTitle);

  const resultsBody = new Text({ text: "", style: { fill: SP.mutedText, fontSize: 16, fontFamily: UI_FONT, wordWrap: true, wordWrapWidth: 300 } });
  resultsBody.anchor.set(0.5);
  resultsContainer.addChild(resultsBody);

  // ── Functions ──

  function updateStability(stability: number) {
    const clamped = Math.max(0, Math.min(100, stability));
    const width = Math.round((clamped / 100) * stabilityBarWidth);

    // Detect damage — trigger flash and shake
    const drop = prevStability - clamped;
    if (drop > 0.5) {
      stabilityFlashAlpha = Math.min(1, drop / 10);
      const shakeAmount = Math.min(8, drop * 0.6);
      if (shakeAmount > shakeIntensity) {
        shakeIntensity = shakeAmount;
        shakeDecay = shakeAmount;
      }
    }
    prevStability = clamped;

    let color: number;
    if (clamped >= 80) color = SP.success;
    else if (clamped >= 40) color = SP.amber;
    else color = SP.danger;

    stabilityFill.clear();
    // Main bar fill
    stabilityFill.rect(10, 18, width, stabilityBarHeight);
    stabilityFill.fill({ color });
    // Bright pip at fill edge
    if (width > 2) {
      stabilityFill.rect(10 + width - 2, 18, 2, stabilityBarHeight);
      stabilityFill.fill({ color: 0xffffff, alpha: 0.4 });
    }

    stabilityLabel.text = `${Math.round(clamped)}%`;
  }

  function updateTeamInventory(inventory: InstrumentType[]) {
    ALL_INSTRUMENTS.forEach((type, i) => {
      const slot = inventorySlots[i];
      const has = inventory.includes(type);
      // Flash on new pickup
      if (has && !slot.has) {
        slot.flashAlpha = 0.7;
      }
      slot.has = has;

      // Update slot background
      slot.bg.clear();
      slot.bg.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 3);
      slot.bg.fill({ color: has ? 0x1a1808 : SP.darkBg });
      slot.bg.stroke({ color: has ? SP.gold : SP.brass, width: has ? 2 : 1, alpha: has ? 1 : 0.5 });

      // Update icon (sprite or fallback)
      if (slot.iconSprite) {
        slot.iconSprite.alpha = has ? 1 : 0.3;
      } else {
        slot.iconFallback.clear();
        slot.iconFallback.circle(SLOT_SIZE / 2, SLOT_SIZE / 2, 10);
        slot.iconFallback.fill({ color: instrumentColors[type], alpha: has ? 0.9 : 0.25 });
        if (has) {
          slot.iconFallback.stroke({ color: 0xffffff, width: 1, alpha: 0.4 });
        }
      }
    });
  }

  function setIssues(issues: Issue[]) {
    // Data-sync only — update emitter map, no Graphics calls
    const incomingIds = new Set<string>();

    for (const issue of issues) {
      incomingIds.add(issue.id);
      let emitter = issueEmitters.get(issue.id);
      if (emitter) {
        // Update mutable fields
        emitter.status = issue.status;
        emitter.fixingBy = issue.fixingBy;
        emitter.fixStartedAt = issue.fixStartedAt;
        emitter.fixDurationMs = issue.fixDurationMs;
      } else {
        // Spawn new emitter
        issueEmitters.set(issue.id, {
          issueId: issue.id,
          issueType: issue.type as IssueType,
          x: issue.x,
          y: issue.y,
          spawnTime: issue.spawnTime,
          status: issue.status,
          requiredPlayers: issue.requiredPlayers,
          fixingBy: issue.fixingBy,
          fixStartedAt: issue.fixStartedAt,
          fixDurationMs: issue.fixDurationMs,
          particles: [],
          emitAccumulator: 0,
          createdAt: Date.now(),
          despawning: false,
          despawnStartedAt: 0,
        });
      }
    }

    // Mark removed issues as despawning
    for (const [id, emitter] of issueEmitters) {
      if (!incomingIds.has(id) && !emitter.despawning) {
        emitter.despawning = true;
        emitter.despawnStartedAt = Date.now();
      }
    }
  }

  function emitParticle(emitter: IssueEmitter, config: IssueParticleConfig, urgency: number): IssueParticle {
    const spawnRadius = lerp(config.spawnRadiusBase, config.spawnRadiusMax, urgency);
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * spawnRadius;
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist;

    const speed = lerp(config.speedRange[0], config.speedRange[1], Math.random()) * lerp(1, 1.5, urgency);
    let vx = 0, vy = 0;
    switch (config.directionPattern) {
      case "upward":
        vx = (Math.random() - 0.5) * speed * 0.5;
        vy = -speed * (0.6 + Math.random() * 0.4);
        break;
      case "downward":
        vx = (Math.random() - 0.5) * speed * 0.4;
        vy = speed * (0.5 + Math.random() * 0.5);
        break;
      case "radial_out": {
        const a = Math.random() * Math.PI * 2;
        vx = Math.cos(a) * speed;
        vy = Math.sin(a) * speed;
        break;
      }
      case "random":
        vx = (Math.random() - 0.5) * speed * 2;
        vy = (Math.random() - 0.5) * speed * 2;
        break;
    }

    const color = config.colors[Math.floor(Math.random() * config.colors.length)];
    const size = lerp(config.sizeRange[0], config.sizeRange[1], Math.random()) * lerp(1, 1.3, urgency);
    const maxAge = lerp(config.lifetimeRange[0], config.lifetimeRange[1], Math.random());

    // For line shape: generate arc endpoint offset
    let lx = 0, ly = 0;
    if (config.shape === "line") {
      const arcLen = size;
      const arcAngle = Math.random() * Math.PI * 2;
      lx = Math.cos(arcAngle) * arcLen;
      ly = Math.sin(arcAngle) * arcLen;
    }

    return { x, y, vx, vy, size, alpha: config.alphaRange[0], color, age: 0, maxAge, shape: config.shape, lx, ly };
  }

  function drawParticle(gfx: Graphics, p: IssueParticle, ex: number, ey: number) {
    const px = ex + p.x;
    const py = ey + p.y;
    switch (p.shape) {
      case "circle":
        gfx.circle(px, py, p.size);
        gfx.fill({ color: p.color, alpha: p.alpha });
        break;
      case "rect":
        gfx.rect(px - p.size / 2, py - p.size / 2, p.size, p.size);
        gfx.fill({ color: p.color, alpha: p.alpha });
        break;
      case "diamond":
        gfx.moveTo(px, py - p.size);
        gfx.lineTo(px + p.size * 0.6, py);
        gfx.lineTo(px, py + p.size);
        gfx.lineTo(px - p.size * 0.6, py);
        gfx.closePath();
        gfx.fill({ color: p.color, alpha: p.alpha });
        break;
      case "line": {
        const midX = (px + px + p.lx) / 2 + (Math.random() - 0.5) * 10;
        const midY = (py + py + p.ly) / 2 + (Math.random() - 0.5) * 10;
        gfx.moveTo(px, py);
        gfx.lineTo(midX, midY);
        gfx.lineTo(px + p.lx, py + p.ly);
        gfx.stroke({ color: p.color, width: 2, alpha: p.alpha });
        break;
      }
    }
  }

  function updateIssueParticles() {
    const now = Date.now();
    const dt = (now - lastIssueParticleTime) / 1000;
    lastIssueParticleTime = now;

    issueParticlesGfx.clear();
    issueLabelsLayer.removeChildren();

    for (const [id, emitter] of issueEmitters) {
      const config = ISSUE_PARTICLE_CONFIGS[emitter.issueType];
      const ageSec = (now - emitter.spawnTime) / 1000;
      const urgency = Math.min(1, ageSec / 60);
      const isFixing = emitter.status === "in_progress";
      const fixerCount = emitter.fixingBy?.length ?? 0;

      // Calculate severity level based on age
      let severityLevel = 0; // 0 = low, 1 = medium, 2 = high, 3 = critical
      if (ageSec >= 30) severityLevel = 3;
      else if (ageSec >= 20) severityLevel = 2;
      else if (ageSec >= 10) severityLevel = 1;

      // Despawning: fade out and clean up
      if (emitter.despawning) {
        const despawnAge = (now - emitter.despawnStartedAt) / 1000;
        if (despawnAge > 1.5 || emitter.particles.length === 0) {
          issueEmitters.delete(id);
          continue;
        }
        // Don't emit new particles, just update existing
      } else {
        // Emit new particles
        const spawnFadeIn = Math.min(1, (now - emitter.createdAt) / 500);
        const rateMultiplier = isFixing ? 0.4 : 1;
        const emitRate = lerp(config.emitRateBase, config.emitRateMax, urgency) * rateMultiplier * spawnFadeIn;
        emitter.emitAccumulator += emitRate * dt;

        while (emitter.emitAccumulator >= 1 && emitter.particles.length < MAX_PARTICLES_PER_EMITTER) {
          emitter.emitAccumulator -= 1;
          emitter.particles.push(emitParticle(emitter, config, urgency));
        }
        emitter.emitAccumulator = Math.min(emitter.emitAccumulator, 3); // cap accumulator
      }

      // Update particles
      for (let i = emitter.particles.length - 1; i >= 0; i--) {
        const p = emitter.particles[i];
        p.age += dt;
        if (p.age >= p.maxAge) {
          emitter.particles.splice(i, 1);
          continue;
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += config.gravity * dt;

        // Alpha fade
        const life = p.age / p.maxAge;
        switch (config.fadePattern) {
          case "linear":
            p.alpha = lerp(config.alphaRange[0], config.alphaRange[1], life);
            break;
          case "ease_out":
            p.alpha = lerp(config.alphaRange[0], config.alphaRange[1], life * life);
            break;
          case "flicker":
            p.alpha = lerp(config.alphaRange[0], config.alphaRange[1], life) * (0.5 + 0.5 * Math.random());
            break;
        }

        // Control corruption: random position jitter
        if (emitter.issueType === "control_corruption" && Math.random() < 0.15) {
          p.x += (Math.random() - 0.5) * 6;
          p.y += (Math.random() - 0.5) * 6;
        }

        // Despawning: extra fade
        if (emitter.despawning) {
          const despawnFade = 1 - Math.min(1, (now - emitter.despawnStartedAt) / 1000);
          p.alpha *= despawnFade;
        }
      }

      // Draw base glow (layered for visibility)
      let baseColor = issueColors[emitter.issueType] ?? 0xcccccc;
      
      // Adjust color based on severity (conservative change)
      if (severityLevel >= 3) {
        // Only change to red for critical issues
        baseColor = 0xff0000;
      } else if (severityLevel === 2) {
        // Orange for high severity
        baseColor = 0xffa500;
      }
      
      const glowRadius = lerp(config.spawnRadiusBase, config.spawnRadiusMax, urgency) * 1.4;
      const glowAlpha = lerp(0.15, 0.35, urgency) * (isFixing ? 0.4 : 1);
      if (!emitter.despawning) {
        // Outer soft glow
        issueParticlesGfx.circle(emitter.x, emitter.y, glowRadius * 1.5);
        issueParticlesGfx.fill({ color: baseColor, alpha: glowAlpha * 0.3 });
        // Inner glow
        issueParticlesGfx.circle(emitter.x, emitter.y, glowRadius);
        issueParticlesGfx.fill({ color: baseColor, alpha: glowAlpha });

      }

      // Draw particles
      for (const p of emitter.particles) {
        drawParticle(issueParticlesGfx, p, emitter.x, emitter.y);
      }

      // Skip labels for despawning emitters
      if (emitter.despawning) continue;

      // Fade labels when player is nearby (interaction hint takes over)
      const dxP = playerContainer.x - emitter.x;
      const dyP = playerContainer.y - emitter.y;
      const distToPlayer = Math.sqrt(dxP * dxP + dyP * dyP);
      const FADE_START = 80;
      const FADE_END = 40;
      const labelAlpha = distToPlayer <= FADE_END ? 0 : distToPlayer >= FADE_START ? 1 : (distToPlayer - FADE_END) / (FADE_START - FADE_END);

      // Label with severity coloring
      let labelColor = baseColor;
      if (severityLevel >= 2) labelColor = 0xff0000; // Red for high/critical issues

      const labelText = issueLabels[emitter.issueType] || emitter.issueType;
      const label = new Text({
        text: labelText,
        style: { fill: labelColor, fontSize: 11, fontWeight: "bold", fontFamily: UI_FONT },
      });
      label.anchor.set(0.5);
      label.x = emitter.x;
      label.y = emitter.y - 26;
      label.alpha = labelAlpha;
      issueLabelsLayer.addChild(label);

      // Drain rate indicator for active (unfixed) issues
      if (emitter.status === "active") {
        const drain = calculateDrainRate(emitter.spawnTime, now);
        const drainColor = drain >= 0.64 ? 0xff4444 : drain >= 0.32 ? 0xffaa44 : 0xff8866;
        const drainLabel = new Text({
          text: `-${drain.toFixed(1)}/s`,
          style: { fill: drainColor, fontSize: 10, fontFamily: UI_FONT },
        });
        drainLabel.anchor.set(0.5);
        drainLabel.x = emitter.x;
        drainLabel.y = emitter.y - 14;
        drainLabel.alpha = labelAlpha * 0.85;
        issueLabelsLayer.addChild(drainLabel);
      }

      // Helper indicator when 2+ fixers are working
      if (isFixing && fixerCount >= 2) {
        const helpText = new Text({
          text: `${fixerCount}x fixing`,
          style: { fill: 0x7ee3c2, fontSize: 10, fontWeight: "bold", fontFamily: UI_FONT },
        });
        helpText.anchor.set(0.5);
        helpText.x = emitter.x;
        helpText.y = emitter.y + 14;
        helpText.alpha = labelAlpha;
        issueLabelsLayer.addChild(helpText);
      }

      // Progress is shown on the player character, not on the issue
    }
  }

  function setGroundInstruments(instruments: GroundInstrument[]) {
    instrumentsLayer.removeChildren();
    for (const inst of instruments) {
      const color = instrumentColors[inst.type] ?? 0xcccccc;
      const tex = toolIconTextures[inst.type];

      if (tex) {
        const sprite = new Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.x = inst.x;
        sprite.y = inst.y;
        instrumentsLayer.addChild(sprite);
      } else {
        // Fallback colored circle
        const g = new Graphics();
        g.circle(0, 0, 6);
        g.fill({ color, alpha: 0.9 });
        g.stroke({ color: 0xffffff, width: 1, alpha: 0.6 });
        g.x = inst.x;
        g.y = inst.y;
        instrumentsLayer.addChild(g);
      }

      const label = new Text({
        text: instrumentLabels[inst.type] || "?",
        style: { fill: 0xe6e6e6, fontSize: 11, fontFamily: UI_FONT },
      });
      label.anchor.set(0.5);
      label.x = inst.x;
      label.y = inst.y - 22;
      instrumentsLayer.addChild(label);
    }
  }

  function showContextMenu(
    issue: Issue,
    teamInventory: InstrumentType[],
    selectedIndex: number
  ) {
    const screenW = app.renderer.screen.width;
    const screenH = app.renderer.screen.height;
    const menuW = 300;

    const label = issueLabels[issue.type] || issue.type;
    contextMenuTitle.text = `Fix: ${label}`;
    contextMenuTitle.style.fill = SP.copper;

    // Options
    const hasTool = teamInventory.includes(issue.requiredTool);
    const options = [
      `Fix manually (${issue.baseFixTime}s)`,
      hasTool
        ? `Use ${instrumentLabels[issue.requiredTool]} (${issue.fixTimeWithTool}s)`
        : `${instrumentLabels[issue.requiredTool]} (not available)`,
      "Cancel",
    ];

    // Set text first so we can measure wrapped heights
    let itemY = 10 + contextMenuTitle.height + 6;
    options.forEach((opt, i) => {
      const isSelected = i === selectedIndex;
      const isDisabled = i === 1 && !hasTool;
      contextMenuItems[i].text = `${isSelected ? "> " : "  "}${opt}`;
      contextMenuItems[i].style.fill = isDisabled
        ? 0x555555
        : isSelected
          ? SP.amber
          : SP.mutedText;
      contextMenuItems[i].y = itemY;
      contextMenuItems[i].visible = true;
      itemY += contextMenuItems[i].height + 4;
    });

    const menuH = itemY + 10;
    const menuX = Math.round(screenW / 2 - menuW / 2);
    const menuY = Math.round(screenH / 2 - menuH / 2);

    contextMenuContainer.x = menuX;
    contextMenuContainer.y = menuY;

    contextMenuBg.clear();
    drawBrassPanel(contextMenuBg, 0, 0, menuW, menuH);

    contextMenuContainer.visible = true;
  }

  function hideContextMenu() {
    contextMenuContainer.visible = false;
  }

  function showResultsScreen(data: {
    won: boolean;
    score: number;
    stars: number;
    issuesFixed: number;
    finalStability: number;
    timeSurvived: number;
  }) {
    const screenW = app.renderer.screen.width;
    const screenH = app.renderer.screen.height;

    resultsBg.clear();
    resultsBg.rect(0, 0, screenW, screenH);
    resultsBg.fill({ color: 0x0a0806, alpha: 0.85 });

    // Brass-framed center panel
    const panelW = 340;
    const panelH = 240;
    const px = screenW / 2 - panelW / 2;
    const py = screenH / 2 - panelH / 2;
    resultsPanel.clear();
    drawBrassPanel(resultsPanel, px, py, panelW, panelH);

    resultsTitle.text = data.won ? "VICTORY" : "DEFEAT";
    resultsTitle.style.fill = data.won ? SP.gold : SP.danger;
    resultsTitle.x = screenW / 2;
    resultsTitle.y = py + 40;

    const starStr = "\u2605".repeat(data.stars) + "\u2606".repeat(5 - data.stars);
    resultsBody.text = [
      `${starStr}  Score: ${data.score}`,
      `Time Survived: ${Math.floor(data.timeSurvived / 60)}m ${data.timeSurvived % 60}s`,
      `Issues Fixed: ${data.issuesFixed}`,
      `Final Stability: ${data.finalStability}%`,
      "",
      "Press R to restart",
    ].join("\n");
    resultsBody.style.fill = SP.mutedText;
    resultsBody.x = screenW / 2;
    resultsBody.y = py + panelH / 2 + 20;

    resultsContainer.visible = true;
  }

  function hideResultsScreen() {
    resultsContainer.visible = false;
  }

  function updateMeta(state: GameState) {
    timerText.text = formatTime(state.timeRemainingSec);
  }

  function update(state: GameState) {
    updateStability(state.stability);
    updateTeamInventory(state.teamInventory);
    setIssues(state.issues.filter(i => i.layer === currentLayer));
    setGroundInstruments(state.groundInstruments.filter(i => i.layer === currentLayer));
    updateMeta(state);

    // Warning ring based on stability
    const lowStability = state.stability <= 30;
    warningRing.clear();
    warningRing.circle(coreX, coreY, 94);
    warningRing.stroke({
      color: 0xff6b6b,
      width: lowStability ? 4 : 2,
      alpha: lowStability ? 0.9 : 0.2,
    });
  }

  function setPlayer(x: number, y: number) {
    playerContainer.x = x;
    playerContainer.y = y;
    playerLabel.x = x;
    playerLabel.y = y - 40; // Adjusted for taller sprite
  }

  function setPlayerColor(color: number) {
    // Store the color for tinting
    playerTintColor = color;
    
    // For fallback circle only
    playerFallback.clear();
    playerFallback.circle(0, 0, 10);
    playerFallback.fill({ color });
    playerFallback.stroke({ color: 0x2a3b47, width: 2 });
    
    // Apply tint to animated sprite if available
    if (playerAnimatedSprite) {
      playerAnimatedSprite.tint = color;
    }
  }

  function setPlayerName(name: string) {
    playerLabel.text = name;
  }

  function setChannelProgress(progress: number, label: string) {
    if (progress <= 0) {
      channelBarBg.visible = false;
      channelBarFill.visible = false;
      channelLabel.visible = false;
      return;
    }
    const barW = 40;
    const barH = 6;
    const bx = playerContainer.x - barW / 2;
    const by = playerContainer.y - 30;

    channelBarBg.clear();
    channelBarBg.rect(bx, by, barW, barH);
    channelBarBg.fill({ color: 0x1e2732 });
    channelBarBg.visible = true;

    channelBarFill.clear();
    channelBarFill.rect(bx, by, barW * progress, barH);
    // Dynamic color based on progress (green to yellow as it gets closer to completion)
    let fillColor = 0x5fc96b; // Green for early progress
    if (progress > 0.7) {
      // Transition to yellow as we approach completion
      const transition = (progress - 0.7) / 0.3;
      fillColor = lerp(0x5fc96b, 0xffd700, transition);
    }
    channelBarFill.fill({ color: fillColor });
    channelBarFill.visible = true;

    channelLabel.text = label;
    channelLabel.x = playerContainer.x;
    channelLabel.y = by - 10;
    channelLabel.visible = true;
  }

  function setOtherPlayers(
    players: { playerId: string; x: number; y: number; color: number; name: string; fixProgress?: { progress: number; label: string } }[]
  ) {
    const keep = new Set<string>();
    players.forEach((entry) => {
      keep.add(entry.playerId);
      let record = otherPlayers.get(entry.playerId);
      if (!record) {
        // Create an animated sprite for other players using the same texture as the main player
        let sprite: AnimatedSprite | Graphics;
        
        if (spritesLoaded && playerAnimatedSprite) {
          // Create a copy of the player sprite with the same textures but different tint
          sprite = new AnimatedSprite(playerAnimatedSprite.textures);
          sprite.anchor.set(0.5, 0.75); // Same anchor as main player
          sprite.animationSpeed = ANIM_SPEED;
          sprite.play();
          sprite.tint = entry.color; // Apply the player's unique color
        } else {
          // Fallback to circle if sprites aren't loaded yet
          sprite = new Graphics();
          sprite.circle(0, 0, 8);
          sprite.fill({ color: entry.color });
          sprite.stroke({ color: 0x1a222a, width: 2 });
        }
        
        const label = new Text({ text: entry.name, style: { fill: 0xd0d7de, fontSize: 11, fontWeight: "bold", fontFamily: UI_FONT } });
        label.anchor.set(0.5);
        
        // Create progress bar for fixing
        const progressBarBg = new Graphics();
        const progressBarFill = new Graphics();
        const progressLabel = new Text({ text: "", style: { fill: 0xffffff, fontSize: 10, fontFamily: UI_FONT } });
        progressLabel.anchor.set(0.5);
        
        playersLayer.addChild(sprite);
        playersLayer.addChild(label);
        playersLayer.addChild(progressBarBg);
        playersLayer.addChild(progressBarFill);
        playersLayer.addChild(progressLabel);
        
        record = {
          sprite,
          label,
          x: entry.x,
          y: entry.y,
          startX: entry.x,
          startY: entry.y,
          targetX: entry.x,
          targetY: entry.y,
          t: 1,
          isWalking: false, // Track if this player is currently moving
          lastX: entry.x,   // Track last position to detect movement
          lastY: entry.y,
          lastDirection: "down" as Direction, // Track last direction for animation
          progressBarBg,
          progressBarFill,
          progressLabel,
        };
        otherPlayers.set(entry.playerId, record);
      } else {
        // Update the color if it has changed
        if (record.sprite instanceof AnimatedSprite) {
          record.sprite.tint = entry.color;
        } else if (record.sprite instanceof Graphics) {
          record.sprite.clear();
          record.sprite.circle(0, 0, 8);
          record.sprite.fill({ color: entry.color });
          record.sprite.stroke({ color: 0x1a222a, width: 2 });
        }
        
        // If sprites are now loaded and the player is still using a circle, upgrade to animated sprite
        if (spritesLoaded && playerAnimatedSprite && record.sprite instanceof Graphics) {
          // Remove the old circle from the stage
          playersLayer.removeChild(record.sprite);
          
          // Create a new animated sprite
          const newSprite = new AnimatedSprite(playerIdleFrames[record.lastDirection]);
          newSprite.anchor.set(0.5, 0.75);
          newSprite.animationSpeed = 0; // Start with idle animation
          newSprite.gotoAndStop(0); // Show first frame
          newSprite.tint = entry.color;
          
          // Position it correctly
          newSprite.x = record.x;
          newSprite.y = record.y;
          
          // Add it to the stage
          playersLayer.addChildAt(newSprite, 0); // Add at index 0 to be behind other elements
          
          // Update the record
          record.sprite = newSprite;
        } else if (record.sprite instanceof AnimatedSprite) {
          // If it's already an animated sprite, just update the color
          record.sprite.tint = entry.color;
        }
      }
      
      record.label.text = entry.name;
      record.startX = record.x;
      record.startY = record.y;
      record.targetX = entry.x;
      record.targetY = entry.y;
      record.t = 0;
      
      // Update progress bar if player is fixing
      if (entry.fixProgress) {
        const barX = entry.x - 15;
        const barY = entry.y - 25;
        const barWidth = 30;
        const barHeight = 4;
        
        // Background of progress bar
        record.progressBarBg.clear();
        record.progressBarBg.beginFill(0x1e2732);
        record.progressBarBg.drawRect(barX, barY, barWidth, barHeight);
        record.progressBarBg.endFill();
        record.progressBarBg.visible = true;
        
        // Fill of progress bar
        record.progressBarFill.clear();
        record.progressBarFill.beginFill(0x5fc96b); // Green color
        record.progressBarFill.drawRect(barX, barY, barWidth * entry.fixProgress.progress, barHeight);
        record.progressBarFill.endFill();
        record.progressBarFill.visible = true;
        
        // Progress label
        record.progressLabel.text = `${Math.round(entry.fixProgress.progress * 100)}%`;
        record.progressLabel.x = entry.x;
        record.progressLabel.y = barY - 8;
        record.progressLabel.visible = true;
      } else {
        // Hide progress bar if not fixing
        record.progressBarBg.visible = false;
        record.progressBarFill.visible = false;
        record.progressLabel.visible = false;
      }
    });
    for (const [id, record] of otherPlayers.entries()) {
      if (keep.has(id)) continue;
      playersLayer.removeChild(record.sprite);
      playersLayer.removeChild(record.label);
      playersLayer.removeChild(record.progressBarBg);
      playersLayer.removeChild(record.progressBarFill);
      playersLayer.removeChild(record.progressLabel);
      otherPlayers.delete(id);
    }
  }

  function tickOtherPlayers(dt: number) {
    const speed = 10;
    otherPlayers.forEach((record) => {
      record.t = Math.min(1, record.t + speed * dt);
      record.x = record.startX + (record.targetX - record.startX) * record.t;
      record.y = record.startY + (record.targetY - record.startY) * record.t;
      
      // Calculate movement vector
      const dx = record.x - record.lastX;
      const dy = record.y - record.lastY;
      const distanceMoved = Math.sqrt(dx * dx + dy * dy);
      
      // Determine direction based on movement
      let newDirection: Direction = record.lastDirection; // Default to last direction
      if (Math.abs(dx) > Math.abs(dy)) {
        newDirection = dx > 0 ? "right" : "left";
      } else {
        newDirection = dy > 0 ? "down" : "up";
      }
      
      // Update walking state if movement detected
      const isMoving = distanceMoved > 0.5; // Threshold to avoid tiny movements
      if (isMoving !== record.isWalking || newDirection !== record.lastDirection) {
        record.lastDirection = newDirection;
        
        if (record.sprite instanceof AnimatedSprite) {
          record.isWalking = isMoving;
          // Switch animation based on movement and direction
          if (isMoving) {
            // Switch to walk animation in the correct direction
            record.sprite.textures = playerWalkFrames[newDirection];
            record.sprite.animationSpeed = ANIM_SPEED;
            record.sprite.play();
          } else {
            // Switch to idle animation in the correct direction
            record.sprite.textures = playerIdleFrames[newDirection];
            record.sprite.animationSpeed = 0; // Stop animation for idle
            record.sprite.gotoAndStop(0); // Show first frame of idle
          }
        }
      }
      
      // If the player is moving, make sure they stay in the walk animation
      if (isMoving && record.sprite instanceof AnimatedSprite && record.isWalking) {
        // Ensure we're using the correct walk frames for the current direction
        if (record.sprite.textures !== playerWalkFrames[newDirection]) {
          record.sprite.textures = playerWalkFrames[newDirection];
          record.sprite.animationSpeed = ANIM_SPEED;
          record.sprite.play();
        }
      }
      
      // Update last position
      record.lastX = record.x;
      record.lastY = record.y;
      
      // Update sprite position
      record.sprite.x = record.x;
      record.sprite.y = record.y;
      record.label.x = record.x;
      record.label.y = record.y - 16;
      
      // Update progress bar positions
      if (record.progressBarBg.visible) {
        const barX = record.x - 15;
        const barY = record.y - 25;
        record.progressBarBg.x = barX;
        record.progressBarBg.y = barY;
        record.progressBarFill.x = barX;
        record.progressBarFill.y = barY;
        record.progressLabel.x = record.x;
        record.progressLabel.y = barY - 8;
      }
    });
  }

  function getWalls(layer?: LayerId) {
    return (layer || currentLayer) === "cargo" ? cargoWalls : walls;
  }

  function getDoors(layer?: LayerId) {
    return (layer || currentLayer) === "cargo" ? cargoDoors : doors;
  }

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

  function getSpawnPoint(layer?: LayerId) {
    return (layer || currentLayer) === "cargo"
      ? { x: cargoSpawnPoint.x, y: cargoSpawnPoint.y }
      : { x: spawnPoint.x, y: spawnPoint.y };
  }

  let currentZoom = 1;

  function setCamera(centerX: number, centerY: number) {
    const screenW = app.renderer.screen.width;
    const screenH = app.renderer.screen.height;
    const z = currentZoom;

    // Center the camera on the target position, accounting for zoom
    let x = screenW / 2 - centerX * z;
    let y = screenH / 2 - centerY * z;

    // Clamp so we don't show beyond world edges
    const scaledW = worldWidth * z;
    const scaledH = worldHeight * z;
    const minX = Math.min(0, screenW - scaledW);
    const minY = Math.min(0, screenH - scaledH);
    x = Math.max(minX, Math.min(0, x));
    y = Math.max(minY, Math.min(0, y));

    // Apply screen shake offset
    if (shakeIntensity > 0.1) {
      x += (Math.random() - 0.5) * shakeIntensity * 2;
      y += (Math.random() - 0.5) * shakeIntensity * 2;
    }

    worldLayer.x = x;
    worldLayer.y = y;
  }

  function setZoom(zoomLevel: number) {
    currentZoom = zoomLevel;
    worldLayer.scale.set(zoomLevel);
  }

  function setInteractionText(text: string) {
    interactionText.text = text;
    interactionBgGfx.clear();
    if (text) {
      const pad = 6;
      const tw = interactionText.width + pad * 2;
      const th = interactionText.height + pad;
      interactionBgGfx.roundRect(interactionText.x - pad, interactionText.y - pad / 2, tw, th, 4);
      interactionBgGfx.fill({ color: SP.darkBg, alpha: 0.75 });
    }
  }

  // ── Fade Overlay ──
  const fadeOverlay = new Graphics();
  fadeOverlay.rect(0, 0, 4000, 3000);
  fadeOverlay.fill({ color: 0x000000 });
  fadeOverlay.alpha = 0;
  fadeOverlay.visible = false;
  uiLayer.addChild(fadeOverlay);

  let fadeState: "none" | "fading_out" | "fading_in" = "none";
  let fadeStartedAt = 0;
  const FADE_DURATION = 300;
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
        const { layer, x, y } = pendingLayerSwitch;
        currentLayer = layer;
        setLayerVisibility(layer);
        drawMinimapStatic();
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

  // ── Minimap ──
  const MINIMAP_W = 160;
  const MINIMAP_H = 120;
  const MINIMAP_PAD = 12;
  const mmScale = MINIMAP_W / worldWidth;

  const minimapContainer = new Container();
  uiLayer.addChild(minimapContainer);

  const mmBg = new Graphics();
  minimapContainer.addChild(mmBg);

  const mmWalls = new Graphics();
  minimapContainer.addChild(mmWalls);

  const mmFloors = new Graphics();
  minimapContainer.addChild(mmFloors);

  // Pre-draw static geometry once
  function drawMinimapStatic() {
    mmBg.clear();
    mmBg.rect(0, 0, MINIMAP_W, MINIMAP_H);
    mmBg.fill({ color: 0x0a0a12, alpha: 0.9 });
    mmBg.stroke({ color: SP.brass, width: 1.5, alpha: 0.7 });

    mmFloors.clear();
    mmWalls.clear();

    if (currentLayer === "deck") {
      // Draw ship hull outline
      mmFloors.moveTo(hullPoints[0].x * mmScale, hullPoints[0].y * mmScale);
      for (let i = 1; i < hullPoints.length; i++) {
        mmFloors.lineTo(hullPoints[i].x * mmScale, hullPoints[i].y * mmScale);
      }
      mmFloors.closePath();
      mmFloors.fill({ color: 0x2a1a0a, alpha: 0.7 });
      mmFloors.stroke({ color: 0x4a3520, width: 1 });

      for (const f of floors) {
        mmFloors.rect(f.x * mmScale, f.y * mmScale, f.w * mmScale, f.h * mmScale);
        mmFloors.fill({ color: 0x3a2a1a, alpha: 0.5 });
      }
      for (const w of walls) {
        mmWalls.rect(w.x * mmScale, w.y * mmScale, w.w * mmScale, w.h * mmScale);
      }
      mmWalls.fill({ color: 0x5a4a3a, alpha: 0.8 });
    } else {
      // Draw cargo hold outline
      for (const f of cargoFloors) {
        mmFloors.rect(f.x * mmScale, f.y * mmScale, f.w * mmScale, f.h * mmScale);
        mmFloors.fill({ color: 0x2a2a2a, alpha: 0.5 });
      }
      for (const w of cargoWalls) {
        mmWalls.rect(w.x * mmScale, w.y * mmScale, w.w * mmScale, w.h * mmScale);
      }
      mmWalls.fill({ color: 0x5a4a3a, alpha: 0.8 });
    }

    // Draw hatch icons on minimap (small ladder/arrow markers)
    const hatchPositions = currentLayer === "deck" ? deckHatches : cargoHatches;
    for (const h of hatchPositions) {
      const hx = h.x * mmScale;
      const hy = h.y * mmScale;
      // Small diamond shape for hatch
      mmFloors.moveTo(hx, hy - 3);
      mmFloors.lineTo(hx + 2.5, hy);
      mmFloors.lineTo(hx, hy + 3);
      mmFloors.lineTo(hx - 2.5, hy);
      mmFloors.closePath();
      mmFloors.fill({ color: SP.amber, alpha: 0.9 });
      mmFloors.stroke({ color: SP.brass, width: 0.5, alpha: 0.6 });
    }
  }
  drawMinimapStatic();

  const mmDynamic = new Graphics();
  minimapContainer.addChild(mmDynamic);

  const mmViewRect = new Graphics();
  minimapContainer.addChild(mmViewRect);

  // ── Minimap Layer Card ──
  let otherLayerIssueCount = 0;
  let otherLayerPlayerCount = 0;

  function setOtherLayerIssueCount(count: number) {
    otherLayerIssueCount = count;
  }

  function setOtherLayerPlayerCount(count: number) {
    otherLayerPlayerCount = count;
  }

  const layerCardGfx = new Graphics();
  minimapContainer.addChild(layerCardGfx);

  const layerCardText = new Text({
    text: "Cargo Hold",
    style: { fill: SP.mutedText, fontSize: 9, fontFamily: UI_FONT },
  });
  layerCardText.x = 6;
  layerCardText.y = MINIMAP_H + 7;
  minimapContainer.addChild(layerCardText);

  function drawLayerCard() {
    layerCardGfx.clear();
    const cardY = MINIMAP_H + 4;

    // Flash the card background when alerting
    const flashing = Date.now() < layerCardFlashUntil;
    if (flashing) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 120);
      layerCardGfx.roundRect(0, cardY, MINIMAP_W, 18, 3);
      layerCardGfx.fill({ color: 0x661111, alpha: 0.6 + 0.3 * pulse });
      layerCardGfx.stroke({ color: 0xff4444, width: 1.5, alpha: 0.7 + 0.3 * pulse });
    } else {
      layerCardGfx.roundRect(0, cardY, MINIMAP_W, 18, 3);
      layerCardGfx.fill({ color: SP.darkBg, alpha: 0.85 });
      layerCardGfx.stroke({ color: SP.brass, width: 1, alpha: 0.4 });
    }

    const otherName = currentLayer === "deck" ? "Cargo Hold" : "Main Deck";
    layerCardText.text = otherLayerPlayerCount > 0
      ? `${otherName} (${otherLayerPlayerCount})`
      : otherName;
    layerCardText.style.fill = flashing ? 0xff6666 : SP.mutedText;

    if (otherLayerIssueCount > 0) {
      layerCardGfx.circle(MINIMAP_W - 10, cardY + 9, 4);
      layerCardGfx.fill({ color: 0xff4444 });
    }
  }

  let layerCardFlashUntil = 0;

  function flashLayerCard() {
    layerCardFlashUntil = Date.now() + 3000; // flash for 3 seconds
  }

  const LAYER_CARD_H = 22; // Height added below minimap by layer card

  // ── Audio Controls (below minimap) ──
  const AUDIO_PANEL_W = MINIMAP_W;
  const AUDIO_PANEL_H = 50;
  const AUDIO_SLIDER_W = 100;
  const AUDIO_SLIDER_H = 6;
  const AUDIO_GAP = 6; // gap between minimap and audio panel

  const audioContainer = new Container();
  uiLayer.addChild(audioContainer);

  const audioBg = new Graphics();
  drawBrassPanel(audioBg, 0, 0, AUDIO_PANEL_W, AUDIO_PANEL_H, false);
  audioContainer.addChild(audioBg);

  let audioMuted = false;
  let bgmVolume = 0.3;
  let sfxVolume = 0.4;
  let onVolumeChange: ((bgm: number, sfx: number) => void) | null = null;
  let onMuteChange: ((muted: boolean) => void) | null = null;

  // Mute button
  const muteHitArea = new Graphics();
  muteHitArea.rect(4, 4, 20, AUDIO_PANEL_H - 8);
  muteHitArea.fill({ color: 0x000000, alpha: 0.001 });
  muteHitArea.eventMode = "static";
  muteHitArea.cursor = "pointer";
  audioContainer.addChild(muteHitArea);

  const muteIcon = new Text({ text: "♫", style: { fill: SP.amber, fontSize: 14, fontFamily: UI_FONT } });
  muteIcon.x = 7;
  muteIcon.y = AUDIO_PANEL_H / 2 - 8;
  audioContainer.addChild(muteIcon);

  const muteStrike = new Graphics();
  muteStrike.visible = false;
  audioContainer.addChild(muteStrike);

  function updateMuteIcon() {
    muteIcon.style.fill = audioMuted ? 0x555555 : SP.amber;
    muteStrike.visible = audioMuted;
    if (audioMuted) {
      muteStrike.clear();
      muteStrike.moveTo(6, AUDIO_PANEL_H / 2);
      muteStrike.lineTo(20, AUDIO_PANEL_H / 2);
      muteStrike.stroke({ color: 0xff4444, width: 2 });
    }
  }

  muteHitArea.on("pointerdown", () => {
    audioMuted = !audioMuted;
    updateMuteIcon();
    onMuteChange?.(audioMuted);
  });

  // BGM slider
  const bgmLabel = new Text({ text: "BGM", style: { fill: SP.copper, fontSize: 10, fontWeight: "bold", letterSpacing: 1, fontFamily: UI_FONT } });
  bgmLabel.x = 28;
  bgmLabel.y = 5;
  audioContainer.addChild(bgmLabel);

  const bgmSliderX = 28;
  const bgmSliderY = 17;

  const bgmTrackBg = new Graphics();
  bgmTrackBg.roundRect(bgmSliderX, bgmSliderY, AUDIO_SLIDER_W, AUDIO_SLIDER_H, 2);
  bgmTrackBg.fill({ color: SP.darkBg });
  bgmTrackBg.roundRect(bgmSliderX, bgmSliderY, AUDIO_SLIDER_W, AUDIO_SLIDER_H, 2);
  bgmTrackBg.stroke({ color: SP.brass, width: 1, alpha: 0.4 });
  audioContainer.addChild(bgmTrackBg);

  const bgmTrackFill = new Graphics();
  audioContainer.addChild(bgmTrackFill);

  const bgmKnob = new Graphics();
  audioContainer.addChild(bgmKnob);

  function drawBgmSlider() {
    const fillW = bgmVolume * AUDIO_SLIDER_W;
    bgmTrackFill.clear();
    if (fillW > 0) {
      bgmTrackFill.roundRect(bgmSliderX, bgmSliderY, fillW, AUDIO_SLIDER_H, 2);
      bgmTrackFill.fill({ color: SP.brass, alpha: 0.6 });
    }
    const knobX = bgmSliderX + fillW;
    bgmKnob.clear();
    bgmKnob.circle(knobX, bgmSliderY + AUDIO_SLIDER_H / 2, 5);
    bgmKnob.fill({ color: SP.amber });
    bgmKnob.circle(knobX, bgmSliderY + AUDIO_SLIDER_H / 2, 5);
    bgmKnob.stroke({ color: SP.brass, width: 1 });
  }
  drawBgmSlider();

  // BGM slider interaction
  const bgmHitArea = new Graphics();
  bgmHitArea.rect(bgmSliderX - 4, bgmSliderY - 6, AUDIO_SLIDER_W + 8, AUDIO_SLIDER_H + 12);
  bgmHitArea.fill({ color: 0x000000, alpha: 0.001 });
  bgmHitArea.eventMode = "static";
  bgmHitArea.cursor = "pointer";
  audioContainer.addChild(bgmHitArea);

  let bgmDragging = false;

  function setBgmFromPointer(globalX: number) {
    const localX = globalX - audioContainer.x - bgmSliderX;
    bgmVolume = Math.max(0, Math.min(1, localX / AUDIO_SLIDER_W));
    drawBgmSlider();
    onVolumeChange?.(bgmVolume, sfxVolume);
  }

  bgmHitArea.on("pointerdown", (e) => { bgmDragging = true; setBgmFromPointer(e.global.x); });
  app.stage.eventMode = "static";
  app.stage.on("pointermove", (e) => { if (bgmDragging) setBgmFromPointer(e.global.x); });
  app.stage.on("pointerup", () => { bgmDragging = false; });
  app.stage.on("pointerupoutside", () => { bgmDragging = false; });

  // SFX slider
  const sfxLabel = new Text({ text: "SFX", style: { fill: SP.copper, fontSize: 10, fontWeight: "bold", letterSpacing: 1, fontFamily: UI_FONT } });
  sfxLabel.x = 28;
  sfxLabel.y = 27;
  audioContainer.addChild(sfxLabel);

  const sfxSliderX = 28;
  const sfxSliderY = 39;

  const sfxTrackBg = new Graphics();
  sfxTrackBg.roundRect(sfxSliderX, sfxSliderY, AUDIO_SLIDER_W, AUDIO_SLIDER_H, 2);
  sfxTrackBg.fill({ color: SP.darkBg });
  sfxTrackBg.roundRect(sfxSliderX, sfxSliderY, AUDIO_SLIDER_W, AUDIO_SLIDER_H, 2);
  sfxTrackBg.stroke({ color: SP.brass, width: 1, alpha: 0.4 });
  audioContainer.addChild(sfxTrackBg);

  const sfxTrackFill = new Graphics();
  audioContainer.addChild(sfxTrackFill);

  const sfxKnob = new Graphics();
  audioContainer.addChild(sfxKnob);

  function drawSfxSlider() {
    const fillW = sfxVolume * AUDIO_SLIDER_W;
    sfxTrackFill.clear();
    if (fillW > 0) {
      sfxTrackFill.roundRect(sfxSliderX, sfxSliderY, fillW, AUDIO_SLIDER_H, 2);
      sfxTrackFill.fill({ color: SP.brass, alpha: 0.6 });
    }
    const knobX = sfxSliderX + fillW;
    sfxKnob.clear();
    sfxKnob.circle(knobX, sfxSliderY + AUDIO_SLIDER_H / 2, 5);
    sfxKnob.fill({ color: SP.amber });
    sfxKnob.circle(knobX, sfxSliderY + AUDIO_SLIDER_H / 2, 5);
    sfxKnob.stroke({ color: SP.brass, width: 1 });
  }
  drawSfxSlider();

  // SFX slider interaction
  const sfxHitArea = new Graphics();
  sfxHitArea.rect(sfxSliderX - 4, sfxSliderY - 6, AUDIO_SLIDER_W + 8, AUDIO_SLIDER_H + 12);
  sfxHitArea.fill({ color: 0x000000, alpha: 0.001 });
  sfxHitArea.eventMode = "static";
  sfxHitArea.cursor = "pointer";
  audioContainer.addChild(sfxHitArea);

  let sfxDragging = false;

  function setSfxFromPointer(globalX: number) {
    const localX = globalX - audioContainer.x - sfxSliderX;
    sfxVolume = Math.max(0, Math.min(1, localX / AUDIO_SLIDER_W));
    drawSfxSlider();
    onVolumeChange?.(bgmVolume, sfxVolume);
  }

  sfxHitArea.on("pointerdown", (e) => { sfxDragging = true; setSfxFromPointer(e.global.x); });
  app.stage.on("pointermove", (e) => { if (sfxDragging) setSfxFromPointer(e.global.x); });
  app.stage.on("pointerup", () => { sfxDragging = false; });
  app.stage.on("pointerupoutside", () => { sfxDragging = false; });

  // Volume labels
  const bgmVolLabel = new Text({ text: "30%", style: { fill: SP.mutedText, fontSize: 10, fontFamily: UI_FONT_MONO } });
  bgmVolLabel.x = bgmSliderX + AUDIO_SLIDER_W + 6;
  bgmVolLabel.y = bgmSliderY - 2;
  audioContainer.addChild(bgmVolLabel);

  const sfxVolLabel = new Text({ text: "40%", style: { fill: SP.mutedText, fontSize: 10, fontFamily: UI_FONT_MONO } });
  sfxVolLabel.x = sfxSliderX + AUDIO_SLIDER_W + 6;
  sfxVolLabel.y = sfxSliderY - 2;
  audioContainer.addChild(sfxVolLabel);

  function updateVolLabels() {
    bgmVolLabel.text = `${Math.round(bgmVolume * 100)}%`;
    sfxVolLabel.text = `${Math.round(sfxVolume * 100)}%`;
  }

  function positionMinimap() {
    const screenW = app.renderer.screen.width;
    const screenH = app.renderer.screen.height;
    minimapContainer.x = screenW - MINIMAP_W - MINIMAP_PAD;
    minimapContainer.y = screenH - MINIMAP_H - MINIMAP_PAD - AUDIO_PANEL_H - AUDIO_GAP - LAYER_CARD_H;
    audioContainer.x = minimapContainer.x;
    audioContainer.y = minimapContainer.y + MINIMAP_H + LAYER_CARD_H + AUDIO_GAP;
  }
  positionMinimap();

  let mmPlayerX = 0;
  let mmPlayerY = 0;
  let mmIssues: Issue[] = [];
  let mmOtherPlayerPositions: { x: number; y: number }[] = [];
  let mmCameraX = 0;
  let mmCameraY = 0;

  function updateMinimap() {
    mmDynamic.clear();

    // Draw issues as colored dots
    for (const issue of mmIssues) {
      const color = issueColors[issue.type] ?? 0xcccccc;
      const ix = issue.x * mmScale;
      const iy = issue.y * mmScale;
      const isFixing = issue.status === "in_progress";

      // Pulsing for active issues
      if (!isFixing) {
        const now = Date.now();
        const pulse = 0.5 + 0.5 * Math.sin(now / 300);
        mmDynamic.circle(ix, iy, 3.5);
        mmDynamic.fill({ color, alpha: 0.3 * pulse });
      }

      mmDynamic.circle(ix, iy, 2);
      mmDynamic.fill({ color, alpha: isFixing ? 0.5 : 0.9 });
    }

    // Draw other players as small grey dots
    for (const op of mmOtherPlayerPositions) {
      mmDynamic.circle(op.x * mmScale, op.y * mmScale, 1.5);
      mmDynamic.fill({ color: 0x999999 });
    }

    // Draw player as bright dot
    mmDynamic.circle(mmPlayerX * mmScale, mmPlayerY * mmScale, 2.5);
    mmDynamic.fill({ color: 0x5fc96b });

    // Draw pings on minimap (only current layer)
    const now = Date.now();
    for (const ping of activePings) {
      if (ping.layer !== currentLayer) continue;
      const age = now - ping.timestamp;
      const progress = age / PING_DURATION_MS;
      const fadeAlpha = 1 - progress;
      const pulse = 0.7 + 0.3 * Math.sin(age / 150);
      const px = ping.x * mmScale;
      const py = ping.y * mmScale;

      // Pulsing ping marker
      mmDynamic.circle(px, py, 4 * pulse);
      mmDynamic.fill({ color: PING_COLOR, alpha: fadeAlpha * 0.8 });
      mmDynamic.circle(px, py, 3);
      mmDynamic.stroke({ color: PING_COLOR, width: 1, alpha: fadeAlpha });
    }

    // Draw camera viewport rectangle
    const screenW = app.renderer.screen.width;
    const screenH = app.renderer.screen.height;
    const zoom = worldLayer.scale.x || 1;
    const viewW = (screenW / zoom) * mmScale;
    const viewH = (screenH / zoom) * mmScale;
    const viewX = mmCameraX * mmScale - viewW / 2;
    const viewY = mmCameraY * mmScale - viewH / 2;

    mmViewRect.clear();
    mmViewRect.rect(
      Math.max(0, viewX),
      Math.max(0, viewY),
      Math.min(viewW, MINIMAP_W - Math.max(0, viewX)),
      Math.min(viewH, MINIMAP_H - Math.max(0, viewY))
    );
    mmViewRect.stroke({ color: 0xaeb7c2, width: 1, alpha: 0.5 });

    // Update layer card
    drawLayerCard();
  }

  function setMinimapPlayer(x: number, y: number) {
    mmPlayerX = x;
    mmPlayerY = y;
  }

  function setMinimapIssues(issues: Issue[]) {
    mmIssues = issues;
  }

  function setMinimapOtherPlayers(positions: { x: number; y: number }[]) {
    mmOtherPlayerPositions = positions;
  }

  function setMinimapCamera(cx: number, cy: number) {
    mmCameraX = cx;
    mmCameraY = cy;
  }

  // ── Event Log ──
  const LOG_MAX = 6;
  const LOG_W = 200;
  const LOG_PAD = 12;

  const logContainer = new Container();
  uiLayer.addChild(logContainer);

  const logBg = new Graphics();
  logContainer.addChild(logBg);

  const logTitle = new Text({ text: "SHIP LOG", style: { fill: SP.copper, fontSize: 11, fontWeight: "bold", letterSpacing: 2, fontFamily: UI_FONT } });
  logTitle.x = 8;
  logTitle.y = 5;
  logContainer.addChild(logTitle);

  const logEntries: { text: Text; time: number }[] = [];

  function positionLog() {
    const screenW = app.renderer.screen.width;
    const screenH = app.renderer.screen.height;
    // Calculate actual log content height
    let contentH = 20;
    for (const entry of logEntries) {
      contentH += entry.text.height + 2;
    }
    const logH = Math.max(28, contentH + 6);
    logContainer.x = screenW - LOG_W - MINIMAP_PAD;
    logContainer.y = screenH - MINIMAP_H - MINIMAP_PAD - AUDIO_PANEL_H - AUDIO_GAP - LAYER_CARD_H - 14 - logH;
  }
  positionLog();

  function redrawLogBg() {
    let contentH = 20;
    for (const entry of logEntries) {
      contentH += entry.text.height + 2;
    }
    const h = Math.max(28, contentH + 6);
    logBg.clear();
    drawBrassPanel(logBg, 0, 0, LOG_W, h, false);
  }
  redrawLogBg();

  function addLogEntry(message: string, color: number = 0xcbd3dd) {
    const now = new Date();
    const timeStr = `${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
    const entry = new Text({
      text: `[${timeStr}] ${message}`,
      style: { fill: color, fontSize: 11, fontFamily: UI_FONT_MONO, wordWrap: true, wordWrapWidth: LOG_W - 16 },
    });
    entry.x = 8;
    logContainer.addChild(entry);
    logEntries.push({ text: entry, time: Date.now() });

    // Remove oldest if over limit
    while (logEntries.length > LOG_MAX) {
      const removed = logEntries.shift()!;
      logContainer.removeChild(removed.text);
    }

    // Reposition entries using actual text heights
    let entryY = 20;
    for (let i = 0; i < logEntries.length; i++) {
      logEntries[i].text.y = entryY;
      entryY += logEntries[i].text.height + 2;
    }
    redrawLogBg();
    positionLog();
  }

  async function preloadToolTextures() {
    // Wait for tool textures to load
    await loadToolTextures();
  }
  
  async function preloadAllAssets() {
    // Preload all tool textures
    await loadToolTextures();
    
    // Preload character sprites
    await loadCharacterSprites();
    
    // Preload floor texture
    try {
      await Assets.load("/sprites/floor.png");
    } catch (err) {
      console.warn("Failed to load floor texture", err);
    }
    
    // Preload all tool icon textures
    const types: InstrumentType[] = ["thermal_regulator", "gear_wrench", "arcane_conduit"];
    for (const type of types) {
      try {
        await Assets.load(`/sprites/tools/${type}.png`);
        await Assets.load(`/sprites/tools/${type}_icon.png`);
      } catch (err) {
        console.warn(`Failed to load tool texture: ${type}`, err);
      }
    }
    
    // Preload character sprites
    try {
      await Assets.load("/sprites/character/standard/walk.png");
      await Assets.load("/sprites/character/standard/idle.png");
    } catch (err) {
      console.warn("Failed to load character sprites", err);
    }
  }

  function tickEffects(dt: number) {
    // Screen shake decay
    if (shakeIntensity > 0.1) {
      shakeIntensity *= Math.pow(0.02, dt); // fast decay
      if (shakeIntensity < 0.1) shakeIntensity = 0;
    }

    // Stability bar flash decay
    if (stabilityFlashAlpha > 0.01) {
      stabilityFlashAlpha *= Math.pow(0.005, dt);
      if (stabilityFlashAlpha < 0.01) stabilityFlashAlpha = 0;
      stabilityFlash.alpha = stabilityFlashAlpha;
    }

    // Inventory slot flash decay
    for (const slot of inventorySlots) {
      if (slot.flashAlpha > 0.01) {
        slot.flashAlpha *= Math.pow(0.01, dt);
        if (slot.flashAlpha < 0.01) slot.flashAlpha = 0;
        slot.flash.alpha = slot.flashAlpha;
      }
    }

    // Dust particles
    tickDust(dt);

    // Spawn dust while walking
    if (isWalking) {
      const now = performance.now();
      if (now - lastDustAt > DUST_INTERVAL_MS) {
        lastDustAt = now;
        spawnDust(playerContainer.x, playerContainer.y);
      }
    }
  }

  function onResize() {
    positionMinimap();
    positionLog();
    positionInventory();
    interactionText.y = app.renderer.screen.height - 36;
  }

  return {
    container,
    update,
    updateMeta,
    setPlayer,
    setPlayerColor,
    setPlayerName,
    setOtherPlayers,
    tickOtherPlayers,
    getWalls,
    getDoors,
    setDoorsState,
    getSpawnPoint,
    setCamera,
    setZoom,
    setChannelProgress,
    setIssues,
    setGroundInstruments,
    showContextMenu,
    hideContextMenu,
    showResultsScreen,
    hideResultsScreen,
    setInteractionText,
    worldWidth,
    worldHeight,
    // Minimap
    updateMinimap,
    setMinimapPlayer,
    setMinimapIssues,
    setMinimapOtherPlayers,
    setMinimapCamera,
    // Event log
    addLogEntry,
    // Pings
    addPing,
    updatePings,
    // Hull collision
    isInsideHull,
    // Layer system
    getHatches: () => currentLayer === "deck" ? deckHatches : cargoHatches,
    getCurrentLayer: () => currentLayer,
    startLayerTransition,
    tickFade,
    setOtherLayerIssueCount,
    setOtherLayerPlayerCount,
    flashLayerCard,
    drawMinimapStatic,
    // Animated background
    updateClouds,
    // Issue particles
    updateIssueParticles,
    // Visual effects (shake, flash, dust)
    tickEffects,
    // Player animation
    setPlayerDirection,
    setPlayerWalking,
    // Resize handler
    onResize,
    // Preload resources
    preloadToolTextures,
    loadCharacterSprites,
    // Loading screen
    showLoadingScreen,
    updateLoadingProgress,
    hideLoadingScreen,
    // Asset preloading
    preloadAllAssets,
    // Audio controls
    setAudioCallbacks(
      volumeCb: (bgm: number, sfx: number) => void,
      muteCb: (muted: boolean) => void,
    ) {
      onVolumeChange = (bgm, sfx) => { updateVolLabels(); volumeCb(bgm, sfx); };
      onMuteChange = muteCb;
    },
    toggleAudioMute() {
      audioMuted = !audioMuted;
      updateMuteIcon();
      onMuteChange?.(audioMuted);
    },
  };
}

function formatTime(totalSec: number) {
  const minutes = Math.floor(totalSec / 60);
  const seconds = Math.round(totalSec) % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
