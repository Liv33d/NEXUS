import { create } from 'zustand'
import { buildDiscoveries } from '../lib/discovery'
import { db, eraseDatabase, pruneDatabase } from '../lib/db'
import { demoProvider } from '../providers/demo'
import { liveProviders } from '../providers/registry'
import { runProvider } from '../providers/runtime'
import { ProviderError } from '../providers/types'
import type { ObserverPlace } from '../providers/openMeteo'
import { createPlaceWatch, evaluateWatchTriggers, inAppWatchDelivery, placeWatchId } from '../lib/watch'
import { aggregateMemory } from '../lib/memory'
import type { WatchRule, WatchTrigger } from '../types/watch'
import type { Discovery, MemoryBucket, ProviderStatus, Signal, SignalType } from '../types/signal'
import { signalRelevantWithin, signalTemporal } from '../lib/temporal'
import { clearGbifPresentationCache } from '../lib/gbifPresentation'
import { clearLifeContextCache } from '../providers/gbif'
import { discoveryUsesOnlyCurrentEvidence } from '../lib/editorial'

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
  observerPlace?: ObserverPlace
  watches: WatchRule[]
  watchTriggers: WatchTrigger[]
  layerVisibility: Record<SignalType, boolean>
  setView(view: ViewId): void
  observePlace(place: ObserverPlace): void
  watchPlace(place: ObserverPlace): Promise<void>
  unwatchPlace(latitude: number, longitude: number): Promise<void>
  setTimeWindow(window: TimeWindow): void
  selectSignal(id?: string): void
  selectDiscovery(id?: string): void
  setGlobeReady(ready: boolean): void
  toggleLayer(type: SignalType): void
  setLayers(types: SignalType[]): void
  enableLayers(types: SignalType[]): void
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
export const timeWindowSince = (window: TimeWindow, now = Date.now()) => now - windowMs[window]
let activeRefresh: AbortController | undefined
let activeRefreshGeneration = 0
const recentSurprises: string[] = []
const legacyApiCaches = ['nexus-usgs', 'nexus-official-feeds', 'nexus-observer-context', 'nexus-life-context']

async function purgeLegacyApiCaches(): Promise<void> {
  try { await Promise.all(legacyApiCaches.map((name) => caches.delete(name))) } catch { /* CacheStorage is optional. */ }
}

function cachedCopy(signal: Signal): Signal {
  return {
    ...signal,
    source: { ...signal.source, freshness: 'cached' },
    provenance: signal.provenance.some((item) => item.label === 'CACHED') ? signal.provenance : [...signal.provenance, { label: 'CACHED', description: 'Previously retrieved data stored on this device.' }],
  }
}

async function deriveWithSaved(signals: Signal[]): Promise<Discovery[]> {
  let memory: MemoryBucket[] = []
  try { memory = await db.memory.toArray() } catch { /* Baselines remain in learning mode. */ }
  const now = Date.now()
  const derived = buildDiscoveries(signals.filter((signal) => signalRelevantWithin(signal, now - windowMs['7D'], now)), now, memory)
  let saved: Discovery[] = []
  try { saved = await db.discoveries.where('status').equals('saved').toArray() } catch { return derived }
  const savedById = new Map(saved.map((item) => [item.id, item]))
  return [...derived.map((item) => savedById.get(item.id) ?? item), ...saved.filter((item) => !derived.some((candidate) => candidate.id === item.id))]
}

export function protectedEvidenceIds(discoveries: Discovery[]): Set<string> {
  return new Set(discoveries.filter((item) => item.status === 'saved').flatMap((item) => item.signalIds))
}

export function retainProtectedEvidence(current: Signal[], incoming: Signal[], providerId: string, discoveries: Discovery[]): Signal[] {
  const protectedIds = protectedEvidenceIds(discoveries)
  return [...new Map([
    ...current.filter((signal) => signal.source.provider !== providerId || protectedIds.has(signal.id)),
    ...incoming,
  ].map((signal) => [signal.id, signal])).values()]
}

