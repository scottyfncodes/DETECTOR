/**
 * Bearings. The surveyor's compass turns a number written in the journal
 * ("bearing 312") into a direction the player can actually face and walk.
 *
 * Convention, shared with systems/explore.ts: yaw 0 faces -Z in world space,
 * which is "up" the plot in field centimetres (decreasing y). That is north.
 * Yaw increases clockwise seen from above, so yaw in degrees IS the compass
 * bearing. Field space (cm, origin at a corner) and world space (metres,
 * origin at the plot centre) share orientation, so a bearing is the same
 * number in both.
 */

export const DEG = 180 / Math.PI;

/** Compass bearing in degrees, 0..360, for a yaw in radians. */
export function bearingFromYaw(yaw: number): number {
  const deg = ((yaw * DEG) % 360 + 360) % 360;
  return deg;
}

export function yawFromBearing(bearingDeg: number): number {
  return (bearingDeg / DEG);
}

/** Bearing from (x1, y1) toward (x2, y2), both in field centimetres. */
export function bearingBetween(x1: number, y1: number, x2: number, y2: number): number {
  return bearingFromYaw(Math.atan2(x2 - x1, -(y2 - y1)));
}

/** The point `metres` away from (x, y) cm along a compass bearing, in cm. */
export function pointAtBearing(x: number, y: number, bearingDeg: number, metres: number): { x: number; y: number } {
  const yaw = yawFromBearing(bearingDeg);
  return { x: x + Math.sin(yaw) * metres * 100, y: y - Math.cos(yaw) * metres * 100 };
}

/** Signed shortest difference a → b in degrees, -180..180. */
export function bearingDelta(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** "NW" for 312, "N" for 2 — the label on a heading strip. */
export function compassPoint(bearingDeg: number): string {
  const idx = Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8;
  return POINTS[idx]!;
}
