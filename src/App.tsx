import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Activity, LoaderCircle } from 'lucide-react'
import { BottomNav, TopBar } from './components/Chrome'
import { CasesPage, DiscoverPage, ObserverPage, SearchPanel, SettingsPage, SurpriseButton } from './components/Pages'
import { SignalSheet } from './components/SignalSheet'
import { TimeControl } from './components/TimeControl'
import { selectVisibleSignals, useNexusStore } from './store/useNexusStore'
import type { Discovery, Signal } from './types/signal'

const GlobeView = lazy(() => import('./components/GlobeView'))

export default function App() {
  const store = useNexusStore()
  const [online, setOnline] = useState(navigator.onLine)
  const visibleSignals = selectVisibleSignals(store)
  const selectedSignal = store.signals.find((signal) => signal.id === store.selectedSignalId)
  const liveCount = store.signals.filter((signal) => signal.source.freshness === 'live').length
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
      <Suspense fallback={<div className="globe-loading"><LoaderCircle/><span>Initializing Earth</span></div>}>
        <GlobeView signals={visibleSignals} selected={selectedSignal} onSelect={(signal) => store.selectSignal(signal.id)} onReady={() => store.setGlobeReady(true)}/>
      </Suspense>
      <div className="earth-overlay">
        <SearchPanel signals={store.signals} onSelect={(signal) => store.selectSignal(signal.id)}/>
        <div className="earth-stats"><div><span>Visible signals</span><strong>{visibleSignals.length}</strong></div><div><span>Live sources</span><strong>{liveCount ? 1 : 0}<small>/ 2</small></strong></div><div><span>Significant</span><strong>{significantCount}</strong></div></div>
        <div className="earth-bottom"><SurpriseButton onClick={() => { const result = store.surprise(); if (!result) return; if ('signalIds' in result) { const discovery = result as Discovery; store.selectDiscovery(discovery.id) } else { store.selectSignal((result as Signal).id) } }}/><TimeControl value={store.timeWindow} onChange={store.setTimeWindow}/></div>
      </div>
      {!store.globeReady && <div className="globe-loading"><LoaderCircle/><span>Initializing Earth</span></div>}
      {selectedSignal && <SignalSheet signal={selectedSignal} onClose={() => store.selectSignal(undefined)}/>} 
    </>
  ), [liveCount, selectedSignal, significantCount, store, visibleSignals])

  return (
    <div className="app-shell">
      <TopBar offline={!online} demo={store.demoMode || store.signals.some((signal) => signal.source.freshness === 'demo')} onSettings={() => store.setView('settings')}/>
      {store.view === 'earth' && earthContent}
      {store.view === 'discover' && <DiscoverPage discoveries={store.discoveries} signals={store.signals} selectedId={store.selectedDiscoveryId} onOpen={(id) => store.selectDiscovery(id || undefined)} onSave={store.saveDiscovery}/>} 
      {store.view === 'cases' && <CasesPage discoveries={store.discoveries} onOpen={(id) => store.selectDiscovery(id)}/>} 
      {store.view === 'observer' && <ObserverPage signals={store.signals}/>} 
      {store.view === 'settings' && <SettingsPage layers={store.layerVisibility} onToggle={store.toggleLayer}/>} 
      {store.view !== 'settings' && <BottomNav view={store.view} onChange={store.setView}/>} 
      {store.view === 'settings' && <button className="settings-done" onClick={() => store.setView('earth')}>Done</button>}
      {!online && <div className="offline-banner"><Activity size={14}/> Viewing cached and demonstration data</div>}
    </div>
  )
}
