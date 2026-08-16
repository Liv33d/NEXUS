import { describe, expect, it } from 'vitest'
import { antimeridianBounds, clampMercatorLatitude, normalizeLongitude, sanitizeAreaGeometry, signalPointsGeoJSON } from './geospatial'
import type { Signal } from '../types/signal'

const place = (id: string, latitude: number, longitude: number): Signal => ({
  id, source: { provider: 'test', retrievedAt: 1, freshness: 'demo' }, type: 'environment', title: id,
  timestamp: 1, location: { latitude, longitude }, attributes: {}, provenance: [{ label: 'DEMO_DATA', description: 'fixture' }],
})

describe('geospatial rendering utilities', () => {
  it('keeps GeoJSON in longitude-latitude order for recognizable cities', () => {
    const collection = signalPointsGeoJSON([place('Tokyo', 35.6762, 139.6503), place('New York', 40.7128, -74.006), place('Sydney', -33.8688, 151.2093)])
    expect(collection.features.map((feature) => feature.geometry.coordinates)).toEqual([[139.6503, 35.6762], [-74.006, 40.7128], [151.2093, -33.8688]])
  })
  it('uses a narrow antimeridian-aware extent for Fiji neighbors', () => {
    const bounds = antimeridianBounds([{ latitude: -17.7, longitude: 179.4 }, { latitude: -18.1, longitude: -179.6 }])!
    expect(bounds[1][0] - bounds[0][0]).toBeCloseTo(1, 5)
  })
  it('normalizes wrapped longitude and clamps Web Mercator latitude', () => {
    expect(normalizeLongitude(190)).toBe(-170)
    expect(clampMercatorLatitude(89)).toBeCloseTo(85.051129)
  })
  it('rejects unclosed polygon rings before they reach a renderer', () => {
    expect(sanitizeAreaGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] })).toBeUndefined()
  })
})

