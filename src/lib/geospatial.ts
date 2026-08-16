import type { Feature, FeatureCollection, Geometry, MultiPolygon, Point, Polygon } from 'geojson'
import type { Signal } from '../types/signal'

export const MAX_MERCATOR_LATITUDE = 85.051129

export function normalizeLongitude(longitude: number): number {
  if (!Number.isFinite(longitude)) throw new Error('Longitude must be finite')
  const normalized = ((longitude + 180) % 360 + 360) % 360 - 180
  return normalized === -180 && longitude > 0 ? 180 : normalized
}

export function clampMercatorLatitude(latitude: number): number {
  if (!Number.isFinite(latitude)) throw new Error('Latitude must be finite')
  return Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude))
}

function validPosition(value: unknown): value is [number, number, ...number[]] {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === 'number'
    && typeof value[1] === 'number'
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
    && value[0] >= -180
    && value[0] <= 180
    && value[1] >= -90
    && value[1] <= 90
}

function validRing(value: unknown): value is Array<[number, number, ...number[]]> {
  if (!Array.isArray(value) || value.length < 4 || !value.every(validPosition)) return false
  const first = value[0]!
  const last = value[value.length - 1]!
  return first[0] === last[0] && first[1] === last[1]
}

export function sanitizeAreaGeometry(geometry?: Geometry): Polygon | MultiPolygon | undefined {
  if (!geometry) return undefined
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates) && geometry.coordinates.every(validRing)) return geometry
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates) && geometry.coordinates.every((polygon) => Array.isArray(polygon) && polygon.every(validRing))) return geometry
  return undefined
}

function signalProperties(signal: Signal) {
  return {
    id: signal.id,
    type: signal.type,
    title: signal.title,
    severity: signal.severity ?? 10,
    confidence: signal.confidence ?? .5,
    freshness: signal.source.freshness,
    provider: signal.source.provider,
    timestamp: signal.timestamp,
  }
}

export function signalPointsGeoJSON(signals: Signal[]): FeatureCollection<Point, ReturnType<typeof signalProperties>> {
  const features = signals.flatMap((signal): Array<Feature<Point, ReturnType<typeof signalProperties>>> => {
    if (!signal.location) return []
    const { latitude, longitude } = signal.location
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return []
    return [{
      type: 'Feature',
      id: signal.id,
      properties: signalProperties(signal),
      geometry: { type: 'Point', coordinates: [longitude, clampMercatorLatitude(latitude)] },
    }]
  })
  return { type: 'FeatureCollection', features }
}

export function signalAreasGeoJSON(signals: Signal[]): FeatureCollection<Polygon | MultiPolygon, ReturnType<typeof signalProperties>> {
  const features = signals.flatMap((signal): Array<Feature<Polygon | MultiPolygon, ReturnType<typeof signalProperties>>> => {
    const geometry = sanitizeAreaGeometry(signal.geometry)
    return geometry ? [{ type: 'Feature', id: signal.id, properties: signalProperties(signal), geometry }] : []
  })
  return { type: 'FeatureCollection', features }
}

export function antimeridianBounds(points: Array<{ latitude: number; longitude: number }>): [[number, number], [number, number]] | undefined {
  const valid = points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180)
  if (!valid.length) return undefined
  const longitudes = valid.map((point) => (normalizeLongitude(point.longitude) + 360) % 360).sort((a, b) => a - b)
  let largestGap = -1
  let gapIndex = 0
  for (let index = 0; index < longitudes.length; index += 1) {
    const next = index === longitudes.length - 1 ? longitudes[0]! + 360 : longitudes[index + 1]!
    const gap = next - longitudes[index]!
    if (gap > largestGap) { largestGap = gap; gapIndex = index }
  }
  const west360 = longitudes[(gapIndex + 1) % longitudes.length]!
  let east360 = longitudes[gapIndex]!
  if (east360 < west360) east360 += 360
  const west = west360 > 180 ? west360 - 360 : west360
  const east = west + (east360 - west360)
  return [
    [west, Math.max(-MAX_MERCATOR_LATITUDE, Math.min(...valid.map((point) => point.latitude)))],
    [east, Math.min(MAX_MERCATOR_LATITUDE, Math.max(...valid.map((point) => point.latitude)))],
  ]
}

export function geometryBounds(geometry?: Geometry): [[number, number], [number, number]] | undefined {
  const area = sanitizeAreaGeometry(geometry)
  if (!area) return undefined
  const points: Array<{ latitude: number; longitude: number }> = []
  const collect = (value: unknown): void => {
    if (validPosition(value)) { points.push({ longitude: value[0], latitude: value[1] }); return }
    if (Array.isArray(value)) for (const child of value) collect(child)
  }
  collect(area.coordinates)
  return antimeridianBounds(points)
}
