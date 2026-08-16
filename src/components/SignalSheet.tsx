import { ExternalLink, MapPin, ShieldCheck, X } from 'lucide-react'
import type { Signal } from '../types/signal'

export function SignalSheet({ signal, onClose }: { signal: Signal; onClose(): void }) {
  const age = Math.max(1, Math.round((Date.now() - signal.timestamp) / 60000))
  return (
    <section className="sheet signal-sheet" aria-modal="true" aria-label="Signal details">
      <div className="sheet-handle" />
      <button className="sheet-close" aria-label="Close details" onClick={onClose}><X size={18}/></button>
      <div className="eyebrow"><span className={`type-dot ${signal.type}`}/>{signal.type.replace('-', ' ')} · {signal.source.freshness}</div>
      <h2>{signal.title}</h2>
      <p className="sheet-summary">{signal.summary}</p>
      <div className="metric-grid">
        <div><span>Severity</span><strong>{Math.round(signal.severity ?? 0)}</strong></div>
        <div><span>Confidence</span><strong>{Math.round((signal.confidence ?? 0) * 100)}%</strong></div>
        <div><span>Observed</span><strong>{age}m ago</strong></div>
      </div>
      {signal.location && <div className="location-row"><MapPin size={16}/>{signal.location.latitude.toFixed(3)}, {signal.location.longitude.toFixed(3)} · H3 {signal.location.h3Index?.slice(-6)}</div>}
      <div className="provenance"><ShieldCheck size={17}/><div><strong>{signal.provenance[0]?.label.replaceAll('_', ' ')}</strong><span>{signal.provenance[0]?.description}</span></div></div>
      {signal.source.url && <a className="source-link" href={signal.source.url} target="_blank" rel="noreferrer">Open original source <ExternalLink size={15}/></a>}
    </section>
  )
}
