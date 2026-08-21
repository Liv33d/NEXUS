import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Bird, Clock3, CloudRain, Globe2, Layers3, LoaderCircle, MonitorUp, Moon, Orbit, PawPrint, Plane, RefreshCw, Satellite, Search, ShipWheel, SunMedium, X } from 'lucide-react'
import { BottomNav, TopBar } from './components/Chrome'
import { CasesPage, DiscoverPage, ObserverPage, SearchPanel, SurpriseButton } from './components/Pages'
import SettingsPage, { type MapTheme, type PerformanceMode } from './components/SettingsPage'
import { SignalSheet } from './components/SignalSheet'
import { TimeControl } from './components/TimeControl'
import { ReplayControl } from './components/ReplayControl'
import { AccessibleEarthFallback } from './components/AccessibleEarthFallback'
import { filterVisibleSignals, useNexusStore } from './store/useNexusStore'
import type { Discovery, Signal, SignalType } from './types/signal'
import { clampGeographicView, DEFAULT_GEOGRAPHIC_VIEW, shouldEnterDetailedMap, type GeographicView } from './lib/geography'
import { fetchMigrationSnapshot, type MigrationSnapshot } from './lib/migration'

const GlobeView = lazy(() => import('./components/GlobeView'))
const MapView = lazy(() => import('./components/MapView'))
const SolarSystemView = lazy(() => import('./components/SolarSystemView'))

