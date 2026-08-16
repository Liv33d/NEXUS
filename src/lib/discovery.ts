import { areNeighborCells, getResolution } from 'h3-js'
import type { Discovery, Relationship, Signal } from '../types/signal'
import { clamp, severityLabel } from './signal'
import { distanceKm, weightedCenter } from './geo'

const MAX_DISTANCE_KM = 300
const MAX_TIME_MS = 6 * 60 * 60 * 1000

export function buildRelationships(signals: Signal[]): Relationship[] {
  const relationships: Relationship[] = []
  const located = signals.filter((signal) => signal.location)
  for (let i = 0; i < located.length; i += 1) {
    for (let j = i + 1; j < located.length; j += 1) {
      const a = located[i]
      const b = located[j]
      if (!a?.location || !b?.location) continue
      const timeDeltaMinutes = Math.abs(a.timestamp - b.timestamp) / 60000
      if (timeDeltaMinutes > MAX_TIME_MS / 60000) continue
      const distance = distanceKm(a.location, b.location)
      const sameCell = a.location.h3Index === b.location.h3Index
      const neighboring = Boolean(
        a.location.h3Index
        && b.location.h3Index
        && getResolution(a.location.h3Index) === getResolution(b.location.h3Index)
        && areNeighborCells(a.location.h3Index, b.location.h3Index),
      )
      if (distance > MAX_DISTANCE_KM && !sameCell && !neighboring) continue
      relationships.push({
        id: `${a.id}:${b.id}`,
        sourceSignalId: a.id,
        targetSignalId: b.id,
        kind: sameCell || neighboring ? 'cell' : distance < MAX_DISTANCE_KM ? 'spatial' : 'temporal',
        distanceKm: Math.round(distance),
        timeDeltaMinutes: Math.round(timeDeltaMinutes),
        reason: `Signals occurred within ${Math.round(distance)} km and ${Math.round(timeDeltaMinutes)} minutes of one another.`,
        confidence: clamp(1 - distance / 600 - timeDeltaMinutes / 720, 0.1, 0.95),
      })
    }
  }
  return relationships
}

function discoveryName(signals: Signal[]): string {
  const strongest = [...signals].sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0))[0]
  const place = strongest?.entities?.find((entity) => entity.type === 'LOCATION' || entity.type === 'REGION')?.name
    ?? strongest?.title.split(' — ').at(-1)
    ?? 'Selected Region'
  const types = new Set(signals.map((signal) => signal.type))
  if (types.size > 1) return `Converging Signals Near ${place}`
  const type = strongest?.type
  if (type === 'earthquake') return `Elevated Seismic Activity Near ${place}`
  if (type === 'fire') return `Significant Thermal Activity Near ${place}`
  if (type === 'aircraft') return `Unusual Aviation Activity Near ${place}`
  if (type === 'weather') return `Severe Weather Activity Near ${place}`
  return `Unusual Activity Near ${place}`
}

export function buildDiscoveries(signals: Signal[], now = Date.now()): Discovery[] {
  const recent = signals.filter((signal) => now - signal.timestamp <= 7 * 86400000)
  const relationships = buildRelationships(recent)
  const groups = new Map<string, Set<string>>()
  for (const relationship of relationships) {
    const root = [...groups.entries()].find(([, ids]) => ids.has(relationship.sourceSignalId) || ids.has(relationship.targetSignalId))?.[0]
      ?? relationship.sourceSignalId
    const set = groups.get(root) ?? new Set<string>()
    set.add(relationship.sourceSignalId)
    set.add(relationship.targetSignalId)
    groups.set(root, set)
  }
  for (const signal of recent.filter((item) => (item.severity ?? 0) >= 60)) {
    if (![...groups.values()].some((set) => set.has(signal.id))) groups.set(signal.id, new Set([signal.id]))
  }
  return [...groups.values()].map((ids) => {
    const members = recent.filter((signal) => ids.has(signal.id))
    const memberRelationships = relationships.filter((relationship) => ids.has(relationship.sourceSignalId) && ids.has(relationship.targetSignalId))
    const sourceDiversity = new Set(members.map((signal) => signal.source.provider)).size
    const averageSeverity = members.reduce((sum, signal) => sum + (signal.severity ?? 20), 0) / members.length
    const score = Math.round(clamp(averageSeverity * 0.55 + Math.min(members.length * 6, 24) + Math.min(sourceDiversity * 8, 24)))
    const center = weightedCenter(members.flatMap((signal) => signal.location ? [signal.location] : []))
    const types = [...new Set(members.map((signal) => signal.type))]
    return {
      id: `discovery-${[...ids].sort().join('-')}`,
      createdAt: Math.min(...members.map((signal) => signal.timestamp)),
      title: discoveryName(members),
      description: `${members.length} observable signal${members.length === 1 ? '' : 's'} across ${sourceDiversity} source${sourceDiversity === 1 ? '' : 's'}. Correlation indicates proximity, not causation.`,
      score,
      level: severityLabel(score),
      center,
      signalIds: [...ids],
      entityIds: [...new Set(members.flatMap((signal) => signal.entities?.map((entity) => entity.id) ?? []))],
      relationships: memberRelationships,
      status: 'new' as const,
      tags: types,
    }
  }).sort((a, b) => b.score - a.score)
}
