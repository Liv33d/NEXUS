import { ChevronDown, ExternalLink, MapPin, ShieldCheck, X } from 'lucide-react'
import type { Signal } from '../types/signal'
import { buildSignalContext } from '../lib/context'

export function SignalSheet({ signal, onClose }: { signal: Signal; onClose(): void }) {
  const context = buildSignalContext(signal)
  const ageMinutes = Math.max(0, Math.round((Date.now() - signal.timestamp) / 60000))
  const age = ageMinutes < 1 ? 'now' : ageMinutes < 60 ? `${ageMinutes}m ago` : ageMinutes < 1440 ? `${Math.round(ageMinutes / 60)}h ago` : `${Math.round(ageMinutes / 1440)}d ago`
  return (
    <section className="sheet signal-sheet" aria-modal="true" aria-label="Signal details">
      <div className="sheet-handle" />
      <button className="sheet-close" aria-label="Close details" onClick={onClose}><X size={18}/></button>
      <div className="eyebrow"><span className={`type-dot ${signal.type}`}/>{context.confidence} · {age}</div>
      <h2>{context.headline}</h2>
      <p className="sheet-summary">{context.plainLanguageSummary}</p>
      {context.whyItMatters && <section className="context-answer"><span>WHY IT MATTERS</span><p>{context.whyItMatters}</p></section>}
      {context.whatHappensNext && <section className="context-answer"><span>WHAT MAY HAPPEN NEXT</span><p>{context.whatHappensNext}</p></section>}
      {context.recommendedAwareness && <section className="context-awareness"><strong>What to know</strong><p>{context.recommendedAwareness}</p></section>}
      <details className="technical-details">
        <summary>Show the science <ChevronDown/></summary>
        <div className="metric-grid">
          <div><span>Severity</span><strong>{Math.round(signal.severity ?? 0)}</strong></div>
          <div><span>Confidence</span><strong>{signal.confidence === undefined ? '—' : `${Math.round(signal.confidence * 100)}%`}</strong></div>
          <div><span>Observed</span><strong>{age}</strong></div>
        </div>
        {context.technicalFacts.length > 0 && <div className="technical-facts">{context.technicalFacts.map((fact) => <span key={fact.label}>{fact.label}<strong>{fact.value}</strong></span>)}</div>}
        {signal.location && <div className="location-row"><MapPin size={16}/>{signal.location.latitude.toFixed(3)}, {signal.location.longitude.toFixed(3)}{signal.location.accuracy ? ` · approximately ${Math.round(signal.location.accuracy / 1000)} km precision` : ` · H3 ${signal.location.h3Index?.slice(-6)}`}</div>}
        <div className="evidence-meta"><span>Dataset<strong>{signal.source.dataset ?? signal.source.provider}</strong></span><span>Retrieved<strong>{new Date(signal.source.retrievedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong></span><span>State<strong>{signal.source.freshness}</strong></span></div>
        <p className="methodology-copy">{context.methodology}</p>
        {signal.provenance.map((entry, index) => <div className="provenance" key={`${entry.label}-${index}`}><ShieldCheck size={17}/><div><strong>{entry.label.replaceAll('_', ' ')}</strong><span>{entry.description}</span></div></div>)}
      </details>
      {signal.source.url && <a className="source-link" href={signal.source.url} target="_blank" rel="noreferrer">Open original source <ExternalLink size={15}/></a>}
    </section>
  )
}
