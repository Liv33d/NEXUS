import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const entry = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8')
const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')

describe('PWA release contract', () => {
  it('activates a fresh application shell without trapping an open installation on stale code', () => {
    expect(entry).toContain("navigator.serviceWorker.addEventListener('controllerchange'")
    expect(entry).toContain('window.location.reload()')
    expect(entry).toContain('registration.update()')
  })

  it('purges the retired third-party radar cache and no longer registers its route', () => {
    expect(entry).toContain("caches.delete('nexus-global-radar')")
    expect(viteConfig).not.toMatch(/rainviewer|nexus-global-radar/i)
  })
})
