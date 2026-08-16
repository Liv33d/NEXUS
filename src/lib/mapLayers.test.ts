import { describe, expect, it } from 'vitest'
import { nasaTrueColorTiles, NOAA_RADAR_TILES, previousUtcDate } from './mapLayers'

describe('environmental layer endpoints', () => {
  it('uses the previous completed UTC day for global imagery', () => {
    const instant = Date.parse('2026-08-16T00:20:00Z')
    expect(previousUtcDate(instant)).toBe('2026-08-15')
    expect(nasaTrueColorTiles(instant)).toContain('/2026-08-15/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg')
  })

  it('uses an HTTPS projected NOAA tile request', () => {
    expect(NOAA_RADAR_TILES.startsWith('https://')).toBe(true)
    expect(NOAA_RADAR_TILES).toContain('{bbox-epsg-3857}')
  })
})
