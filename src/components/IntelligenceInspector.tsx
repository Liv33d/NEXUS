import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, ChevronDown, ExternalLink, MapPin, Microscope, ShieldCheck, X } from 'lucide-react'
import type { NexusIntelligenceObject } from '../types/intelligence'
import { enrichSelectedIntelligence } from '../lib/intelligence'

function relativeAge(timestamp?: number) {
  if (!timestamp) return undefined
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 1440) return `${Math.round(minutes / 60)} hr ago`
  return `${Math.round(minutes / 1440)} days ago`
}

function freshnessLabel(object: NexusIntelligenceObject) {
  const age = relativeAge(object.timestamp)
  return `${object.status.replaceAll('-', ' ')}${age ? ` · ${age}` : ''}`.toUpperCase()
}

export type InformationDensity = 'simple' | 'standard' | 'expert'

export function IntelligenceInspector({ object, density = 'standard', onClose, onWatch, onSelectRelated }: {
  object: NexusIntelligenceObject
  density?: InformationDensity
  onClose(): void
  onWatch?(object: NexusIntelligenceObject): void
  onSelectRelated?(object: NexusIntelligenceObject): void
}) {
  const [detent, setDetent] = useState<'peek' | 'story' | 'full'>('peek')
  const [mediaIndex, setMediaIndex] = useState(0)
  const [failedMedia, setFailedMedia] = useState<Set<string>>(() => new Set())
  const [resolved, setResolved] = useState(object)
  const dragStart = useRef<number | undefined>(undefined)
  const suppressHandleClick = useRef(false)
  useEffect(() => {
    setDetent('peek'); setMediaIndex(0); setFailedMedia(new Set()); setResolved(object)
    const controller = new AbortController()
    void enrichSelectedIntelligence(object, controller.signal).then((value) => { if (!controller.signal.aborted) setResolved(value) })
    return () => controller.abort()
  }, [object])
  const availableMedia = resolved.media.filter((item) => !failedMedia.has(item.id))
  const media = availableMedia[Math.min(mediaIndex, Math.max(0, availableMedia.length - 1))]
  const domainClass = `intelligence-${resolved.domain}`
  const mediaLabel = useMemo(() => media ? `${media.title}${media.observedAt ? ` · ${relativeAge(media.observedAt)}` : ''}` : undefined, [media])
  const stepDetent = (direction: 'up' | 'down') => setDetent((current) => {
    if (direction === 'up') return current === 'peek' ? 'story' : 'full'
    return current === 'full' ? 'story' : 'peek'
  })
  return (
    <section className={`intelligence-inspector nexus-hero-card ${domainClass} detent-${detent}`} role="dialog" aria-label={`${resolved.title} intelligence`}>
      <button className="inspector-drag-handle" aria-label={detent === 'full' ? 'Collapse details' : 'Expand details'}
        onClick={() => { if (suppressHandleClick.current) { suppressHandleClick.current = false; return } stepDetent(detent === 'full' ? 'down' : 'up') }}
        onPointerDown={(event) => { dragStart.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerUp={(event) => { const start = dragStart.current; if (start !== undefined && Math.abs(event.clientY - start) > 28) { suppressHandleClick.current = true; stepDetent(event.clientY < start ? 'up' : 'down') } dragStart.current = undefined }}
        onPointerCancel={() => { dragStart.current = undefined; suppressHandleClick.current = false }}><span/></button>
      <button className="sheet-close" aria-label="Close intelligence" onClick={onClose}><X size={19}/></button>
      {media ? <div className="intelligence-hero intelligence-media-frame">
        <img src={media.url} alt={media.alt} loading="eager" decoding="async" referrerPolicy="no-referrer" onError={() => { setFailedMedia((current) => new Set([...current, media.id])); setMediaIndex(0) }}/>
        <div className="intelligence-hero-shade"/>
        <span>{mediaLabel}</span>
        {availableMedia.length > 1 && <div className="media-tabs" role="tablist" aria-label="Evidence media">{availableMedia.map((item, index) => <button key={item.id} className={index === mediaIndex ? 'active' : ''} role="tab" aria-selected={index === mediaIndex} onClick={() => setMediaIndex(index)}>{item.kind}</button>)}</div>}
      </div> : <div className="intelligence-hero intelligence-hero-fallback" aria-hidden="true"><span>{resolved.domain.toUpperCase()}</span><i/></div>}
      <div className="intelligence-content">
        <div className="intelligence-eyebrow"><i/>{freshnessLabel(resolved)}{resolved.evidence ? ` · ${resolved.evidence}` : ''}</div>
        <h2>{resolved.title}</h2>
        {density !== 'simple' && resolved.scientificName && <em className="scientific-name">{resolved.scientificName}</em>}
        {resolved.subtitle && <p className="intelligence-subtitle">{resolved.subtitle}</p>}
        <p className="intelligence-summary">{resolved.summary}</p>
        {resolved.facts.length > 0 && <div className="hero-key-facts">{resolved.facts.slice(0, 3).map((fact) => <span key={fact.label}><small>{fact.label}</small><strong>{fact.value}</strong></span>)}</div>}
        <div className="intelligence-actions">
          {onWatch && resolved.location && <button onClick={() => onWatch(resolved)}><Bell/> {resolved.watchLabel ?? 'Watch'}</button>}
          <button className="details-action" onClick={() => stepDetent(detent === 'full' ? 'down' : 'up')}>{detent === 'full' ? 'Less' : 'Explore'} <ChevronDown/></button>
        </div>
        <div className="intelligence-expanded">
          {resolved.whyItMatters && <section className="intelligence-answer"><span>WHY IT MATTERS</span><p>{resolved.whyItMatters}</p></section>}
          {resolved.whatMayHappenNext && <section className="intelligence-answer"><span>WHAT MAY HAPPEN NEXT</span><p>{resolved.whatMayHappenNext}</p></section>}
          {resolved.movement && <section className="movement-story"><span>WHERE FROM → WHERE TO</span><div><strong>{resolved.movement.from ?? 'Earlier observation center'}</strong><i>→</i><strong>{resolved.movement.toward ?? 'Recent observation center'}</strong></div><p>{resolved.movement.interpretation}</p></section>}
          {resolved.relationships.length > 0 && <section className="related-intelligence"><span>RELATED</span>{resolved.relationships.slice(0, 6).map((relationship) => <button key={relationship.id} disabled={!relationship.object} onClick={() => relationship.object && onSelectRelated?.(relationship.object)}><strong>{relationship.title}</strong><small>{relationship.description}</small></button>)}</section>}
          {density !== 'simple' && <details className="technical-details" open={density === 'expert'}>
            <summary><Microscope/> Show the science <ChevronDown/></summary>
            {resolved.facts.length > 0 && <div className="technical-facts">{resolved.facts.map((fact) => <span key={fact.label}>{fact.label}<strong>{fact.value}</strong></span>)}</div>}
            {resolved.location && <div className="location-row"><MapPin size={16}/>{resolved.location.latitude.toFixed(3)}, {resolved.location.longitude.toFixed(3)}</div>}
            <p className="methodology-copy">{resolved.methodology}</p>
            {resolved.provenance.map((entry, index) => <div className="provenance" key={`${entry.label}-${index}`}><ShieldCheck size={17}/><div><strong>{entry.label.replaceAll('_', ' ')}</strong><span>{entry.description}</span></div></div>)}
            {media && <div className="media-license"><span>{media.attribution}</span>{media.license && <strong>{media.license}</strong>}{media.sourceUrl && <a href={media.sourceUrl} target="_blank" rel="noreferrer">Media source <ExternalLink/></a>}</div>}
          </details>}
          {resolved.sourceUrl && <a className="source-link" href={resolved.sourceUrl} target="_blank" rel="noreferrer">Open original source <ExternalLink size={15}/></a>}
        </div>
      </div>
    </section>
  )
}
