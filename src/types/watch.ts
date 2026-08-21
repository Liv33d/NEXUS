import type { SignalType } from './signal'

export interface WatchRule {
  id: string
  createdAt: number
  enabled: boolean
  target: {
    kind: 'place'
    name: string
    latitude: number
    longitude: number
  }
  conditions: {
    radiusKm: number
    minimumSeverity: number
    signalTypes?: SignalType[]
    cooldownMs?: number
    dedupeWindowMs?: number
    weather?: {
      severeAlerts?: boolean
      precipitationProbabilityAtLeast?: number
      windSpeedAtLeastKmh?: number
      temperatureAboveC?: number
      temperatureBelowC?: number
    }
  }
  delivery: 'in-app'
}

export interface WatchWeatherMatch {
  ruleId: string
  evaluatedAt: number
  active: boolean
  reasons: string[]
}

export interface WatchMatch {
  ruleId: string
  evaluatedAt: number
  signalIds: string[]
}

export interface WatchTrigger {
  id: string
  ruleId: string
  signalId: string
  triggeredAt: number
  lastSeenAt: number
  state: 'new' | 'seen' | 'expired'
  delivery: 'in-app'
  reason?: string
}

export interface WatchDeliveryAdapter {
  id: WatchRule['delivery']
  deliver(triggers: WatchTrigger[]): Promise<void>
}
