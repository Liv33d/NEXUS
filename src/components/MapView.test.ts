import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDemoSignals } from '../data/demo'
import { atlasGeometryPath, atlasProject, prioritizeAtlasSignals } from '../lib/atlas'

describe('onboard SVG atlas', () => {
  it('projects canonical world coordinates deterministically', () => {
    expect(atlasProject(-180, 90)).toEqual([0, 0])
    expect(atlasProject(0, 0)).toEqual([500, 280])
    expect(atlasProject(180, -90)).toEqual([1000, 560])
  })

  it('turns bounded GeoJSON into an SVG path', () => {
    const path = atlasGeometryPath({ type: 'Polygon', coordinates: [[[-10, 10], [10, 10], [10, -10], [-10, 10]]] })
    expect(path).toMatch(/^M/)
    expect(path).toContain(' Z')
  })

  it('prioritizes severe signals and increases detail with zoom', () => {
    const signals = createDemoSignals(1_800_000_000_000)
    const overview = prioritizeAtlasSignals(signals, 1)
    const detailed = prioritizeAtlasSignals(signals, 3)
    expect(detailed.length).toBeGreaterThanOrEqual(overview.length)
    expect(overview.every((signal) => signal.location)).toBe(true)
  })

  it('keeps LIFE density and migration corridors visible in both map renderers', () => {
    const atlas = readFileSync(resolve(process.cwd(), 'src/components/MapView.tsx'), 'utf8')
    const detail = readFileSync(resolve(process.cwd(), 'src/components/ConnectedMapView.tsx'), 'utf8')
    expect(atlas).toContain('atlas-life-density')
    expect(atlas).toContain('atlas-migration')
    expect(detail).toContain("map.addSource('nexus-life-density'")
    expect(detail).toContain("map.addSource('nexus-migration'")
    expect(detail).toContain("getSource('nexus-life-density')")
    expect(detail).toContain("getSource('nexus-migration')")
  })
})
