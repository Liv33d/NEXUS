import { Activity, BatteryLow, Database, ExternalLink, Gauge, Globe2, KeyRound, Layers3, RefreshCw, Rotate3D, ShieldCheck, Sparkles, Trash2, Type } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { providerById } from '../providers/registry'
import type { ProviderStatus, SignalType } from '../types/signal'

export type PerformanceMode = 'automatic' | 'quality' | 'battery'
export type MapTheme = 'dark' | 'street'

interface Props {
  layers: Record<SignalType, boolean>
  statuses: Record<string, ProviderStatus>
  demoMode: boolean
  firmsConfigured: boolean
  performanceMode: PerformanceMode
  autoRotate: boolean
  atmosphere: boolean
  labels: boolean
  mapTheme: MapTheme
  onToggle(type: SignalType): void
  onDemoMode(enabled: boolean): Promise<void>
  onFirmsKey(key: string): Promise<void>
  onRefresh(): Promise<void>
  onPerformance(mode: PerformanceMode): void
  onAutoRotate(enabled: boolean): void
  onAtmosphere(enabled: boolean): void
  onLabels(enabled: boolean): void
  onMapTheme(theme: MapTheme): void
  onErase(): Promise<void>
}

const liveLayers: Array<{ type: SignalType; label: string }> = [
  { type: 'earthquake', label: 'Earthquakes' }, { type: 'fire', label: 'Thermal activity' },
  { type: 'weather', label: 'Severe weather' }, { type: 'space-weather', label: 'Space weather' },
  { type: 'environment', label: 'Environmental events' },
]
const extendedLayers: Array<{ type: SignalType; label: string }> = [
  { type: 'aircraft', label: 'Aircraft' }, { type: 'satellite', label: 'Satellites' },
  { type: 'media', label: 'Media activity' }, { type: 'infrastructure', label: 'Infrastructure' },
]

function statusLabel(state: ProviderStatus['state']) {
  return ({ idle: 'STANDBY', loading: 'CHECKING', live: 'LIVE', cached: 'CACHED', error: 'RETRY LATER', unavailable: 'UNAVAILABLE', 'rate-limited': 'RATE LIMITED' })[state]
}

function relativeTime(value?: number) {
  if (!value) return 'Never updated'
  const minutes = Math.max(0, Math.round((Date.now() - value) / 60000))
  return minutes < 1 ? 'Updated now' : minutes === 1 ? 'Updated 1 min ago' : `Updated ${minutes} min ago`
}

