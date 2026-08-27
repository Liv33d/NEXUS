import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, CloudRain, Globe2, Layers3, LoaderCircle, PawPrint } from 'lucide-react'
import { BottomNav, TopBar } from './components/Chrome'
import { CasesPage, DiscoverPage, ObserverPage, SearchPanel, SurpriseButton } from './components/Pages'
import SettingsPage, { type PerformanceMode } from './components/SettingsPage'
import { IntelligenceInspector, type InformationDensity } from './components/IntelligenceInspector'
import { TimeControl } from './components/TimeControl'
import { ReplayControl } from './components/ReplayControl'
import { filterVisibleSignals, timeWindowSince, useNexusStore } from './store/useNexusStore'
import type { Discovery, Signal } from './types/signal'
import { clampGeographicView, DEFAULT_GEOGRAPHIC_VIEW, type GeographicView } from './lib/geography'
import { fetchLifeGlobeSnapshot, lifeGlobeCacheKey, type LifeGlobeSnapshot } from './lib/lifeGlobe'
import { allLayerIds, layerPresets, layerSupportsSignal, livingEarthLayerIds, nexusLayers, visibleWithLayers, type LayerCategory, type NexusLayerId } from './lib/layers'
import { discoveryToIntelligence, ecologicalClusterToIntelligence, lifeTaxonToIntelligence, searchedPlaceToIntelligence, signalClusterToIntelligence, signalToIntelligence } from './lib/intelligence'
import type { NexusIntelligenceObject } from './types/intelligence'
import { deriveGlobalDataTruth } from './lib/dataTruth'
import { liveProviders } from './providers/registry'
import { EarthCommandSheet, type EarthCommandPanel } from './components/EarthCommandSheet'
import type { SheetDetent } from './lib/bottomSheet'
import { sameInspectorLayout, type InspectorLayout } from './lib/interactionLayout'
import { buildPresentedEntities, presentedEntitySignals } from './lib/presentedEntities'
import { signalVisibleAt } from './lib/temporal'
import { discoveryUsesOnlyCurrentEvidence } from './lib/editorial'

const MapView = lazy(() => import('./components/MapView'))
const providerCadences = Object.fromEntries(liveProviders.map((provider) => [provider.id, provider.cadenceMs]))
const allSignalTypesVisible = { earthquake: true, fire: true, weather: true, aircraft: true, satellite: true, 'space-weather': true, media: true, environment: true, infrastructure: true } as const

let cachedWebGLSupport: boolean | undefined
type EarthLensId = 'world' | 'weather' | 'hazards' | 'life'

function sameLayerSet(enabled: ReadonlySet<NexusLayerId>, ids: readonly NexusLayerId[]) {
  return enabled.size === ids.length && ids.every((id) => enabled.has(id))
}

function supportsWebGL() {
  if (cachedWebGLSupport !== undefined) return cachedWebGLSupport
  try {
    const canvas = document.createElement('canvas')
    cachedWebGLSupport = Boolean(canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }))
  } catch {
    cachedWebGLSupport = false
  }
  return cachedWebGLSupport
}

