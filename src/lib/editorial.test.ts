import { describe, expect, it } from 'vitest'
import { discoveryUsesOnlyCurrentEvidence, selectEditorialStories } from './editorial'
import type { Discovery, Signal } from '../types/signal'

const signal = (id: string, type: Signal['type']): Signal => ({ id, type, title: id, timestamp: 1, source: { provider: id, retrievedAt: 1, freshness: 'live' }, attributes: {}, provenance: [] })
const discovery = (id: string, score: number, signalId: string, entityId = id): Discovery => ({ id, createdAt: score, title: id, description: id, score, level: 'significant', signalIds: [signalId, `${signalId}-support`], entityIds: [entityId], relationships: [], status: 'new', tags: [] })

describe('editorial story selection', () => {
  it('keeps a mixed current and expired saved Case out of live briefings', () => {
    const mixed = discovery('mixed', 90, 'current')
    mixed.status = 'saved'
    expect(discoveryUsesOnlyCurrentEvidence(mixed, new Set(['current']))).toBe(false)
    expect(discoveryUsesOnlyCurrentEvidence(mixed, new Set(['current', 'current-support']))).toBe(true)
  })

  it('caps the briefing, domains, and duplicate entities deterministically', () => {
    const signals = [signal('q1', 'earthquake'), signal('q2', 'earthquake'), signal('q3', 'earthquake'), signal('f1', 'fire'), signal('w1', 'weather')]
    const stories = [discovery('a', 99, 'q1', 'same'), discovery('b', 98, 'q2', 'same'), discovery('c', 97, 'q3'), discovery('d', 96, 'q2'), discovery('e', 95, 'f1'), discovery('f', 94, 'w1')]
    expect(selectEditorialStories(stories, signals, 5).map((item) => item.id)).toEqual(['a', 'c', 'e', 'f'])
  })
})
