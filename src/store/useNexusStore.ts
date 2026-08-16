import { create } from 'zustand'
import { buildDiscoveries } from '../lib/discovery'
import { db, eraseDatabase, pruneDatabase } from '../lib/db'
import { demoProvider } from '../providers/demo'
import { liveProviders } from '../providers/registry'
import { runProvider } from '../providers/runtime'
import { ProviderError } from '../providers/types'
import type { Discovery, ProviderStatus, Signal, SignalType } from '../types/signal'

export type ViewId = 'earth' | 'discover' | 'cases' | 'observer' | 'settings'
export type TimeWindow = 'NOW' | '1H' | '6H' | '24H' | '7D'

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
  isRefreshing: boolean
  lastRefreshed?: number
  firmsConfigured: boolean
  layerVisibility: Record<SignalType, boolean>
  setView(view: ViewId): void
  setTimeWindow(window: TimeWindow): void
  selectSignal(id?: string): void
  selectDiscovery(id?: string): void
  setGlobeReady(ready: boolean): void
  toggleLayer(type: SignalType): void
  setLayers(types: SignalType[]): void
  setDemoMode(enabled: boolean): Promise<void>
  setFirmsKey(key: string): Promise<void>
  initialize(): Promise<void>
  refresh(): Promise<void>
  saveDiscovery(id: string): Promise<void>
  updateCaseNotes(id: string, notes: string): Promise<void>
  removeCase(id: string): Promise<void>
  eraseLocalData(): Promise<void>
  surprise(): Discovery | Signal | undefined
}

const windowMs: Record<TimeWindow, number> = { NOW: 15 * 60000, '1H': 3600000, '6H': 21600000, '24H': 86400000, '7D': 604800000 }
let activeRefresh: AbortController | undefined
const recentSurprises: string[] = []

function cachedCopy(signal: Signal): Signal {
  return {
    ...signal,
    source: { ...signal.source, freshness: 'cached' },
    provenance: signal.provenance.some((item) => item.label === 'CACHED') ? signal.provenance : [...signal.provenance, { label: 'CACHED', description: 'Previously retrieved data stored on this device.' }],
  }
}

async function deriveWithSaved(signals: Signal[]): Promise<Discovery[]> {
  const derived = buildDiscoveries(signals)
  let saved: Discovery[] = []
  try { saved = await db.discoveries.where('status').equals('saved').toArray() } catch { return derived }
  const savedById = new Map(saved.map((item) => [item.id, item]))
  return [...derived.map((item) => savedById.get(item.id) ?? item), ...saved.filter((item) => !derived.some((candidate) => candidate.id === item.id))]
}

