import type { ProvenanceEntry, Signal } from './signal'

export type IntelligenceKind =
  | 'signal'
  | 'species'
  | 'migration'
  | 'life-cluster'
  | 'signal-cluster'
  | 'phenomenon'
  | 'orbital-pass'
  | 'place'

export type IntelligenceDomain = 'hazards' | 'weather' | 'life' | 'human' | 'ocean' | 'orbit' | 'place'
export type IntelligenceEvidence = 'official' | 'observed' | 'reported' | 'corroborated' | 'derived' | 'predicted' | 'estimated' | 'possible' | 'unknown'

export interface IntelligenceMedia {
  id: string
  kind: 'photo' | 'satellite' | 'radar' | 'model' | 'map' | 'chart' | 'diagram' | 'audio' | 'animation'
  url: string
  title: string
  alt: string
  creator?: string
  license?: string
  attribution: string
  sourceUrl?: string
  observedAt?: number
  freshness?: 'live' | 'near-real-time' | 'recent' | 'historical' | 'derived'
  role?: 'current-evidence' | 'forecast' | 'representative' | 'historical'
  geographicScope?: string
}

export interface IntelligenceFact {
  label: string
  value: string
}

export interface IntelligenceRelationship {
  id: string
  title: string
  description: string
  object?: NexusIntelligenceObject
}

export interface NexusIntelligenceObject {
  id: string
  kind: IntelligenceKind
  domain: IntelligenceDomain
  title: string
  scientificName?: string
  subtitle?: string
  status: 'live' | 'near-real-time' | 'recent' | 'forecast' | 'historical' | 'derived' | 'cached'
  evidence?: IntelligenceEvidence
  timestamp?: number
  location?: { latitude: number; longitude: number }
  geometry?: GeoJSON.Geometry
  media: IntelligenceMedia[]
  summary: string
  whyItMatters?: string
  whatMayHappenNext?: string
  movement?: {
    from?: string
    toward?: string
    direction?: string
    distanceKm?: number
    interpretation: string
  }
  facts: IntelligenceFact[]
  relationships: IntelligenceRelationship[]
  provenance: ProvenanceEntry[]
  methodology: string
  confidence?: number
  sourceUrl?: string
  sourceSignal?: Signal
  watchLabel?: string
}
