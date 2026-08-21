import { describe, expect, it } from 'vitest'
import { normalizeNhc } from './nhc'

describe('NHC cyclone provider', () => {
  it('combines official track and cone products into one traceable Signal', () => {
    const payload = {
      generatedAt: '2026-08-20T12:00:00Z',
      features: [
        { type: 'Feature', properties: { stormId: 'al012026', name: 'Hurricane Example (Advisory #4) - Forecast Track', product: 'track', sourceUrl: 'https://www.nhc.noaa.gov/example-track.kmz' }, geometry: { type: 'LineString', coordinates: [[-60, 20], [-62, 22]] } },
        { type: 'Feature', properties: { stormId: 'al012026', name: 'Hurricane Example (Advisory #4) - Forecast Track Uncertainty', product: 'cone', sourceUrl: 'https://www.nhc.noaa.gov/example-cone.kmz' }, geometry: { type: 'Polygon', coordinates: [[[-61, 19], [-59, 19], [-61, 23], [-61, 19]]] } },
      ],
    }
    const [signal] = normalizeNhc(payload, Date.UTC(2026, 7, 20, 13))
    expect(signal?.id).toBe('nhc-al012026')
    expect(signal?.title).toBe('Hurricane Example')
    expect(signal?.geometry?.type).toBe('Polygon')
    expect(signal?.attributes.forecastTrack).toEqual([[-60, 20], [-62, 22]])
    expect(signal?.provenance[0]?.label).toBe('OFFICIAL_SOURCE')
  })
})
