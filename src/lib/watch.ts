import type { ObserverPlace } from '../providers/openMeteo'
import type { ObserverContext } from '../providers/openMeteo'
import type { Signal } from '../types/signal'
import type { WatchMatch, WatchRule, WatchTrigger, WatchWeatherMatch } from '../types/watch'
import { distanceKm } from './geo'
import { buildSignalContext } from './context'

export function placeWatchId(latitude: number, longitude: number): string {
  return `place-${latitude.toFixed(4)}-${longitude.toFixed(4)}`
}

export function createPlaceWatch(place: ObserverPlace, now = Date.now()): WatchRule {
  return {
    id: placeWatchId(place.latitude, place.longitude),
    createdAt: now,
    enabled: true,
    target: { kind: 'place', name: [place.name, place.subtitle].filter(Boolean).join(', '), latitude: place.latitude, longitude: place.longitude },
    conditions: {
      radiusKm: 250, minimumSeverity: 55, cooldownMs: 15 * 60000, dedupeWindowMs: 24 * 3600000,
      weather: { severeAlerts: true, precipitationProbabilityAtLeast: 70, windSpeedAtLeastKmh: 60 },
    },
    delivery: 'in-app',
  }
}

export function evaluateWeatherWatch(rule: WatchRule, context: ObserverContext | undefined, signals: Signal[], now = Date.now()): WatchWeatherMatch {
  const weather = rule.conditions.weather
  if (!rule.enabled || !weather) return { ruleId: rule.id, evaluatedAt: now, active: false, reasons: [] }
  const reasons: string[] = []
  if (weather.severeAlerts && signals.some((signal) => signal.type === 'weather' && signal.location && (signal.severity ?? 0) >= rule.conditions.minimumSeverity && distanceKm(rule.target, signal.location) <= rule.conditions.radiusKm)) reasons.push('An official severe weather alert affects the watched area')
  if (context) {
    const precipitationPeak = Math.max(0, ...context.hourly24.map((point) => point.precipitationProbability ?? 0))
    const windPeak = Math.max(context.windSpeed, ...context.hourly24.map((point) => point.windSpeed ?? 0))
    const temperaturePeak = Math.max(context.temperature, ...context.hourly24.map((point) => point.temperature))
    const temperatureLow = Math.min(context.temperature, ...context.hourly24.map((point) => point.temperature))
    if (weather.precipitationProbabilityAtLeast !== undefined && precipitationPeak >= weather.precipitationProbabilityAtLeast) reasons.push(`Rain becomes likely, reaching ${Math.round(precipitationPeak)}% during the next 24 hours`)
    if (weather.windSpeedAtLeastKmh !== undefined && windPeak >= weather.windSpeedAtLeastKmh) reasons.push(`Winds may reach about ${Math.round(windPeak)} km/h during the next 24 hours`)
    if (weather.temperatureAboveC !== undefined && temperaturePeak >= weather.temperatureAboveC) reasons.push(`Temperatures may rise to about ${Math.round(temperaturePeak)}°C`)
    if (weather.temperatureBelowC !== undefined && temperatureLow <= weather.temperatureBelowC) reasons.push(`Temperatures may fall to about ${Math.round(temperatureLow)}°C`)
  }
  return { ruleId: rule.id, evaluatedAt: now, active: reasons.length > 0, reasons }
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
    const signal = signals.find((candidate) => candidate.id === signalId)
    const context = signal ? buildSignalContext(signal) : undefined
    return [{ id: `${rule.id}:${signalId}:${Math.floor(now / dedupeWindow)}`, ruleId: rule.id, signalId, triggeredAt: now, lastSeenAt: now, state: 'new' as const, delivery: rule.delivery, reason: context ? `${context.headline}. ${context.whyItMatters ?? context.plainLanguageSummary}` : 'A watched condition crossed its configured threshold.' }]
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
