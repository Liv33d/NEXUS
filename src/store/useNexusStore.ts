import { create } from 'zustand'
import { buildDiscoveries } from '../lib/discovery'
import { db, pruneDatabase } from '../lib/db'
import { providerById } from '../providers/registry'
import type { Discovery, ProviderStatus, Signal, SignalType } from '../types/signal'

export type ViewId = 'earth' | 'discover' | 'cases' | 'observer' | 'settings'
export type TimeWindow = '1H' | '6H' | '24H' | '7D'

interface NexusState {
  view: ViewId
  timeWindow: TimeWindow
  signals: Signal[]
  discoveries: Discovery[]
  selectedSignalId?: string
  selectedDiscoveryId?: string
  statuses: Record<string, ProviderStatus>
  demoMode: boolean
  globeReady: boolean
  layerVisibility: Record<SignalType, boolean>
  setView(view: ViewId): void
  setTimeWindow(window: TimeWindow): void
  selectSignal(id?: string): void
  selectDiscovery(id?: string): void
  setGlobeReady(ready: boolean): void
  toggleLayer(type: SignalType): void
  initialize(): Promise<void>
  refresh(): Promise<void>
  saveDiscovery(id: string): Promise<void>
  surprise(): Discovery | Signal | undefined
}

const windowMs: Record<TimeWindow, number> = { '1H': 3600000, '6H': 21600000, '24H': 86400000, '7D': 604800000 }

export const useNexusStore = create<NexusState>((set, get) => ({
  view: 'earth',
  timeWindow: '24H',
  signals: [],
  discoveries: [],
  statuses: {},
  demoMode: false,
  globeReady: false,
  layerVisibility: { earthquake: true, fire: true, weather: true, aircraft: true, satellite: true, 'space-weather': true, media: true, environment: true, infrastructure: true },
  setView: (view) => set({ view, selectedSignalId: undefined, selectedDiscoveryId: undefined }),
  setTimeWindow: (timeWindow) => { set({ timeWindow }); void get().refresh() },
  selectSignal: (selectedSignalId) => set({ selectedSignalId }),
  selectDiscovery: (selectedDiscoveryId) => set({ selectedDiscoveryId, view: selectedDiscoveryId ? 'discover' : get().view }),
  setGlobeReady: (globeReady) => set({ globeReady }),
  toggleLayer: (type) => set((state) => ({ layerVisibility: { ...state.layerVisibility, [type]: !state.layerVisibility[type] } })),
  initialize: async () => {
    await pruneDatabase()
    const cached = await db.signals.orderBy('timestamp').reverse().limit(2000).toArray()
    const saved = await db.discoveries.where('status').equals('saved').toArray()
    if (cached.length) set({ signals: cached, discoveries: [...buildDiscoveries(cached), ...saved.filter((item) => !buildDiscoveries(cached).some((derived) => derived.id === item.id))] })
    await get().refresh()
  },
  refresh: async () => {
    const { timeWindow } = get()
    const now = Date.now()
    const context = { since: now - windowMs[timeWindow], until: now }
    const load = async (providerId: 'usgs' | 'demo') => {
      const provider = providerById.get(providerId)!
      set((state) => ({ statuses: { ...state.statuses, [providerId]: { providerId, state: 'loading', lastAttempt: now } } }))
      try {
        const signals = await provider.fetchSignals(context)
        await db.signals.bulkPut(signals)
        set((state) => ({ statuses: { ...state.statuses, [providerId]: { providerId, state: providerId === 'demo' ? 'cached' : 'live', lastAttempt: now, lastSuccess: Date.now(), message: providerId === 'demo' ? 'Representative demonstration data' : undefined } } }))
        return signals
      } catch (error) {
        set((state) => ({ statuses: { ...state.statuses, [providerId]: { providerId, state: 'error', lastAttempt: now, message: error instanceof Error ? error.message : 'Provider unavailable' } } }))
        return []
      }
    }
    const [live, demo] = await Promise.all([load('usgs'), load('demo')])
    const demoMode = !live.length
    const combined = demoMode ? demo : [...live, ...demo]
    const filtered = combined.filter((signal) => signal.timestamp >= context.since)
    set({ signals: filtered, discoveries: buildDiscoveries(filtered), demoMode })
  },
  saveDiscovery: async (id) => {
    const discovery = get().discoveries.find((item) => item.id === id)
    if (!discovery) return
    const saved = { ...discovery, status: 'saved' as const }
    await db.discoveries.put(saved)
    set((state) => ({ discoveries: state.discoveries.map((item) => item.id === id ? saved : item) }))
  },
  surprise: () => {
    const { discoveries, signals } = get()
    const pool: Array<Discovery | Signal> = discoveries.filter((item) => item.score >= 35)
    if (!pool.length) pool.push(...signals.filter((item) => (item.severity ?? 0) >= 35))
    if (!pool.length) return undefined
    const daySeed = new Date().getUTCDate() + new Date().getUTCHours()
    return pool[daySeed % pool.length]
  },
}))

export function selectVisibleSignals(state: NexusState): Signal[] {
  const cutoff = Date.now() - windowMs[state.timeWindow]
  return state.signals.filter((signal) => signal.timestamp >= cutoff && state.layerVisibility[signal.type])
}
