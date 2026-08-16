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
})