export const useNexusStore = create<NexusState>((set, get) => ({
  view: 'earth',
  timeWindow: '24H',
  signals: [],
  discoveries: [],
  statuses: Object.fromEntries(liveProviders.map((provider) => [provider.id, { providerId: provider.id, providerName: provider.name, state: 'idle' }])),
  demoMode: false,
  globeReady: false,
  isRefreshing: false,
  firmsConfigured: false,
  layerVisibility: { earthquake: true, fire: true, weather: true, aircraft: true, satellite: true, 'space-weather': true, media: true, environment: true, infrastructure: true },
  setView: (view) => set({ view, selectedSignalId: undefined, selectedDiscoveryId: undefined }),
  setTimeWindow: (timeWindow) => { set({ timeWindow }); void get().refresh() },
  selectSignal: (selectedSignalId) => set({ selectedSignalId }),
  selectDiscovery: (selectedDiscoveryId) => set({ selectedDiscoveryId, view: selectedDiscoveryId ? 'discover' : get().view }),
  setGlobeReady: (globeReady) => set({ globeReady }),
  toggleLayer: (type) => set((state) => {
    const layerVisibility = { ...state.layerVisibility, [type]: !state.layerVisibility[type] }
    void db.settings.put({ key: 'layers', value: layerVisibility }).catch(() => undefined)
    return { layerVisibility }
  }),
  setLayers: (types) => set((state) => {
    const enabled = new Set(types)
    const layerVisibility = Object.fromEntries(Object.keys(state.layerVisibility).map((type) => [type, enabled.has(type as SignalType)])) as Record<SignalType, boolean>
    void db.settings.put({ key: 'layers', value: layerVisibility }).catch(() => undefined)
    return { layerVisibility }
  }),
  setDemoMode: async (demoMode) => {
    set({ demoMode })
    try { await db.settings.put({ key: 'demoMode', value: demoMode }) } catch { /* Memory-only mode. */ }
    await get().refresh()
  },
  setFirmsKey: async (key) => {
    const normalized = key.trim()
    try {
      if (normalized) await db.settings.put({ key: 'firmsMapKey', value: normalized })
      else await db.settings.delete('firmsMapKey')
    } catch { /* Memory-only mode; the key cannot be retained. */ }
    set({ firmsConfigured: Boolean(normalized) })
    await get().refresh()
  },
  initialize: async () => {
    try {
      await pruneDatabase()
      const [cached, storedStatuses, layerSetting, demoSetting, firmsSetting] = await Promise.all([
        db.signals.orderBy('timestamp').reverse().limit(3000).toArray(),
        db.providerStatus.toArray(),
        db.settings.get('layers'),
        db.settings.get('demoMode'),
        db.settings.get('firmsMapKey'),
      ])
      const statuses = { ...get().statuses, ...Object.fromEntries(storedStatuses.map((status) => [status.providerId, status])) }
      const layerVisibility = layerSetting?.value && typeof layerSetting.value === 'object' ? { ...get().layerVisibility, ...layerSetting.value as Partial<Record<SignalType, boolean>> } : get().layerVisibility
      const demoMode = demoSetting?.value === true
      const firmsConfigured = typeof firmsSetting?.value === 'string' && firmsSetting.value.length > 0
      if (cached.length) set({ signals: cached.map(cachedCopy), discoveries: await deriveWithSaved(cached), statuses, layerVisibility, demoMode, firmsConfigured })
      else set({ statuses, layerVisibility, demoMode, firmsConfigured })
    } catch {
      // Safari private browsing and low-storage conditions can disable IndexedDB.
      // NEXUS remains useful as a live, memory-only experience.
    }
    await get().refresh()
  },
  refresh: async () => {
    activeRefresh?.abort()
    const controller = new AbortController()
    activeRefresh = controller
    const { timeWindow, demoMode } = get()
    const now = Date.now()
    const context = { since: now - windowMs[timeWindow], until: now, signal: controller.signal }
    set({ isRefreshing: true })

    if (demoMode) {
      const signals = await demoProvider.fetchSignals(context)
      set({ signals, discoveries: await deriveWithSaved(signals), isRefreshing: false, lastRefreshed: Date.now() })
      return
    }

    const load = async (provider: (typeof liveProviders)[number]): Promise<Signal[]> => {
      const loading: ProviderStatus = { ...get().statuses[provider.id], providerId: provider.id, providerName: provider.name, state: 'loading', lastAttempt: now }
      set((state) => ({ statuses: { ...state.statuses, [provider.id]: loading } }))
      try {
        const signals = await runProvider(provider, context)
        if (controller.signal.aborted) return []
        const status: ProviderStatus = { providerId: provider.id, providerName: provider.name, state: 'live', lastAttempt: now, lastSuccess: Date.now(), signalCount: signals.length, message: signals.length ? undefined : 'Connected; no qualifying signals' }
        try { await db.signals.bulkPut(signals); await db.providerStatus.put(status) } catch { /* Continue in memory-only mode. */ }
        set((state) => ({ statuses: { ...state.statuses, [provider.id]: status } }))
        return signals
      } catch (error) {
        if (controller.signal.aborted) return []
        let cached: Signal[] = []
        try { cached = await db.signals.where('source.provider').equals(provider.id).and((signal) => signal.timestamp >= context.since).toArray() } catch { /* Storage unavailable. */ }
        const providerError = error instanceof ProviderError ? error : undefined
        const state = providerError?.status === 429 ? 'rate-limited' : cached.length ? 'cached' : providerError?.status === 401 || !navigator.onLine ? 'unavailable' : 'error'
        const status: ProviderStatus = { providerId: provider.id, providerName: provider.name, state, lastAttempt: now, lastSuccess: get().statuses[provider.id]?.lastSuccess, retryAt: providerError?.retryAt, signalCount: cached.length, message: cached.length ? 'Live request failed; showing device cache' : providerError?.status === 401 ? 'Optional credential not configured' : 'Temporarily unavailable' }
        try { await db.providerStatus.put(status) } catch { /* Storage unavailable. */ }
        set((current) => ({ statuses: { ...current.statuses, [provider.id]: status } }))
        return cached.map(cachedCopy)
      }
    }

    const batches = await Promise.all(liveProviders.map(load))
    if (controller.signal.aborted) return
    const deduped = [...new Map(batches.flat().map((signal) => [signal.id, signal])).values()]
      .filter((signal) => signal.timestamp >= context.since || (signal.endTime ?? 0) >= context.since)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5000)
    set({ signals: deduped, discoveries: await deriveWithSaved(deduped), isRefreshing: false, lastRefreshed: Date.now() })
  },
  saveDiscovery: async (id) => {
    const discovery = get().discoveries.find((item) => item.id === id)
    if (!discovery) return
    const saved = { ...discovery, status: 'saved' as const, savedAt: discovery.savedAt ?? Date.now(), notes: discovery.notes ?? '' }
    try { await db.discoveries.put(saved) } catch { /* Keep the case for this session. */ }
    set((state) => ({ discoveries: state.discoveries.map((item) => item.id === id ? saved : item) }))
  },
  updateCaseNotes: async (id, notes) => {
    const discovery = get().discoveries.find((item) => item.id === id && item.status === 'saved')
    if (!discovery) return
    const updated = { ...discovery, notes: notes.slice(0, 10_000) }
    try { await db.discoveries.put(updated) } catch { /* Keep notes for this session. */ }
    set((state) => ({ discoveries: state.discoveries.map((item) => item.id === id ? updated : item) }))
  },
  removeCase: async (id) => {
    try { await db.discoveries.delete(id) } catch { /* Storage may be unavailable. */ }
    const liveIds = new Set(buildDiscoveries(get().signals).map((item) => item.id))
    set((state) => ({ discoveries: state.discoveries.flatMap((item) => item.id !== id ? [item] : liveIds.has(id) ? [{ ...item, status: 'new' as const, savedAt: undefined, notes: undefined }] : []) }))
  },
  eraseLocalData: async () => {
    activeRefresh?.abort()
    try { await eraseDatabase() } catch { /* Storage may already be unavailable. */ }
    try {
      for (const key of ['nexus:radar', 'nexus:satellite', 'nexus:lighting', 'nexus:performance', 'nexus:autoRotate', 'nexus:atmosphere', 'nexus:labels', 'nexus:mapTheme', 'nexus:observerPlaces']) localStorage.removeItem(key)
    } catch { /* Private browsing may deny localStorage access. */ }
    recentSurprises.length = 0
    set({
      signals: [], discoveries: [], selectedSignalId: undefined, selectedDiscoveryId: undefined,
      demoMode: false, firmsConfigured: false, isRefreshing: false, lastRefreshed: undefined,
      statuses: Object.fromEntries(liveProviders.map((provider) => [provider.id, { providerId: provider.id, providerName: provider.name, state: 'idle' }])),
    })
  },
  surprise: () => {
    const { discoveries, signals } = get()
    const pool: Array<Discovery | Signal> = discoveries.filter((item) => item.score >= 35)
    if (!pool.length) pool.push(...signals.filter((item) => (item.severity ?? 0) >= 35))
    if (!pool.length) return undefined
    const candidates = pool.filter((item) => !recentSurprises.includes(item.id))
    const available = candidates.length ? candidates : pool
    const seed = Math.floor(Date.now() / (15 * 60000))
    const result = available[seed % available.length]
    if (result) {
      recentSurprises.push(result.id)
      if (recentSurprises.length > 5) recentSurprises.shift()
    }
    return result
  },
}))

export function selectVisibleSignals(state: NexusState): Signal[] {
  const cutoff = Date.now() - windowMs[state.timeWindow]
  return state.signals.filter((signal) => (signal.timestamp >= cutoff || (signal.endTime ?? 0) >= cutoff) && state.layerVisibility[signal.type])
}
