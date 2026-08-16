import type { MultiPolygon, Polygon } from 'geojson'
import type { Signal } from '../types/signal'

export const ATLAS_WIDTH = 1000
export const ATLAS_HEIGHT = 560

export function atlasProject(longitude: number, latitude: number): [number, number] {
  return [((longitude + 180) / 360) * ATLAS_WIDTH, ((90 - latitude) / 180) * ATLAS_HEIGHT]
}

export function atlasGeometryPath(geometry: Polygon | MultiPolygon): string {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.map((polygon) => polygon.map((ring) => ring.map((position, index) => {
    const [x, y] = atlasProject(position[0]!, position[1]!)
    return `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ') + ' Z').join(' ')).join(' ')
}

export function prioritizeAtlasSignals(signals: Signal[], scale: number): Signal[] {
  const located = signals.filter((signal) => signal.location).sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0))
  const cellSize = scale >= 3 ? 8 : scale >= 1.8 ? 14 : 24
  const cellLimit = scale >= 3 ? 4 : scale >= 1.8 ? 2 : 1
  const cells = new Map<string, number>()
  return located.filter((signal) => {
    const [x, y] = atlasProject(signal.location!.longitude, signal.location!.latitude)
    const key = `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`
    const count = cells.get(key) ?? 0
    if (count >= cellLimit) return false
    cells.set(key, count + 1)
    return true
  }).slice(0, scale >= 3 ? 500 : scale >= 1.8 ? 260 : 130)
}
