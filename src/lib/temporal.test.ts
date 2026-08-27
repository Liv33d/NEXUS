import { describe, expect, it } from 'vitest'
import type { Signal } from '../types/signal'
import { buildTemporal, signalTemporal, signalVisibleAt } from './temporal'

const signal = (timestamp: number): Signal => ({ id: 'temporal', type: 'weather', title: 'Temporal fixture', timestamp, source: { provider: 'test', retrievedAt: timestamp + 10_000, freshness: 'cached' }, attributes: {}, provenance: [] })

describe('canonical temporal replay', () => {
  it('preserves a legacy event timestamp instead of promoting retrieval time', () => {
    const legacy = signal(100)
    expect(signalTemporal(legacy)).toMatchObject({ basis: 'legacy-unknown', effectiveAt: 100, retrievedAt: 10_100 })
  })

  it('shows products only inside their explicit validity interval', () => {
    const product = { ...signal(100), temporal: buildTemporal({ issuedAt: 100, validFrom: 200, validUntil: 400, confirmedAt: 250, basis: 'product-validity' }) }
    expect(signalVisibleAt(product, 199)).toBe(false)
    expect(signalVisibleAt(product, 300)).toBe(true)
    expect(signalVisibleAt(product, 401)).toBe(false)
  })

  it('does not replay a current-state snapshot before it was confirmed', () => {
    const state = { ...signal(100), temporal: buildTemporal({ issuedAt: 100, confirmedAt: 300, validUntil: 500, basis: 'current-state-confirmation' }) }
    expect(signalVisibleAt(state, 299)).toBe(false)
    expect(signalVisibleAt(state, 400)).toBe(true)
  })
})
