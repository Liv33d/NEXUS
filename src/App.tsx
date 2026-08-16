import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Activity, Clock3, CloudRain, Globe2, Layers3, LoaderCircle, Map, RefreshCw, Search, X } from 'lucide-react'
import { BottomNav, TopBar } from './components/Chrome'
import { CasesPage, DiscoverPage, ObserverPage, SearchPanel, SettingsPage, SurpriseButton } from './components/Pages'
import { SignalSheet } from './components/SignalSheet'
import { TimeControl } from './components/TimeControl'
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
  const visibleSignals = selectVisibleSignals(store)
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

  const earthContent = useMemo(() => (
    <>
      {visualMode === 'map' ? <Suspense fallback={<div className="globe-loading"><LoaderCircle/><span>Loading onboard atlas</span></div>}><MapView signals={visibleSignals} selected={selectedSignal} radarEnabled={radarEnabled} onSelect={(signal) => store.selectSignal(signal.id)}/></Suspense> : !webGLAvailable ? <AccessibleEarthFallback signals={visibleSignals} onSelect={(signal) => store.selectSignal(signal.id)}/> : <Suspense fallback={<div className="globe-loading"><LoaderCircle/><span>Initializing Earth</span></div>}>
        <GlobeView signals={visibleSignals} selected={selectedSignal} radarEnabled={radarEnabled} onSelect={(signal) => store.selectSignal(signal.id)} onReady={() => store.setGlobeReady(true)}/>
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
          <button className={activePanel === 'time' ? 'active' : ''} onClick={() => setActivePanel(activePanel === 'time' ? undefined : 'time')}><Clock3/><span>{store.timeWindow}</span></button>
        </div>
        <div className="view-toggle"><button className={visualMode === 'globe' ? 'active' : ''} onClick={() => setVisualMode('globe')} aria-label={webGLAvailable ? 'Globe view' : 'Globe view unavailable on this device'} disabled={!webGLAvailable} title={webGLAvailable ? 'Globe view' : 'WebGL unavailable'}><Globe2/></button><button className={visualMode === 'map' ? 'active' : ''} onClick={() => setVisualMode('map')} aria-label="Map view"><Map/></button><button onClick={() => void store.refresh()} aria-label="Refresh sources"><RefreshCw className={store.isRefreshing ? 'spin' : ''}/></button></div>
        {!webGLAvailable && <div className="compatibility-notice" role="status">Accessible signal mode · WebGL 2 unavailable</div>}
        <div className="earth-bottom"><SurpriseButton onClick={() => { const result = store.surprise(); if (!result) return; if ('signalIds' in result) { const discovery = result as Discovery; store.selectDiscovery(discovery.id) } else { store.selectSignal((result as Signal).id) } }}/></div>
      </div>
      {activePanel && <div className="command-scrim" onClick={() => setActivePanel(undefined)}><section className="command-sheet" role="dialog" aria-modal="true" aria-label={`${activePanel} controls`} onClick={(event) => event.stopPropagation()}><div className="sheet-handle"/><header><div><span className="eyebrow">EARTH COMMAND</span><h2>{activePanel === 'search' ? 'Find anywhere' : activePanel === 'layers' ? 'Signal lens' : 'Time horizon'}</h2></div><button onClick={() => setActivePanel(undefined)} aria-label="Close controls"><X/></button></header>{activePanel === 'search' && <><SearchPanel signals={store.signals} onSelect={(signal) => { store.selectSignal(signal.id); setActivePanel(undefined) }}/><p className="control-note">Search current evidence, source names, places, and recognized entities.</p></>}{activePanel === 'layers' && <><button className={`environment-lens ${radarEnabled ? 'active' : ''}`} onClick={() => setRadarEnabled((enabled) => !enabled)} aria-pressed={radarEnabled}><CloudRain/><span><strong>Live weather radar</strong><small>NOAA MRMS · US domains · 5 min</small></span><b>{radarEnabled ? 'ON' : 'OFF'}</b></button><div className="lens-summary"><strong>{activeLayerCount}</strong><span>active signal layers</span></div><div className="lens-grid">{earthLayerOptions.map((layer) => { const count = store.signals.filter((signal) => signal.type === layer.type).length; return <button key={layer.type} className={store.layerVisibility[layer.type] ? 'active' : ''} onClick={() => store.toggleLayer(layer.type)} aria-pressed={store.layerVisibility[layer.type]}><i className={`type-dot ${layer.type}`}/><span><strong>{layer.label}</strong><small>{count} available</small></span><b>{store.layerVisibility[layer.type] ? 'ON' : 'OFF'}</b></button> })}</div><p className="control-note">Radar is authoritative current reflectivity—not a forecast. Signal lenses never delete locally cached evidence.</p></>}{activePanel === 'time' && <><div className="time-panel"><TimeControl value={store.timeWindow} onChange={(window) => { store.setTimeWindow(window); setActivePanel(undefined) }}/></div><p className="control-note">Choose the evidence horizon. Provider requests and cached results are bounded to this window.</p></>}</section></div>}
      {visualMode === 'globe' && !store.globeReady && <div className="globe-loading"><LoaderCircle/><span>Initializing Earth</span></div>}
      {selectedSignal && <SignalSheet signal={selectedSignal} onClose={() => store.selectSignal(undefined)}/>} 
    </>
  ), [activeLayerCount, activePanel, leadDiscovery, liveSourceCount, radarEnabled, selectedSignal, significantCount, store, visibleSignals, visualMode, webGLAvailable])

  return (
    <div className="app-shell">
      <TopBar offline={!online} demo={store.demoMode || store.signals.some((signal) => signal.source.freshness === 'demo')} onSettings={() => store.setView('settings')}/>
      {store.view === 'earth' && earthContent}
      {store.view === 'discover' && <DiscoverPage discoveries={store.discoveries} signals={store.signals} selectedId={store.selectedDiscoveryId} onOpen={(id) => store.selectDiscovery(id || undefined)} onSave={store.saveDiscovery}/>} 
      {store.view === 'cases' && <CasesPage discoveries={store.discoveries} onOpen={(id) => store.selectDiscovery(id)}/>} 
      {store.view === 'observer' && <ObserverPage signals={store.signals}/>} 
      {store.view === 'settings' && <SettingsPage layers={store.layerVisibility} statuses={store.statuses} demoMode={store.demoMode} firmsConfigured={store.firmsConfigured} onToggle={store.toggleLayer} onDemoMode={store.setDemoMode} onFirmsKey={store.setFirmsKey} onRefresh={store.refresh}/>} 
      {store.view !== 'settings' && <BottomNav view={store.view} onChange={store.setView}/>} 
      {store.view === 'settings' && <button className="settings-done" onClick={() => store.setView('earth')}>Done</button>}
      {!online && <div className="offline-banner"><Activity size={14}/> Viewing cached and demonstration data</div>}
    </div>
  )
}
