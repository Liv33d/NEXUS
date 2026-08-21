import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const globe = readFileSync(resolve(process.cwd(), 'src/components/GlobeView.tsx'), 'utf8')
const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8')
const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
const migration = readFileSync(resolve(process.cwd(), 'src/lib/migration.ts'), 'utf8')

describe('globe visual stability contract', () => {
  it('keeps raster shells separated from Earth geometry on mobile GPUs', () => {
    expect(globe).toContain('getGlobeRadius() * 1.012')
    expect(globe).toContain('getGlobeRadius() * 1.022')
    expect(globe).toContain('polygonAltitude={0.0025}')
    expect(globe).toContain('depthWrite: false')
  })

  it('does not treat a true-colour satellite image as an opaque second Earth', () => {
    expect(globe).toContain('smoothstep(.055,.17,chroma)')
    expect(globe).toContain('opacity: { value: 0.34 }')
    expect(globe).toContain('if(cloud<.055)discard')
  })

  it('makes Migration an uncluttered focus lens with visible activity pulses', () => {
    expect(app).toMatch(/lens === 'migration'[\s\S]+setRadarEnabled\(false\)[\s\S]+setSatelliteEnabled\(false\)[\s\S]+setMigrationEnabled\(true\)/)
    expect(globe).toContain('id: `migration-${cell.id}`')
    expect(globe).toContain("color: '#a4ffcc'")
    expect(migration).toContain("params.append('license', 'CC0_1_0')")
    expect(migration).toContain("params.append('license', 'CC_BY_4_0')")
  })

  it('uses a compact portrait control hierarchy', () => {
    expect(styles).toContain('@media (orientation: portrait) and (max-width: 699px)')
    expect(styles).toContain('grid-template-rows:repeat(2,72px)')
    expect(app).toContain('<details className="advanced-layers">')
  })
})