export function caseEvidenceSnapshot(signals: Signal[], discovery: Discovery): Signal[] {
  const ids = new Set(discovery.signalIds)
  return signals.filter((signal) => ids.has(signal.id))
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
  observerPlace: undefined,
  watches: [],
  watchTriggers: [],
  layerVisibility: { earthquake: true, fire: true, weather: true, aircraft: true, satellite: true, 'space-weather': true, media: true, environment: true, infrastructure: true },
  setView: (view) => set({ view, selectedSignalId: undefined, selectedDiscoveryId: undefined }),
  observePlace: (observerPlace) => set({ observerPlace, view: 'observer', selectedSignalId: undefined, selectedDiscoveryId: undefined }),
  watchPlace: async (place) => {
    const watch = createPlaceWatch(place)
    try { await db.watches.put(watch) } catch { /* Keep this-session watch when storage is unavailable. */ }
    set((state) => ({ watches: [watch, ...state.watches.filter((item) => item.id !== watch.id)] }))
  },
  unwatchPlace: async (latitude, longitude) => {
    const id = placeWatchId(latitude, longitude)
    try { await db.watches.delete(id) } catch { /* Remove from memory even if storage is unavailable. */ }
    set((state) => ({ watches: state.watches.filter((watch) => watch.id !== id) }))
  },
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
  enableLayers: (types) => set((state) => {
    const layerVisibility = { ...state.layerVisibility }
    for (const type of types) layerVisibility[type] = true
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
      await purgeLegacyApiCaches()
      await pruneDatabase()
      const [cached, storedStatuses, layerSetting, demoSetting, firmsSetting, watches, watchTriggers] = await Promise.all([
        db.signals.orderBy('timestamp').reverse().limit(3000).toArray(),
        db.providerStatus.toArray(),
        db.settings.get('layers'),
        db.settings.get('demoMode'),
        db.settings.get('firmsMapKey'),
        db.watches.toArray(),
        db.watchTriggers.toArray(),
      ])
      const statuses = { ...get().statuses, ...Object.fromEntries(storedStatuses.map((status) => [status.providerId, {
        ...status,
        state: status.lastSuccess ? 'cached' as const : 'idle' as const,
        message: status.lastSuccess ? 'Stored status; checking source' : undefined,
      }])) }
      const layerVisibility = layerSetting?.value && typeof layerSetting.value === 'object' ? { ...get().layerVisibility, ...layerSetting.value as Partial<Record<SignalType, boolean>> } : get().layerVisibility
      const demoMode = demoSetting?.value === true
      const firmsConfigured = typeof firmsSetting?.value === 'string' && firmsSetting.value.length > 0
      const saved = await db.discoveries.where('status').equals('saved').toArray()
      const loadedIds = new Set(cached.map((signal) => signal.id))
      const protectedSignals = (await db.signals.bulkGet([...protectedEvidenceIds(saved)].filter((id) => !loadedIds.has(id)))).filter((signal): signal is Signal => Boolean(signal))
      const hydrated = [...cached, ...protectedSignals]
      if (hydrated.length) set({ signals: hydrated.map(cachedCopy), discoveries: await deriveWithSaved(hydrated), statuses, layerVisibility, demoMode, firmsConfigured, watches, watchTriggers })
      else set({ statuses, layerVisibility, demoMode, firmsConfigured, watches, watchTriggers })
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
    const generation = ++activeRefreshGeneration
    const isCurrent = () => generation === activeRefreshGeneration && !controller.signal.aborted
    const { timeWindow, demoMode } = get()
    const now = Date.now()
    const context = { since: now - windowMs[timeWindow], until: now, signal: controller.signal }
    set({ isRefreshing: true })

    if (demoMode) {
      const signals = await demoProvider.fetchSignals(context)
      if (!isCurrent()) return
      const previous = get().watchTriggers
      const watchTriggers = get().watches.flatMap((watch) => evaluateWatchTriggers(watch, signals, previous, now))
      try { if (watchTriggers.length) await db.watchTriggers.bulkPut(watchTriggers) } catch { /* In-app trigger history remains in memory. */ }
      if (!isCurrent()) return
      await inAppWatchDelivery.deliver(watchTriggers)
      if (!isCurrent()) return
      const discoveries = await deriveWithSaved(signals)
      if (!isCurrent()) return
      set({ signals, discoveries, watchTriggers, isRefreshing: false, lastRefreshed: Date.now() })
      return
    }

    let discoveryRevision = 0
    const commitProviderBatch = (providerId: string, batch: Signal[]) => {
      if (!isCurrent()) return
      const revision = ++discoveryRevision
      const protectedIds = protectedEvidenceIds(get().discoveries)
      const eligible = retainProtectedEvidence(get().signals, batch, providerId, get().discoveries)
        .filter((signal) => protectedIds.has(signal.id) || signalRelevantWithin(signal, context.since, now))
        .sort((a, b) => signalTemporal(b).effectiveAt - signalTemporal(a).effectiveAt)
      const protectedSignals = eligible.filter((signal) => protectedIds.has(signal.id))
      const liveSignals = eligible.filter((signal) => !protectedIds.has(signal.id)).slice(0, Math.max(0, 5000 - protectedSignals.length))
      const merged = [...liveSignals, ...protectedSignals]
      set({ signals: merged, lastRefreshed: Date.now() })
      void deriveWithSaved(merged).then((discoveries) => {
        if (isCurrent() && revision === discoveryRevision) set({ discoveries })
      })
    }

    const load = async (provider: (typeof liveProviders)[number]): Promise<void> => {
      const loading: ProviderStatus = { ...get().statuses[provider.id], providerId: provider.id, providerName: provider.name, state: 'loading', lastAttempt: now }
      if (isCurrent()) set((state) => ({ statuses: { ...state.statuses, [provider.id]: loading } }))
      try {
        const signals = await runProvider(provider, context)
        if (!isCurrent()) return
        const currentSignals = signals.filter((signal) => signalRelevantWithin(signal, context.since, now))
        const semanticallyLive = currentSignals.some((signal) => signal.source.freshness === 'live')
        const state: ProviderStatus['state'] = semanticallyLive ? 'live' : currentSignals.length ? 'cached' : 'idle'
        const sourceAsOf = currentSignals.reduce((latest, signal) => Math.max(latest, signalTemporal(signal).effectiveAt), 0)
        const status: ProviderStatus = { providerId: provider.id, providerName: provider.name, state, lastAttempt: now, lastSuccess: semanticallyLive ? Date.now() : sourceAsOf || undefined, signalCount: currentSignals.length, message: currentSignals.length ? semanticallyLive ? undefined : 'Checked; source data is delayed or stored' : 'Checked; no current records (coverage not asserted)' }
        if (!isCurrent()) return
        set((state) => ({ statuses: { ...state.statuses, [provider.id]: status } }))
        // Without an explicit complete-coverage envelope, an empty response
        // cannot safely clear the prior provider slice.
        if (currentSignals.length) commitProviderBatch(provider.id, currentSignals)
      } catch (error) {
        if (!isCurrent()) return
        let cached: Signal[] = []
        try { cached = await db.signals.where('source.provider').equals(provider.id).and((signal) => signal.timestamp >= context.since).toArray() } catch { /* Storage unavailable. */ }
        if (!isCurrent()) return
        const providerError = error instanceof ProviderError ? error : undefined
        const state = providerError?.status === 429 ? 'rate-limited' : cached.length ? 'cached' : providerError?.status === 401 || !navigator.onLine ? 'unavailable' : 'error'
        const status: ProviderStatus = { providerId: provider.id, providerName: provider.name, state, lastAttempt: now, lastSuccess: get().statuses[provider.id]?.lastSuccess, retryAt: providerError?.retryAt, signalCount: cached.length, message: cached.length ? 'Live request failed; showing device cache' : providerError?.status === 401 ? 'Optional credential not configured' : 'Temporarily unavailable' }
        if (!isCurrent()) return
        set((current) => ({ statuses: { ...current.statuses, [provider.id]: status } }))
        commitProviderBatch(provider.id, cached.map(cachedCopy))
      }
    }

    await Promise.allSettled(liveProviders.map(load))
    if (!isCurrent()) return
    const deduped = get().signals
    try {
      await db.transaction('rw', db.signals, db.providerStatus, async () => {
        if (!isCurrent()) throw new Error('STALE_REFRESH_GENERATION')
        await db.signals.bulkPut(deduped)
        if (!isCurrent()) throw new Error('STALE_REFRESH_GENERATION')
        await db.providerStatus.bulkPut(Object.values(get().statuses))
        if (!isCurrent()) throw new Error('STALE_REFRESH_GENERATION')
      })
    } catch { /* Continue in memory-only mode. */ }
    if (!isCurrent()) return
    try {
      const retained = await db.signals.where('timestamp').above(now - 30 * 86400000).toArray()
      if (!isCurrent()) return
      const buckets = aggregateMemory(retained, Date.now())
      if (buckets.length) await db.memory.bulkPut(buckets)
    } catch { /* Planetary Memory degrades to this-session learning when IndexedDB is unavailable. */ }
    const previous = get().watchTriggers
    const watchEvidence = deduped.filter((signal) => signalRelevantWithin(signal, context.since, now))
    const watchTriggers = get().watches.flatMap((watch) => evaluateWatchTriggers(watch, watchEvidence, previous, now))
    try { if (watchTriggers.length) await db.watchTriggers.bulkPut(watchTriggers) } catch { /* In-app trigger history remains in memory. */ }
    if (!isCurrent()) return
    await inAppWatchDelivery.deliver(watchTriggers)
    if (!isCurrent()) return
    const discoveries = await deriveWithSaved(deduped)
    if (!isCurrent()) return
    set({ signals: deduped, discoveries, watchTriggers, isRefreshing: false, lastRefreshed: Date.now() })
  },
  saveDiscovery: async (id) => {
    const discovery = get().discoveries.find((item) => item.id === id)
    if (!discovery) return
    const saved = { ...discovery, status: 'saved' as const, savedAt: discovery.savedAt ?? Date.now(), notes: discovery.notes ?? '' }
    const evidence = caseEvidenceSnapshot(get().signals, saved)
    try {
      await db.transaction('rw', db.discoveries, db.signals, async () => {
        if (evidence.length) await db.signals.bulkPut(evidence)
        await db.discoveries.put(saved)
      })
    } catch { /* Keep the case and its in-memory evidence for this session. */ }
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
    activeRefreshGeneration += 1
    try { await eraseDatabase() } catch { /* Storage may already be unavailable. */ }
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith('nexus:')) localStorage.removeItem(key)
    } catch { /* Private browsing may deny localStorage access. */ }
    try {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name.startsWith('nexus-') || name.includes('workbox')).map((name) => caches.delete(name)))
    } catch { /* CacheStorage may be unavailable or already empty. */ }
    recentSurprises.length = 0
    clearGbifPresentationCache()
    clearLifeContextCache()
    set({
      signals: [], discoveries: [], watches: [], watchTriggers: [], observerPlace: undefined, selectedSignalId: undefined, selectedDiscoveryId: undefined,
      demoMode: false, firmsConfigured: false, isRefreshing: false, lastRefreshed: undefined,
      statuses: Object.fromEntries(liveProviders.map((provider) => [provider.id, { providerId: provider.id, providerName: provider.name, state: 'idle' }])),
    })
  },
  surprise: () => {
    const { discoveries, signals, timeWindow, layerVisibility } = get()
    const currentSignals = filterVisibleSignals(signals, timeWindow, layerVisibility)
    const currentIds = new Set(currentSignals.map((signal) => signal.id))
    const pool: Array<Discovery | Signal> = discoveries.filter((item) => item.score >= 35 && discoveryUsesOnlyCurrentEvidence(item, currentIds))
    if (!pool.length) pool.push(...currentSignals.filter((item) => (item.severity ?? 0) >= 35))
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
  return filterVisibleSignals(state.signals, state.timeWindow, state.layerVisibility)
}

export function filterVisibleSignals(signals: Signal[], timeWindow: TimeWindow, layerVisibility: Record<SignalType, boolean>, now = Date.now()): Signal[] {
  const cutoff = now - windowMs[timeWindow]
  return signals.filter((signal) => signalRelevantWithin(signal, cutoff, now) && layerVisibility[signal.type])
}