let cachedWebGLSupport: boolean | undefined
const earthLayerOptions: Array<{ type: SignalType; label: string }> = [
  { type: 'earthquake', label: 'Seismic' }, { type: 'fire', label: 'Thermal' }, { type: 'weather', label: 'Weather' },
  { type: 'environment', label: 'Environment' }, { type: 'space-weather', label: 'Space weather' },
]
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
  const [visualMode, setVisualMode] = useState<'globe' | 'map'>(() => supportsWebGL() ? 'globe' : 'map')
  const [activePanel, setActivePanel] = useState<'search' | 'layers' | 'time'>()
  const [earthDomain, setEarthDomain] = useState<'earth' | 'solar'>('earth')
  const [activeEarthLens, setActiveEarthLens] = useState<EarthLensId>('world')
  const [migrationEnabled, setMigrationEnabled] = useState(() => {
    try { return localStorage.getItem('nexus:migration') === 'true' } catch { return false }
  })
  const [migration, setMigration] = useState<MigrationSnapshot>()
  const [migrationStatus, setMigrationStatus] = useState<'idle' | 'loading' | 'live' | 'cached' | 'error'>('idle')
  const [radarEnabled, setRadarEnabled] = useState(() => {
    try { return localStorage.getItem('nexus:radar') === 'true' } catch { return false }
  })
  const [satelliteEnabled, setSatelliteEnabled] = useState(() => {
    try { return localStorage.getItem('nexus:satellite') === 'true' } catch { return false }
  })
  const [lightingMode, setLightingMode] = useState<'live' | 'day' | 'night'>(() => {
    try { const value = localStorage.getItem('nexus:lighting'); return value === 'day' || value === 'night' ? value : 'live' } catch { return 'live' }
  })
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>(() => {
    try { const value = localStorage.getItem('nexus:performance'); return value === 'quality' || value === 'battery' ? value : 'automatic' } catch { return 'automatic' }
  })
  const [autoRotate, setAutoRotate] = useState(() => { try { return localStorage.getItem('nexus:autoRotate') !== 'false' } catch { return true } })
  const [atmosphere, setAtmosphere] = useState(() => { try { return localStorage.getItem('nexus:atmosphere') !== 'false' } catch { return true } })
  const [labels, setLabels] = useState(() => { try { return localStorage.getItem('nexus:labels') !== 'false' } catch { return true } })
  const [mapTheme, setMapTheme] = useState<MapTheme>(() => { try { return localStorage.getItem('nexus:mapTheme') === 'street' ? 'street' : 'dark' } catch { return 'dark' } })
  const [ambientMode, setAmbientMode] = useState(false)
  const [replayCutoff, setReplayCutoff] = useState<number>()
  const [ambientIdle, setAmbientIdle] = useState(false)
  const [geographicView, setGeographicView] = useState<GeographicView>(DEFAULT_GEOGRAPHIC_VIEW)
  const wakeLock = useRef<WakeLockSentinel | null>(null)
  const ambientActive = ambientMode && store.view === 'earth'
  const windowSignals = useMemo(() => filterVisibleSignals(store.signals, store.timeWindow, store.layerVisibility), [store.layerVisibility, store.signals, store.timeWindow])
  const visibleSignals = useMemo(() => replayCutoff ? windowSignals.filter((signal) => signal.timestamp <= replayCutoff) : windowSignals, [replayCutoff, windowSignals])
  const selectedSignal = useMemo(() => store.signals.find((signal) => signal.id === store.selectedSignalId), [store.selectedSignalId, store.signals])
  const liveSourceCount = Object.values(store.statuses).filter((status) => status.state === 'live').length
  const significantCount = store.discoveries.filter((item) => item.score >= 61).length
  const leadDiscovery = store.discoveries[0]
  const activeLayerCount = Object.values(store.layerVisibility).filter(Boolean).length
  const selectSignalById = store.selectSignal
  const markGlobeReady = store.setGlobeReady
  const selectSignal = useCallback((signal: Signal) => selectSignalById(signal.id), [selectSignalById])
  const globeReady = useCallback(() => markGlobeReady(true), [markGlobeReady])
  const handleGlobeViewChange = useCallback((view: GeographicView) => {
    const next = clampGeographicView(view)
    setGeographicView(next)
    if (shouldEnterDetailedMap(next)) setVisualMode('map')
  }, [])
  const handleMapViewChange = useCallback((view: GeographicView) => setGeographicView(clampGeographicView(view)), [])
  const returnToGlobe = useCallback(() => { if (webGLAvailable) setVisualMode('globe') }, [webGLAvailable])
  const enterSolarSystem = useCallback(() => {
    if (!webGLAvailable) return
    setActivePanel(undefined)
    setEarthDomain('solar')
  }, [webGLAvailable])
  const activateEarthLens = useCallback((lens: EarthLensId) => {
    setActiveEarthLens(lens)
    if (lens === 'world') {
      store.setLayers(['earthquake', 'fire', 'weather', 'environment', 'space-weather'])
      setMigrationEnabled(false)
    } else if (lens === 'weather') {
      store.setLayers(['weather', 'environment'])
      setRadarEnabled(true)
      setMigrationEnabled(false)
    } else if (lens === 'migration') {
      store.setLayers(['environment'])
      // Migration is a deliberate visual focus. Atmospheric rasters otherwise
      // occlude the derived corridors and hotspots on a phone-sized globe.
      setRadarEnabled(false)
      setSatelliteEnabled(false)
      setMigrationEnabled(true)
    } else if (lens === 'maritime') {
      store.setLayers(['weather', 'environment', 'infrastructure'])
      setMigrationEnabled(false)
    } else if (lens === 'aviation') {
      store.setLayers(['aircraft', 'weather'])
      setMigrationEnabled(false)
    } else if (lens === 'animals') {
      setMigrationEnabled(false)
      setActivePanel(undefined)
      store.setView('observer')
    } else {
      store.setLayers(['satellite', 'space-weather'])
      setMigrationEnabled(false)
    }
  }, [store])

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
    try { localStorage.setItem('nexus:radar', String(radarEnabled)) } catch { /* private storage may be unavailable */ }
  }, [radarEnabled])

  useEffect(() => {
    try { localStorage.setItem('nexus:migration', String(migrationEnabled)) } catch { /* private storage may be unavailable */ }
    if (!migrationEnabled) { setMigrationStatus('idle'); return }
    const controller = new AbortController()
    setMigrationStatus('loading')
    void fetchMigrationSnapshot(controller.signal)
      .then((value) => { setMigration(value); setMigrationStatus(value.freshness) })
      .catch(() => { if (!controller.signal.aborted) setMigrationStatus('error') })
    return () => controller.abort()
  }, [migrationEnabled])

  useEffect(() => {
    try { localStorage.setItem('nexus:satellite', String(satelliteEnabled)); localStorage.setItem('nexus:lighting', lightingMode) } catch { /* private storage may be unavailable */ }
  }, [lightingMode, satelliteEnabled])

  useEffect(() => {
    try {
      localStorage.setItem('nexus:performance', performanceMode); localStorage.setItem('nexus:autoRotate', String(autoRotate))
      localStorage.setItem('nexus:atmosphere', String(atmosphere)); localStorage.setItem('nexus:labels', String(labels)); localStorage.setItem('nexus:mapTheme', mapTheme)
    } catch { /* private storage may be unavailable */ }
  }, [atmosphere, autoRotate, labels, mapTheme, performanceMode])

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
      {visualMode === 'map' ? <Suspense fallback={<div className="globe-loading"><LoaderCircle/><span>Loading geographic detail</span></div>}><MapView signals={visibleSignals} selected={selectedSignal} radarEnabled={radarEnabled} satelliteEnabled={satelliteEnabled} mapTheme={mapTheme} initialView={geographicView} onViewChange={handleMapViewChange} onRequestGlobe={returnToGlobe} onSelect={selectSignal}/></Suspense> : !webGLAvailable ? <AccessibleEarthFallback signals={visibleSignals} onSelect={selectSignal}/> : <Suspense fallback={<div className="globe-loading"><LoaderCircle/><span>Initializing Earth</span></div>}>
        <GlobeView signals={visibleSignals} selected={selectedSignal} radarEnabled={radarEnabled} satelliteEnabled={satelliteEnabled} lightingMode={lightingMode} batterySaver={performanceMode === 'battery'} qualityMode={performanceMode} autoRotate={autoRotate} atmosphereEnabled={atmosphere} labelsEnabled={labels} initialView={geographicView} onViewChange={handleGlobeViewChange} onRequestSolar={enterSolarSystem} onSelect={selectSignal} onReady={globeReady} migration={migrationEnabled ? migration : undefined}/>
      </Suspense>} 
      <div className="earth-overlay">
        <button className={`world-pulse ${leadDiscovery ? `level-${leadDiscovery.level}` : ''}`} onClick={() => leadDiscovery && store.selectDiscovery(leadDiscovery.id)} disabled={!leadDiscovery}>
          <span><Activity/> WORLD PULSE <i>{significantCount ? `${significantCount} significant` : 'nominal'}</i></span>
          <strong>{leadDiscovery?.title ?? (store.isRefreshing ? 'Resolving current activity…' : 'No significant convergence detected')}</strong>
          <small>{leadDiscovery ? leadDiscovery.memory?.status === 'established' ? `${leadDiscovery.memory.deviationPercent! >= 0 ? '+' : ''}${leadDiscovery.memory.deviationPercent}% vs ${leadDiscovery.memory.observedDays}d regional baseline · score ${leadDiscovery.score}` : `${leadDiscovery.signalIds.length} evidence item${leadDiscovery.signalIds.length === 1 ? '' : 's'} · memory learning · score ${leadDiscovery.score}` : `${visibleSignals.length} qualifying signals · ${liveSourceCount} live sources`}</small>
        </button>
        <button className={`earth-tools-button ${activePanel ? 'active' : ''}`} onClick={() => setActivePanel(activePanel ? undefined : 'layers')} aria-expanded={Boolean(activePanel)} aria-label="Explore Earth controls"><Layers3/><span>Explore</span></button>
        {!webGLAvailable && <div className="compatibility-notice" role="status">Accessible signal mode · WebGL 2 unavailable</div>}
        <div className="earth-bottom"><SurpriseButton onClick={() => { const result = store.surprise(); if (!result) return; if ('signalIds' in result) { const discovery = result as Discovery; store.selectDiscovery(discovery.id) } else { store.selectSignal((result as Signal).id) } }}/></div>
      </div>
      {activePanel && <div className="command-scrim" onClick={() => setActivePanel(undefined)}>
        <section className="command-sheet" role="dialog" aria-modal="true" aria-label={`${activePanel} controls`} onClick={(event) => event.stopPropagation()}>
          <div className="sheet-handle"/>
          <header><div><span className="eyebrow">EARTH COMMAND</span><h2>{activePanel === 'search' ? 'Find anywhere' : activePanel === 'layers' ? 'Earth lenses' : 'Time horizon'}</h2></div><div className="command-header-actions"><button onClick={() => void store.refresh()} aria-label="Refresh sources"><RefreshCw className={store.isRefreshing ? 'spin' : ''}/></button><button onClick={() => setActivePanel(undefined)} aria-label="Close controls"><X/></button></div></header>
          <nav className="command-tabs" aria-label="Earth control sections"><button className={activePanel === 'search' ? 'active' : ''} onClick={() => setActivePanel('search')}><Search/>Find</button><button className={activePanel === 'layers' ? 'active' : ''} onClick={() => setActivePanel('layers')}><Layers3/>Layers</button><button className={activePanel === 'time' ? 'active' : ''} onClick={() => setActivePanel('time')}><Clock3/>Time</button></nav>
          {activePanel === 'search' && <><SearchPanel signals={store.signals} onSelect={(signal) => { store.selectSignal(signal.id); setActivePanel(undefined) }} onPlace={(place) => { store.observePlace(place); setActivePanel(undefined) }}/><p className="control-note">Places open directly in Observer. Current evidence remains traceable to its original source.</p></>}
          {activePanel === 'layers' && <>
            <section className="domain-launcher" aria-labelledby="domain-lenses-heading">
              <div className="domain-heading"><span>EXPLORE BY DOMAIN</span><small>Each lens changes the evidence shown on Earth</small></div>
              <div className="domain-lens-grid" id="domain-lenses-heading" role="group" aria-label="Earth domain lenses">
                <button className={activeEarthLens === 'world' ? 'active' : ''} onClick={() => activateEarthLens('world')}><Globe2/><span><strong>Living Earth</strong><small>All verified planetary signals</small></span><b>LIVE</b></button>
                <button className="solar-domain" onClick={enterSolarSystem} disabled={!webGLAvailable} aria-disabled={!webGLAvailable}><Orbit/><span><strong>Solar System</strong><small>{webGLAvailable ? 'Calculated planets, Moon and Sun' : 'Requires WebGL 2 on this device'}</small></span><b>{webGLAvailable ? 'OPEN' : 'UNAVAILABLE'}</b></button>
                <button className={activeEarthLens === 'weather' ? 'active' : ''} onClick={() => activateEarthLens('weather')}><CloudRain/><span><strong>Atmosphere</strong><small>Radar, clouds, storms and alerts</small></span><b>LIVE</b></button>
                <button className={activeEarthLens === 'migration' ? 'active life-domain' : 'life-domain'} onClick={() => activateEarthLens('migration')}><Bird/><span><strong>Bird Migration</strong><small>GBIF observation shifts · derived</small></span><b>{migrationStatus === 'loading' ? '…' : migrationEnabled ? 'ON' : 'VIEW'}</b></button>
                <button className={activeEarthLens === 'maritime' ? 'active ocean-domain' : 'ocean-domain'} onClick={() => activateEarthLens('maritime')}><ShipWheel/><span><strong>Maritime</strong><small>Ocean hazards and public context</small></span><b>CONTEXT</b></button>
                <button className={activeEarthLens === 'aviation' ? 'active' : ''} onClick={() => activateEarthLens('aviation')}><Plane/><span><strong>Flight Activity</strong><small>{store.signals.some((signal) => signal.type === 'aircraft' && signal.source.freshness !== 'demo') ? 'Available public aircraft signals' : store.demoMode ? 'Deterministic demonstration feed' : 'No live aircraft provider connected'}</small></span><b>{store.signals.filter((signal) => signal.type === 'aircraft').length || '—'}</b></button>
                <button onClick={() => activateEarthLens('animals')}><PawPrint/><span><strong>Animals & Life</strong><small>Licensed nearby observations in Observer</small></span><b>OPEN</b></button>
                <button className={activeEarthLens === 'orbit' ? 'active solar-domain' : 'solar-domain'} onClick={() => activateEarthLens('orbit')}><Satellite/><span><strong>Orbit</strong><small>Space weather and selected objects</small></span><b>VIEW</b></button>
              </div>
              <p>Maritime does not imply live vessel tracking. Bird corridors are derived from licensed observation aggregates, and aircraft only appear when a real or clearly marked demo source is available.</p>
            </section>
            <div className="lighting-control"><span>EARTH LIGHTING</span><div>
              <button className={lightingMode === 'live' ? 'active' : ''} onClick={() => setLightingMode('live')}><Globe2/>Live</button>
              <button className={lightingMode === 'day' ? 'active' : ''} onClick={() => setLightingMode('day')}><SunMedium/>Day</button>
              <button className={lightingMode === 'night' ? 'active' : ''} onClick={() => setLightingMode('night')}><Moon/>Night</button>
            </div></div>
            <div className="environment-grid">
              <button className={`environment-lens ${radarEnabled ? 'active' : ''}`} onClick={() => setRadarEnabled((enabled) => !enabled)} aria-pressed={radarEnabled}><CloudRain/><span><strong>Weather radar</strong><small>NOAA MRMS · US domains · 5 min</small></span><b>{radarEnabled ? 'ON' : 'OFF'}</b></button>
              <button className={`environment-lens ${satelliteEnabled ? 'active' : ''}`} onClick={() => setSatelliteEnabled((enabled) => !enabled)} aria-pressed={satelliteEnabled}><Satellite/><span><strong>Observed clouds</strong><small>NASA VIIRS · global · daily</small></span><b>{satelliteEnabled ? 'ON' : 'OFF'}</b></button>
            </div>
            {migrationEnabled && <div className="active-domain-note"><Bird/><span><strong>Migration overlay active</strong><small>{migrationStatus === 'live' ? `${migration?.recentRecordCount ?? 0} licensed records · ${migration?.corridors.length ?? 0} derived shifts` : migrationStatus === 'cached' ? `${migration?.recentRecordCount ?? 0} cached records · offline-safe` : migrationStatus === 'error' ? 'GBIF unavailable · no stored sample' : 'Resolving licensed observations…'}</small></span></div>}
            <button className={`ambient-toggle ${ambientMode ? 'active' : ''}`} onClick={() => setAmbientMode((enabled) => !enabled)} aria-pressed={ambientMode}><MonitorUp/><span><strong>Ambient Earth</strong><small>Keeps the display awake and hides controls after 12 seconds</small></span><b>{ambientMode ? 'ON' : 'OFF'}</b></button>
            <details className="advanced-layers">
              <summary><span>Signal categories</span><b>{activeLayerCount} active</b></summary>
              <div className="lens-grid">{earthLayerOptions.map((layer) => { const count = store.signals.filter((signal) => signal.type === layer.type).length; return <button key={layer.type} className={store.layerVisibility[layer.type] ? 'active' : ''} onClick={() => { setActiveEarthLens('custom'); store.toggleLayer(layer.type) }} aria-pressed={store.layerVisibility[layer.type]}><i className={`type-dot ${layer.type}`}/><span><strong>{layer.label}</strong><small>{count} available</small></span><b>{store.layerVisibility[layer.type] ? 'ON' : 'OFF'}</b></button> })}</div>
            </details>
            <p className="control-note">Environmental imagery is visual context, not a forecast. Signal lenses never delete locally cached evidence.</p>
          </>}
          {activePanel === 'time' && <><div className="time-panel"><TimeControl value={store.timeWindow} onChange={(window) => { setReplayCutoff(undefined); store.setTimeWindow(window) }}/></div><ReplayControl signals={windowSignals} cutoff={replayCutoff} onCutoff={setReplayCutoff}/><p className="control-note">Replay reveals observations by their authoritative timestamps. It does not interpolate movement or imply causation.</p></>}
        </section>
      </div>}
      {visualMode === 'globe' && !store.globeReady && <div className="globe-loading"><LoaderCircle/><span>Initializing Earth</span></div>}
      {selectedSignal && <SignalSheet signal={selectedSignal} onClose={() => store.selectSignal(undefined)}/>} 
      {replayCutoff && <button className="replay-indicator" onClick={() => { setReplayCutoff(undefined); setActivePanel('time') }}><span>REPLAY · {new Date(replayCutoff).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><strong>Return live</strong></button>}
    </>
  ), [activateEarthLens, activeEarthLens, activeLayerCount, activePanel, ambientMode, atmosphere, autoRotate, enterSolarSystem, geographicView, globeReady, handleGlobeViewChange, handleMapViewChange, labels, leadDiscovery, lightingMode, liveSourceCount, mapTheme, migration, migrationEnabled, migrationStatus, performanceMode, radarEnabled, replayCutoff, returnToGlobe, satelliteEnabled, selectSignal, selectedSignal, significantCount, store, visibleSignals, visualMode, webGLAvailable, windowSignals])

  return (
    <div className={`app-shell ${ambientActive && ambientIdle ? 'ambient-idle' : ''}`}>
      <TopBar offline={!online} demo={store.demoMode || store.signals.some((signal) => signal.source.freshness === 'demo')} onSettings={() => store.setView('settings')}/>
      {store.view === 'earth' && (earthDomain === 'earth' ? earthContent : <Suspense fallback={<div className="globe-loading"><LoaderCircle/><span>Calculating planetary positions</span></div>}><SolarSystemView batterySaver={performanceMode === 'battery'} onBack={() => setEarthDomain('earth')}/></Suspense>)}
      {store.view === 'discover' && <DiscoverPage discoveries={store.discoveries} signals={store.signals} selectedId={store.selectedDiscoveryId} onOpen={(id) => store.selectDiscovery(id || undefined)} onSave={store.saveDiscovery} onNotes={store.updateCaseNotes} onRemove={async (id) => { await store.removeCase(id); store.selectDiscovery(undefined); store.setView('cases') }}/>} 
      {store.view === 'cases' && <CasesPage discoveries={store.discoveries} watches={store.watches} signals={store.signals} onOpen={(id) => store.selectDiscovery(id)} onObserve={store.observePlace} onUnwatch={store.unwatchPlace}/>} 
      {store.view === 'observer' && <ObserverPage key={String(store.observerPlace?.id ?? 'observer')} signals={store.signals} initialPlace={store.observerPlace} watches={store.watches} onWatch={store.watchPlace} onUnwatch={store.unwatchPlace}/>} 
      {store.view === 'settings' && <SettingsPage layers={store.layerVisibility} statuses={store.statuses} demoMode={store.demoMode} firmsConfigured={store.firmsConfigured} performanceMode={performanceMode} autoRotate={autoRotate} atmosphere={atmosphere} labels={labels} mapTheme={mapTheme} onToggle={store.toggleLayer} onDemoMode={store.setDemoMode} onFirmsKey={store.setFirmsKey} onRefresh={store.refresh} onPerformance={setPerformanceMode} onAutoRotate={setAutoRotate} onAtmosphere={setAtmosphere} onLabels={setLabels} onMapTheme={setMapTheme} onErase={async () => { await store.eraseLocalData(); setRadarEnabled(false); setSatelliteEnabled(false); setLightingMode('live'); setPerformanceMode('automatic'); setAutoRotate(true); setAtmosphere(true); setLabels(true); setMapTheme('dark') }}/>} 
      {store.view !== 'settings' && <BottomNav view={store.view} onChange={(view) => { if (view === 'earth') setEarthDomain('earth'); store.setView(view) }}/>} 
      {store.view === 'settings' && <button className="settings-done" onClick={() => store.setView('earth')}>Done</button>}
      {!online && <div className="offline-banner"><Activity size={14}/> Offline · viewing stored data</div>}
      {ambientActive && ambientIdle && <div className="ambient-hint">AMBIENT EARTH · TAP FOR CONTROLS</div>}
    </div>
  )
}
