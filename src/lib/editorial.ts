import type { Discovery, Signal, SignalType } from '../types/signal'

export function discoveryUsesOnlyCurrentEvidence(discovery: Discovery, currentIds: ReadonlySet<string>): boolean {
  return discovery.signalIds.length > 0 && discovery.signalIds.every((id) => currentIds.has(id))
}

function dominantType(discovery: Discovery, signals: Signal[]): SignalType | 'mixed' {
  const types = new Set(signals.filter((signal) => discovery.signalIds.includes(signal.id)).map((signal) => signal.type))
  return types.size === 1 ? [...types][0]! : 'mixed'
}

export function selectEditorialStories(discoveries: Discovery[], signals: Signal[], limit = 5): Discovery[] {
  const eligible = discoveries
    .filter((discovery) => discovery.signalIds.length > 1 || discovery.score >= 61)
    .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt || a.id.localeCompare(b.id))
  const selected: Discovery[] = []
  const entityIds = new Set<string>()
  const domainCounts = new Map<string, number>()
  for (const discovery of eligible) {
    if (selected.length >= limit) break
    if (discovery.entityIds.some((id) => entityIds.has(id))) continue
    const domain = dominantType(discovery, signals)
    if ((domainCounts.get(domain) ?? 0) >= 2) continue
    selected.push(discovery)
    discovery.entityIds.forEach((id) => entityIds.add(id))
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1)
  }
  return selected
}
