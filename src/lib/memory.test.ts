import { describe, expect, it } from 'vitest'
import { createDemoSignals } from '../data/demo'
import { aggregateMemory, deviationWeight, discoveryMemory, regionalCell } from './memory'

describe('planetary memory', () => {
  it('aggregates stable daily regional buckets without provider-format coupling', () => {
    const now = Date.UTC(2026, 7, 20, 12)
    const signal = createDemoSignals(now)[0]!
    const buckets = aggregateMemory([{ ...signal, timestamp: now - 86400000 }, { ...signal, id: `${signal.id}-2`, timestamp: now - 86400000 }], now)
    expect(buckets).toHaveLength(1)
    expect(buckets[0]?.count).toBe(2)
    expect(buckets[0]?.h3Index).toBe(regionalCell(signal))
  })

  it('never establishes an anomaly baseline without provider coverage denominators', () => {
    const now = Date.UTC(2026, 7, 20, 12)
    const signal = createDemoSignals(now)[0]!
    const historySignals = Array.from({ length: 28 }, (_, day) => ({ ...signal, id: `${signal.id}-history-${day}`, timestamp: now - (day + 1) * 86400000 }))
    const learning = discoveryMemory([signal], aggregateMemory(historySignals.slice(0, 27), now), now)
    const memory = discoveryMemory([signal, { ...signal, id: `${signal.id}-current-2` }], aggregateMemory(historySignals, now), now)
    expect(learning.status).toBe('learning')
    expect(memory.status).toBe('learning')
    expect(memory.baselineCount).toBeUndefined()
    expect(memory.deviationPercent).toBeUndefined()
    expect(deviationWeight(memory.deviationPercent)).toBe(0)
  })

  it('does not treat a long gap between recorded days as observed zero activity', () => {
    const now = Date.UTC(2026, 7, 20, 12)
    const signal = createDemoSignals(now)[0]!
    const sparse = [1, 100].map((day) => ({ ...signal, id: `${signal.id}-${day}`, timestamp: now - day * 86400000 }))
    const memory = discoveryMemory([signal], aggregateMemory(sparse, now), now)
    expect(memory.status).toBe('learning')
    expect(memory.observedDays).toBe(2)
  })
})
