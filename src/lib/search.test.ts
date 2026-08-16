import { describe, expect, it } from 'vitest'
import { searchSignals } from './search'
import type { Signal } from '../types/signal'

const base: Pick<Signal, 'source' | 'timestamp' | 'attributes' | 'provenance'> = { source: { provider: 'test', retrievedAt: 1, freshness: 'live' }, timestamp: 1, attributes: {}, provenance: [] }
const signals = [
  { ...base, id: 'quake', type: 'earthquake', title: 'M5.4 — Near Taiwan', entities: [{ id: 'taiwan', type: 'LOCATION', name: 'Taiwan' }] },
  { ...base, id: 'fire', type: 'fire', title: 'Thermal detection — California' },
  { ...base, id: 'storm', type: 'weather', title: 'Typhoon warning — Taiwan' },
] as Signal[]

describe('deterministic search', () => {
  it('parses a type and place without requiring exact command wording', () => {
    expect(searchSignals(signals, 'earthquakes near Taiwan').map((signal) => signal.id)).toEqual(['quake'])
  })

  it('maps common hazard aliases to normalized signal types', () => {
    expect(searchSignals(signals, 'wildfires California').map((signal) => signal.id)).toEqual(['fire'])
    expect(searchSignals(signals, 'storms over Taiwan').map((signal) => signal.id)).toEqual(['storm'])
  })
})
