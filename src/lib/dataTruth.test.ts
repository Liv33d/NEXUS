import { describe, expect, it } from 'vitest'
import { deriveGlobalDataTruth } from './dataTruth'
import type { ProviderStatus } from '../types/signal'

const now = Date.UTC(2026, 7, 27, 12)
const status = (providerId: string, state: ProviderStatus['state'], lastSuccess?: number): ProviderStatus => ({ providerId, state, lastSuccess })

describe('global data truth', () => {
  it('does not equate connectivity with live data', () => {
    expect(deriveGlobalDataTruth({ a: status('a', 'loading') }, { a: 60_000 }, { refreshing: true, online: true, demo: false, hasStoredSignals: false, now }).state).toBe('updating')
    expect(deriveGlobalDataTruth({ a: status('a', 'idle') }, { a: 60_000 }, { refreshing: false, online: true, demo: false, hasStoredSignals: false, now }).state).toBe('limited')
  })

  it('expires live claims by provider cadence and preserves the as-of time', () => {
    const stale = now - 31 * 60_000
    const truth = deriveGlobalDataTruth({ a: status('a', 'live', stale) }, { a: 5 * 60_000 }, { refreshing: false, online: true, demo: false, hasStoredSignals: true, now })
    expect(truth).toEqual({ state: 'stored', liveSources: 0, asOf: stale })
  })

  it('never reports live while offline', () => {
    const truth = deriveGlobalDataTruth({ a: status('a', 'live', now) }, { a: 60_000 }, { refreshing: false, online: false, demo: false, hasStoredSignals: true, now })
    expect(truth.state).toBe('stored')
  })
})
