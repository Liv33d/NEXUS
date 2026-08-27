import { areNeighborCells, getResolution } from 'h3-js'
import type { Discovery, MemoryBucket, Relationship, Signal } from '../types/signal'
import { clamp, severityLabel } from './signal'
import { distanceKm, weightedCenter } from './geo'
import { deviationWeight, discoveryMemory } from './memory'
import { discoveryPlainLanguage } from './context'
import { signalCorrelationAnchor, signalRelevantWithin, signalTemporal, temporalDistanceMs } from './temporal'

interface PairPolicy {
  maxDistanceKm: number
  maxTimeMs: number
  maxClusterDiameterKm: number
  clusterEligible: boolean
}

function pairPolicy(a: Signal, b: Signal): PairPolicy | undefined {
  if (a.source.upstreamKey && a.source.upstreamKey === b.source.upstreamKey) {
    return { maxDistanceKm: 500, maxTimeMs: 30 * 86_400_000, maxClusterDiameterKm: 500, clusterEligible: true }
  }
  const pair = [a.type, b.type].sort().join(':')
  if (pair === 'earthquake:earthquake') return { maxDistanceKm: 100, maxTimeMs: 24 * 3_600_000, maxClusterDiameterKm: 200, clusterEligible: true }
  if (pair === 'fire:fire') return { maxDistanceKm: 50, maxTimeMs: 24 * 3_600_000, maxClusterDiameterKm: 100, clusterEligible: true }
  if (pair === 'weather:weather') return { maxDistanceKm: 300, maxTimeMs: 6 * 3_600_000, maxClusterDiameterKm: 400, clusterEligible: true }
  if (pair === 'environment:environment') return { maxDistanceKm: 150, maxTimeMs: 24 * 3_600_000, maxClusterDiameterKm: 250, clusterEligible: true }
  if (['aircraft:media', 'aircraft:satellite', 'media:satellite'].includes(pair)) return { maxDistanceKm: 250, maxTimeMs: 6 * 3_600_000, maxClusterDiameterKm: 350, clusterEligible: true }
  if (a.type === b.type) return { maxDistanceKm: 75, maxTimeMs: 3 * 3_600_000, maxClusterDiameterKm: 125, clusterEligible: true }
  // Different phenomena may be worth inspecting together, but proximity alone
  // must not turn them into one Discovery.
  if (pair === 'fire:weather') return { maxDistanceKm: 100, maxTimeMs: 6 * 3_600_000, maxClusterDiameterKm: 100, clusterEligible: false }
  return undefined
}