function formatBytes(value?: number) {
  if (!value) return 'No local data'
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB stored`
  return `${(value / (1024 * 1024)).toFixed(1)} MB stored`
}

export default function SettingsPage(props: Props) {
  const [firmsKey, setFirmsKey] = useState('')
  const [storageUsage, setStorageUsage] = useState<number>()
  const [confirmErase, setConfirmErase] = useState(false)
  const visibleLayers = [...liveLayers, ...extendedLayers]
  const healthy = useMemo(() => Object.values(props.statuses).filter((status) => status.state === 'live').length, [props.statuses])

  useEffect(() => {
    void navigator.storage?.estimate().then((estimate) => setStorageUsage(estimate.usage)).catch(() => undefined)
  }, [])

  return <main className="page settings-page">
    <div className="page-heading"><div><span className="eyebrow">CONTROL SURFACE</span><h1>Settings</h1></div></div>

    <section className="settings-overview" aria-label="NEXUS status">
      <div><Activity/><strong>{healthy}/{Object.keys(props.statuses).length}</strong><span>live providers</span></div>
      <div><Database/><strong>{formatBytes(storageUsage).replace(' stored', '')}</strong><span>on this device</span></div>
      <div><ShieldCheck/><strong>LOCAL</strong><span>private by default</span></div>
    </section>

    <section className="settings-group">
      <h2>Earth experience</h2>
      <div className="settings-segment" role="group" aria-label="Performance mode">
        {(['automatic', 'quality', 'battery'] as const).map((mode) => <button key={mode} className={props.performanceMode === mode ? 'active' : ''} onClick={() => props.onPerformance(mode)}>{mode === 'automatic' ? <Gauge/> : mode === 'quality' ? <Sparkles/> : <BatteryLow/>}<span>{mode}</span></button>)}
      </div>
      <button onClick={() => props.onAutoRotate(!props.autoRotate)}><span><Rotate3D/>Automatic rotation</span><b className={props.autoRotate ? 'toggle on' : 'toggle'} aria-label={props.autoRotate ? 'On' : 'Off'}/></button>
      <button onClick={() => props.onAtmosphere(!props.atmosphere)}><span><Globe2/>Atmospheric glow</span><b className={props.atmosphere ? 'toggle on' : 'toggle'} aria-label={props.atmosphere ? 'On' : 'Off'}/></button>
      <button onClick={() => props.onLabels(!props.labels)}><span><Type/>Geographic labels</span><b className={props.labels ? 'toggle on' : 'toggle'} aria-label={props.labels ? 'On' : 'Off'}/></button>
      <div className="settings-choice"><span><Layers3/>Detailed map style</span><div><button className={props.mapTheme === 'dark' ? 'active' : ''} onClick={() => props.onMapTheme('dark')}>Dark</button><button className={props.mapTheme === 'street' ? 'active' : ''} onClick={() => props.onMapTheme('street')}>Street</button></div></div>
      <p className="setting-note">Automatic balances sharpness and battery life. Battery mode reduces globe resolution, animation, and environmental overlays.</p>
    </section>

    <details className="settings-advanced">
      <summary><span><Database/>Advanced & data sources</span><small>Layer defaults, provider health, demo data, and credentials</small></summary>
    <section className="settings-group">
      <h2>Signal layers</h2>
      {visibleLayers.map((layer) => <button key={layer.type} onClick={() => props.onToggle(layer.type)}><span><i className={`type-dot ${layer.type}`}/>{layer.label}{props.demoMode && extendedLayers.some((item) => item.type === layer.type) && <small className="demo-layer-label">DEMO</small>}</span><b className={props.layers[layer.type] ? 'toggle on' : 'toggle'} aria-label={props.layers[layer.type] ? 'On' : 'Off'}/></button>)}
      <p className="setting-note">All normalized Signal categories remain available. A layer with no current provider stays empty instead of fabricating activity.</p>
    </section>

    <section className="settings-group">
      <h2>Data mode</h2>
      <button onClick={() => void props.onDemoMode(!props.demoMode)}><span><Database/>Deterministic demo data</span><b className={props.demoMode ? 'toggle on' : 'toggle'} aria-label={props.demoMode ? 'On' : 'Off'}/></button>
      <p className="setting-note">Demo Mode replaces live feeds completely. It never mixes simulated and real-world records.</p>
    </section>

    <section className="settings-group provider-health">
      <h2>Provider health <button className="inline-refresh" onClick={() => void props.onRefresh()} aria-label="Refresh all providers"><RefreshCw size={14}/></button></h2>
      {Object.values(props.statuses).map((status) => <div className="provider-row" key={status.providerId}><i className={`health-dot ${status.state}`}/><span><strong>{status.providerName ?? status.providerId}</strong><small>{status.message ?? `${status.signalCount ?? 0} signals · ${relativeTime(status.lastSuccess)} · ${providerById.get(status.providerId)?.description ?? 'Open-data provider'}`}</small></span><b>{statusLabel(status.state)}</b></div>)}
    </section>

    <section className="settings-group">
      <h2>Optional provider access</h2>
      <div className="credential-panel"><KeyRound/><span><strong>NASA FIRMS map key</strong><small>{props.firmsConfigured ? 'Configured on this device. Enter another key to replace it.' : 'Stored only in IndexedDB on this device; never uploaded to NEXUS.'}</small></span><a className="credential-help" href="https://firms.modaps.eosdis.nasa.gov/api/area/" target="_blank" rel="noreferrer">Get a free NASA MAP key <ExternalLink/></a><input type="password" autoComplete="off" value={firmsKey} onChange={(event) => setFirmsKey(event.target.value)} placeholder={props.firmsConfigured ? '••••••••••••••••' : 'Paste MAP key'} aria-label="NASA FIRMS map key"/><button disabled={!firmsKey.trim()} onClick={() => { void props.onFirmsKey(firmsKey); setFirmsKey('') }}>{props.firmsConfigured ? 'Replace key' : 'Save key locally'}</button>{props.firmsConfigured && <button className="danger-link" onClick={() => void props.onFirmsKey('')}>Remove saved key</button>}</div>
    </section>
    </details>

    <section className="settings-group storage-control">
      <h2>Privacy and storage</h2>
      <div className="privacy-copy"><ShieldCheck/><span><strong>Local by default</strong><small>No account, analytics, advertising, trackers, or cloud profile. Cases and credentials remain on this device.</small></span></div>
      {!confirmErase ? <button className="erase-control" onClick={() => setConfirmErase(true)}><span><Trash2/>Erase all local NEXUS data</span></button> : <div className="erase-confirm"><strong>Erase cached signals, cases, settings, and credentials?</strong><div><button onClick={() => setConfirmErase(false)}>Cancel</button><button onClick={() => void props.onErase()}>Erase everything</button></div></div>}
    </section>
  </main>
}
