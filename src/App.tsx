import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Bird, Clock3, CloudRain, Globe2, Layers3, LoaderCircle, MonitorUp, PawPrint, Plane, RefreshCw, Satellite, Search, ShipWheel, X } from 'lucide-react'
import { BottomNav, TopBar } from './components/Chrome'
import { CasesPage, DiscoverPage, ObserverPage, SearchPanel } from './components/Pages'
import SettingsPage, { type MapTheme, type PerformanceMode } from './components/SettingsPage'
import { IntelligenceInspector, type InformationDensity } from './components/IntelligenceInspector'
import { TimeControl } from './components/TimeControl'
import { ReplayControl } from './components/ReplayControl'
import { AccessibleEarthFallback } from './components/AccessibleEarthFallback'
import { filterVisibleSignals, useNexusStore } from './store/useNexusStore'
import type { Discovery, Signal } from './types/signal'
import { clampGeographicView, DEFAULT_GEOGRAPHIC_VIEW, type GeographicView } from './lib/geography'
import { fetchMigrationSnapshot, type MigrationSnapshot } from './lib/migration'
import { fetchLifeGlobeSnapshot, type LifeGlobeSnapshot } from './lib/lifeGlobe'
import { allLayerIds, layerPresets, layerSupportsSignal, livingEarthLayerIds, nexusLayers, visibleWithLayers, type NexusLayerId } from './lib/layers'
import { discoveryToIntelligence, ecologicalClusterToIntelligence, lifeTaxonToIntelligence, migrationToIntelligence, searchedPlaceToIntelligence, signalClusterToIntelligence, signalToIntelligence } from './lib/intelligence'
import type { NexusIntelligenceObject } from './types/intelligence'

const MapView = lazy(() => import('./components/MapView'))

