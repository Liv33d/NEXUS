import type { Signal, SignalTemporal, SourceRole, TemporalBasis, TimePrecision, UpstreamReference } from '../types/signal'

interface TemporalInput {
  observedAt?: number
  issuedAt?: number
  updatedAt?: number
  validFrom?: number
  validUntil?: number
  confirmedAt: number
  retrievedAt?: number
  precision?: TimePrecision
  basis: TemporalBasis
}

const finiteTime = (value: number | undefined): value is number => Number.isInteger(value) && (value ?? -1) >= 0

export function buildTemporal(input: TemporalInput): SignalTemporal {
  const effectiveAt = input.basis === 'current-state-confirmation' || input.basis === 'retrieval-fallback'
    ? input.confirmedAt
    : input.basis === 'product-validity'
      ? [input.validFrom, input.issuedAt, input.updatedAt, input.confirmedAt].find(finiteTime) ?? input.confirmedAt
      : [input.observedAt, input.issuedAt, input.validFrom, input.updatedAt, input.confirmedAt].find(finiteTime) ?? input.confirmedAt
  return {
    ...(finiteTime(input.observedAt) ? { observedAt: input.observedAt } : {}),
    ...(finiteTime(input.issuedAt) ? { issuedAt: input.issuedAt } : {}),
    ...(finiteTime(input.updatedAt) ? { updatedAt: input.updatedAt } : {}),
    ...(finiteTime(input.validFrom) ? { validFrom: input.validFrom } : {}),
    ...(finiteTime(input.validUntil) ? { validUntil: input.validUntil } : {}),
    confirmedAt: input.confirmedAt,
    retrievedAt: input.retrievedAt ?? input.confirmedAt,
    effectiveAt,
    precision: input.precision ?? 'second',
    basis: input.basis,
  }
}

export function signalTemporal(signal: Signal): SignalTemporal {
  if (signal.temporal) return signal.temporal
  return buildTemporal({
    observedAt: signal.timestamp,
    confirmedAt: signal.source.retrievedAt,
    retrievedAt: signal.source.retrievedAt,
    precision: 'unknown',
    basis: 'legacy-unknown',
  })
}

/** One relevance rule for display, derivation, replay and watch evaluation. */
export function signalRelevantWithin(signal: Signal, since: number, now = Date.now()): boolean {
  if (signal.expiresAt !== undefined && signal.expiresAt <= now) return false
  const temporal = signalTemporal(signal)
  if (temporal.basis === 'current-state-confirmation') {
    return temporal.confirmedAt >= since && (temporal.validUntil === undefined || temporal.validUntil > now)
  }
  if (temporal.basis === 'product-validity') {
    const begins = temporal.validFrom ?? temporal.issuedAt ?? temporal.effectiveAt
    const ends = temporal.validUntil ?? signal.expiresAt ?? temporal.effectiveAt
    return begins <= now && ends >= since
  }
  if (temporal.basis === 'publisher-issue' && temporal.validUntil !== undefined) {
    return (temporal.validFrom ?? temporal.issuedAt ?? temporal.effectiveAt) <= now && temporal.validUntil >= since
  }
  return temporal.effectiveAt >= since || (temporal.validUntil ?? signal.endTime ?? 0) >= since
}

/** Whether the evidence is valid/known at a replay instant. */
export function signalVisibleAt(signal: Signal, at: number): boolean {
  const temporal = signalTemporal(signal)
  if (temporal.basis === 'product-validity' || (temporal.basis === 'publisher-issue' && temporal.validUntil !== undefined)) {
    const begins = temporal.validFrom ?? temporal.issuedAt ?? temporal.effectiveAt
    const ends = temporal.validUntil ?? signal.expiresAt ?? Number.POSITIVE_INFINITY
    return begins <= at && ends >= at
  }
  if (temporal.basis === 'current-state-confirmation') {
    return temporal.confirmedAt <= at && (temporal.validUntil ?? signal.expiresAt ?? Number.POSITIVE_INFINITY) >= at
  }
  return temporal.effectiveAt <= at && (temporal.validUntil ?? signal.endTime ?? signal.expiresAt ?? Number.POSITIVE_INFINITY) >= at
}

export interface SignalTimeInterval { start: number; end: number }

export function signalTemporalInterval(signal: Signal): SignalTimeInterval {
  const temporal = signalTemporal(signal)
  if (temporal.basis === 'product-validity' || temporal.basis === 'publisher-issue') {
    const start = temporal.validFrom ?? temporal.issuedAt ?? temporal.effectiveAt
    return { start, end: temporal.validUntil ?? signal.expiresAt ?? start }
  }
  if (temporal.basis === 'current-state-confirmation') {
    return { start: temporal.confirmedAt, end: temporal.validUntil ?? signal.expiresAt ?? temporal.confirmedAt }
  }
  return { start: temporal.effectiveAt, end: temporal.validUntil ?? signal.endTime ?? temporal.effectiveAt }
}

export function signalCorrelationAnchor(signal: Signal, referenceAt: number): number {
  const interval = signalTemporalInterval(signal)
  return Math.min(Math.max(referenceAt, interval.start), interval.end)
}

export function temporalDistanceMs(a: Signal, b: Signal): number {
  const first = signalTemporalInterval(a)
  const second = signalTemporalInterval(b)
  if (first.end < second.start) return second.start - first.end
  if (second.end < first.start) return first.start - second.end
  return 0
}

export function replayBounds(signals: Signal[], since: number, until: number): SignalTimeInterval | undefined {
  const ranges = signals.map(signalTemporalInterval)
    .map((range) => ({ start: Math.max(since, range.start), end: Math.min(until, range.end) }))
    .filter((range) => range.start <= range.end)
  if (!ranges.length) return undefined
  return { start: Math.min(...ranges.map((range) => range.start)), end: Math.max(...ranges.map((range) => range.end)) }
}

export function lineage(
  sourceFamily: string,
  sourceRole: SourceRole,
  upstreamKey: string,
  revisionKey?: string,
  upstreamRefs: UpstreamReference[] = [],
) {
  return { sourceFamily, sourceRole, upstreamKey, ...(revisionKey ? { revisionKey } : {}), ...(upstreamRefs.length ? { upstreamRefs } : {}) }
}