export function buildRelationships(signals: Signal[]): Relationship[] {
  const relationships: Relationship[] = []
  const referenceAt = signals.reduce((latest, signal) => Math.max(latest, signal.source.retrievedAt), 0)
  const relationTime = (signal: Signal) => signalCorrelationAnchor(signal, referenceAt)
  const located = signals.filter((signal) => signal.location).sort((a, b) => relationTime(a) - relationTime(b) || a.id.localeCompare(b.id))
  const buckets = new Map<string, Signal[]>()
  const cellDegrees = 4
  const longitudeCells = Math.ceil(360 / cellDegrees)
  const latitudeRadius = Math.ceil(500 / (111.32 * cellDegrees))
  const longitudeCell = (longitude: number) => ((Math.floor((longitude + 180) / cellDegrees) % longitudeCells) + longitudeCells) % longitudeCells
  const bucketKey = (latitude: number, longitude: number) => `${Math.floor((latitude + 90) / cellDegrees)}:${longitudeCell(longitude)}`
  for (const b of located) {
    if (!b.location) continue
    const latCell = Math.floor((b.location.latitude + 90) / cellDegrees)
    const lngCell = longitudeCell(b.location.longitude)
    const maxAbsoluteLatitude = Math.min(90, Math.abs(b.location.latitude) + latitudeRadius * cellDegrees)
    const minimumCosine = Math.abs(Math.cos(maxAbsoluteLatitude * Math.PI / 180))
    const longitudeRadius = minimumCosine < 0.01
      ? Math.floor(longitudeCells / 2)
      : Math.min(Math.floor(longitudeCells / 2), Math.ceil(500 / (111.32 * minimumCosine * cellDegrees)))
    let links = 0
    const compared = new Set<string>()
    for (let latOffset = -latitudeRadius; latOffset <= latitudeRadius && links < 12; latOffset += 1) {
      for (let lngOffset = -longitudeRadius; lngOffset <= longitudeRadius && links < 12; lngOffset += 1) {
        const wrappedLng = (lngCell + lngOffset + longitudeCells) % longitudeCells
        const candidates = buckets.get(`${latCell + latOffset}:${wrappedLng}`) ?? []
        for (let candidateIndex = candidates.length - 1; candidateIndex >= 0 && links < 12; candidateIndex -= 1) {
          const a = candidates[candidateIndex]
          if (!a?.location || compared.has(a.id)) continue
          compared.add(a.id)
          const policy = pairPolicy(a, b)
          if (!policy) continue
          const timeDeltaMinutes = temporalDistanceMs(a, b) / 60000
          if (timeDeltaMinutes > policy.maxTimeMs / 60000) continue
          const distance = distanceKm(a.location, b.location)
          const sameCell = Boolean(a.location.h3Index && b.location.h3Index && a.location.h3Index === b.location.h3Index)
          const neighboring = Boolean(a.location.h3Index && b.location.h3Index && getResolution(a.location.h3Index) === getResolution(b.location.h3Index) && areNeighborCells(a.location.h3Index, b.location.h3Index))
          if (distance > policy.maxDistanceKm && !sameCell && !neighboring) continue
          const sourceSignalId = a.id.localeCompare(b.id) <= 0 ? a.id : b.id
          const targetSignalId = sourceSignalId === a.id ? b.id : a.id
          const sameUpstream = Boolean(a.source.upstreamKey && a.source.upstreamKey === b.source.upstreamKey)
          relationships.push({
            id: `${sourceSignalId}:${targetSignalId}`,
            sourceSignalId,
            targetSignalId,
            kind: sameUpstream ? 'entity' : sameCell || neighboring ? 'cell' : 'spatial',
            distanceKm: Math.round(distance),
            timeDeltaMinutes: Math.round(timeDeltaMinutes),
            reason: sameUpstream ? 'Signals reference the same upstream event identifier.' : `Signals occurred within ${Math.round(distance)} km and ${Math.round(timeDeltaMinutes)} minutes of one another.`,
            confidence: sameUpstream ? .99 : clamp(1 - distance / Math.max(1, policy.maxDistanceKm * 2) - timeDeltaMinutes / Math.max(1, policy.maxTimeMs / 30_000), 0.1, 0.95),
          })
          links += 1
        }
      }
    }
    const key = bucketKey(b.location.latitude, b.location.longitude)
    const bucket = buckets.get(key) ?? []
    bucket.push(b)
    buckets.set(key, bucket)
    if (relationships.length >= 4000) break
  }
  return relationships
}

function relationshipSignals(relationship: Relationship, byId: Map<string, Signal>): [Signal, Signal] | undefined {
  const a = byId.get(relationship.sourceSignalId)
  const b = byId.get(relationship.targetSignalId)
  return a && b ? [a, b] : undefined
}

function buildAnchorGroups(signals: Signal[], relationships: Relationship[]): Set<string>[] {
  const byId = new Map(signals.map((signal) => [signal.id, signal]))
  const direct = new Map<string, Relationship[]>()
  for (const relationship of relationships) {
    const pair = relationshipSignals(relationship, byId)
    if (!pair || !pairPolicy(...pair)?.clusterEligible) continue
    for (const id of [relationship.sourceSignalId, relationship.targetSignalId]) direct.set(id, [...(direct.get(id) ?? []), relationship])
  }
  const ranked = [...signals].sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0) || signalTemporal(b).effectiveAt - signalTemporal(a).effectiveAt || a.id.localeCompare(b.id))
  const assigned = new Set<string>()
  const groups: Set<string>[] = []
  for (const anchor of ranked) {
    if (assigned.has(anchor.id)) continue
    const members = [anchor]
    const candidates = (direct.get(anchor.id) ?? []).flatMap((relationship) => {
      const otherId = relationship.sourceSignalId === anchor.id ? relationship.targetSignalId : relationship.sourceSignalId
      const other = byId.get(otherId)
      return other ? [{ other, relationship }] : []
    }).sort((a, b) => b.relationship.confidence - a.relationship.confidence || (b.other.severity ?? 0) - (a.other.severity ?? 0) || a.other.id.localeCompare(b.other.id))
    for (const { other } of candidates) {
      if (assigned.has(other.id)) continue
      const policy = pairPolicy(anchor, other)
      if (!policy?.clusterEligible || !anchor.location || !other.location) continue
      const withinDiameter = members.every((member) => member.location && distanceKm(member.location, other.location!) <= policy.maxClusterDiameterKm)
      if (withinDiameter) members.push(other)
    }
    if (members.length > 1 || (anchor.severity ?? 0) >= 60) {
      const group = new Set(members.map((member) => member.id))
      groups.push(group)
      group.forEach((id) => assigned.add(id))
    }
  }
  return groups
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

