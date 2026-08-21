import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Clock3, CloudRain, Globe2, Layers3, LoaderCircle, Map, MonitorUp, Moon, RefreshCw, Satellite, Search, SunMedium, X } from 'lucide-react'
import { BottomNav, TopBar } from './components/Chrome'
import { CasesPage, DiscoverPage, ObserverPage, SearchPanel, SurpriseButton } from './components/Pages'
import SettingsPage, { type MapTheme, type PerformanceMode } from './components/SettingsPage'
import { SignalSheet } from './components/SignalSheet'
import { TimeControl } from './components/TimeControl'
import { ReplayControl } from './components/ReplayControl'
import { AccessibleEarthFallback } from './components/AccessibleEarthFallback'
import { selectVisibleSignals, useNexusStore } from './store/useNexusStore'
import type { Discovery, Signal, SignalType } from './types/signal'

const GlobeView = lazy(() => import('./components/GlobeView'))
const MapView = lazy(() => import('./components/MapView'))

let cachedWebGLSupport: boolean | undefined
const earthLayerOptions: Array<{ type: SignalType; label: string }> = [
  { type: 'earthquake', label: 'Seismic' }, { type: 'fire', label: 'Thermal' }, { type: 'weather', label: 'Weather' },
  { type: 'environment', label: 'Environment' }, { type: 'space-weather', label: 'Space weather' },
]
const lensPresets: Array<{ id: string; label: string; description: string; types: SignalType[] }> = [
  { id: 'world', label: 'World', description: 'All verified live layers', types: ['earthquake', 'fire', 'weather', 'environment', 'space-weather'] },
  { id: 'storm', label: 'Storm', description: 'Warnings and environmental events', types: ['weather', 'environment'] },
  { id: 'fire', label: 'Fire', description: 'Thermal and air context', types: ['fire', 'environment'] },
  { id: 'seismic', label: 'Seismic', description: 'Earthquakes and volcanoes', types: ['earthquake', 'environment'] },
  { id: 'space', label: 'Space', description: 'Global space weather', types: ['space-weather', 'satellite'] },
]

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
  const wakeLock = useRef<WakeLockSentinel | null>(null)
  const ambientActive = ambientMode && store.view === 'earth'
  const windowSignals = selectVisibleSignals(store)
  const visibleSignals = replayCutoff ? windowSignals.filter((signal) => signal.timestamp <= replayCutoff) : windowSignals
  const selectedSignal = store.signals.find((signal) => signal.id === store.selectedSignalId)
  const liveSourceCount = Object.values(store.statuses).filter((status) => status.state === 'live').length
  const significantCount = store.discoveries.filter((item) => item.score >= 61).length
  const leadDiscovery = store.discoveries[0]
  const activeLayerCount = Object.values(store.layerVisibility).filter(Boolean).length

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
      {visualMode === 'map' ? <Suspense fallback={<div className="globe-loading"><LoaderCircle/><span>Loading geographic detail</span></div>}><MapView signals={visibleSignals} selected={selectedSignal} radarEnabled={radarEnabled} satelliteEnabled={satelliteEnabled} mapTheme={mapTheme} onSelect={(signal) => store.selectSignal(signal.id)}/></Suspense> : !webGLAvailable ? <AccessibleEarthFallback signals={visibleSignals} onSelect={(signal) => store.selectSignal(signal.id)}/> : <Suspense fallback={<div className="globe-loading"><LoaderCircle/><span>Initializing Earth</span></div>}>
        <GlobeView signals={visibleSignals} selected={selectedSignal} radarEnabled={radarEnabled} satelliteEnabled={satelliteEnabled} lightingMode={lightingMode} batterySaver={performanceMode === 'battery'} qualityMode={performanceMode} autoRotate={autoRotate} atmosphereEnabled={atmosphere} labelsEnabled={labels} onSelect={(signal) => store.selectSignal(signal.id)} onReady={() => store.setGlobeReady(true)}/>
      </Suspense>} 
      <div className="earth-overlay">
        <button className={`world-pulse ${leadDiscovery ? `level-${leadDiscovery.level}` : ''}`} onClick={() => leadDiscovery && store.selectDiscovery(leadDiscovery.id)} disabled={!leadDiscovery}>
          <span><Activity/> WORLD PULSE <i>{significantCount ? `${significantCount} significant` : 'nominal'}</i></span>
          <strong>{leadDiscovery?.title ?? (store.isRefreshing ? 'Resolving current activity…' : 'No significant convergence detected')}</strong>
          <small>{leadDiscovery ? `${leadDiscovery.signalIds.length} evidence item${leadDiscovery.signalIds.length === 1 ? '' : 's'} · score ${leadDiscovery.score} · tap to investigate` : `${visibleSignals.length} qualifying signals · ${liveSourceCount} live sources`}</small>
        </button>
        <div className="earth-command-rail" aria-label="Earth controls">
          <button className={activePanel === 'search' ? 'active' : ''} onClick={() => setActivePanel(activePanel === 'search' ? undefined : 'search')}><Search/><span>Find</span></button>
          <button className={activePanel === 'layers' ? 'active' : ''} onClick={() => setActivePanel(activePanel === 'layers' ? undefined : 'layers')}><Layers3/><span>Lens</span></button>
          <button className={activePanel === 'time' ? 'active' : ''} onClick={() => setActivePanel(activePanel === 'time' ? undefined : 'time')}><Clock3/><span>{replayCutoff ? 'Replay' : store.timeWindow}</span></button>
        </div>
        {visualMode === 'globe' && <div className="globe-quick-lenses" aria-label="Globe appearance controls">
          <div className="quick-lighting" role="group" aria-label="Earth lighting">
            <button className={lightingMode === 'live' ? 'active' : ''} onClick={() => setLightingMode('live')} aria-pressed={lightingMode === 'live'}><Globe2/><span>Live</span></button>
            <button className={lightingMode === 'day' ? 'active' : ''} onClick={() => setLightingMode('day')} aria-pressed={lightingMode === 'day'}><SunMedium/><span>Day</span></button>
            <button className={lightingMode === 'night' ? 'active' : ''} onClick={() => setLightingMode('night')} aria-pressed={lightingMode === 'night'}><Moon/><span>Night</span></button>
          </div>
          <div className="quick-imagery" role="group" aria-label="Live environmental imagery">
            <button className={radarEnabled ? 'active' : ''} onClick={() => setRadarEnabled((enabled) => !enabled)} aria-pressed={radarEnabled}><CloudRain/><span>Radar</span></button>
            <button className={satelliteEnabled ? 'active' : ''} onClick={() => setSatelliteEnabled((enabled) => !enabled)} aria-pressed={satelliteEnabled}><Satellite/><span>Clouds</span></button>
          </div>
        </div>}
        <div className="view-toggle"><button className={visualMode === 'globe' ? 'active' : ''} onClick={() => setVisualMode('globe')} aria-label={webGLAvailable ? 'Globe view' : 'Globe view unavailable on this device'} disabled={!webGLAvailable} title={webGLAvailable ? 'Globe view' : 'WebGL unavailable'}><Globe2/></button><button className={visualMode === 'map' ? 'active' : ''} onClick={() => setVisualMode('map')} aria-label="Map view"><Map/></button><button onClick={() => void store.refresh()} aria-label="Refresh sources"><RefreshCw className={store.isRefreshing ? 'spin' : ''}/></button></div>
        {!webGLAvailable && <div className="compatibility-notice" role="status">Accessible signal mode · WebGL 2 unavailable</div>}
        <div className="earth-bottom"><SurpriseButton onClick={() => { const result = store.surprise(); if (!result) return; if ('signalIds' in result) { const discovery = result as Discovery; store.selectDiscovery(discovery.id) } else { store.selectSignal((result as Signal).id) } }}/></div>
      </div>
      {activePanel && <div className="command-scrim" onClick={() => setActivePanel(undefined)}>
        <section className="command-sheet" role="dialog" aria-modal="true" aria-label={`${activePanel} controls`} onClick={(event) => event.stopPropagation()}>
          <div className="sheet-handle"/>
          <header><div><span className="eyebrow">EARTH COMMAND</span><h2>{activePanel === 'search' ? 'Find anywhere' : activePanel === 'layers' ? 'Earth lenses' : 'Time horizon'}</h2></div><button onClick={() => setActivePanel(undefined)} aria-label="Close controls"><X/></button></header>
          {activePanel === 'search' && <><SearchPanel signals={store.signals} onSelect={(signal) => { store.selectSignal(signal.id); setActivePanel(undefined) }} onPlace={(place) => { store.observePlace(place); setActivePanel(undefined) }}/><p className="control-note">Places open directly in Observer. Current evidence remains traceable to its original source.</p></>}
          {activePanel === 'layers' && <>
            <div className="lens-presets" role="group" aria-label="Question-focused lenses">{lensPresets.map((lens) => <button key={lens.id} onClick={() => store.setLayers(lens.types)}><strong>{lens.label}</strong><small>{lens.description}</small></button>)}</div>
            <div className="lighting-control"><span>EARTH LIGHTING</span><div>
              <button className={lightingMode === 'live' ? 'active' : ''} onClick={() => setLightingMode('live')}><Globe2/>Live</button>
              <button className={lightingMode === 'day' ? 'active' : ''} onClick={() => setLightingMode('day')}><SunMedium/>Day</button>
              <button className={lightingMode === 'night' ? 'active' : ''} onClick={() => setLightingMode('night')}><Moon/>Night</button>
            </div></div>
            <div className="environment-grid">
              <button className={`environment-lens ${radarEnabled ? 'active' : ''}`} onClick={() => setRadarEnabled((enabled) => !enabled)} aria-pressed={radarEnabled}><CloudRain/><span><strong>Weather radar</strong><small>NOAA MRMS · US domains · 5 min</small></span><b>{radarEnabled ? 'ON' : 'OFF'}</b></button>
              <button className={`environment-lens ${satelliteEnabled ? 'active' : ''}`} onClick={() => setSatelliteEnabled((enabled) => !enabled)} aria-pressed={satelliteEnabled}><Satellite/><span><strong>Live satellite</strong><small>NOAA GeoColor · GOES East/West</small></span><b>{satelliteEnabled ? 'ON' : 'OFF'}</b></button>
            </div>
            <button className={`ambient-toggle ${ambientMode ? 'active' : ''}`} onClick={() => setAmbientMode((enabled) => !enabled)} aria-pressed={ambientMode}><MonitorUp/><span><strong>Ambient Earth</strong><small>Keeps the display awake and hides controls after 12 seconds</small></span><b>{ambientMode ? 'ON' : 'OFF'}</b></button>
            <div className="lens-summary"><strong>{activeLayerCount}</strong><span>active signal layers</span></div>
            <div className="lens-grid">{earthLayerOptions.map((layer) => { const count = store.signals.filter((signal) => signal.type === layer.type).length; return <button key={layer.type} className={store.layerVisibility[layer.type] ? 'active' : ''} onClick={() => store.toggleLayer(layer.type)} aria-pressed={store.layerVisibility[layer.type]}><i className={`type-dot ${layer.type}`}/><span><strong>{layer.label}</strong><small>{count} available</small></span><b>{store.layerVisibility[layer.type] ? 'ON' : 'OFF'}</b></button> })}</div>
            <p className="control-note">Environmental imagery is visual context, not a forecast. Signal lenses never delete locally cached evidence.</p>
          </>}
          {activePanel === 'time' && <><div className="time-panel"><TimeControl value={store.timeWindow} onChange={(window) => { setReplayCutoff(undefined); store.setTimeWindow(window) }}/></div><ReplayControl signals={windowSignals} cutoff={replayCutoff} onCutoff={setReplayCutoff}/><p className="control-note">Replay reveals observations by their authoritative timestamps. It does not interpolate movement or imply causation.</p></>}
        </section>
      </div>}
      {visualMode === 'globe' && !store.globeReady && <div className="globe-loading"><LoaderCircle/><span>Initializing Earth</span></div>}
      {selectedSignal && <SignalSheet signal={selectedSignal} onClose={() => store.selectSignal(undefined)}/>} 
      {replayCutoff && <button className="replay-indicator" onClick={() => { setReplayCutoff(undefined); setActivePanel('time') }}><span>REPLAY · {new Date(replayCutoff).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><strong>Return live</strong></button>}
    </>
  ), [activeLayerCount, activePanel, ambientMode, atmosphere, autoRotate, labels, leadDiscovery, lightingMode, liveSourceCount, mapTheme, performanceMode, radarEnabled, replayCutoff, satelliteEnabled, selectedSignal, significantCount, store, visibleSignals, visualMode, webGLAvailable, windowSignals])

  return (
    <div className={`app-shell ${ambientActive && ambientIdle ? 'ambient-idle' : ''}`}>
      <TopBar offline={!online} demo={store.demoMode || store.signals.some((signal) => signal.source.freshness === 'demo')} onSettings={() => store.setView('settings')}/>
      {store.view === 'earth' && earthContent}
      {store.view === 'discover' && <DiscoverPage discoveries={store.discoveries} signals={store.signals} selectedId={store.selectedDiscoveryId} onOpen={(id) => store.selectDiscovery(id || undefined)} onSave={store.saveDiscovery} onNotes={store.updateCaseNotes} onRemove={async (id) => { await store.removeCase(id); store.selectDiscovery(undefined); store.setView('cases') }}/>} 
      {store.view === 'cases' && <CasesPage discoveries={store.discoveries} watches={store.watches} signals={store.signals} onOpen={(id) => store.selectDiscovery(id)} onObserve={store.observePlace} onUnwatch={store.unwatchPlace}/>} 
      {store.view === 'observer' && <ObserverPage key={String(store.observerPlace?.id ?? 'observer')} signals={store.signals} initialPlace={store.observerPlace} watches={store.watches} onWatch={store.watchPlace} onUnwatch={store.unwatchPlace}/>} 
      {store.view === 'settings' && <SettingsPage layers={store.layerVisibility} statuses={store.statuses} demoMode={store.demoMode} firmsConfigured={store.firmsConfigured} performanceMode={performanceMode} autoRotate={autoRotate} atmosphere={atmosphere} labels={labels} mapTheme={mapTheme} onToggle={store.toggleLayer} onDemoMode={store.setDemoMode} onFirmsKey={store.setFirmsKey} onRefresh={store.refresh} onPerformance={setPerformanceMode} onAutoRotate={setAutoRotate} onAtmosphere={setAtmosphere} onLabels={setLabels} onMapTheme={setMapTheme} onErase={async () => { await store.eraseLocalData(); setRadarEnabled(false); setSatelliteEnabled(false); setLightingMode('live'); setPerformanceMode('automatic'); setAutoRotate(true); setAtmosphere(true); setLabels(true); setMapTheme('dark') }}/>} 
      {store.view !== 'settings' && <BottomNav view={store.view} onChange={store.setView}/>} 
      {store.view === 'settings' && <button className="settings-done" onClick={() => store.setView('earth')}>Done</button>}
      {!online && <div className="offline-banner"><Activity size={14}/> Offline · viewing stored data</div>}
      {ambientActive && ambientIdle && <div className="ambient-hint">AMBIENT EARTH · TAP FOR CONTROLS</div>}
    </div>
  )
}
