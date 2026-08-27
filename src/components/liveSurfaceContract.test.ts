import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8')
const store = readFileSync(resolve(process.cwd(), 'src/store/useNexusStore.ts'), 'utf8')

describe('saved evidence isolation contract', () => {
  it('routes Earth search, layer counts, Today, and Observer through current evidence', () => {
    expect(app).toContain('<SearchPanel signals={currentSignals}')
    expect(app).toContain('const count = currentSignals.filter')
    expect(app).toContain('<DiscoverPage discoveries={store.selectedDiscoveryId ? store.discoveries : currentDiscoveries}')
    expect(app).toContain("store.view === 'observer' && <ObserverPage")
    expect(app).toContain('signals={currentSignals}')
    expect(app).not.toContain('SearchPanel signals={store.signals}')
  })

  it('filters Surprise while retaining raw evidence for Case management', () => {
    expect(store).toContain('const currentSignals = filterVisibleSignals(signals, timeWindow, layerVisibility)')
    expect(app).toContain('signals={store.selectedDiscoveryId ? store.signals : currentSignals}')
    expect(app).toContain("onOpen={store.selectDiscovery}")
  })
})
