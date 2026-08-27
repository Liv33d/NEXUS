import { describe, expect, it } from 'vitest'
import { caseEvidenceSnapshot, filterVisibleSignals, retainProtectedEvidence } from './useNexusStore'
import type { Signal, SignalType } from '../types/signal'
import { buildTemporal } from '../lib/temporal'

const layers = Object.fromEntries(['earthquake', 'fire', 'weather', 'aircraft', 'satellite', 'space-weather', 'media', 'environment', 'infrastructure'].map((type) => [type, true])) as Record<SignalType, boolean>
const makeSignal = (id: string, timestamp: number, expiresAt?: number): Signal => ({ id, type: 'weather', title: id, timestamp, expiresAt, source: { provider: 'test', retrievedAt: timestamp, freshness: 'live' }, attributes: {}, provenance: [] })

describe('visible signal truth', () => {
  it('never presents an expired current product even inside the selected time window', () => {
    const now = Date.UTC(2026, 7, 27, 12)
    const visible = filterVisibleSignals([
      makeSignal('expired', now - 60_000, now - 1),
      makeSignal('current', now - 60_000, now + 60_000),
    ], '24H', layers, now)
    expect(visible.map((signal) => signal.id)).toEqual(['current'])
  })

  it('keeps an old-issued current state when it was freshly confirmed', () => {
    const now = Date.UTC(2026, 7, 27, 12)
    const old = now - 10 * 86400000
    const currentState: Signal = {
      ...makeSignal('volcano-watch', old, now + 60_000),
      temporal: buildTemporal({ issuedAt: old, confirmedAt: now - 60_000, validUntil: now + 60_000, basis: 'current-state-confirmation' }),
    }
    expect(filterVisibleSignals([currentState], '24H', layers, now).map((signal) => signal.id)).toEqual(['volcano-watch'])
  })

  it('retains saved Case evidence when a provider refresh replaces its live slice', () => {
    const old = makeSignal('saved-evidence', 1)
    const unsaved = makeSignal('ordinary-old', 2)
    const incoming = makeSignal('new-evidence', 3)
    const discoveries = [{ id: 'case', createdAt: 3, title: 'Saved case', description: 'Fixture', score: 60, level: 'unusual' as const, center: { latitude: 0, longitude: 0 }, signalIds: [old.id], entityIds: [], relationships: [], status: 'saved' as const, tags: [] }]
    expect(retainProtectedEvidence([old, unsaved], [incoming], 'test', discoveries).map((signal) => signal.id)).toEqual(['saved-evidence', 'new-evidence'])
  })

  it('does not make a legacy event current from retrieval time alone', () => {
    const now = Date.UTC(2026, 7, 27, 12)
    const old = { ...makeSignal('legacy-old', now - 7 * 86400000), source: { provider: 'test', retrievedAt: now, freshness: 'cached' as const } }
    expect(filterVisibleSignals([old], 'NOW', layers, now)).toEqual([])
  })

  it('captures only a saved Case\'s referenced evidence for atomic persistence', () => {
    const first = makeSignal('first', 1)
    const second = makeSignal('second', 2)
    const discovery = { id: 'case', createdAt: 3, title: 'Saved case', description: 'Fixture', score: 60, level: 'unusual' as const, center: { latitude: 0, longitude: 0 }, signalIds: [second.id], entityIds: [], relationships: [], status: 'saved' as const, tags: [] }
    expect(caseEvidenceSnapshot([first, second], discovery)).toEqual([second])
  })
})
