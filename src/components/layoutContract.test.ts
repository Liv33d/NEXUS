import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8')
const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

describe('mobile interaction layout contract', () => {
  it('keeps one floating Earth command entry point', () => {
    expect(app.match(/earth-tools-button/g)).toHaveLength(1)
    expect(app).not.toMatch(/earth-command-rail|globe-quick-lenses|view-toggle/)
    expect(styles).not.toMatch(/\.earth-command-rail|\.globe-quick-lenses|\.view-toggle|\.map-mode-switch/)
  })

  it('uses the V2 human navigation and three-detent hero card', () => {
    const chrome = readFileSync(resolve(process.cwd(), 'src/components/Chrome.tsx'), 'utf8')
    const inspector = readFileSync(resolve(process.cwd(), 'src/components/IntelligenceInspector.tsx'), 'utf8')
    expect(chrome).toContain("label: 'Today'")
    expect(chrome).toContain("label: 'Yours'")
    expect(chrome).not.toContain("label: 'Observer'")
    for (const detent of ["'peek'", "'story'", "'full'"]) expect(inspector).toContain(detent)
    expect(styles).toContain('.nexus-hero-card.detent-story')
  })

  it('keeps the intelligence sheet transform, viewport, and accessibility contract aligned', () => {
    const inspector = readFileSync(resolve(process.cwd(), 'src/components/IntelligenceInspector.tsx'), 'utf8')
    expect(styles).toContain('--sheet-story-visible')
    expect(styles).toContain('height:var(--sheet-story-visible)')
    expect(styles).toMatch(/\.inspector-drag-handle \{[^}]+height:44px/)
    expect(styles).toContain('.nexus-hero-card[data-phase="settling"]')
    expect(inspector).toContain('onLostPointerCapture={onLostPointerCapture}')
    expect(inspector).toContain('scrollRef.current?.scrollTo')
    expect(inspector).toContain('aria-controls="nexus-intelligence-content"')
    expect(inspector).toContain('onKeyDown={onDialogKeyDown}')
  })

  it('presents four consumer quick views before progressively disclosed layers', () => {
    for (const label of ['Living Earth', 'Weather', 'Hazards', 'Life']) {
      expect(app).toContain(label)
    }
    expect(app).toContain('active-layer-summary')
    expect(app).toContain('layer-category-accordion')
    expect(app).toContain('aria-expanded={open}')
    expect(app).not.toContain('taxon-strip')
    expect(app).not.toContain('Ambient Earth')
    expect(styles).toContain('.domain-lens-grid')
  })

  it('opens privacy-safe LIFE geometry through universal intelligence', () => {
    expect(app).not.toContain('migrationToIntelligence')
    expect(app).toContain('lifeTaxonToIntelligence(taxon')
    expect(app).toContain('onSelectLife={selectLife}')
    expect(app).not.toContain('Recent observed global cloud imagery')
  })

  it('reserves Earth zoom exclusively for Earth navigation', () => {
    expect(app).not.toContain('onRequestSolar')
    expect(app).not.toContain('enterSolarSystem')
    expect(app).not.toContain('<strong>Solar System</strong>')
    expect(app).toContain("store.view === 'earth' ? 'active' : ''")
    expect(app).toContain('>{earthContent}</div>')
  })

  it('uses an intentional landscape inspector instead of stacking portrait sheets', () => {
    expect(styles).toContain('@media (orientation: landscape) and (max-height: 600px)')
    expect(styles).toMatch(/\.command-sheet \{ top:calc\(54px[^}]+left:auto[^}]+width:min\(390px,46vw\)/)
    expect(styles).toMatch(/\.observer-dashboard \{ display:grid;grid-template-columns:minmax\(250px,.84fr\) minmax\(360px,1.16fr\)/)
    expect(styles).toContain('.observer-dashboard>.weather-forecast { grid-column:2;grid-row:1/span 7')
  })

  it('removes the half-built ambient mode from production interaction', () => {
    expect(app).not.toContain('ambientMode')
    expect(app).not.toContain('wakeLock')
    expect(app).not.toContain('Ambient Earth')
  })
})
