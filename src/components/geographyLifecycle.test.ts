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
  })

  it('passes the same camera state into globe and map', () => {
    const app = source('../App.tsx')
    expect(app.match(/initialView=\{geographicView\}/g)).toHaveLength(2)
    expect(app.match(/onViewChange=\{setGeographicView\}/g)).toHaveLength(2)
  })
})
