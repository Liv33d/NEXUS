import { describe, expect, it } from 'vitest'
import { buildCaseBundle } from './caseExport'
import type { Discovery, Signal } from '../types/signal'

const signal = { id: 'signal-1', source: { provider: 'test', retrievedAt: 1, freshness: 'live' }, type: 'earthquake', title: 'Test', timestamp: 1, attributes: {}, provenance: [] } as Signal
const discovery = { id: 'case-1', createdAt: 1, title: 'Test Case', description: 'Test', score: 50, level: 'unusual', signalIds: ['signal-1', 'missing'], entityIds: [], relationships: [], status: 'saved', tags: ['earthquake'] } as Discovery

describe('case export', () => {
  it('preserves available evidence and reports missing references', () => {
    const bundle = buildCaseBundle(discovery, [signal], new Date('2026-08-16T12:00:00Z'))
    expect(bundle.format).toBe('nexus-case-v1')
    expect(bundle.evidence).toEqual([signal])
    expect(bundle.integrity.includedSignals).toBe(1)
    expect(bundle.integrity.missingSignalIds).toEqual(['missing'])
  })
})
