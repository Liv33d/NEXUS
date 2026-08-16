import { areNeighborCells, getResolution } from 'h3-js'
import type { Discovery, Relationship, Signal } from '../types/signal'
import { clamp, severityLabel } from './signal'
import { distanceKm, weightedCenter } from './geo'

const MAX_DISTANCE_KM = 300
const MAX_TIME_MS = 6 * 60 * 60 * 1000

export function buildRelationships(signals: Signal[]): Relationship[] {
  const relationships: Relationship[] = []
  const located = signals.filter((signal) => signal.location).sort((a, b) => a.timestamp - b.timestamp)
  const buckets = new Map<string, Signal[]>()
  const cellDegrees = 4
  const bucketKey = (latitude: number, longitude: number, time: number) => `${Math.floor((latitude + 90) / cellDegrees)}:${Math.floor((longitude + 180) / cellDegrees)}:${Math.floor(time / MAX_TIME_MS)}`
  for (const b of located) {
    if (!b.location) continue
    const latCell = Math.floor((b.location.latitude + 90) / cellDegrees)
    const lngCell = Math.floor((b.location.longitude + 180) / cellDegrees)
    const timeCell = Math.floor(b.timestamp / MAX_TIME_MS)
    let links = 0
    for (let latOffset = -1; latOffset <= 1 && links < 12; latOffset += 1) {
      for (let lngOffset = -1; lngOffset <= 1 && links < 12; lngOffset += 1) {
        for (let timeOffset = -1; timeOffset <= 1 && links < 12; timeOffset += 1) {
          const wrappedLng = (lngCell + lngOffset + Math.ceil(360 / cellDegrees)) % Math.ceil(360 / cellDegrees)
          const candidates = buckets.get(`${latCell + latOffset}:${wrappedLng}:${timeCell + timeOffset}`) ?? []
          for (let candidateIndex = candidates.length - 1; candidateIndex >= 0 && links < 12; candidateIndex -= 1) {
            const a = candidates[candidateIndex]
            if (!a?.location) continue
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
            links += 1
          }
        }
      }
    }
    const key = bucketKey(b.location.latitude, b.location.longitude, b.timestamp)
    const bucket = buckets.get(key) ?? []
    bucket.push(b)
    if (bucket.length > 80) bucket.shift()
    buckets.set(key, bucket)
    if (relationships.length >= 4000) break
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
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    const current = parent.get(id) ?? id
    if (current === id) { parent.set(id, id); return id }
    const root = find(current)
    parent.set(id, root)
    return root
  }
  const union = (a: string, b: string): void => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootB, rootA)
  }
  for (const relationship of relationships) {
    union(relationship.sourceSignalId, relationship.targetSignalId)
  }
  for (const signal of recent.filter((item) => (item.severity ?? 0) >= 60)) {
    find(signal.id)
  }
  const groups = new Map<string, Set<string>>()
  for (const id of parent.keys()) {
    const root = find(id)
    const set = groups.get(root) ?? new Set<string>()
    set.add(id)
    groups.set(root, set)
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
