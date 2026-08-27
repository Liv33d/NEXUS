import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const entry = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8')
const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')

describe('PWA release contract', () => {
  it('stages updates without reloading a tab that may contain unsaved Case notes', () => {
    expect(entry).not.toContain("navigator.serviceWorker.addEventListener('controllerchange'")
    expect(entry).not.toContain('window.location.reload()')
    expect(entry).toContain("dataset.updateReady = 'true'")
    expect(entry).toContain('registration.update()')
    expect(viteConfig).toContain("registerType: 'prompt'")
  })

  it('purges the retired third-party radar cache and no longer registers its route', () => {
    expect(entry).toContain("caches.delete('nexus-global-radar')")
    expect(viteConfig).not.toMatch(/rainviewer|nexus-global-radar/i)
  })
})
