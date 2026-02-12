export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FloorRect extends Rect {
  color: number;
}

export interface DoorRect extends Rect {
  id: string;
  open: boolean;
}

export interface LayoutParams {
  shipCenterX: number;
  shipCenterY: number;
  shipWidthMax: number;
  shipLength: number;
  wallThickness: number;
}

export interface DeckRooms {
  bridge: Rect;
  hub: Rect;
  portCabin: Rect;
  starboardCabin: Rect;
  engine: Rect;
}

export interface CargoRooms {
  foreStorage: Rect;
  corridor: Rect;
  aftStorage: Rect;
}

export interface DeckLayout {
  floors: FloorRect[];
  walls: Rect[];
  doors: DoorRect[];
  rooms: DeckRooms;
  spawnPoint: { x: number; y: number };
}

export interface CargoLayout {
  floors: FloorRect[];
  walls: Rect[];
  doors: DoorRect[];
  rooms: CargoRooms;
  spawnPoint: { x: number; y: number };
  hullPoints: { x: number; y: number }[];
  collisionHullPoints: { x: number; y: number }[];
  cargoX: number;
  cargoTopY: number;
  cargoW: number;
  cargoTotalH: number;
}

export interface AirshipLayout {
  deck: DeckLayout;
  cargo: CargoLayout;
}

