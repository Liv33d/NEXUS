import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Hero Card Lab production exclusion', () => {
  it('is not imported by the production application or configured as a build input', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8')
    const vite = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')
    expect(app).not.toMatch(/HeroCardLab|hero-lab/)
    expect(vite).not.toMatch(/hero-lab\.html|HeroCardLab/)
  })
})
