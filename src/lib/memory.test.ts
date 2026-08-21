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

  it('only establishes a baseline after seven genuine calendar days', () => {
    const now = Date.UTC(2026, 7, 20, 12)
    const signal = createDemoSignals(now)[0]!
    const historySignals = Array.from({ length: 8 }, (_, day) => ({ ...signal, id: `${signal.id}-history-${day}`, timestamp: now - (day + 1) * 86400000 }))
    const memory = discoveryMemory([signal, { ...signal, id: `${signal.id}-current-2` }], aggregateMemory(historySignals, now), now)
    expect(memory.status).toBe('established')
    expect(memory.baselineCount).toBe(1)
    expect(memory.deviationPercent).toBe(100)
    expect(deviationWeight(memory.deviationPercent)).toBeGreaterThan(0)
  })
})
