import type { IntelligenceEvidence } from '../types/intelligence'
import type { Signal } from '../types/signal'

export interface PresentedEntity {
  id: string
  representative: Signal
  members: Signal[]
  independentProviders: string[]
  evidence: IntelligenceEvidence
}

function identityKeys(signal: Signal): string[] {
  const keys = new Set<string>()
  if (signal.source.upstreamKey) keys.add(`${signal.source.sourceFamily ?? signal.source.provider}:${signal.source.upstreamKey}`)
  for (const ref of signal.source.upstreamRefs ?? []) if (ref.upstreamKey) keys.add(`${ref.sourceFamily}:${ref.upstreamKey}`)
  for (const entity of signal.entities ?? []) if (entity.type === 'EVENT' || entity.type === 'FACILITY') keys.add(`entity:${entity.id}`)
  return [...keys]
}

function terminalFamilies(signal: Signal): string[] {
  const referenced = (signal.source.upstreamRefs ?? []).map((ref) => ref.sourceFamily).filter(Boolean)
  return referenced.length ? referenced : [signal.source.sourceFamily ?? signal.source.provider]
}

function representativeScore(signal: Signal) {
  const official = signal.source.sourceRole === 'official-product' || signal.provenance.some((entry) => entry.label === 'OFFICIAL_SOURCE')
  return Number(official) * 1_000_000 + (signal.severity ?? 0) * 1_000 + signal.timestamp / 1e12
}

/**
 * Consolidates only exact identifiers. Name/place similarity is deliberately
 * excluded: it may create a relationship, but cannot turn two records into one
 * real-world object.
 */
export function buildPresentedEntities(signals: Signal[]): PresentedEntity[] {
  const parents = signals.map((_, index) => index)
  const find = (index: number): number => parents[index] === index ? index : (parents[index] = find(parents[index]!))
  const union = (left: number, right: number) => { const a = find(left); const b = find(right); if (a !== b) parents[Math.max(a, b)] = Math.min(a, b) }
  const owner = new Map<string, number>()
  signals.forEach((signal, index) => {
    for (const key of identityKeys(signal)) {
      const prior = owner.get(key)
      if (prior === undefined) owner.set(key, index)
      else union(prior, index)
    }
  })
  const groups = new Map<number, Signal[]>()
  signals.forEach((signal, index) => { const root = find(index); groups.set(root, [...(groups.get(root) ?? []), signal]) })
  return [...groups.values()].map((members) => {
    const ranked = members.slice().sort((a, b) => representativeScore(b) - representativeScore(a) || a.id.localeCompare(b.id))
    const independentProviders = [...new Set(members.flatMap(terminalFamilies))].sort()
    const representative = ranked[0]!
    const id = identityKeys(representative).sort()[0] ?? `signal:${representative.id}`
    const evidence: IntelligenceEvidence = representative.provenance.some((entry) => entry.label === 'OFFICIAL_SOURCE') ? 'official'
      : independentProviders.length > 1 ? 'corroborated'
      : 'reported'
    return { id, representative, members: members.slice().sort((a, b) => a.id.localeCompare(b.id)), independentProviders, evidence }
  }).sort((a, b) => representativeScore(b.representative) - representativeScore(a.representative) || a.id.localeCompare(b.id))
}

export function presentedEntitySignals(entities: PresentedEntity[]): Signal[] {
  return entities.map((entity) => ({
    ...entity.representative,
    provenance: [...new Map(entity.members.flatMap((member) => member.provenance).map((entry) => [`${entry.label}:${entry.sourceUrl ?? entry.description}`, entry])).values()],
    attributes: {
      ...entity.representative.attributes,
      presentedEntityId: entity.id,
      memberSignalIds: entity.members.map((member) => member.id),
      independentSourceFamilies: entity.independentProviders,
    },
  }))
}
