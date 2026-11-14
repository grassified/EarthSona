export type Bounds = { west: number; east: number; south: number; north: number };
export type GlobeView = { longitude: number; latitude: number };
export const radians = Math.PI / 180;
export const globalBounds: Bounds = { west: -180, east: 180, south: -90, north: 90 };

export function surface(x: number, y: number, view: GlobeView) {
  const depth = 1 - x * x - y * y;
  if (depth < 0) return null;
  const z = Math.sqrt(depth);
  const sin = Math.sin(view.latitude);
  const cos = Math.cos(view.latitude);
  const longitude = view.longitude + Math.atan2(x, z * cos - y * sin);
  return {
    longitude: ((longitude / radians + 540) % 360) - 180,
    latitude: Math.asin(Math.max(-1, Math.min(1, y * cos + z * sin))) / radians,
    light: .7 + z * .3,
  };
}

export function mapPoint(location: { longitude: number; latitude: number }, bounds: Bounds) {
  const x = (location.longitude - bounds.west) / (bounds.east - bounds.west);
  const y = (bounds.north - location.latitude) / (bounds.north - bounds.south);
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}
