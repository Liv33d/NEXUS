import { describe, expect, it } from 'vitest'
import { altitudeToMapZoom, clampGeographicView, geographicViewsDiffer, mapZoomToAltitude } from './geography'

describe('shared geographic camera', () => {
  it('round-trips between globe altitude and map zoom', () => {
    for (const altitude of [0.12, 0.3, 0.72, 1.4, 2.05]) {
      expect(mapZoomToAltitude(altitudeToMapZoom(altitude))).toBeCloseTo(altitude, 5)
    }
  })

  it('rejects invalid or dangerous camera values', () => {
    expect(clampGeographicView({ latitude: Number.NaN, longitude: 400, altitude: 0 })).toEqual({ latitude: 18, longitude: 180, altitude: 0.08 })
  })

  it('ignores tiny renderer jitter but retains meaningful movement', () => {
    const origin = { latitude: 18, longitude: -45, altitude: 2 }
    expect(geographicViewsDiffer(origin, { latitude: 18.1, longitude: -45.1, altitude: 2.01 })).toBe(false)
    expect(geographicViewsDiffer(origin, { latitude: 19, longitude: -45, altitude: 2 })).toBe(true)
  })
})
