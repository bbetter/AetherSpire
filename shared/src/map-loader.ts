/**
 * Map Layout Loader
 * Loads custom maps exported from the map editor
 */

import { MapLayout } from './index.js';

/**
 * Load a map layout from a file
 */
export async function loadMapLayout(mapName: string): Promise<MapLayout | null> {
  try {
    const response = await fetch(`/maps/${mapName}.map.json`);
    if (!response.ok) {
      console.warn(`Map not found: ${mapName}`);
      return null;
    }
    const layout = await response.json();
    return validateMapLayout(layout);
  } catch (error) {
    console.error(`Failed to load map: ${mapName}`, error);
    return null;
  }
}

/**
 * Validate map layout structure
 */
export function validateMapLayout(layout: any): MapLayout {
  return {
    name: layout.name || 'Unknown Map',
    width: layout.width || 3200,
    height: layout.height || 2400,
    walls: Array.isArray(layout.walls) ? layout.walls : [],
    floors: Array.isArray(layout.floors) ? layout.floors : [],
    stations: Array.isArray(layout.stations) ? layout.stations : [],
    createdAt: layout.createdAt || new Date().toISOString(),
    updatedAt: layout.updatedAt || new Date().toISOString()
  };
}

/**
 * Get list of available maps
 */
export async function listMaps(): Promise<string[]> {
  try {
    const response = await fetch('/maps/');
    if (!response.ok) return [];
    
    // This requires server-side support for directory listing
    // For now, return empty array
    return [];
  } catch {
    return [];
  }
}