export default function App() {
  const store = useNexusStore()
  const [online, setOnline] = useState(navigator.onLine)
  const [webGLAvailable] = useState(supportsWebGL)
  const [activePanel, setActivePanel] = useState<EarthCommandPanel>()
  const [openLayerCategory, setOpenLayerCategory] = useState<LayerCategory>()
  const [enabledLayers, setEnabledLayers] = useState<Set<NexusLayerId>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('nexus:visualLayers') ?? 'null') as unknown
      if (Array.isArray(stored)) return new Set(stored.filter((id): id is NexusLayerId => allLayerIds.includes(id as NexusLayerId)))
      const legacy = [...livingEarthLayerIds]
      if (localStorage.getItem('nexus:radar') === 'true') legacy.push('radar')
      if (localStorage.getItem('nexus:satellite') === 'true') legacy.push('clouds')
      return new Set(legacy)
    } catch { return new Set(livingEarthLayerIds) }
  })
  const [life, setLife] = useState<LifeGlobeSnapshot>()
  const [lifeStatus, setLifeStatus] = useState<'idle' | 'zoom' | 'loading' | 'live' | 'cached' | 'error'>('idle')
  const [selectedIntelligence, setSelectedIntelligence] = useState<NexusIntelligenceObject>()
  const [sheetDetent, setSheetDetent] = useState<SheetDetent>('story')
  const [inspectorLayout, setInspectorLayout] = useState<InspectorLayout>()
  const [truthClock, setTruthClock] = useState(Date.now)
  const [informationDensity, setInformationDensity] = useState<InformationDensity>(() => {
    try { const value = localStorage.getItem('nexus:informationDensity'); return value === 'simple' || value === 'expert' ? value : 'standard' } catch { return 'standard' }
  })
  const lifeEnabled = enabledLayers.has('life')
  const radarEnabled = enabledLayers.has('radar')
  const satelliteEnabled = enabledLayers.has('clouds')
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>(() => {
    try { const value = localStorage.getItem('nexus:performance'); return value === 'quality' || value === 'battery' ? value : 'automatic' } catch { return 'automatic' }
  })
  const [replayCutoff, setReplayCutoff] = useState<number>()
  const [geographicView, setGeographicView] = useState<GeographicView>(DEFAULT_GEOGRAPHIC_VIEW)
  const lifeLatitude = Math.round(geographicView.latitude * 2) / 2
  const lifeLongitude = Math.round(geographicView.longitude * 2) / 2
  const lifeRadius = geographicView.altitude > .9 ? undefined : geographicView.altitude <= .22 ? 120 : geographicView.altitude <= .55 ? 500 : 1_000
  const lifeQuery = useMemo(() => {
    if (lifeRadius === undefined) return undefined
    return { latitude: lifeLatitude, longitude: lifeLongitude, radiusKm: lifeRadius }
  }, [lifeLatitude, lifeLongitude, lifeRadius])
  const lifeQueryKey = useMemo(() => lifeQuery ? lifeGlobeCacheKey(lifeQuery.latitude, lifeQuery.longitude, lifeQuery.radiusKm) : undefined, [lifeQuery])
  const activeLife = life?.queryKey === lifeQueryKey ? life : undefined
  const currentSignals = useMemo(() => filterVisibleSignals(store.signals, store.timeWindow, allSignalTypesVisible), [store.signals, store.timeWindow])
  const currentSignalIds = useMemo(() => new Set(currentSignals.map((signal) => signal.id)), [currentSignals])
  const currentDiscoveries = useMemo(() => store.discoveries.filter((discovery) => discoveryUsesOnlyCurrentEvidence(discovery, currentSignalIds)), [currentSignalIds, store.discoveries])
  const windowSignals = useMemo(() => currentSignals.filter((signal) => store.layerVisibility[signal.type] && visibleWithLayers(signal, enabledLayers)), [currentSignals, enabledLayers, store.layerVisibility])
  const rawVisibleSignals = useMemo(() => replayCutoff ? windowSignals.filter((signal) => signalVisibleAt(signal, replayCutoff)) : windowSignals, [replayCutoff, windowSignals])
  const presentedEntities = useMemo(() => buildPresentedEntities(rawVisibleSignals), [rawVisibleSignals])
  const visibleSignals = useMemo(() => presentedEntitySignals(presentedEntities), [presentedEntities])
  const selectedSignal = useMemo(() => store.signals.find((signal) => signal.id === store.selectedSignalId), [store.selectedSignalId, store.signals])
  const activeIntelligence = useMemo(() => selectedIntelligence ?? (selectedSignal ? signalToIntelligence(selectedSignal, store.signals) : undefined), [selectedIntelligence, selectedSignal, store.signals])
  const liveSourceCount = Object.values(store.statuses).filter((status) => status.state === 'live').length
  const dataTruth = deriveGlobalDataTruth(store.statuses, providerCadences, {
    refreshing: store.isRefreshing,
    online,
    demo: store.demoMode || store.signals.some((signal) => signal.source.freshness === 'demo'),
    hasStoredSignals: store.signals.some((signal) => signal.source.freshness === 'cached'),
    now: truthClock,
  })
  const significantCount = currentDiscoveries.filter((item) => item.score >= 61).length
  const leadDiscovery = currentDiscoveries[0]
  const activeLayerCount = enabledLayers.size

  useEffect(() => {
    try {
      // Retire the centroid-shift experiment even for users who already have
      // a visual-layer preference saved.
      localStorage.removeItem('nexus:migration')
      localStorage.removeItem('nexus:migration:v3')
    } catch { /* private storage may be unavailable */ }
  }, [])
  const activeEarthLens = useMemo<EarthLensId | undefined>(() => sameLayerSet(enabledLayers, livingEarthLayerIds) ? 'world' : sameLayerSet(enabledLayers, layerPresets.weather) ? 'weather' : sameLayerSet(enabledLayers, layerPresets.hazards) ? 'hazards' : sameLayerSet(enabledLayers, layerPresets.life) ? 'life' : undefined, [enabledLayers])
  const activeLensLabel = activeEarthLens === 'world' ? 'Living Earth' : activeEarthLens === 'weather' ? 'Weather' : activeEarthLens === 'hazards' ? 'Hazards' : activeEarthLens === 'life' ? 'Life' : 'Custom view'
  const selectSignalById = store.selectSignal
  const reportInspectorLayout = useCallback((layout: InspectorLayout) => setInspectorLayout((current) => sameInspectorLayout(current, layout) ? current : layout), [])
  const openIntelligence = useCallback((object: NexusIntelligenceObject, signalId?: string) => {
    selectSignalById(signalId)
    setSelectedIntelligence(object)
    setSheetDetent('story')
    setInspectorLayout(undefined)
  }, [selectSignalById])
  const selectSignal = useCallback((signal: Signal) => {
    const entity = presentedEntities.find((item) => item.members.some((member) => member.id === signal.id))
    const representative = entity ? presentedEntitySignals([entity])[0]! : signal
    const intelligence = signalToIntelligence(representative, visibleSignals)
    openIntelligence(entity ? { ...intelligence, evidence: entity.evidence } : intelligence, representative.id)
  }, [openIntelligence, presentedEntities, visibleSignals])
  const selectSignalCluster = useCallback((signals: Signal[], location: { latitude: number; longitude: number }, totalCount?: number) => {
    openIntelligence(signalClusterToIntelligence(signals, location, totalCount))
  }, [openIntelligence])
  const selectLife = useCallback((taxon: LifeGlobeSnapshot['taxa'][number]) => {
    if (!activeLife) return
    openIntelligence(lifeTaxonToIntelligence(taxon, activeLife.retrievedAt, activeLife.methodology, activeLife.freshness))
  }, [activeLife, openIntelligence])
  const selectEcologicalCell = useCallback((cell: LifeGlobeSnapshot['cells'][number]) => {
    if (!activeLife) return
    openIntelligence(ecologicalClusterToIntelligence(cell, activeLife.retrievedAt, activeLife.methodology, activeLife.freshness))
  }, [activeLife, openIntelligence])
  const closeIntelligence = useCallback(() => { selectSignalById(undefined); setSelectedIntelligence(undefined); setInspectorLayout(undefined) }, [selectSignalById])
  const selectDiscovery = useCallback((discovery: Discovery) => {
    openIntelligence(discoveryToIntelligence(discovery, store.signals))
    if (store.view !== 'earth') store.setView('earth')
  }, [openIntelligence, store])
  const surprise = useCallback(() => {
    const result = store.surprise()
    if (!result) return
    if ('signalIds' in result) selectDiscovery(result)
    else selectSignal(result)
  }, [selectDiscovery, selectSignal, store])
  const watchIntelligence = useCallback((object: NexusIntelligenceObject) => {
    if (!object.location) return
    void store.watchPlace({ id: object.id, name: object.title, subtitle: object.subtitle ?? object.domain, latitude: object.location.latitude, longitude: object.location.longitude })
  }, [store])
  const handleMapViewChange = useCallback((view: GeographicView) => setGeographicView(clampGeographicView(view)), [])
  const enableLayerCollection = useCallback((ids: NexusLayerId[]) => setEnabledLayers((current) => new Set([...current, ...ids])), [])
  const toggleVisualLayer = useCallback((id: NexusLayerId) => setEnabledLayers((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  }), [])
  const setLayerCategoryEnabled = useCallback((category: LayerCategory, enabled: boolean) => {
    setEnabledLayers((current) => {
      const next = new Set(current)
      for (const layer of nexusLayers.filter((item) => item.category === category)) {
        if (enabled) next.add(layer.id); else next.delete(layer.id)
      }
      return next
    })
  }, [])
  const activateEarthLens = useCallback((lens: EarthLensId) => {
    if (lens === 'world') {
      enableLayerCollection(livingEarthLayerIds)
      store.enableLayers(['earthquake', 'fire', 'weather', 'aircraft', 'satellite', 'space-weather', 'media', 'environment', 'infrastructure'])
    } else if (lens === 'weather') {
      enableLayerCollection(layerPresets.weather)
      store.enableLayers(['weather', 'environment'])
    } else if (lens === 'hazards') {
      enableLayerCollection(layerPresets.hazards)
      store.enableLayers(['earthquake', 'fire', 'weather', 'environment'])
    } else {
      enableLayerCollection(layerPresets.life)
      store.enableLayers(['environment'])
    }
  }, [enableLayerCollection, store])

  useEffect(() => {
    const timer = window.setInterval(() => setTruthClock(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    void store.initialize()
    const onOnline = () => { setOnline(true); void store.refresh() }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void store.refresh() }, 5 * 60000)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); window.clearInterval(timer) }
    // initialize only once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('nexus:visualLayers', JSON.stringify([...enabledLayers]))
      localStorage.setItem('nexus:radar', String(radarEnabled)); localStorage.setItem('nexus:satellite', String(satelliteEnabled))
    } catch { /* private storage may be unavailable */ }
  }, [enabledLayers, radarEnabled, satelliteEnabled])

  useEffect(() => {
    if (!lifeEnabled) { setLifeStatus('idle'); return }
    if (!lifeQuery) { setLife(undefined); setLifeStatus('zoom'); return }
    const controller = new AbortController()
    setLife(undefined)
    setLifeStatus('loading')
    void fetchLifeGlobeSnapshot(lifeQuery.latitude, lifeQuery.longitude, lifeQuery.radiusKm, controller.signal)
      .then((value) => { setLife(value); setLifeStatus(value.freshness) })
      .catch(() => { if (!controller.signal.aborted) setLifeStatus('error') })
    return () => controller.abort()
  }, [lifeEnabled, lifeQuery])

  useEffect(() => {
    try { localStorage.setItem('nexus:informationDensity', informationDensity) } catch { /* private storage may be unavailable */ }
  }, [informationDensity])

  useEffect(() => {
    try {
      localStorage.setItem('nexus:performance', performanceMode)
    } catch { /* private storage may be unavailable */ }
  }, [performanceMode])

  const earthContent = useMemo(() => (
    <>
      <Suspense fallback={<div className="globe-loading"><LoaderCircle/><span>Awakening Earth</span></div>}><MapView forceAtlas={!webGLAvailable} active={store.view === 'earth'} environmentalTime={replayCutoff} signals={visibleSignals} selected={selectedSignal} focusLocation={activeIntelligence?.location} focusOcclusion={inspectorLayout} radarEnabled={radarEnabled} satelliteEnabled={satelliteEnabled} performanceMode={performanceMode} initialView={geographicView} onViewChange={handleMapViewChange} onSelect={selectSignal} onSelectSignalCluster={selectSignalCluster} onSelectLife={selectLife} onSelectEcologicalCell={selectEcologicalCell} life={lifeEnabled && !replayCutoff ? activeLife : undefined}/></Suspense>
      <div className="earth-overlay">
        {significantCount > 0 && leadDiscovery && <button className={`world-pulse level-${leadDiscovery.level}`} onClick={() => selectDiscovery(leadDiscovery)}>
          <span><Activity/> WORLD PULSE <i>{significantCount ? `${significantCount} significant` : 'nominal'}</i></span>
          <strong>{leadDiscovery?.title ?? (store.isRefreshing ? 'Resolving current activity…' : 'No significant convergence detected')}</strong>
          <small>{leadDiscovery ? leadDiscovery.memory?.status === 'established' ? `${Math.abs(leadDiscovery.memory.deviationPercent ?? 0) >= 100 ? 'Far outside' : 'Different from'} the recent ${leadDiscovery.memory.observedDays}-day regional pattern · tap to understand` : `${leadDiscovery.signalIds.length} evidence item${leadDiscovery.signalIds.length === 1 ? '' : 's'} · learning the regional pattern` : `${visibleSignals.length} qualifying signals · ${liveSourceCount} live sources`}</small>
        </button>}
        <button className={`earth-tools-button ${activePanel ? 'active' : ''}`} onClick={() => setActivePanel(activePanel ? undefined : 'layers')} aria-expanded={Boolean(activePanel)} aria-label={`Explore Earth controls. ${activeLayerCount} active layers.`}><Layers3/><span>{activeLayerCount}</span></button>
        <div className="earth-surprise"><SurpriseButton onClick={surprise}/></div>
        {!webGLAvailable && <div className="compatibility-notice" role="status">Accessible signal mode · WebGL 2 unavailable</div>}
      </div>
      {activePanel && <EarthCommandSheet activePanel={activePanel} onPanelChange={setActivePanel} onClose={() => setActivePanel(undefined)}>
          {activePanel === 'search' && <><SearchPanel signals={currentSignals} onSelect={(signal) => { selectSignal(signal); setActivePanel(undefined) }} onPlace={(place) => { openIntelligence(searchedPlaceToIntelligence(place)); setGeographicView({ latitude: place.latitude, longitude: place.longitude, altitude: .35 }); setActivePanel(undefined) }}/><p className="control-note">Results stay on Earth and open in the same intelligence sheet. Sources remain available in details.</p></>}
          {activePanel === 'layers' && <>
            <div className="active-layer-summary"><span><small>ACTIVE NOW</small><strong>{activeLensLabel}</strong><b>{activeLayerCount} layers active</b></span><button disabled={activeEarthLens === 'world'} onClick={() => setEnabledLayers(new Set(livingEarthLayerIds))}>Restore</button></div>
            <section className="domain-launcher" aria-labelledby="domain-lenses-heading">
              <div className="domain-heading"><span>QUICK VIEWS</span><small>Add a curated view</small></div>
              <div className="domain-lens-grid" id="domain-lenses-heading" role="group" aria-label="Earth domain lenses">
                <button className={activeEarthLens === 'world' ? 'active' : ''} onClick={() => activateEarthLens('world')}><Globe2/><span><strong>Living Earth</strong><small>A calm, prioritized view of what matters now</small></span><b>VIEW</b></button>
                <button className={activeEarthLens === 'weather' ? 'active' : ''} onClick={() => activateEarthLens('weather')}><CloudRain/><span><strong>Weather</strong><small>Radar, satellite, storms and alerts</small></span><b>VIEW</b></button>
                <button className={activeEarthLens === 'hazards' ? 'active' : ''} onClick={() => activateEarthLens('hazards')}><Activity/><span><strong>Hazards</strong><small>Earthquakes, fires, storms and official alerts</small></span><b>VIEW</b></button>
                <button className={activeEarthLens === 'life' ? 'active life-domain' : 'life-domain'} onClick={() => activateEarthLens('life')}><PawPrint/><span><strong>Life</strong><small>{lifeStatus === 'zoom' ? 'Zoom closer to request a bounded region' : 'Coarse, privacy-protected biodiversity records'}</small></span><b>{lifeStatus === 'loading' ? '…' : lifeStatus === 'zoom' ? 'ZOOM' : lifeEnabled ? 'ON' : 'VIEW'}</b></button>
              </div>
            </section>
            <div className="layer-category-accordion">{(['ATMOSPHERE', 'HAZARDS', 'LIFE', 'HUMAN', 'OCEAN', 'ORBIT', 'CONTEXT'] as const).map((category) => { const layers = nexusLayers.filter((layer) => layer.category === category); const enabledCount = layers.filter((layer) => enabledLayers.has(layer.id)).length; const open = openLayerCategory === category; const panelId = `layer-category-${category.toLowerCase()}`; return <section key={category}><button className="layer-category-row" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpenLayerCategory(open ? undefined : category)}><span><strong>{{ ATMOSPHERE: 'Weather', HAZARDS: 'Hazards', LIFE: 'Life', HUMAN: 'Human activity', OCEAN: 'Ocean', ORBIT: 'Orbit', CONTEXT: 'Earth context' }[category]}</strong><small>{enabledCount}/{layers.length} active</small></span><b>{open ? '−' : '+'}</b></button>{open && <div className="layer-category-panel" id={panelId}><button className="category-all" onClick={() => setLayerCategoryEnabled(category, enabledCount !== layers.length)}>{enabledCount === layers.length ? 'All off' : 'All on'}</button><div className="lens-grid">{layers.map((layer) => { const count = currentSignals.filter((signal) => layerSupportsSignal(layer.id, signal)).length; const enabled = enabledLayers.has(layer.id); return <button key={layer.id} className={enabled ? 'active' : ''} onClick={() => toggleVisualLayer(layer.id)} aria-pressed={enabled}><i className={`layer-category-dot ${layer.category.toLowerCase()}`}/><span><strong>{layer.label}</strong><small>{count ? `${count} available` : layer.shortDescription}</small></span><b>{enabled ? 'ON' : 'OFF'}</b></button> })}</div></div>}</section> })}</div>
            <details className="advanced-layers">
              <summary><span>Advanced</span><b>Power user</b></summary>
              <button className="show-everything" onClick={() => { setEnabledLayers(new Set(allLayerIds)); store.enableLayers(['earthquake', 'fire', 'weather', 'aircraft', 'satellite', 'space-weather', 'media', 'environment', 'infrastructure']) }}><Layers3/><span><strong>Show everything</strong><small>Power-user view · visual detail adapts automatically</small></span></button>
            </details>
            <p className="control-note">Environmental imagery is visual context, not a forecast. Signal lenses never delete locally cached evidence.</p>
          </>}
          {activePanel === 'time' && <><div className="time-panel"><TimeControl value={store.timeWindow} onChange={(window) => { setReplayCutoff(undefined); store.setTimeWindow(window) }}/></div><ReplayControl signals={windowSignals} cutoff={replayCutoff} since={timeWindowSince(store.timeWindow, truthClock)} until={truthClock} onCutoff={setReplayCutoff}/><p className="control-note">Replay reveals observations by their authoritative timestamps and product validity. It does not interpolate movement or imply causation.</p></>}
      </EarthCommandSheet>}
      {replayCutoff && <button className="replay-indicator" onClick={() => { setReplayCutoff(undefined); setActivePanel('time') }}><span>REPLAY · {new Date(replayCutoff).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><strong>Return live</strong></button>}
    </>
  ), [activateEarthLens, activeEarthLens, activeIntelligence?.location, activeLayerCount, activeLensLabel, activeLife, activePanel, currentSignals, enabledLayers, geographicView, handleMapViewChange, inspectorLayout, leadDiscovery, lifeEnabled, lifeStatus, liveSourceCount, openIntelligence, openLayerCategory, performanceMode, radarEnabled, replayCutoff, satelliteEnabled, selectDiscovery, selectEcologicalCell, selectedSignal, selectLife, selectSignal, selectSignalCluster, setLayerCategoryEnabled, significantCount, store, surprise, toggleVisualLayer, truthClock, visibleSignals, webGLAvailable, windowSignals])

  return (
    <div className={`app-shell ${activePanel ? 'command-open' : ''}`}>
      <TopBar state={dataTruth.state} liveSources={dataTruth.liveSources} asOf={dataTruth.asOf} onSettings={() => store.setView('settings')}/>
      <div className={`earth-route ${store.view === 'earth' ? 'active' : ''}`} aria-hidden={store.view !== 'earth'}>{earthContent}</div>
      {store.view === 'discover' && (
        <DiscoverPage discoveries={store.selectedDiscoveryId ? store.discoveries : currentDiscoveries} signals={store.selectedDiscoveryId ? store.signals : currentSignals} selectedId={store.selectedDiscoveryId}
          onOpen={(id) => { if (!id) { store.selectDiscovery(undefined); store.setView('cases'); return } const discovery = currentDiscoveries.find((item) => item.id === id); if (discovery) selectDiscovery(discovery) }}
          onOpenEarth={(id) => { const discovery = store.discoveries.find((item) => item.id === id); if (discovery) selectDiscovery(discovery) }}
          onSave={store.saveDiscovery} onNotes={store.updateCaseNotes} onRemove={async (id) => { await store.removeCase(id); store.selectDiscovery(undefined); store.setView('cases') }}/>
      )}
      {store.view === 'cases' && <CasesPage discoveries={store.discoveries} watches={store.watches} signals={currentSignals} onOpen={store.selectDiscovery} onObserve={(place) => { openIntelligence(searchedPlaceToIntelligence(place)); setGeographicView({ latitude: place.latitude, longitude: place.longitude, altitude: .35 }); store.setView('earth') }} onUnwatch={store.unwatchPlace}/>}
      {store.view === 'observer' && <ObserverPage key={String(store.observerPlace?.id ?? 'observer')} signals={currentSignals} initialPlace={store.observerPlace} watches={store.watches} onWatch={store.watchPlace} onUnwatch={store.unwatchPlace} onSelectIntelligence={setSelectedIntelligence}/>}
      {store.view === 'settings' && (
        <SettingsPage layers={store.layerVisibility} statuses={store.statuses} demoMode={store.demoMode} firmsConfigured={store.firmsConfigured} performanceMode={performanceMode} informationDensity={informationDensity} onToggle={store.toggleLayer} onDemoMode={store.setDemoMode} onFirmsKey={store.setFirmsKey} onRefresh={store.refresh} onPerformance={setPerformanceMode} onInformationDensity={setInformationDensity} onErase={async () => { await store.eraseLocalData(); setEnabledLayers(new Set(livingEarthLayerIds)); setPerformanceMode('automatic'); setInformationDensity('standard'); setLife(undefined); setLifeStatus('idle'); closeIntelligence() }}/>
      )}
      {activeIntelligence && store.view === 'earth' && <IntelligenceInspector object={activeIntelligence} density={informationDensity} detent={sheetDetent} onDetentChange={setSheetDetent} onLayoutChange={reportInspectorLayout} onClose={closeIntelligence} onWatch={watchIntelligence} onSelectRelated={openIntelligence}/>}
      {store.view !== 'settings' && (
        <BottomNav view={store.view} onChange={(view) => { closeIntelligence(); store.setView(view) }}/>
      )}
      {store.view === 'settings' && <button className="settings-done" onClick={() => store.setView('earth')}>Done</button>}
      {!online && <div className="offline-banner"><Activity size={14}/> Offline · viewing stored data</div>}
    </div>
  )
}
