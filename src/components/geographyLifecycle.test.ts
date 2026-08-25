import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8')

describe('geographic renderer lifecycle regression guards', () => {
  it('keeps continuous GlobeGL zoom events outside React state', () => {
    const globe = source('./GlobeView.tsx')
    expect(globe).not.toMatch(/onZoom\s*=/)
    expect(globe).toContain("controls.addEventListener('end', commitView)")
    expect(globe).toContain('new ResizeObserver(resize)')
  })

  it('updates MapLibre sources without coupling instance creation to Signal data', () => {
    const map = source('./ConnectedMapView.tsx')
    expect(map.match(/new MapLibreMap\(/g)).toHaveLength(1)
    expect(map).toContain("getSource('nexus-signals') as GeoJSONSource).setData(collection)")
    expect(map).toContain('new ResizeObserver(resize)')
    expect(map).toContain('try { map.remove() } catch')
    expect(map).toContain('source.setTiles(tiles)')
    expect(map).not.toContain("removeWeatherSource(map, 'nexus-radar')\n    removeWeatherSource(map, 'nexus-satellite')")
  })

  it('passes camera state into the single Earth renderer', () => {
    const app = source('../App.tsx')
    expect(app.match(/initialView=\{geographicView\}/g)).toHaveLength(1)
    expect(app).toContain('onViewChange={handleMapViewChange}')
    expect(app).not.toContain('GlobeView')
  })

  it('uses a single automatic Earth surface instead of competing mode controls', () => {
    const app = source('../App.tsx')
    const map = source('./MapView.tsx')
    expect(app).not.toContain('view-toggle')
    expect(app).not.toContain('globe-quick-lenses')
    expect(map).not.toContain('map-mode-switch')
    expect(app).not.toContain('visualMode')
    expect(source('./ConnectedMapView.tsx')).toContain("map.setProjection({ type: 'globe' })")
    expect(source('./ConnectedMapView.tsx')).not.toContain('shouldReturnToGlobe')
  })

  it('keeps Earth zoom isolated from the preserved Space prototype', () => {
    const app = source('../App.tsx')
    const globe = source('./GlobeView.tsx')
    expect(app).not.toContain('SolarSystemView')
    expect(app).not.toContain('enterSolarSystem')
    expect(globe).not.toContain('onRequestSolar')
    expect(globe).not.toContain('solarArm')
  })
})
