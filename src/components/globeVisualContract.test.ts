import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const globe = readFileSync(resolve(process.cwd(), 'src/components/GlobeView.tsx'), 'utf8')
const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8')
const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
const migration = readFileSync(resolve(process.cwd(), 'src/lib/migration.ts'), 'utf8')
const life = readFileSync(resolve(process.cwd(), 'src/lib/lifeGlobe.ts'), 'utf8')
const layers = readFileSync(resolve(process.cwd(), 'src/lib/layers.ts'), 'utf8')

describe('globe visual stability contract', () => {
  it('keeps raster shells separated from Earth geometry on mobile GPUs', () => {
    expect(globe).toContain('getGlobeRadius() * 1.012')
    expect(globe).toContain('getGlobeRadius() * 1.022')
    expect(globe).toContain('polygonAltitude={0.0025}')
    expect(globe).toContain('depthWrite: false')
  })

  it('does not treat a true-colour satellite image as an opaque second Earth', () => {
    expect(globe).toContain('smoothstep(.055,.17,chroma)')
    expect(globe).toContain("layerFocus === 'migration' || layerFocus === 'animals' ? 0.2 : 0.34")
    expect(globe).toContain('if(cloud<.055)discard')
  })

  it('makes Migration an additive focus with visible activity pulses', () => {
    expect(app).toContain('enableLayerCollection(layerPresets.migration)')
    expect(app).not.toContain('setRadarEnabled(false)')
    expect(app).not.toContain('setSatelliteEnabled(false)')
    expect(globe).toContain("layerFocus === 'migration'")
    expect(globe).toContain('id: `migration-${cell.id}`')
    expect(globe).toContain("color: '#a4ffcc'")
    expect(migration).toContain("params.append('license', 'CC0_1_0')")
    expect(migration).toContain("params.append('license', 'CC_BY_4_0')")
    expect(app).toContain('migrationFocus.distanceKm.toLocaleString()')
    expect(app).toContain('migrationFocus.direction')
    expect(app).toContain('corridor.commonName ?? corridor.species')
  })

  it('opens Animals and Life on Earth with licensed biodiversity context', () => {
    expect(app).toContain('enableLayerCollection(layerPresets.life)')
    expect(app).not.toMatch(/lens === 'animals'[\s\S]{0,500}store\.setView\('observer'\)/)
    expect(app).toContain('life={lifeEnabled ? life : undefined}')
    expect(life).toContain("params.append('license', 'CC0_1_0')")
    expect(life).toContain('coarse H3 cells')
  })

  it('exposes every normalized signal category in Earth controls', () => {
    for (const type of ['earthquake', 'fire', 'weather', 'aircraft', 'satellite', 'space-weather', 'media', 'environment', 'infrastructure']) {
      expect(layers).toContain(`'${type}'`)
    }
  })

  it('uses a compact portrait control hierarchy', () => {
    expect(styles).toContain('@media (orientation: portrait) and (max-width: 699px)')
    expect(styles).toContain('grid-template-rows:repeat(2,72px)')
    expect(app).toContain('<details className="advanced-layers">')
  })

  it('never starts a WebGL map when WebGL2 is unavailable', () => {
    expect(app).toMatch(/\{!webGLAvailable \? <AccessibleEarthFallback[\s\S]+: visualMode === 'map' \? <Suspense/)
    expect(app).not.toMatch(/\{visualMode === 'map' \?[\s\S]+: !webGLAvailable \? <AccessibleEarthFallback/)
  })
})
