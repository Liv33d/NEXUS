import { cellToParent, getResolution, latLngToCell } from 'h3-js'
import type { MemoryBucket, Signal } from '../types/signal'

const MEMORY_RESOLUTION = 3

function dayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

export function regionalCell(signal: Signal): string | undefined {
  if (!signal.location) return undefined
  try {
    const source = signal.location.h3Index ?? latLngToCell(signal.location.latitude, signal.location.longitude, MEMORY_RESOLUTION)
    const resolution = getResolution(source)
    return resolution > MEMORY_RESOLUTION ? cellToParent(source, MEMORY_RESOLUTION) : source
  } catch { return undefined }
}

export function aggregateMemory(signals: Signal[], updatedAt = Date.now()): MemoryBucket[] {
  const buckets = new Map<string, MemoryBucket>()
  for (const signal of signals) {
    const h3Index = regionalCell(signal)
    if (!h3Index || !Number.isFinite(signal.timestamp)) continue
    const day = dayKey(signal.timestamp)
    const id = `${day}:${h3Index}:${signal.type}:${signal.source.provider}`
    const prior = buckets.get(id)
    const severity = Math.max(0, Math.min(100, signal.severity ?? 0))
    buckets.set(id, prior ? { ...prior, count: prior.count + 1, severitySum: prior.severitySum + severity, maxSeverity: Math.max(prior.maxSeverity, severity), updatedAt } : {
      id, day, h3Index, type: signal.type, provider: signal.source.provider, count: 1, severitySum: severity, maxSeverity: severity, updatedAt,
    })
  }
  return [...buckets.values()]
}

export function discoveryMemory(current: Signal[], history: MemoryBucket[], now = Date.now()) {
  const currentCells = new Set(current.flatMap((signal) => regionalCell(signal) ?? []))
  const currentTypes = new Set(current.map((signal) => signal.type))
  const currentProviders = new Set(current.map((signal) => signal.source.provider))
  const today = dayKey(now)
  const relevant = history.filter((bucket) => bucket.day < today && currentCells.has(bucket.h3Index) && currentTypes.has(bucket.type) && currentProviders.has(bucket.provider))
  // The current schema cannot prove a provider successfully covered a day on
  // which it emitted zero records. Treat only recorded days as observed rather
  // than manufacturing zeros from outages or missed refreshes.
  const observedDays = new Set(relevant.map((bucket) => bucket.day)).size
  const historicalCount = relevant.reduce((sum, bucket) => sum + bucket.count, 0)
  // A count-only history cannot distinguish a true zero-event day from a
  // provider outage. Keep the feature in learning mode until provider-run
  // coverage envelopes supply trustworthy denominators.
  const baselineCount = observedDays ? historicalCount / observedDays : undefined
  return {
    status: 'learning' as const,
    currentCount: current.length,
    baselineCount: undefined,
    deviationPercent: undefined,
    observedDays,
    regionCount: currentCells.size,
    method: `Learning a conservative local baseline from recorded provider activity in ${currentCells.size} H3 region${currentCells.size === 1 ? '' : 's'}. An anomaly claim remains disabled until provider coverage can distinguish true zero-event days from outages.${baselineCount === undefined ? '' : ` Recorded-event days currently average ${Math.round(baselineCount * 10) / 10} items, but that value is not used as a baseline.`}`,
  }
}

export function deviationWeight(deviationPercent?: number): number {
  if (deviationPercent === undefined || deviationPercent <= 0) return 0
  return Math.min(20, Math.log2(1 + deviationPercent / 100) * 8)
}
