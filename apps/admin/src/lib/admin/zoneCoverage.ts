import { validPoint, type MapPoint } from "../maps/google"

// Geodesic circle, encoded as GeoJSON for the existing audited zone API.
export function circleBoundary(point: MapPoint, radiusM: number) {
  if (!validPoint(point) || Math.abs(point.lat) > 85 || !Number.isFinite(radiusM) || radiusM < 1000 || radiusM > 50000) throw new Error("Choose an area and a coverage radius between 1 and 50 km.")
  const rad = Math.PI / 180, lat = point.lat * rad, lng = point.lng * rad, distance = radiusM / 6371008.8
  const ring: number[][] = []
  for (let i = 0; i < 96; i++) {
    const bearing = i * 2 * Math.PI / 96
    const y = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing))
    const x = lng + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(lat), Math.cos(distance) - Math.sin(lat) * Math.sin(y))
    ring.push([((x / rad + 540) % 360) - 180, y / rad])
  }
  // Do not produce a misleading polygon that wraps across the world.
  if (ring.some((p, i) => i > 0 && Math.abs(p[0] - ring[i - 1][0]) > 180)) throw new Error("This coverage crosses the date line. Use an advanced boundary instead.")
  ring.push([...ring[0]])
  return { type: "Polygon", coordinates: [ring] }
}

export function zoneSlug(name: string) {
  return name.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}