export function buildAirshipLayout(params: LayoutParams): AirshipLayout {
  const { shipCenterX, shipCenterY, shipWidthMax, shipLength, wallThickness } = params;

  const floors: FloorRect[] = [];
  const walls: Rect[] = [];
  const doors: DoorRect[] = [];

  const addHorizontalCorridor = (left: number, right: number, y: number, width: number) => {
    const half = width / 2;
    floors.push({ x: left, y: y - half, w: right - left, h: width, color: 0x101820 });
  };

  const addVerticalCorridor = (x: number, top: number, bottom: number, width: number) => {
    const half = width / 2;
    floors.push({ x: x - half, y: top, w: width, h: bottom - top, color: 0x101820 });
  };

  // ── Deck Rooms ──
  const shipCenterYTop = shipCenterY - shipLength / 2;
  const shipCenterYBottom = shipCenterY + shipLength / 2;

  const bridgeW = 340;
  const bridgeH = 240;
  const bridgeX = shipCenterX - bridgeW / 2;
  const bridgeY = shipCenterYTop + 160;
  floors.push({ x: bridgeX, y: bridgeY, w: bridgeW, h: bridgeH, color: 0x121a22 });
  walls.push({ x: bridgeX, y: bridgeY, w: wallThickness, h: bridgeH });
  walls.push({ x: bridgeX + bridgeW - wallThickness, y: bridgeY, w: wallThickness, h: bridgeH });
  walls.push({ x: bridgeX, y: bridgeY, w: bridgeW, h: wallThickness });

  const bridgeDoorW = 70;
  const bridgeDoorX = shipCenterX - bridgeDoorW / 2;
  const bridgeDoorY = bridgeY + bridgeH - wallThickness;
  walls.push({ x: bridgeX, y: bridgeDoorY, w: bridgeDoorX - bridgeX, h: wallThickness });
  walls.push({ x: bridgeDoorX + bridgeDoorW, y: bridgeDoorY, w: bridgeX + bridgeW - (bridgeDoorX + bridgeDoorW), h: wallThickness });
  doors.push({ id: "door-bridge", x: bridgeDoorX, y: bridgeDoorY, w: bridgeDoorW, h: wallThickness, open: false });

  const hubW = 420;
  const hubH = 340;
  const hubX = shipCenterX - hubW / 2;
  const hubY = shipCenterY - hubH / 2;
  floors.push({ x: hubX, y: hubY, w: hubW, h: hubH, color: 0x111922 });

  const corridorWidth = 90;
  addVerticalCorridor(shipCenterX, bridgeY + bridgeH, hubY, corridorWidth);

  const cabinW = 300;
  const cabinH = 260;
  const portCabinX = shipCenterX - shipWidthMax / 2 + 80;
  const portCabinY = shipCenterY - cabinH / 2;
  floors.push({ x: portCabinX, y: portCabinY, w: cabinW, h: cabinH, color: 0x121a22 });
  walls.push({ x: portCabinX, y: portCabinY, w: cabinW, h: wallThickness });
  walls.push({ x: portCabinX, y: portCabinY + cabinH - wallThickness, w: cabinW, h: wallThickness });
  walls.push({ x: portCabinX, y: portCabinY, w: wallThickness, h: cabinH });

  const portDoorH = 64;
  const portDoorY = portCabinY + cabinH / 2 - portDoorH / 2;
  const portDoorX = portCabinX + cabinW - wallThickness;
  walls.push({ x: portDoorX, y: portCabinY, w: wallThickness, h: portDoorY - portCabinY });
  walls.push({ x: portDoorX, y: portDoorY + portDoorH, w: wallThickness, h: portCabinY + cabinH - (portDoorY + portDoorH) });
  doors.push({ id: "door-port", x: portDoorX, y: portDoorY, w: wallThickness, h: portDoorH, open: false });
  addHorizontalCorridor(portCabinX + cabinW, hubX, shipCenterY, corridorWidth);

  const starboardCabinX = shipCenterX + shipWidthMax / 2 - 80 - cabinW;
  const starboardCabinY = shipCenterY - cabinH / 2;
  floors.push({ x: starboardCabinX, y: starboardCabinY, w: cabinW, h: cabinH, color: 0x121a22 });
  walls.push({ x: starboardCabinX, y: starboardCabinY, w: cabinW, h: wallThickness });
  walls.push({ x: starboardCabinX, y: starboardCabinY + cabinH - wallThickness, w: cabinW, h: wallThickness });
  walls.push({ x: starboardCabinX + cabinW - wallThickness, y: starboardCabinY, w: wallThickness, h: cabinH });

  const starboardDoorY = starboardCabinY + cabinH / 2 - portDoorH / 2;
  walls.push({ x: starboardCabinX, y: starboardCabinY, w: wallThickness, h: starboardDoorY - starboardCabinY });
  walls.push({ x: starboardCabinX, y: starboardDoorY + portDoorH, w: wallThickness, h: starboardCabinY + cabinH - (starboardDoorY + portDoorH) });
  doors.push({ id: "door-starboard", x: starboardCabinX, y: starboardDoorY, w: wallThickness, h: portDoorH, open: false });
  addHorizontalCorridor(hubX + hubW, starboardCabinX, shipCenterY, corridorWidth);

  const engineW = 400;
  const engineH = 240;
  const engineX = shipCenterX - engineW / 2;
  const engineY = shipCenterYBottom - 100 - engineH;
  floors.push({ x: engineX, y: engineY, w: engineW, h: engineH, color: 0x121a22 });
  walls.push({ x: engineX, y: engineY + engineH - wallThickness, w: engineW, h: wallThickness });
  walls.push({ x: engineX, y: engineY, w: wallThickness, h: engineH });
  walls.push({ x: engineX + engineW - wallThickness, y: engineY, w: wallThickness, h: engineH });

  const engineDoorW = 70;
  const engineDoorX = shipCenterX - engineDoorW / 2;
  walls.push({ x: engineX, y: engineY, w: engineDoorX - engineX, h: wallThickness });
  walls.push({ x: engineDoorX + engineDoorW, y: engineY, w: engineX + engineW - (engineDoorX + engineDoorW), h: wallThickness });
  doors.push({ id: "door-engine", x: engineDoorX, y: engineY, w: engineDoorW, h: wallThickness, open: true });
  addVerticalCorridor(shipCenterX, hubY + hubH, engineY, corridorWidth);

  const deckPadding = 50;
  floors.push({
    x: shipCenterX - 240,
    y: bridgeY + bridgeH + deckPadding,
    w: 480,
    h: hubY - (bridgeY + bridgeH) - deckPadding * 2,
    color: 0x0f1720,
  });
  floors.push({
    x: shipCenterX - 240,
    y: hubY + hubH + deckPadding,
    w: 480,
    h: engineY - (hubY + hubH) - deckPadding * 2,
    color: 0x0f1720,
  });

  const spawnPoint = { x: engineX + engineW / 2, y: engineY + engineH / 2 };

  // ── Cargo Layout ──
  const cargoFloors: FloorRect[] = [];
  const cargoWalls: Rect[] = [];
  const cargoDoors: DoorRect[] = [];

  const cargoW = 600;
  const cargoTotalH = 1000;
  const cargoX = shipCenterX - cargoW / 2;
  const cargoTopY = shipCenterY - cargoTotalH / 2;

  const foreStorageH = 350;
  cargoFloors.push({ x: cargoX, y: cargoTopY, w: cargoW, h: foreStorageH, color: 0x0e1418 });
  cargoWalls.push({ x: cargoX, y: cargoTopY, w: cargoW, h: wallThickness });
  cargoWalls.push({ x: cargoX, y: cargoTopY, w: wallThickness, h: foreStorageH });
  cargoWalls.push({ x: cargoX + cargoW - wallThickness, y: cargoTopY, w: wallThickness, h: foreStorageH });
  const cargoDoorW = 70;
  const foreDoorX = shipCenterX - cargoDoorW / 2;
  const foreDoorY = cargoTopY + foreStorageH - wallThickness;
  cargoWalls.push({ x: cargoX, y: foreDoorY, w: foreDoorX - cargoX, h: wallThickness });
  cargoWalls.push({ x: foreDoorX + cargoDoorW, y: foreDoorY, w: cargoX + cargoW - (foreDoorX + cargoDoorW), h: wallThickness });
  cargoDoors.push({ id: "door-fore-storage", x: foreDoorX, y: foreDoorY, w: cargoDoorW, h: wallThickness, open: false });

  const corridorH = 300;
  const corridorY = cargoTopY + foreStorageH;
  cargoFloors.push({ x: cargoX, y: corridorY, w: cargoW, h: corridorH, color: 0x0c1216 });
  cargoWalls.push({ x: cargoX, y: corridorY, w: wallThickness, h: corridorH });
  cargoWalls.push({ x: cargoX + cargoW - wallThickness, y: corridorY, w: wallThickness, h: corridorH });
  const aftDoorX = shipCenterX - cargoDoorW / 2;
  const aftDoorY = corridorY + corridorH - wallThickness;
  cargoWalls.push({ x: cargoX, y: aftDoorY, w: aftDoorX - cargoX, h: wallThickness });
  cargoWalls.push({ x: aftDoorX + cargoDoorW, y: aftDoorY, w: cargoX + cargoW - (aftDoorX + cargoDoorW), h: wallThickness });
  cargoDoors.push({ id: "door-aft-storage", x: aftDoorX, y: aftDoorY, w: cargoDoorW, h: wallThickness, open: false });

  const aftStorageH = 350;
  const aftStorageY = corridorY + corridorH;
  cargoFloors.push({ x: cargoX, y: aftStorageY, w: cargoW, h: aftStorageH, color: 0x0e1418 });
  cargoWalls.push({ x: cargoX, y: aftStorageY + aftStorageH - wallThickness, w: cargoW, h: wallThickness });
  cargoWalls.push({ x: cargoX, y: aftStorageY, w: wallThickness, h: aftStorageH });
  cargoWalls.push({ x: cargoX + cargoW - wallThickness, y: aftStorageY, w: wallThickness, h: aftStorageH });

  const cargoSpawnPoint = { x: shipCenterX, y: cargoTopY + foreStorageH / 2 };

  const cargoHullPoints: { x: number; y: number }[] = [
    { x: shipCenterX, y: cargoTopY - 30 },
    { x: cargoX - 20, y: cargoTopY + 80 },
    { x: cargoX - 40, y: shipCenterY - 100 },
    { x: cargoX - 40, y: shipCenterY + 100 },
    { x: cargoX - 20, y: aftStorageY + aftStorageH - 80 },
    { x: shipCenterX - 100, y: aftStorageY + aftStorageH + 30 },
    { x: shipCenterX + 100, y: aftStorageY + aftStorageH + 30 },
    { x: cargoX + cargoW + 20, y: aftStorageY + aftStorageH - 80 },
    { x: cargoX + cargoW + 40, y: shipCenterY + 100 },
    { x: cargoX + cargoW + 40, y: shipCenterY - 100 },
    { x: cargoX + cargoW + 20, y: cargoTopY + 80 },
  ];

  const cargoHullCollisionInset = 20;
  const cargoCenterX = shipCenterX;
  const cargoCenterY = shipCenterY;
  const cargoHullCollisionPoints = cargoHullPoints.map((p) => {
    const dx = p.x - cargoCenterX;
    const dy = p.y - cargoCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return { x: p.x, y: p.y + cargoHullCollisionInset };
    const insetX = (dx / dist) * cargoHullCollisionInset;
    const insetY = (dy / dist) * cargoHullCollisionInset;
    return { x: p.x - insetX, y: p.y - insetY };
  });

  return {
    deck: {
      floors,
      walls,
      doors,
      rooms: {
        bridge: { x: bridgeX, y: bridgeY, w: bridgeW, h: bridgeH },
        hub: { x: hubX, y: hubY, w: hubW, h: hubH },
        portCabin: { x: portCabinX, y: portCabinY, w: cabinW, h: cabinH },
        starboardCabin: { x: starboardCabinX, y: starboardCabinY, w: cabinW, h: cabinH },
        engine: { x: engineX, y: engineY, w: engineW, h: engineH },
      },
      spawnPoint,
    },
    cargo: {
      floors: cargoFloors,
      walls: cargoWalls,
      doors: cargoDoors,
      rooms: {
        foreStorage: { x: cargoX, y: cargoTopY, w: cargoW, h: foreStorageH },
        corridor: { x: cargoX, y: corridorY, w: cargoW, h: corridorH },
        aftStorage: { x: cargoX, y: aftStorageY, w: cargoW, h: aftStorageH },
      },
      spawnPoint: cargoSpawnPoint,
      hullPoints: cargoHullPoints,
      collisionHullPoints: cargoHullCollisionPoints,
      cargoX,
      cargoTopY,
      cargoW,
      cargoTotalH,
    },
  };
}