function terminalSourceFamilies(signal: Signal): string[] {
  if (signal.source.sourceRole === 'aggregator' && signal.source.upstreamRefs?.length) {
    return signal.source.upstreamRefs.map((reference) => reference.sourceFamily)
  }
  return [signal.source.sourceFamily ?? signal.source.provider]
}

export function buildDiscoveries(signals: Signal[], now = Date.now(), memoryBuckets: MemoryBucket[] = []): Discovery[] {
  const recent = signals.filter((signal) => signalRelevantWithin(signal, now - 7 * 86400000, now))
  const relationships = buildRelationships(recent)
  const groups = buildAnchorGroups(recent, relationships)
  return groups.map((ids) => {
    const members = recent.filter((signal) => ids.has(signal.id))
    const memberRelationships = relationships.filter((relationship) => ids.has(relationship.sourceSignalId) && ids.has(relationship.targetSignalId))
    const sourceDiversity = new Set(members.flatMap(terminalSourceFamilies)).size
    const typeDiversity = new Set(members.map((signal) => signal.type)).size
    const averageSeverity = members.reduce((sum, signal) => sum + (signal.severity ?? 20), 0) / members.length
    const maximumSeverity = Math.max(...members.map((signal) => signal.severity ?? 20))
    const evidenceItems = new Set(members.map((signal) => signal.source.upstreamKey ?? signal.id)).size
    const evidenceWeight = Math.min(Math.log2(evidenceItems + 1) * 7, 21)
    const diversityWeight = Math.max(0, sourceDiversity - 1) * 12 + Math.max(0, typeDiversity - 1) * 5
    const currentMembers = members.filter((signal) => signalRelevantWithin(signal, now - 86400000, now))
    const memory = discoveryMemory(currentMembers.length ? currentMembers : members, memoryBuckets, now)
    const baselineWeight = deviationWeight(memory.deviationPercent)
    const rawComponents = {
      typicalSeverity: averageSeverity * 0.32,
      peakSeverity: maximumSeverity * 0.24,
      evidence: evidenceWeight,
      diversity: diversityWeight,
      deviation: baselineWeight,
    }
    const rawScore = Object.values(rawComponents).reduce((sum, value) => sum + value, 0)
    const score = Math.round(clamp(rawScore))
    const componentScale = rawScore > 100 ? 100 / rawScore : 1
    const scoreComponents = {
      typicalSeverity: Math.round(rawComponents.typicalSeverity * componentScale),
      peakSeverity: Math.round(rawComponents.peakSeverity * componentScale),
      evidence: Math.round(rawComponents.evidence * componentScale),
      diversity: Math.round(rawComponents.diversity * componentScale),
      deviation: Math.round(rawComponents.deviation * componentScale),
    }
    const center = weightedCenter(members.flatMap((signal) => signal.location ? [signal.location] : []))
    const types = [...new Set(members.map((signal) => signal.type))].sort()
    return {
      id: `discovery-${[...ids].sort().join('-')}`,
      createdAt: Math.min(...members.map((signal) => signalTemporal(signal).effectiveAt)),
      title: discoveryName(members),
      description: `${discoveryPlainLanguage(members.length, sourceDiversity, undefined)} Nearby signals may be related, but proximity alone does not establish a cause.`,
      score,
      scoreComponents,
      memory,
      level: severityLabel(score),
      center,
      signalIds: [...ids],
      entityIds: [...new Set(members.flatMap((signal) => signal.entities?.map((entity) => entity.id) ?? []))],
      relationships: memberRelationships,
      status: 'new' as const,
      tags: types,
    }
  }).filter((discovery) => {
    const members = recent.filter((signal) => discovery.signalIds.includes(signal.id))
    const maximumSeverity = Math.max(...members.map((signal) => signal.severity ?? 0))
    const sourceDiversity = new Set(members.flatMap(terminalSourceFamilies)).size
    // A feed item is not automatically a discovery. Promote only major
    // single events, meaningful clusters, or genuine cross-source convergence.
    return maximumSeverity >= 80 || members.length >= 3 || sourceDiversity >= 2
  }).sort((a, b) => b.score - a.score).slice(0, 12)
}
