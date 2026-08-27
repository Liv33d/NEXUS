import type { FeatureCollection, LineString, Point, Polygon, MultiPolygon } from 'geojson'
import { signalAreasGeoJSON } from './geospatial'
import type { LifeGlobeSnapshot } from './lifeGlobe'
import type { Signal } from '../types/signal'
import { signalTemporal } from './temporal'

export type EarthPerformanceMode = 'automatic' | 'quality' | 'battery'
export type SemanticZoomBand = 'orbit' | 'continent' | 'region' | 'local'

export interface EarthRenderCaps {
  signals: number
  areas: number
  lifeCells: number
  lifeTaxa: number
}

export interface EarthRenderPolicy extends EarthRenderCaps {
  band: SemanticZoomBand
  minimumIndividualSeverity: number
}

const CAPS: Record<EarthPerformanceMode, Record<SemanticZoomBand, EarthRenderCaps>> = {
  quality: {
    orbit: { signals: 900, areas: 80, lifeCells: 48, lifeTaxa: 0 },
    continent: { signals: 2_200, areas: 120, lifeCells: 80, lifeTaxa: 0 },
    region: { signals: 4_000, areas: 180, lifeCells: 100, lifeTaxa: 28 },
    local: { signals: 5_000, areas: 240, lifeCells: 64, lifeTaxa: 36 },
  },
  automatic: {
    orbit: { signals: 650, areas: 64, lifeCells: 40, lifeTaxa: 0 },
    continent: { signals: 1_600, areas: 100, lifeCells: 64, lifeTaxa: 0 },
    region: { signals: 3_000, areas: 150, lifeCells: 80, lifeTaxa: 24 },
    local: { signals: 4_000, areas: 180, lifeCells: 56, lifeTaxa: 28 },
  },
  battery: {
    orbit: { signals: 300, areas: 40, lifeCells: 28, lifeTaxa: 0 },
    continent: { signals: 800, areas: 60, lifeCells: 40, lifeTaxa: 0 },
    region: { signals: 1_200, areas: 80, lifeCells: 48, lifeTaxa: 12 },
    local: { signals: 1_800, areas: 100, lifeCells: 40, lifeTaxa: 16 },
  },
}

const MINIMUM_INDIVIDUAL_SEVERITY: Record<SemanticZoomBand, number> = {
  orbit: 75,
  continent: 55,
  region: 0,
  local: 0,
}

export function semanticZoomBand(zoom: number): SemanticZoomBand {
  if (zoom < 2) return 'orbit'
  if (zoom < 4) return 'continent'
  if (zoom < 7) return 'region'
  return 'local'
}

export function earthRenderPolicy(mode: EarthPerformanceMode, band: SemanticZoomBand): EarthRenderPolicy {
  return { band, minimumIndividualSeverity: MINIMUM_INDIVIDUAL_SEVERITY[band], ...CAPS[mode][band] }
}

export function earthPixelRatio(mode: EarthPerformanceMode, devicePixelRatio: number): number {
  const safeRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  return Math.min(safeRatio, mode === 'quality' ? 2 : mode === 'battery' ? 1 : 1.5)
}

const FRESHNESS_PRIORITY: Record<Signal['source']['freshness'], number> = {
  live: 3,
  delayed: 2,
  cached: 1,
  demo: 0,
}

function official(signal: Signal) {
  return signal.provenance.some((entry) => entry.label === 'OFFICIAL_SOURCE') ? 1 : 0
}

function boundedSeverity(signal: Signal) {
  return Math.max(0, Math.min(100, signal.severity ?? 20))
}

/**
 * Produces a deterministic order independent of provider response order.
 * Selection always survives a cap, followed by severity, freshness, official
 * evidence, observation time, confidence, and finally a stable id tie-break.
 */
export function compareSignalsForEarth(a: Signal, b: Signal, selectedId?: string): number {
  const selectedDifference = Number(b.id === selectedId) - Number(a.id === selectedId)
  if (selectedDifference) return selectedDifference
  const severityDifference = boundedSeverity(b) - boundedSeverity(a)
  if (severityDifference) return severityDifference
  const freshnessDifference = FRESHNESS_PRIORITY[b.source.freshness] - FRESHNESS_PRIORITY[a.source.freshness]
  if (freshnessDifference) return freshnessDifference
  const officialDifference = official(b) - official(a)
  if (officialDifference) return officialDifference
  const timestampDifference = signalTemporal(b).effectiveAt - signalTemporal(a).effectiveAt
  if (timestampDifference) return timestampDifference
  const confidenceDifference = (b.confidence ?? .5) - (a.confidence ?? .5)
  if (confidenceDifference) return confidenceDifference
  return a.id.localeCompare(b.id)
}

