import type { LayerId } from "@aether-spire/shared";

const playerColorPalette = [
  0x6aa5ff, 0xffb24d, 0xff6b6b, 0x7ee3c2, 0xb197fc, 0x63e6be,
];

export function colorFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return playerColorPalette[Math.abs(hash) % playerColorPalette.length];
}

const SHIP_AREAS = [
  { x: 1600, y: 1200, label: "Main Deck" },
  { x: 1600, y: 400, label: "Bridge" },
  { x: 1200, y: 1200, label: "Port Cabin" },
  { x: 2000, y: 1200, label: "Starboard Cabin" },
  { x: 1600, y: 2030, label: "Engine Room" },
  { x: 1600, y: 680, label: "Fore Deck" },
  { x: 1600, y: 1680, label: "Aft Deck" },
];

const CARGO_AREAS = [
  { x: 1600, y: 875, label: "Fore Storage" },
  { x: 1600, y: 1200, label: "Cargo Corridor" },
  { x: 1600, y: 1525, label: "Aft Storage" },
];

export function getAreaName(x: number, y: number, layer: LayerId = "deck"): string {
  const areas = layer === "cargo" ? CARGO_AREAS : SHIP_AREAS;
  let best = layer === "cargo" ? "Cargo Hold" : "Main Deck";
  let bestDist = Infinity;
  for (const zone of areas) {
    const dx = x - zone.x;
    const dy = y - zone.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist && dist < 350) {
      best = zone.label;
      bestDist = dist;
    }
  }
  return best;
}

export function circleIntersectsRect(
  cx: number,
  cy: number,
  radius: number,
  rect: { x: number; y: number; w: number; h: number },
): boolean {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < radius * radius;
}

export function findNearestDoor(
  doors: { id: string; x: number; y: number; w: number; h: number; open: boolean }[],
  px: number,
  py: number,
): { id: string; dist: number; open: boolean } | null {
  let best: { id: string; dist: number; open: boolean } | null = null;
  for (const door of doors) {
    const doorCenterX = door.x + door.w / 2;
    const doorCenterY = door.y + door.h / 2;
    const d = Math.hypot(px - doorCenterX, py - doorCenterY);
    if (!best || d < best.dist) {
      best = { id: door.id, dist: d, open: door.open };
    }
  }
  return best;
}
