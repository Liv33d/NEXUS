import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/components/ConnectedMapView.tsx'), 'utf8')

describe('MapLibre V3 lifecycle contract', () => {
  it('starts from bundled geography instead of blocking on a remote style document', () => {
    expect(source).toContain('style: fallbackMapStyle(import.meta.env.BASE_URL)')
    expect(source).not.toContain('tiles.openfreemap.org/styles/')
  })

  it('changes pixel ratio through the live MapLibre instance', () => {
    expect(source.match(/new MapLibreMap\(/g)).toHaveLength(1)
    expect(source).toContain('map.setPixelRatio(nextRatio)')
    expect(source).toContain('earthPixelRatio(initialPerformanceModeRef.current')
    expect(source).toContain('}, [onFallback])')
  })

  it('pauses hidden routes and flushes render sources only when active', () => {
    expect(source).toContain('const rendererActive = active && pageVisible')
    expect(source).toContain('if (!rendererActive) {')
    expect(source).toContain('map.stop()')
    expect(source).toContain('map.triggerRepaint()')
    expect(source).toContain("if (!ready || !rendererActive || !map?.getSource('nexus-signals')) return")
  })

  it('rejects stale cluster work after selection or source replacement', () => {
    expect(source).toContain('const epoch = ++selectionEpoch.current')
    expect(source).toContain('if (epoch !== selectionEpoch.current) return')
    expect(source).toContain('selectionEpoch.current += 1')
    expect(source).toContain('signalsByIdRef.current.get(id)')
  })
})
