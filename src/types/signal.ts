export const signalTypes = [
  'earthquake', 'fire', 'weather', 'aircraft', 'satellite', 'space-weather', 'media', 'environment', 'infrastructure'
] as const

export type SignalType = (typeof signalTypes)[number]
export type Freshness = 'live' | 'delayed' | 'cached' | 'demo'
export type ProvenanceLabel = 'OFFICIAL_SOURCE' | 'OPEN_DATA' | 'MEDIA_SIGNAL' | 'DERIVED_METRIC' | 'CORRELATION' | 'ESTIMATED' | 'CACHED' | 'DEMO_DATA'

export interface SignalEntity {
  id: string
  type: 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'AIRCRAFT' | 'SATELLITE' | 'VESSEL' | 'FACILITY' | 'EVENT' | 'COUNTRY' | 'REGION' | 'OTHER'
  name: string
}

export interface ProvenanceEntry {
  label: ProvenanceLabel
  description: string
  sourceUrl?: string
}

export interface Signal {
  id: string
  source: {
    provider: string
    dataset?: string
    url?: string
    retrievedAt: number
    freshness: Freshness
  }
  type: SignalType
  title: string
  summary?: string
  timestamp: number
  startTime?: number
  endTime?: number
  location?: {
    latitude: number
    longitude: number
    altitude?: number
    accuracy?: number
    h3Index?: string
  }
  geometry?: GeoJSON.Geometry
  magnitude?: number
  severity?: number
  confidence?: number
  entities?: SignalEntity[]
  attributes: Record<string, unknown>
  provenance: ProvenanceEntry[]
  expiresAt?: number
}

export interface Relationship {
  id: string
  sourceSignalId: string
  targetSignalId: string
  kind: 'spatial' | 'temporal' | 'entity' | 'cell'
  distanceKm?: number
  timeDeltaMinutes?: number
  reason: string
  confidence: number
}

export interface Discovery {
  id: string
  createdAt: number
  title: string
  description: string
  score: number
  scoreComponents?: {
    typicalSeverity: number
    peakSeverity: number
    evidence: number
    diversity: number
  }
  level: 'routine' | 'elevated' | 'unusual' | 'significant' | 'exceptional'
  center?: { latitude: number; longitude: number }
  signalIds: string[]
  entityIds: string[]
  relationships: Relationship[]
  status: 'new' | 'watching' | 'saved' | 'dismissed'
  tags: string[]
}

export interface ProviderStatus {
  providerId: string
  providerName?: string
  state: 'idle' | 'loading' | 'live' | 'cached' | 'rate-limited' | 'unavailable' | 'error'
  lastSuccess?: number
  lastAttempt?: number
  message?: string
  retryAt?: number
  signalCount?: number
}
