import type { ObserverPlace } from '../providers/openMeteo'
import type { Signal } from '../types/signal'
import type { WatchMatch, WatchRule, WatchTrigger } from '../types/watch'
import { distanceKm } from './geo'

export function placeWatchId(latitude: number, longitude: number): string {
  return `place-${latitude.toFixed(4)}-${longitude.toFixed(4)}`
}

export function createPlaceWatch(place: ObserverPlace, now = Date.now()): WatchRule {
  return {
    id: placeWatchId(place.latitude, place.longitude),
    createdAt: now,
    enabled: true,
    target: { kind: 'place', name: [place.name, place.subtitle].filter(Boolean).join(', '), latitude: place.latitude, longitude: place.longitude },
    conditions: { radiusKm: 250, minimumSeverity: 55, cooldownMs: 15 * 60000, dedupeWindowMs: 24 * 3600000 },
    delivery: 'in-app',
  }
}

export function evaluateWatchTriggers(rule: WatchRule, signals: Signal[], previous: WatchTrigger[], now = Date.now()): WatchTrigger[] {
  const match = evaluateWatch(rule, signals, now)
  const bySignal = new Map(previous.filter((trigger) => trigger.ruleId === rule.id).map((trigger) => [trigger.signalId, trigger]))
  const dedupeWindow = rule.conditions.dedupeWindowMs ?? 24 * 3600000
  const cooldown = rule.conditions.cooldownMs ?? 15 * 60000
  const latestNew = previous.filter((trigger) => trigger.ruleId === rule.id).reduce((latest, trigger) => Math.max(latest, trigger.triggeredAt), 0)
  let canCreate = now - latestNew >= cooldown
  return match.signalIds.flatMap((signalId) => {
    const existing = bySignal.get(signalId)
    if (existing && now - existing.triggeredAt < dedupeWindow) return [{ ...existing, lastSeenAt: now }]
    if (!canCreate) return []
    canCreate = false
    return [{ id: `${rule.id}:${signalId}:${Math.floor(now / dedupeWindow)}`, ruleId: rule.id, signalId, triggeredAt: now, lastSeenAt: now, state: 'new' as const, delivery: rule.delivery }]
  })
}

export const inAppWatchDelivery = {
  id: 'in-app' as const,
  async deliver(triggers: WatchTrigger[]) {
    // IndexedDB is the web delivery surface. Native push can implement this
    // same adapter boundary later without moving logic into providers.
    void triggers
  },
}

export function evaluateWatch(rule: WatchRule, signals: Signal[], now = Date.now()): WatchMatch {
  if (!rule.enabled) return { ruleId: rule.id, evaluatedAt: now, signalIds: [] }
  const allowed = rule.conditions.signalTypes ? new Set(rule.conditions.signalTypes) : undefined
  const signalIds = signals.filter((signal) => signal.location
    && (signal.severity ?? 0) >= rule.conditions.minimumSeverity
    && (!allowed || allowed.has(signal.type))
    && distanceKm(rule.target, signal.location) <= rule.conditions.radiusKm).map((signal) => signal.id)
  return { ruleId: rule.id, evaluatedAt: now, signalIds }
}
