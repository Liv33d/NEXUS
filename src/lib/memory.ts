import { cellToParent, getResolution, latLngToCell } from 'h3-js'
import type { MemoryBucket, Signal } from '../types/signal'

const DAY_MS = 86_400_000
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
  const today = dayKey(now)
  const relevant = history.filter((bucket) => bucket.day < today && currentCells.has(bucket.h3Index) && currentTypes.has(bucket.type))
  const earliest = relevant.map((bucket) => Date.parse(`${bucket.day}T00:00:00Z`)).filter(Number.isFinite).sort((a, b) => a - b)[0]
  const observedDays = earliest ? Math.max(1, Math.min(365, Math.ceil((Date.parse(`${today}T00:00:00Z`) - earliest) / DAY_MS))) : 0
  const historicalCount = relevant.reduce((sum, bucket) => sum + bucket.count, 0)
  const baselineCount = observedDays ? historicalCount / observedDays : undefined
  const established = observedDays >= 7 && baselineCount !== undefined && baselineCount >= .25
  const deviationPercent = established ? Math.round(((current.length - baselineCount!) / baselineCount!) * 100) : undefined
  return {
    status: established ? 'established' as const : 'learning' as const,
    currentCount: current.length,
    baselineCount: established ? Math.round(baselineCount! * 10) / 10 : undefined,
    deviationPercent,
    observedDays,
    regionCount: currentCells.size,
    method: established
      ? `Daily activity in ${currentCells.size} H3 region${currentCells.size === 1 ? '' : 's'}, compared with ${observedDays} prior calendar days stored on this device.`
      : `Learning a local baseline from daily activity in ${currentCells.size} H3 region${currentCells.size === 1 ? '' : 's'}; seven days are required before deviation affects ranking.`,
  }
}

export function deviationWeight(deviationPercent?: number): number {
  if (deviationPercent === undefined || deviationPercent <= 0) return 0
  return Math.min(20, Math.log2(1 + deviationPercent / 100) * 8)
}
