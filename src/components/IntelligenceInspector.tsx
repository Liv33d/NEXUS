import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type TransitionEvent as ReactTransitionEvent } from 'react'
import { Bell, ChevronDown, ExternalLink, MapPin, Microscope, ShieldCheck, X } from 'lucide-react'
import type { NexusIntelligenceObject } from '../types/intelligence'
import { enrichSelectedIntelligence } from '../lib/intelligence'
import { adjacentSheetDetent, chooseSheetDetent, clampSheetOffset, computeSheetDetentOffsets, type SheetDetent, type SheetDetentOffsets } from '../lib/bottomSheet'

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

const DETENT_LABELS: Record<SheetDetent, string> = {
  peek: 'peek',
  story: 'story',
  full: 'full',
}

export function IntelligenceInspector({ object, density = 'standard', onClose, onWatch, onSelectRelated }: {
  object: NexusIntelligenceObject
  density?: InformationDensity
  onClose(): void
  onWatch?(object: NexusIntelligenceObject): void
  onSelectRelated?(object: NexusIntelligenceObject): void
}) {
  const [detent, setDetent] = useState<SheetDetent>('peek')
  const [mediaIndex, setMediaIndex] = useState(0)
  const [failedMedia, setFailedMedia] = useState<Set<string>>(() => new Set())
  const [resolved, setResolved] = useState(object)
  const sheetRef = useRef<HTMLElement>(null)
  const handleRef = useRef<HTMLButtonElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const detentRef = useRef<SheetDetent>('peek')
  const offsetsRef = useRef<SheetDetentOffsets>(computeSheetDetentOffsets(640))
  const offsetRef = useRef(offsetsRef.current.peek)
  const reducedMotionRef = useRef(false)
  const landscapeRef = useRef(false)
  const frameRef = useRef(0)
  const gestureRef = useRef<{
    pointerId: number
    origin: SheetDetent
    startY: number
    startOffset: number
    currentOffset: number
    lastY: number
    lastTime: number
    velocityY: number
  } | undefined>(undefined)
  const suppressHandleClick = useRef(false)
  useEffect(() => {
    setResolved(object)
    const controller = new AbortController()
    void enrichSelectedIntelligence(object, controller.signal).then((value) => { if (!controller.signal.aborted) setResolved(value) })
    return () => controller.abort()
  }, [object])
  const intelligence = resolved.id === object.id ? resolved : object
  const availableMedia = intelligence.media.filter((item) => !failedMedia.has(item.id))
  const media = availableMedia[Math.min(mediaIndex, Math.max(0, availableMedia.length - 1))]
  const domainClass = `intelligence-${intelligence.domain}`
  const mediaLabel = useMemo(() => media ? `${media.title}${media.observedAt ? ` · ${relativeAge(media.observedAt)}` : ''}` : undefined, [media])

  const applyOffset = useCallback((offset: number) => {
    offsetRef.current = offset
    const sheet = sheetRef.current
    if (!sheet || landscapeRef.current) return
    sheet.style.transform = `translate3d(0, ${Math.round(offset * 100) / 100}px, 0)`
  }, [])

  const syncMetrics = useCallback((sheet: HTMLElement) => {
    const fullHeight = sheet.getBoundingClientRect().height
    const offsets = computeSheetDetentOffsets(fullHeight)
    offsetsRef.current = offsets
    sheet.style.setProperty('--sheet-peek-visible', `${Math.round(fullHeight - offsets.peek)}px`)
    sheet.style.setProperty('--sheet-story-visible', `${Math.round(fullHeight - offsets.story)}px`)
    return offsets
  }, [])

  const settleTo = useCallback((target: SheetDetent) => {
    const sheet = sheetRef.current
    const targetOffset = offsetsRef.current[target]
    const willMove = Math.abs(offsetRef.current - targetOffset) > .5
    detentRef.current = target
    setDetent(target)
    if (!sheet || landscapeRef.current) return
    sheet.dataset.phase = reducedMotionRef.current || !willMove ? 'idle' : 'settling'
    applyOffset(targetOffset)
    if (reducedMotionRef.current) sheet.style.willChange = ''
  }, [applyOffset])

  const stepDetent = useCallback((direction: 'up' | 'down') => settleTo(adjacentSheetDetent(detentRef.current, direction)), [settleTo])

  const finishTransition = useCallback((event: ReactTransitionEvent<HTMLElement>) => {
    const sheet = sheetRef.current
    if (!sheet || event.target !== sheet || event.propertyName !== 'transform' || sheet.dataset.phase !== 'settling') return
    sheet.dataset.phase = 'idle'
    sheet.style.willChange = ''
  }, [])

  const onHandlePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (landscapeRef.current || event.button !== 0) return
    const sheet = sheetRef.current
    if (!sheet || gestureRef.current) return
    window.cancelAnimationFrame(frameRef.current)
    syncMetrics(sheet)
    const startOffset = offsetsRef.current[detentRef.current]
    gestureRef.current = {
      pointerId: event.pointerId,
      origin: detentRef.current,
      startY: event.clientY,
      startOffset,
      currentOffset: startOffset,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocityY: 0,
    }
    suppressHandleClick.current = false
    sheet.dataset.phase = 'dragging'
    sheet.style.willChange = 'transform'
    applyOffset(startOffset)
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [applyOffset, syncMetrics])

  const onHandlePointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const elapsed = Math.max(1, event.timeStamp - gesture.lastTime)
    const instantaneousVelocity = (event.clientY - gesture.lastY) / elapsed
    gesture.velocityY = gesture.velocityY * .72 + instantaneousVelocity * .28
    gesture.lastY = event.clientY
    gesture.lastTime = event.timeStamp
    gesture.currentOffset = clampSheetOffset(gesture.startOffset + event.clientY - gesture.startY, offsetsRef.current)
    if (Math.abs(event.clientY - gesture.startY) > 4) suppressHandleClick.current = true
    window.cancelAnimationFrame(frameRef.current)
    frameRef.current = window.requestAnimationFrame(() => applyOffset(gesture.currentOffset))
    event.preventDefault()
  }, [applyOffset])

  const finishPointerGesture = useCallback((event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    window.cancelAnimationFrame(frameRef.current)
    applyOffset(gesture.currentOffset)
    const target = cancelled ? gesture.origin : chooseSheetDetent(offsetsRef.current, gesture.origin, gesture.currentOffset, gesture.velocityY)
    gestureRef.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    settleTo(target)
  }, [applyOffset, settleTo])

  const onLostPointerCapture = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    window.cancelAnimationFrame(frameRef.current)
    applyOffset(gesture.currentOffset)
    gestureRef.current = undefined
    settleTo(gesture.origin)
  }, [applyOffset, settleTo])

  const onHandleKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp') { event.preventDefault(); stepDetent('up') }
    else if (event.key === 'ArrowDown') { event.preventDefault(); stepDetent('down') }
    else if (event.key === 'Home') { event.preventDefault(); settleTo('full') }
    else if (event.key === 'End') { event.preventDefault(); settleTo('peek') }
  }, [settleTo, stepDetent])

  const onDialogKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onClose()
  }, [onClose])

  useLayoutEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      const target = returnFocusRef.current
      if (target?.isConnected) target.focus({ preventScroll: true })
    }
  }, [])

  useLayoutEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    window.cancelAnimationFrame(frameRef.current)
    const activeGesture = gestureRef.current
    gestureRef.current = undefined
    if (activeGesture && handleRef.current?.hasPointerCapture(activeGesture.pointerId)) handleRef.current.releasePointerCapture(activeGesture.pointerId)
    suppressHandleClick.current = Boolean(activeGesture)
    detentRef.current = 'peek'
    setDetent('peek')
    setMediaIndex(0)
    setFailedMedia(new Set())
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
    const offsets = syncMetrics(sheet)
    applyOffset(offsets.peek)
    sheet.dataset.phase = 'idle'
    sheet.style.willChange = ''
    handleRef.current?.focus({ preventScroll: true })
  }, [applyOffset, object.id, syncMetrics])

  useLayoutEffect(() => {
    detentRef.current = detent
    const sheet = sheetRef.current
    if (!sheet || gestureRef.current || landscapeRef.current) return
    syncMetrics(sheet)
    applyOffset(offsetsRef.current[detent])
  }, [applyOffset, detent, syncMetrics])

  useLayoutEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    const landscape = window.matchMedia('(orientation: landscape) and (max-height: 620px)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const measure = () => {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = window.requestAnimationFrame(() => {
        const activeGesture = gestureRef.current
        gestureRef.current = undefined
        if (activeGesture && handleRef.current?.hasPointerCapture(activeGesture.pointerId)) handleRef.current.releasePointerCapture(activeGesture.pointerId)
        suppressHandleClick.current = Boolean(activeGesture)
        landscapeRef.current = landscape.matches
        reducedMotionRef.current = reduced.matches
        sheet.dataset.mode = landscape.matches ? 'landscape-panel' : 'portrait-sheet'
        sheet.dataset.phase = 'idle'
        sheet.style.willChange = ''
        if (landscape.matches) sheet.style.transform = ''
        else {
          syncMetrics(sheet)
          applyOffset(offsetsRef.current[detentRef.current])
        }
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(sheet)
    landscape.addEventListener('change', measure)
    reduced.addEventListener('change', measure)
    window.visualViewport?.addEventListener('resize', measure, { passive: true })
    measure()
    return () => {
      window.cancelAnimationFrame(frameRef.current)
      observer.disconnect()
      landscape.removeEventListener('change', measure)
      reduced.removeEventListener('change', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [applyOffset, syncMetrics])

  return (
    <section ref={sheetRef} className={`intelligence-inspector nexus-hero-card ${domainClass} detent-${detent}`} data-phase="idle" data-mode="portrait-sheet" role="dialog" aria-labelledby="nexus-intelligence-title" onKeyDown={onDialogKeyDown} onTransitionEnd={finishTransition}>
      <button ref={handleRef} className="inspector-drag-handle" aria-label={`${detent === 'full' ? 'Collapse' : 'Expand'} details. Current position: ${DETENT_LABELS[detent]}`}
        aria-controls="nexus-intelligence-content" aria-expanded={detent !== 'peek'}
        onClick={() => { if (suppressHandleClick.current) { suppressHandleClick.current = false; return } stepDetent(detent === 'full' ? 'down' : 'up') }}
        onKeyDown={onHandleKeyDown}
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={(event) => finishPointerGesture(event)}
        onPointerCancel={(event) => finishPointerGesture(event, true)}
        onLostPointerCapture={onLostPointerCapture}><span/></button>
      <button className="sheet-close" aria-label="Close intelligence" onClick={onClose}><X size={19}/></button>
      <div ref={scrollRef} id="nexus-intelligence-content" className="intelligence-scroll">
      {media ? <div className="intelligence-hero intelligence-media-frame">
        <img src={media.url} alt={media.alt} loading="eager" decoding="async" referrerPolicy="no-referrer" onError={() => { setFailedMedia((current) => new Set([...current, media.id])); setMediaIndex(0) }}/>
        <div className="intelligence-hero-shade"/>
        <span>{mediaLabel}</span>
        {availableMedia.length > 1 && <div className="media-tabs" role="tablist" aria-label="Evidence media">{availableMedia.map((item, index) => <button key={item.id} className={index === mediaIndex ? 'active' : ''} role="tab" aria-selected={index === mediaIndex} onClick={() => setMediaIndex(index)}>{item.kind}</button>)}</div>}
      </div> : <div className="intelligence-hero intelligence-hero-fallback" aria-hidden="true"><span>{intelligence.domain.toUpperCase()}</span><i/></div>}
      <div className="intelligence-content">
        <div className="intelligence-eyebrow"><i/>{freshnessLabel(intelligence)}{intelligence.evidence ? ` · ${intelligence.evidence}` : ''}</div>
        <h2 id="nexus-intelligence-title">{intelligence.title}</h2>
        {density !== 'simple' && intelligence.scientificName && <em className="scientific-name">{intelligence.scientificName}</em>}
        {intelligence.subtitle && <p className="intelligence-subtitle">{intelligence.subtitle}</p>}
        <p className="intelligence-summary">{intelligence.summary}</p>
        {intelligence.facts.length > 0 && <div className="hero-key-facts">{intelligence.facts.slice(0, 3).map((fact) => <span key={fact.label}><small>{fact.label}</small><strong>{fact.value}</strong></span>)}</div>}
        <div className="intelligence-actions">
          {onWatch && intelligence.location && <button onClick={() => onWatch(intelligence)}><Bell/> {intelligence.watchLabel ?? 'Watch'}</button>}
          <button className="details-action" onClick={() => stepDetent(detent === 'full' ? 'down' : 'up')}>{detent === 'full' ? 'Less' : 'Explore'} <ChevronDown/></button>
        </div>
        <div className="intelligence-expanded">
          {intelligence.whyItMatters && <section className="intelligence-answer"><span>WHY IT MATTERS</span><p>{intelligence.whyItMatters}</p></section>}
          {intelligence.whatMayHappenNext && <section className="intelligence-answer"><span>WHAT MAY HAPPEN NEXT</span><p>{intelligence.whatMayHappenNext}</p></section>}
          {intelligence.movement && <section className="movement-story"><span>WHERE FROM → WHERE TO</span><div><strong>{intelligence.movement.from ?? 'Earlier observation center'}</strong><i>→</i><strong>{intelligence.movement.toward ?? 'Recent observation center'}</strong></div><p>{intelligence.movement.interpretation}</p></section>}
          {intelligence.relationships.length > 0 && <section className="related-intelligence"><span>RELATED</span>{intelligence.relationships.slice(0, 6).map((relationship) => <button key={relationship.id} disabled={!relationship.object} onClick={() => relationship.object && onSelectRelated?.(relationship.object)}><strong>{relationship.title}</strong><small>{relationship.description}</small></button>)}</section>}
          {density !== 'simple' && <details className="technical-details" open={density === 'expert'}>
            <summary><Microscope/> Show the science <ChevronDown/></summary>
            {intelligence.facts.length > 0 && <div className="technical-facts">{intelligence.facts.map((fact) => <span key={fact.label}>{fact.label}<strong>{fact.value}</strong></span>)}</div>}
            {intelligence.location && <div className="location-row"><MapPin size={16}/>{intelligence.location.latitude.toFixed(3)}, {intelligence.location.longitude.toFixed(3)}</div>}
            <p className="methodology-copy">{intelligence.methodology}</p>
            {intelligence.provenance.map((entry, index) => <div className="provenance" key={`${entry.label}-${index}`}><ShieldCheck size={17}/><div><strong>{entry.label.replaceAll('_', ' ')}</strong><span>{entry.description}</span></div></div>)}
            {media && <div className="media-license"><span>{media.attribution}</span>{media.license && <strong>{media.license}</strong>}{media.sourceUrl && <a href={media.sourceUrl} target="_blank" rel="noreferrer">Media source <ExternalLink/></a>}</div>}
          </details>}
          {intelligence.sourceUrl && <a className="source-link" href={intelligence.sourceUrl} target="_blank" rel="noreferrer">Open original source <ExternalLink size={15}/></a>}
        </div>
      </div>
      </div>
    </section>
  )
}
