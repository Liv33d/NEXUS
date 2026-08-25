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

  it('exposes coherent Earth domains without presenting unavailable feeds as live', () => {
    for (const label of ['Bird Migration', 'Maritime', 'Flight Activity', 'Animals & Life', 'Orbit']) {
      expect(app).toContain(label)
    }
    expect(app).toContain('Ocean hazards · no live vessel tracking')
    expect(app).toContain('No live aircraft provider connected')
    expect(styles).toContain('.domain-lens-grid')
  })

  it('reserves Earth zoom exclusively for Earth navigation', () => {
    expect(app).not.toContain('onRequestSolar')
    expect(app).not.toContain('enterSolarSystem')
    expect(app).not.toContain('<strong>Solar System</strong>')
    expect(app).toContain("store.view === 'earth' && earthContent")
  })

  it('uses an intentional landscape inspector instead of stacking portrait sheets', () => {
    expect(styles).toContain('@media (orientation: landscape) and (max-height: 600px)')
    expect(styles).toMatch(/\.command-sheet \{ top:calc\(54px[^}]+left:auto[^}]+width:min\(390px,46vw\)/)
    expect(styles).toMatch(/\.observer-dashboard \{ display:grid;grid-template-columns:minmax\(250px,.84fr\) minmax\(360px,1.16fr\)/)
    expect(styles).toContain('.observer-dashboard>.weather-forecast { grid-column:2;grid-row:1/span 7')
  })

  it('removes every ambient overlay when the display becomes idle', () => {
    expect(styles).toContain('.ambient-idle .topbar,.ambient-idle .earth-overlay,.ambient-idle .bottom-nav,.ambient-idle .environment-status-stack')
  })
})
