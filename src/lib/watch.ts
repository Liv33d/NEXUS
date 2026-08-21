import type { ObserverPlace } from '../providers/openMeteo'
import type { Signal } from '../types/signal'
import type { WatchMatch, WatchRule } from '../types/watch'
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
    conditions: { radiusKm: 250, minimumSeverity: 55 },
    delivery: 'in-app',
  }
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
