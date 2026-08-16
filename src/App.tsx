import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Activity, Globe2, LoaderCircle, Map, RefreshCw } from 'lucide-react'
import { BottomNav, TopBar } from './components/Chrome'
import { CasesPage, DiscoverPage, ObserverPage, SearchPanel, SettingsPage, SurpriseButton } from './components/Pages'
import { SignalSheet } from './components/SignalSheet'
import { TimeControl } from './components/TimeControl'
import { FlatMapView } from './components/FlatMapView'
import { selectVisibleSignals, useNexusStore } from './store/useNexusStore'
import type { Discovery, Signal } from './types/signal'

const GlobeView = lazy(() => import('./components/GlobeView'))

let cachedWebGLSupport: boolean | undefined

function supportsWebGL() {
  if (cachedWebGLSupport !== undefined) return cachedWebGLSupport
  try {
    const canvas = document.createElement('canvas')
    cachedWebGLSupport = Boolean(
      canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
      || canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true }),
    )
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
  const visibleSignals = selectVisibleSignals(store)
  const selectedSignal = store.signals.find((signal) => signal.id === store.selectedSignalId)
  const liveSourceCount = Object.values(store.statuses).filter((status) => status.state === 'live').length
  const significantCount = store.discoveries.filter((item) => item.score >= 61).length

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

  const earthContent = useMemo(() => (
    <>
      {visualMode === 'globe' ? <Suspense fallback={<div className="globe-loading"><LoaderCircle/><span>Initializing Earth</span></div>}>
        <GlobeView signals={visibleSignals} selected={selectedSignal} onSelect={(signal) => store.selectSignal(signal.id)} onReady={() => store.setGlobeReady(true)}/>
      </Suspense> : <FlatMapView signals={visibleSignals} selected={selectedSignal} onSelect={(signal) => store.selectSignal(signal.id)}/>} 
      <div className="earth-overlay">
        <SearchPanel signals={store.signals} onSelect={(signal) => store.selectSignal(signal.id)}/>
        <div className="earth-toolbar"><div className="earth-stats"><div><span>Visible signals</span><strong>{visibleSignals.length}</strong></div><div><span>Live sources</span><strong>{liveSourceCount}<small>/ {Object.keys(store.statuses).length}</small></strong></div><div><span>Significant</span><strong>{significantCount}</strong></div></div><div className="view-toggle"><button className={visualMode === 'globe' ? 'active' : ''} onClick={() => setVisualMode('globe')} aria-label={webGLAvailable ? 'Globe view' : 'Globe view unavailable on this device'} disabled={!webGLAvailable} title={webGLAvailable ? 'Globe view' : 'WebGL unavailable'}><Globe2/></button><button className={visualMode === 'map' ? 'active' : ''} onClick={() => setVisualMode('map')} aria-label="Map view"><Map/></button><button onClick={() => void store.refresh()} aria-label="Refresh sources"><RefreshCw className={store.isRefreshing ? 'spin' : ''}/></button></div></div>
        {!webGLAvailable && <div className="compatibility-notice" role="status">2D compatibility mode · WebGL unavailable</div>}
        <div className="provider-strip" aria-label="Provider health">{Object.values(store.statuses).map((status) => <span key={status.providerId} className={`provider-state ${status.state}`}><i/>{status.providerName?.replace('NOAA ', '').replace('NASA ', '') ?? status.providerId}</span>)}</div>
        <div className="earth-bottom"><SurpriseButton onClick={() => { const result = store.surprise(); if (!result) return; if ('signalIds' in result) { const discovery = result as Discovery; store.selectDiscovery(discovery.id) } else { store.selectSignal((result as Signal).id) } }}/><TimeControl value={store.timeWindow} onChange={store.setTimeWindow}/></div>
      </div>
      {visualMode === 'globe' && !store.globeReady && <div className="globe-loading"><LoaderCircle/><span>Initializing Earth</span></div>}
      {selectedSignal && <SignalSheet signal={selectedSignal} onClose={() => store.selectSignal(undefined)}/>} 
    </>
  ), [liveSourceCount, selectedSignal, significantCount, store, visibleSignals, visualMode, webGLAvailable])

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
