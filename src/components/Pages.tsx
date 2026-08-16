import { Activity, CloudSun, LocateFixed, MapPin, Navigation, Radio, Satellite, Search, ShieldCheck, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Discovery, Signal, SignalType } from '../types/signal'
import { EmptyState } from './Chrome'
import { DiscoveryCard } from './DiscoveryCard'

export function DiscoverPage({ discoveries, signals, selectedId, onOpen, onSave }: { discoveries: Discovery[]; signals: Signal[]; selectedId?: string; onOpen(id: string): void; onSave(id: string): void }) {
  const selected = discoveries.find((item) => item.id === selectedId)
  if (selected) {
    const members = signals.filter((signal) => selected.signalIds.includes(signal.id)).sort((a, b) => a.timestamp - b.timestamp)
    return <main className="page investigation"><button className="text-button" onClick={() => onOpen('')}>← Discoveries</button><div className="eyebrow">INVESTIGATION · {selected.level}</div><h1>{selected.title}</h1><p className="lead">{selected.description}</p><div className="investigation-score"><span>Anomaly score</span><strong>{selected.score}</strong><small>Derived indicator—not statistical certainty</small></div><h2>Observed timeline</h2><div className="timeline">{members.map((signal) => <div key={signal.id}><i/><time>{new Date(signal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><section><strong>{signal.title}</strong><span>{signal.source.provider} · {signal.provenance[0]?.label.replaceAll('_', ' ')}</span></section></div>)}</div>{selected.relationships.length > 0 && <><h2>Connections</h2>{selected.relationships.map((relationship) => <div className="connection" key={relationship.id}><ShieldCheck size={17}/><span>{relationship.reason}<small>Observed correlation only</small></span></div>)}</>}</main>
  }
  return <main className="page"><div className="page-heading"><div><span className="eyebrow">REALITY, ORGANIZED</span><h1>Discover</h1></div><span className="count-pill">{discoveries.length} active</span></div><p className="lead">Measurable departures from recent activity, ranked without invented explanations.</p><div className="card-stack">{discoveries.map((discovery, index) => <DiscoveryCard key={discovery.id} discovery={discovery} index={index} onOpen={() => onOpen(discovery.id)} onSave={() => onSave(discovery.id)}/>)}</div></main>
}

export function CasesPage({ discoveries, onOpen }: { discoveries: Discovery[]; onOpen(id: string): void }) {
  const saved = discoveries.filter((item) => item.status === 'saved')
  return <main className="page"><div className="page-heading"><div><span className="eyebrow">LOCAL & PRIVATE</span><h1>Cases</h1></div></div>{saved.length ? <div className="card-stack">{saved.map((discovery, index) => <DiscoveryCard key={discovery.id} discovery={discovery} index={index} onOpen={() => onOpen(discovery.id)} onSave={() => undefined}/>)}</div> : <EmptyState icon={<ShieldCheck/>} title="No saved cases">Save a discovery to preserve it locally for later investigation. Nothing is uploaded.</EmptyState>}</main>
}

export function ObserverPage({ signals }: { signals: Signal[] }) {
  const [location, setLocation] = useState<{ latitude: number; longitude: number }>()
  const [denied, setDenied] = useState(false)
  const nearby = location ? signals.filter((signal) => signal.location && Math.abs(signal.location.latitude - location.latitude) < 8 && Math.abs(signal.location.longitude - location.longitude) < 8).slice(0, 5) : []
  const request = () => navigator.geolocation?.getCurrentPosition((position) => setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }), () => setDenied(true), { enableHighAccuracy: false, timeout: 8000 })
  return <main className="page observer-page"><div className="page-heading"><div><span className="eyebrow">AMBIENT WORLD WINDOW</span><h1>Observer</h1></div><Radio className="observer-radio"/></div>{!location ? <div className="permission-card"><LocateFixed/><h2>Choose your observation point</h2><p>NEXUS uses your location only after you ask. It stays on this device and is used to find nearby public signals.</p><button className="primary-action" onClick={request}>Use my location</button>{denied && <small>Location wasn’t available. You can enable it in browser settings.</small>}</div> : <><div className="observer-hero"><span>OBSERVING</span><strong>{location.latitude.toFixed(2)}°, {location.longitude.toFixed(2)}°</strong><time>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><div className="ambient-grid"><div><CloudSun/><span>Local context</span><strong>Live source pending</strong></div><div><Activity/><span>Nearby signals</span><strong>{nearby.length}</strong></div><div><Satellite/><span>Orbital context</span><strong>Demo available</strong></div></div><div className="nearby-list">{nearby.map((signal) => <div key={signal.id}><span className={`type-dot ${signal.type}`}/><section><strong>{signal.title}</strong><small>{signal.source.provider}</small></section></div>)}</div></>}</main>
}

const layerInfo: Array<{ type: SignalType; label: string }> = [
  { type: 'earthquake', label: 'Earthquakes' }, { type: 'fire', label: 'Thermal activity' }, { type: 'weather', label: 'Severe weather' },
  { type: 'aircraft', label: 'Aircraft' }, { type: 'satellite', label: 'Satellites' }, { type: 'space-weather', label: 'Space weather' }, { type: 'media', label: 'Media activity' },
]

export function SettingsPage({ layers, onToggle }: { layers: Record<SignalType, boolean>; onToggle(type: SignalType): void }) {
  return <main className="page settings-page"><div className="page-heading"><div><span className="eyebrow">CONTROL SURFACE</span><h1>Settings</h1></div></div><section className="settings-group"><h2>Signal layers</h2>{layerInfo.map((layer) => <button key={layer.type} onClick={() => onToggle(layer.type)}><span><i className={`type-dot ${layer.type}`}/>{layer.label}</span><b className={layers[layer.type] ? 'toggle on' : 'toggle'} aria-label={layers[layer.type] ? 'On' : 'Off'}/></button>)}</section><section className="settings-group"><h2>Privacy</h2><div className="privacy-copy"><ShieldCheck/><span><strong>Local by default</strong><small>No account, analytics, advertising, trackers, or cloud profile. Saved cases remain in IndexedDB on this device.</small></span></div></section></main>
}

export function SearchPanel({ signals, onSelect }: { signals: Signal[]; onSelect(signal: Signal): void }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => query.length < 2 ? [] : signals.filter((signal) => `${signal.title} ${signal.type} ${signal.entities?.map((entity) => entity.name).join(' ')}`.toLowerCase().includes(query.toLowerCase())).slice(0, 7), [query, signals])
  return <div className="search-panel"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search locations, signals, entities" aria-label="Search NEXUS"/>{results.length > 0 && <div className="search-results">{results.map((signal) => <button key={signal.id} onClick={() => { onSelect(signal); setQuery('') }}><MapPin size={15}/><span>{signal.title}<small>{signal.type} · {signal.source.provider}</small></span><Navigation size={14}/></button>)}</div>}</div>
}

export function SurpriseButton({ onClick }: { onClick(): void }) { return <button className="surprise-button" onClick={onClick}><Sparkles size={16}/> Surprise me</button> }
