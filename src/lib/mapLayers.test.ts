import { describe, expect, it } from 'vitest'
import { fallbackMapStyle, nasaTrueColorTiles, noaaRadarImage, previousUtcDate, radarFrames, worldGridGeoJSON } from './mapLayers'

describe('environmental layer endpoints', () => {
  it('uses the previous completed UTC day for global imagery', () => {
    const instant = Date.parse('2026-08-16T00:20:00Z')
    expect(previousUtcDate(instant)).toBe('2026-08-15')
    expect(nasaTrueColorTiles(instant)).toContain('/2026-08-15/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg')
  })

  it('uses a bounded, georeferenced NOAA export request', () => {
    const frames = radarFrames(Date.parse('2026-08-16T05:17:00Z'), 3)
    expect(frames).toEqual([Date.parse('2026-08-16T04:40:00Z'), Date.parse('2026-08-16T04:50:00Z'), Date.parse('2026-08-16T05:00:00Z')])
    const url = new URL(noaaRadarImage(frames[2]))
    expect(url.protocol).toBe('https:')
    expect(url.pathname).toContain('/radar_base_reflectivity/MapServer/export')
    expect(url.searchParams.get('bbox')).toBe('-180,-90,180,90')
    expect(url.searchParams.get('bboxSR')).toBe('4326')
    expect(url.searchParams.get('imageSR')).toBe('4326')
    expect(url.searchParams.get('size')).toBe('2048,1024')
    expect(url.href).not.toContain('{bbox')
  })

  it('ships a georeferenced zero-network map fallback', () => {
    const style = fallbackMapStyle('/NEXUS/')
    const source = style.sources['nexus-natural-earth']
    expect(source?.type).toBe('geojson')
    expect(source && 'data' in source ? source.data : '').toBe('/NEXUS/natural-earth-110m-countries.geojson')
    expect(worldGridGeoJSON().features.length).toBeGreaterThan(10)
  })
})
