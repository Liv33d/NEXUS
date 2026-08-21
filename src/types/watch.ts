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
  }
  delivery: 'in-app'
}

export interface WatchMatch {
  ruleId: string
  evaluatedAt: number
  signalIds: string[]
}