let cachedWebGLSupport: boolean | undefined
type EarthLensId = 'world' | 'weather' | 'migration' | 'maritime' | 'aviation' | 'animals' | 'orbit' | 'custom'

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
  const [activePanel, setActivePanel] = useState<'search' | 'layers' | 'time'>()
  const [activeEarthLens, setActiveEarthLens] = useState<EarthLensId>(() => {
    try { return localStorage.getItem('nexus:visualLayers') ? 'custom' : 'world' } catch { return 'world' }
  })
  const [enabledLayers, setEnabledLayers] = useState<Set<NexusLayerId>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('nexus:visualLayers') ?? 'null') as unknown
      if (Array.isArray(stored)) return new Set(stored.filter((id): id is NexusLayerId => allLayerIds.includes(id as NexusLayerId)))
      const legacy = [...livingEarthLayerIds]
      if (localStorage.getItem('nexus:migration') === 'true') legacy.push('migration')
      if (localStorage.getItem('nexus:radar') === 'true') legacy.push('radar')
      if (localStorage.getItem('nexus:satellite') === 'true') legacy.push('clouds')
      return new Set(legacy)
    } catch { return new Set(livingEarthLayerIds) }
  })
  const [migration, setMigration] = useState<MigrationSnapshot>()
  const [migrationStatus, setMigrationStatus] = useState<'idle' | 'loading' | 'live' | 'cached' | 'error'>('idle')
  const [migrationFocusId, setMigrationFocusId] = useState<string>()
  const [life, setLife] = useState<LifeGlobeSnapshot>()
  const [lifeStatus, setLifeStatus] = useState<'idle' | 'loading' | 'live' | 'cached' | 'error'>('idle')
  const [lifeFocusId, setLifeFocusId] = useState<string>()
  const [selectedIntelligence, setSelectedIntelligence] = useState<NexusIntelligenceObject>()
  const [informationDensity, setInformationDensity] = useState<InformationDensity>(() => {
    try { const value = localStorage.getItem('nexus:informationDensity'); return value === 'simple' || value === 'expert' ? value : 'standard' } catch { return 'standard' }
  })
  const migrationEnabled = enabledLayers.has('migration')
  const lifeEnabled = enabledLayers.has('life')
  const radarEnabled = enabledLayers.has('radar')
  const satelliteEnabled = enabledLayers.has('clouds')
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>(() => {
    try { const value = localStorage.getItem('nexus:performance'); return value === 'quality' || value === 'battery' ? value : 'automatic' } catch { return 'automatic' }
  })
  const [mapTheme, setMapTheme] = useState<MapTheme>(() => { try { return localStorage.getItem('nexus:mapTheme') === 'street' ? 'street' : 'dark' } catch { return 'dark' } })
  const [ambientMode, setAmbientMode] = useState(false)
  const [replayCutoff, setReplayCutoff] = useState<number>()
  const [ambientIdle, setAmbientIdle] = useState(false)
  const [geographicView, setGeographicView] = useState<GeographicView>(DEFAULT_GEOGRAPHIC_VIEW)
  const wakeLock = useRef<WakeLockSentinel | null>(null)
  const ambientActive = ambientMode && store.view === 'earth'
  const windowSignals = useMemo(() => filterVisibleSignals(store.signals, store.timeWindow, store.layerVisibility).filter((signal) => visibleWithLayers(signal, enabledLayers)), [enabledLayers, store.layerVisibility, store.signals, store.timeWindow])
  const visibleSignals = useMemo(() => replayCutoff ? windowSignals.filter((signal) => signal.timestamp <= replayCutoff) : windowSignals, [replayCutoff, windowSignals])
  const selectedSignal = useMemo(() => store.signals.find((signal) => signal.id === store.selectedSignalId), [store.selectedSignalId, store.signals])
  const activeIntelligence = useMemo(() => selectedIntelligence ?? (selectedSignal ? signalToIntelligence(selectedSignal, store.signals) : undefined), [selectedIntelligence, selectedSignal, store.signals])
  const liveSourceCount = Object.values(store.statuses).filter((status) => status.state === 'live').length
  const significantCount = store.discoveries.filter((item) => item.score >= 61).length
  const leadDiscovery = store.discoveries[0]
  const migrationFocus = migration?.corridors.find((corridor) => corridor.id === migrationFocusId)
  const lifeFocus = life?.taxa.find((taxon) => taxon.id === lifeFocusId)
  const activeLayerCount = enabledLayers.size
  const selectSignalById = store.selectSignal
  const selectSignal = useCallback((signal: Signal) => { selectSignalById(signal.id); setSelectedIntelligence(signalToIntelligence(signal, store.signals)) }, [selectSignalById, store.signals])
  const selectSignalCluster = useCallback((signals: Signal[], location: { latitude: number; longitude: number }) => {
    selectSignalById(undefined)
    setSelectedIntelligence(signalClusterToIntelligence(signals, location))
  }, [selectSignalById])
  const selectMigration = useCallback((corridor: MigrationSnapshot['corridors'][number]) => {
    if (!migration) return
    setMigrationFocusId(corridor.id)
    selectSignalById(undefined)
    setSelectedIntelligence(migrationToIntelligence(corridor, migration.retrievedAt, migration.sourceUrl, migration.methodology))
  }, [migration, selectSignalById])
  const selectLife = useCallback((taxon: LifeGlobeSnapshot['taxa'][number]) => {
    if (!life) return
    setLifeFocusId(taxon.id)
    selectSignalById(undefined)
    setSelectedIntelligence(lifeTaxonToIntelligence(taxon, life.retrievedAt, life.methodology))
  }, [life, selectSignalById])
  const selectEcologicalCell = useCallback((cell: { id: string; latitude: number; longitude: number; observations: number; domain: 'migration' | 'life' }) => {
    const snapshot = cell.domain === 'migration' ? migration : life
    if (!snapshot) return
    selectSignalById(undefined)
    setSelectedIntelligence(ecologicalClusterToIntelligence(cell, cell.domain, snapshot.retrievedAt, snapshot.methodology))
  }, [life, migration, selectSignalById])
  const closeIntelligence = useCallback(() => { selectSignalById(undefined); setSelectedIntelligence(undefined) }, [selectSignalById])
  const selectDiscovery = useCallback((discovery: Discovery) => {
    selectSignalById(undefined)
    setSelectedIntelligence(discoveryToIntelligence(discovery, store.signals))
    if (store.view !== 'earth') store.setView('earth')
  }, [selectSignalById, store])
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
  const activateEarthLens = useCallback((lens: EarthLensId) => {
    setActiveEarthLens(lens)
    if (lens === 'world') {
      setEnabledLayers(new Set(livingEarthLayerIds))
      store.enableLayers(['earthquake', 'fire', 'weather', 'aircraft', 'satellite', 'space-weather', 'media', 'environment', 'infrastructure'])
    } else if (lens === 'weather') {
      enableLayerCollection(layerPresets.weather)
      store.enableLayers(['weather', 'environment'])
    } else if (lens === 'migration') {
      enableLayerCollection(layerPresets.migration)
      store.enableLayers(['environment', 'weather'])
    } else if (lens === 'maritime') {
      enableLayerCollection(layerPresets.maritime)
      store.enableLayers(['weather', 'environment', 'infrastructure'])
    } else if (lens === 'aviation') {
      enableLayerCollection(layerPresets.aviation)
      store.enableLayers(['aircraft', 'weather'])
    } else if (lens === 'animals') {
      enableLayerCollection(layerPresets.life)
      store.enableLayers(['environment'])
    } else {
      enableLayerCollection(layerPresets.orbit)
      store.enableLayers(['satellite', 'space-weather'])
    }
  }, [enableLayerCollection, store])

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
      localStorage.setItem('nexus:radar', String(radarEnabled)); localStorage.setItem('nexus:migration', String(migrationEnabled)); localStorage.setItem('nexus:satellite', String(satelliteEnabled))
    } catch { /* private storage may be unavailable */ }
  }, [enabledLayers, migrationEnabled, radarEnabled, satelliteEnabled])

  useEffect(() => {
    if (!migrationEnabled) { setMigrationStatus('idle'); setMigrationFocusId(undefined); return }
    const controller = new AbortController()
    setMigrationStatus('loading')
    void fetchMigrationSnapshot(controller.signal)
      .then((value) => { setMigration(value); setMigrationStatus(value.freshness) })
      .catch(() => { if (!controller.signal.aborted) setMigrationStatus('error') })
    return () => controller.abort()
  }, [migrationEnabled])

  useEffect(() => {
    if (!lifeEnabled) { setLifeStatus('idle'); setLifeFocusId(undefined); return }
    const controller = new AbortController()
    setLifeStatus('loading')
    void fetchLifeGlobeSnapshot(controller.signal)
      .then((value) => { setLife(value); setLifeStatus(value.freshness) })
      .catch(() => { if (!controller.signal.aborted) setLifeStatus('error') })
    return () => controller.abort()
  }, [lifeEnabled])

  useEffect(() => {
    try { localStorage.setItem('nexus:informationDensity', informationDensity) } catch { /* private storage may be unavailable */ }
  }, [informationDensity])

  useEffect(() => {
    try {
      localStorage.setItem('nexus:performance', performanceMode); localStorage.setItem('nexus:mapTheme', mapTheme)
    } catch { /* private storage may be unavailable */ }
  }, [mapTheme, performanceMode])

  useEffect(() => {
    if (!ambientActive) { setAmbientIdle(false); void wakeLock.current?.release(); wakeLock.current = null; return }
    let idleTimer = window.setTimeout(() => setAmbientIdle(true), 12_000)
    const wake = async () => {
      setAmbientIdle(false)
      window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => setAmbientIdle(true), 12_000)
      try { if (!wakeLock.current && 'wakeLock' in navigator) wakeLock.current = await navigator.wakeLock.request('screen') } catch { /* Ambient UI still works without the optional browser lock. */ }
    }
    const visible = () => { if (document.visibilityState === 'visible') void wake() }
    void wake()
    window.addEventListener('pointerdown', wake, { passive: true })
    document.addEventListener('visibilitychange', visible)
    return () => { window.clearTimeout(idleTimer); window.removeEventListener('pointerdown', wake); document.removeEventListener('visibilitychange', visible); void wakeLock.current?.release(); wakeLock.current = null }
  }, [ambientActive])

  const earthContent = useMemo(() => (
    <>
      {!webGLAvailable ? <AccessibleEarthFallback signals={visibleSignals} onSelect={selectSignal}/> : <Suspense fallback={<div className="globe-loading"><LoaderCircle/><span>Awakening Earth</span></div>}><MapView active={store.view === 'earth'} environmentalTime={replayCutoff} signals={visibleSignals} selected={selectedSignal} focusLocation={activeIntelligence?.location} radarEnabled={radarEnabled} satelliteEnabled={satelliteEnabled} mapTheme={mapTheme} performanceMode={performanceMode} initialView={geographicView} onViewChange={handleMapViewChange} onSelect={selectSignal} onSelectSignalCluster={selectSignalCluster} onSelectMigration={selectMigration} onSelectLife={selectLife} onSelectEcologicalCell={selectEcologicalCell} migration={migrationEnabled && !replayCutoff ? migration : undefined} life={lifeEnabled && !replayCutoff ? life : undefined}/></Suspense>}
      <div className="earth-overlay">
        {significantCount > 0 && leadDiscovery && <button className={`world-pulse level-${leadDiscovery.level}`} onClick={() => selectDiscovery(leadDiscovery)}>
          <span><Activity/> WORLD PULSE <i>{significantCount ? `${significantCount} significant` : 'nominal'}</i></span>
          <strong>{leadDiscovery?.title ?? (store.isRefreshing ? 'Resolving current activity…' : 'No significant convergence detected')}</strong>
          <small>{leadDiscovery ? leadDiscovery.memory?.status === 'established' ? `${Math.abs(leadDiscovery.memory.deviationPercent ?? 0) >= 100 ? 'Far outside' : 'Different from'} the recent ${leadDiscovery.memory.observedDays}-day regional pattern · tap to understand` : `${leadDiscovery.signalIds.length} evidence item${leadDiscovery.signalIds.length === 1 ? '' : 's'} · learning the regional pattern` : `${visibleSignals.length} qualifying signals · ${liveSourceCount} live sources`}</small>
        </button>}
        <button className={`earth-tools-button ${activePanel ? 'active' : ''}`} onClick={() => setActivePanel(activePanel ? undefined : 'layers')} aria-expanded={Boolean(activePanel)} aria-label={`Explore Earth controls. ${activeLayerCount} active layers.`}><Layers3/><span>{activeLayerCount}</span></button>
        {!webGLAvailable && <div className="compatibility-notice" role="status">Accessible signal mode · WebGL 2 unavailable</div>}
      </div>
      {activePanel && <div className="command-scrim" onClick={() => setActivePanel(undefined)}>
        <section className="command-sheet" role="dialog" aria-modal="true" aria-label={`${activePanel} controls`} onClick={(event) => event.stopPropagation()}>
          <div className="sheet-handle"/>
          <header><div><span className="eyebrow">EXPLORE EARTH</span><h2>{activePanel === 'search' ? 'Find anywhere' : activePanel === 'layers' ? 'What do you want to see?' : 'Move through time'}</h2></div><div className="command-header-actions"><button onClick={() => void store.refresh()} aria-label="Refresh sources"><RefreshCw className={store.isRefreshing ? 'spin' : ''}/></button><button onClick={() => setActivePanel(undefined)} aria-label="Close controls"><X/></button></div></header>
          <nav className="command-tabs" aria-label="Earth control sections"><button className={activePanel === 'search' ? 'active' : ''} onClick={() => setActivePanel('search')}><Search/>Find</button><button className={activePanel === 'layers' ? 'active' : ''} onClick={() => setActivePanel('layers')}><Layers3/>Layers</button><button className={activePanel === 'time' ? 'active' : ''} onClick={() => setActivePanel('time')}><Clock3/>Time</button></nav>
          {activePanel === 'search' && <><SearchPanel signals={store.signals} onSelect={(signal) => { selectSignal(signal); setActivePanel(undefined) }} onPlace={(place) => { selectSignalById(undefined); setSelectedIntelligence(searchedPlaceToIntelligence(place)); setGeographicView({ latitude: place.latitude, longitude: place.longitude, altitude: .35 }); setActivePanel(undefined) }}/><p className="control-note">Results stay on Earth and open in the same intelligence sheet. Sources remain available in details.</p></>}
          {activePanel === 'layers' && <>
            <section className="domain-launcher" aria-labelledby="domain-lenses-heading">
              <div className="domain-heading"><span>QUICK VIEWS</span><small>Views add compatible layers. Nothing is silently removed.</small></div>
              <div className="domain-lens-grid" id="domain-lenses-heading" role="group" aria-label="Earth domain lenses">
                <button className={activeEarthLens === 'world' ? 'active' : ''} onClick={() => activateEarthLens('world')}><Globe2/><span><strong>Living Earth</strong><small>A calm, prioritized view of what matters now</small></span><b>LIVE</b></button>
                <button className={activeEarthLens === 'weather' ? 'active' : ''} onClick={() => activateEarthLens('weather')}><CloudRain/><span><strong>Atmosphere</strong><small>Radar, satellite, storms and alerts</small></span><b>VIEW</b></button>
                <button className={activeEarthLens === 'migration' ? 'active life-domain' : 'life-domain'} onClick={() => activateEarthLens('migration')}><Bird/><span><strong>Bird Migration</strong><small>GBIF observation shifts · derived</small></span><b>{migrationStatus === 'loading' ? '…' : migrationEnabled ? 'ON' : 'VIEW'}</b></button>
                <button className={activeEarthLens === 'maritime' ? 'active ocean-domain' : 'ocean-domain'} onClick={() => activateEarthLens('maritime')}><ShipWheel/><span><strong>Maritime</strong><small>Ocean hazards · no live vessel tracking</small></span><b>CONTEXT</b></button>
                <button className={activeEarthLens === 'aviation' ? 'active' : ''} onClick={() => activateEarthLens('aviation')}><Plane/><span><strong>Flight Activity</strong><small>{store.signals.some((signal) => signal.type === 'aircraft' && signal.source.freshness !== 'demo') ? 'Available public aircraft signals' : store.demoMode ? 'Deterministic demonstration feed' : 'No live aircraft provider connected'}</small></span><b>{store.signals.filter((signal) => signal.type === 'aircraft').length || '—'}</b></button>
                <button className={activeEarthLens === 'animals' ? 'active life-domain' : 'life-domain'} onClick={() => activateEarthLens('animals')}><PawPrint/><span><strong>Animals & Life</strong><small>Licensed global animal and plant observations</small></span><b>{lifeStatus === 'loading' ? '…' : lifeEnabled ? 'ON' : 'VIEW'}</b></button>
                <button className={activeEarthLens === 'orbit' ? 'active solar-domain' : 'solar-domain'} onClick={() => activateEarthLens('orbit')}><Satellite/><span><strong>Orbit</strong><small>Space weather and selected objects</small></span><b>VIEW</b></button>
              </div>
              <p>Quick Views emphasize a subject while preserving compatible layers. NEXUS automatically reduces visual density as more systems are enabled.</p>
            </section>
            <div className="environment-grid">
              <button className={`environment-lens ${radarEnabled ? 'active' : ''}`} onClick={() => toggleVisualLayer('radar')} aria-pressed={radarEnabled}><CloudRain/><span><strong>Weather radar</strong><small>Latest NOAA precipitation · coverage varies</small></span><b>{radarEnabled ? 'ON' : 'OFF'}</b></button>
              <button className={`environment-lens ${satelliteEnabled ? 'active' : ''}`} onClick={() => toggleVisualLayer('clouds')} aria-pressed={satelliteEnabled}><Satellite/><span><strong>Satellite imagery</strong><small>Latest GOES GeoColor · regional coverage</small></span><b>{satelliteEnabled ? 'ON' : 'OFF'}</b></button>
            </div>
            {migrationEnabled && <div className="active-domain-note migration-domain-note"><Bird/><span><strong>Bird movement patterns</strong><small>{migrationStatus === 'live' ? `${migration?.corridors.length ?? 0} notable species shifts from ${migration?.recentRecordCount ?? 0} recent observations` : migrationStatus === 'cached' ? 'Showing the most recent saved migration sample' : migrationStatus === 'error' ? 'Bird observations are temporarily unavailable' : 'Finding recent bird movement patterns…'}</small></span>{migration?.corridors.length ? <div className="taxon-strip" aria-label="Migration species">{migration.corridors.slice(0, 10).map((corridor) => <button key={corridor.id} className={migrationFocus?.id === corridor.id ? 'active' : ''} onClick={() => { selectMigration(corridor); setActivePanel(undefined) }}>{corridor.media && <img src={corridor.media.url} alt="" loading="lazy" referrerPolicy="no-referrer"/>}<strong>{corridor.commonName ?? corridor.species}</strong><small>Observations shifted {corridor.direction} · {corridor.recentObservations} recent</small></button>)}</div> : null}{migrationFocus?.media && <a className="media-attribution" href={migrationFocus.media.sourceUrl} target="_blank" rel="noreferrer">Photo: {migrationFocus.media.creator} · {migrationFocus.media.license}</a>}<p>These are changes in observation patterns, not tracks of individual birds. Weather may coincide with movement but does not prove why it occurred.</p>{migrationFocus && <details className="domain-science"><summary>Show the science</summary><dl><div><dt>Scientific name</dt><dd>{migrationFocus.species}</dd></div><div><dt>Derived center shift</dt><dd>{migrationFocus.distanceKm.toLocaleString()} km {migrationFocus.direction}</dd></div><div><dt>Sampling windows</dt><dd>Recent 14 days vs previous 14 days</dd></div></dl></details>}</div>}
            {lifeEnabled && <div className="active-domain-note life-domain-note"><PawPrint/><span><strong>Life across Earth</strong><small>{lifeStatus === 'live' ? `${life?.taxa.length ?? 0} species groups summarized from ${life?.recordCount ?? 0} recent records` : lifeStatus === 'cached' ? 'Showing saved biodiversity context' : lifeStatus === 'error' ? 'Biodiversity observations are temporarily unavailable' : 'Finding recent wildlife and plant observations…'}</small></span>{life?.taxa.length ? <div className="taxon-strip" aria-label="Observed taxa">{life.taxa.slice(0, 10).map((taxon) => <button key={taxon.id} className={lifeFocus?.id === taxon.id ? 'active' : ''} onClick={() => { selectLife(taxon); setActivePanel(undefined) }}>{taxon.media && <img src={taxon.media.url} alt="" loading="lazy" referrerPolicy="no-referrer"/>}<strong>{taxon.commonName ?? taxon.scientificName}</strong><small>{taxon.commonName ? taxon.scientificName : taxon.taxonomicClass ?? taxon.kingdom} · {taxon.observations} records</small></button>)}</div> : null}{lifeFocus?.media && <a className="media-attribution" href={lifeFocus.media.sourceUrl} target="_blank" rel="noreferrer">Photo: {lifeFocus.media.creator} · {lifeFocus.media.license}</a>}<p>{life?.methodology ?? 'Records are grouped into broad regions to protect sensitive wildlife locations.'}</p></div>}
            <button className={`ambient-toggle ${ambientMode ? 'active' : ''}`} onClick={() => setAmbientMode((enabled) => !enabled)} aria-pressed={ambientMode}><MonitorUp/><span><strong>Ambient Earth</strong><small>Keeps the display awake and hides controls after 12 seconds</small></span><b>{ambientMode ? 'ON' : 'OFF'}</b></button>
            <details className="advanced-layers">
              <summary><span>All layers</span><b>{activeLayerCount} active</b></summary>
              <button className="show-everything" onClick={() => { setActiveEarthLens('custom'); setEnabledLayers(new Set(allLayerIds)); store.enableLayers(['earthquake', 'fire', 'weather', 'aircraft', 'satellite', 'space-weather', 'media', 'environment', 'infrastructure']) }}><Layers3/><span><strong>Show everything</strong><small>Power-user view · visual detail adapts automatically</small></span></button>
              {(['ATMOSPHERE', 'HAZARDS', 'LIFE', 'HUMAN', 'OCEAN', 'ORBIT', 'CONTEXT'] as const).map((category) => <section className="layer-category-group" key={category}><h3>{category}</h3><div className="lens-grid">{nexusLayers.filter((layer) => layer.category === category).map((layer) => { const count = store.signals.filter((signal) => layerSupportsSignal(layer.id, signal)).length; const enabled = enabledLayers.has(layer.id); return <button key={layer.id} className={enabled ? 'active' : ''} onClick={() => { setActiveEarthLens('custom'); toggleVisualLayer(layer.id) }} aria-pressed={enabled}><i className={`layer-category-dot ${layer.category.toLowerCase()}`}/><span><strong>{layer.label}</strong><small>{count ? `${count} available` : layer.shortDescription}</small></span><b>{enabled ? 'ON' : 'OFF'}</b></button> })}</div></section>)}
            </details>
            <p className="control-note">Environmental imagery is visual context, not a forecast. Signal lenses never delete locally cached evidence.</p>
          </>}
          {activePanel === 'time' && <><div className="time-panel"><TimeControl value={store.timeWindow} onChange={(window) => { setReplayCutoff(undefined); store.setTimeWindow(window) }}/></div><ReplayControl signals={windowSignals} cutoff={replayCutoff} onCutoff={setReplayCutoff}/><p className="control-note">Replay reveals observations by their authoritative timestamps. It does not interpolate movement or imply causation.</p></>}
        </section>
      </div>}
      {replayCutoff && <button className="replay-indicator" onClick={() => { setReplayCutoff(undefined); setActivePanel('time') }}><span>REPLAY · {new Date(replayCutoff).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><strong>Return live</strong></button>}
    </>
  ), [activateEarthLens, activeEarthLens, activeIntelligence?.location, activeLayerCount, activePanel, ambientMode, enabledLayers, geographicView, handleMapViewChange, leadDiscovery, life, lifeEnabled, lifeFocus, lifeStatus, liveSourceCount, mapTheme, migration, migrationEnabled, migrationFocus, migrationStatus, performanceMode, radarEnabled, replayCutoff, satelliteEnabled, selectDiscovery, selectEcologicalCell, selectedSignal, selectLife, selectMigration, selectSignal, selectSignalById, selectSignalCluster, significantCount, store, toggleVisualLayer, visibleSignals, webGLAvailable, windowSignals])

  return (
    <div className={`app-shell ${ambientActive && ambientIdle ? 'ambient-idle' : ''}`}>
      <TopBar offline={!online} demo={store.demoMode || store.signals.some((signal) => signal.source.freshness === 'demo')} onSettings={() => store.setView('settings')}/>
      <div className={`earth-route ${store.view === 'earth' ? 'active' : ''}`} aria-hidden={store.view !== 'earth'}>{earthContent}</div>
      {store.view === 'discover' && <DiscoverPage discoveries={store.discoveries} signals={store.signals} selectedId={store.selectedDiscoveryId} onOpen={(id) => store.selectDiscovery(id || undefined)} onSave={store.saveDiscovery} onNotes={store.updateCaseNotes} onRemove={async (id) => { await store.removeCase(id); store.selectDiscovery(undefined); store.setView('cases') }}/>}
      {store.view === 'cases' && <CasesPage discoveries={store.discoveries} watches={store.watches} signals={store.signals} onOpen={(id) => store.selectDiscovery(id)} onObserve={(place) => { setSelectedIntelligence(searchedPlaceToIntelligence(place)); setGeographicView({ latitude: place.latitude, longitude: place.longitude, altitude: .35 }); store.setView('earth') }} onUnwatch={store.unwatchPlace}/>}
      {store.view === 'observer' && <ObserverPage key={String(store.observerPlace?.id ?? 'observer')} signals={store.signals} initialPlace={store.observerPlace} watches={store.watches} onWatch={store.watchPlace} onUnwatch={store.unwatchPlace} onSelectIntelligence={setSelectedIntelligence}/>}
      {store.view === 'settings' && (
        <SettingsPage layers={store.layerVisibility} statuses={store.statuses} demoMode={store.demoMode} firmsConfigured={store.firmsConfigured} performanceMode={performanceMode} mapTheme={mapTheme} informationDensity={informationDensity} onToggle={store.toggleLayer} onDemoMode={store.setDemoMode} onFirmsKey={store.setFirmsKey} onRefresh={store.refresh} onPerformance={setPerformanceMode} onMapTheme={setMapTheme} onInformationDensity={setInformationDensity} onErase={async () => { await store.eraseLocalData(); setEnabledLayers(new Set(livingEarthLayerIds)); setActiveEarthLens('world'); setPerformanceMode('automatic'); setMapTheme('dark'); setInformationDensity('standard') }}/>
      )}
      {activeIntelligence && store.view === 'earth' && <IntelligenceInspector object={activeIntelligence} density={informationDensity} onClose={closeIntelligence} onWatch={watchIntelligence} onSelectRelated={setSelectedIntelligence}/>}
      {store.view !== 'settings' && (
        <BottomNav view={store.view} onChange={(view) => { closeIntelligence(); store.setView(view) }}/>
      )}
      {store.view === 'settings' && <button className="settings-done" onClick={() => store.setView('earth')}>Done</button>}
      {!online && <div className="offline-banner"><Activity size={14}/> Offline · viewing stored data</div>}
      {ambientActive && ambientIdle && <div className="ambient-hint">AMBIENT EARTH · TAP FOR CONTROLS</div>}
    </div>
  )
}
