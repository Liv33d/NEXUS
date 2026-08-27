import type { ProviderStatus } from '../types/signal'

export type DataTruthState = 'updating' | 'live' | 'live-stored' | 'stored' | 'limited' | 'demo'

export interface GlobalDataTruth {
  state: DataTruthState
  liveSources: number
  asOf?: number
}

export function deriveGlobalDataTruth(
  statuses: Record<string, ProviderStatus>,
  cadences: Record<string, number>,
  options: { refreshing: boolean; online: boolean; demo: boolean; hasStoredSignals: boolean; now?: number },
): GlobalDataTruth {
  if (options.demo) return { state: 'demo', liveSources: 0 }
  const now = options.now ?? Date.now()
  const values = Object.values(statuses)
  const recentLive = options.online ? values.filter((status) => {
    if (status.state !== 'live' || !status.lastSuccess) return false
    const maximumAge = Math.max(15 * 60_000, 2 * (cadences[status.providerId] ?? 15 * 60_000))
    return now - status.lastSuccess <= maximumAge
  }) : []
  const asOf = values.reduce<number | undefined>((latest, status) => status.lastSuccess && (!latest || status.lastSuccess > latest) ? status.lastSuccess : latest, undefined)
  const hasStored = options.hasStoredSignals || values.some((status) => status.state === 'cached') || values.some((status) => status.state === 'live' && !recentLive.includes(status))
  if (options.refreshing && recentLive.length === 0) return { state: 'updating', liveSources: 0, asOf }
  if (recentLive.length > 0) return { state: hasStored ? 'live-stored' : 'live', liveSources: recentLive.length, asOf }
  if (hasStored) return { state: 'stored', liveSources: 0, asOf }
  return { state: 'limited', liveSources: 0, asOf }
}
