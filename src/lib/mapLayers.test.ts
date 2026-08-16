import { describe, expect, it } from 'vitest'
import { nasaTrueColorTiles, noaaRadarTiles, previousUtcDate, radarFrames } from './mapLayers'

describe('environmental layer endpoints', () => {
  it('uses the previous completed UTC day for global imagery', () => {
    const instant = Date.parse('2026-08-16T00:20:00Z')
    expect(previousUtcDate(instant)).toBe('2026-08-15')
    expect(nasaTrueColorTiles(instant)).toContain('/2026-08-15/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg')
  })

  it('uses an HTTPS projected NOAA tile request', () => {
    const frames = radarFrames(Date.parse('2026-08-16T05:17:00Z'), 3)
    expect(frames).toEqual([Date.parse('2026-08-16T04:40:00Z'), Date.parse('2026-08-16T04:50:00Z'), Date.parse('2026-08-16T05:00:00Z')])
    expect(noaaRadarTiles(frames[2]).startsWith('https://')).toBe(true)
    expect(noaaRadarTiles(frames[2])).toContain('{bbox-epsg-3857}')
    expect(noaaRadarTiles(frames[2])).toContain(`time=${frames[2]}`)
  })
})