export function prioritizeSignals(signals: Signal[], cap: number, selectedId?: string, requireLocation = false): Signal[] {
  const limit = Math.max(0, cap)
  const ranked = signals
    .filter((signal) => !requireLocation || Boolean(signal.location))
    .slice()
    .sort((a, b) => compareSignalsForEarth(a, b, selectedId))
  if (ranked.length <= limit) return ranked
  const selected = selectedId ? ranked.find((signal) => signal.id === selectedId) : undefined
  const buckets = new Map<string, Signal[]>()
  for (const signal of ranked) {
    if (signal === selected) continue
    const location = signal.location
    const grid = location ? `${Math.floor((location.latitude + 90) / 15)}:${Math.floor((location.longitude + 180) / 15)}` : 'no-location'
    const key = `${signal.type}:${grid}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(signal)
    else buckets.set(key, [signal])
  }
  const result = selected ? [selected] : []
  let depth = 0
  while (result.length < limit) {
    let added = false
    for (const bucket of buckets.values()) {
      const signal = bucket[depth]
      if (!signal) continue
      result.push(signal)
      added = true
      if (result.length === limit) break
    }
    if (!added) break
    depth += 1
  }
  return result
}

export type EarthSignalProperties = {
  id: string
  title: string
  type: Signal['type']
  severity: number
  timestamp: number
  thermal: number
  storm: number
}

export function earthSignalCollection(signals: Signal[], policy: EarthRenderPolicy, selectedId?: string): FeatureCollection<Point, EarthSignalProperties> {
  return {
    type: 'FeatureCollection',
    features: prioritizeSignals(signals, policy.signals, selectedId, true).map((signal) => ({
      type: 'Feature',
      id: signal.id,
      properties: {
        id: signal.id,
        title: signal.title.slice(0, 180),
        type: signal.type,
        severity: boundedSeverity(signal),
        timestamp: signalTemporal(signal).effectiveAt,
        thermal: Number(signal.source.provider.toLowerCase() === 'firms'),
        storm: Number(signal.source.provider.toLowerCase() === 'nhc'),
      },
      geometry: { type: 'Point', coordinates: [signal.location!.longitude, signal.location!.latitude] },
    })),
  }
}

export function earthAreaCollection(signals: Signal[], policy: EarthRenderPolicy, selectedId?: string): FeatureCollection<Polygon | MultiPolygon> {
  return signalAreasGeoJSON(prioritizeSignals(signals.filter((signal) => Boolean(signal.geometry)), policy.areas, selectedId))
}

export function earthForecastTracks(signals: Signal[], policy: EarthRenderPolicy, selectedId?: string): FeatureCollection<LineString, { id: string; title: string }> {
  const candidates = prioritizeSignals(signals.filter((signal) => Array.isArray(signal.attributes.forecastTrack)), policy.areas, selectedId)
  return { type: 'FeatureCollection', features: candidates.flatMap((signal) => {
    const value = signal.attributes.forecastTrack
    if (!Array.isArray(value)) return []
    const coordinates = value.filter((item): item is [number, number] => Array.isArray(item) && item.length >= 2 && typeof item[0] === 'number' && typeof item[1] === 'number' && Math.abs(item[0]) <= 180 && Math.abs(item[1]) <= 90)
    return coordinates.length >= 2 ? [{ type: 'Feature' as const, properties: { id: signal.id, title: signal.title }, geometry: { type: 'LineString' as const, coordinates } }] : []
  }) }
}

type LifeProperties = { id: string; observations: number; itemKind: 'cell' | 'taxon' }

export function earthLifeCollection(life: LifeGlobeSnapshot | undefined, policy: EarthRenderPolicy): FeatureCollection<Point, LifeProperties> {
  const cells = (life?.cells ?? []).slice().sort((a, b) => b.observations - a.observations || a.id.localeCompare(b.id)).slice(0, policy.lifeCells)
  const taxa = (life?.taxa ?? []).slice().sort((a, b) => b.observations - a.observations || a.id.localeCompare(b.id)).slice(0, policy.lifeTaxa)
  return { type: 'FeatureCollection', features: [
    ...cells.map((cell) => ({ type: 'Feature' as const, properties: { id: cell.id, observations: cell.observations, itemKind: 'cell' as const }, geometry: { type: 'Point' as const, coordinates: [cell.longitude, cell.latitude] } })),
    ...taxa.map((taxon) => ({ type: 'Feature' as const, properties: { id: taxon.id, observations: taxon.observations, itemKind: 'taxon' as const }, geometry: { type: 'Point' as const, coordinates: [taxon.longitude, taxon.latitude] } })),
  ] }
}
