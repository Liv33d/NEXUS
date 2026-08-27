import { useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Clock3, Layers3, Search, X } from 'lucide-react'

export type EarthCommandPanel = 'search' | 'layers' | 'time'

const FOCUSABLE = 'button:not([disabled]), summary, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function EarthCommandSheet({ activePanel, onPanelChange, onClose, children }: {
  activePanel: EarthCommandPanel
  onPanelChange(panel: EarthCommandPanel): void
  onClose(): void
  children: ReactNode
}) {
  const sheetRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const title = activePanel === 'search' ? 'Find anywhere' : activePanel === 'layers' ? 'What do you want to see?' : 'Move through time'

  useLayoutEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    sheetRef.current?.focus({ preventScroll: true })
    return () => {
      const target = returnFocusRef.current
      if (target?.isConnected) target.focus({ preventScroll: true })
    }
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const sheet = sheetRef.current
    if (!sheet) return
    const focusable = [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => {
      const closedDetails = element.closest('details:not([open])')
      return !element.hidden && element.getAttribute('aria-hidden') !== 'true' && (!closedDetails || element.tagName === 'SUMMARY')
    })
    const first = focusable[0]
    const last = focusable.at(-1)
    if (!first || !last) { event.preventDefault(); sheet.focus(); return }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === sheet)) {
      event.preventDefault()
      first.focus()
    }
  }

  return <div className="command-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={sheetRef} className="command-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="sheet-handle"/>
      <header><div><span className="eyebrow">EXPLORE EARTH</span><h2 id={titleId}>{title}</h2></div><div className="command-header-actions"><button onClick={onClose} aria-label="Close controls"><X/></button></div></header>
      <nav className="command-tabs" aria-label="Earth control sections">
        <button className={activePanel === 'search' ? 'active' : ''} aria-current={activePanel === 'search' ? 'page' : undefined} onClick={() => onPanelChange('search')}><Search/>Find</button>
        <button className={activePanel === 'layers' ? 'active' : ''} aria-current={activePanel === 'layers' ? 'page' : undefined} onClick={() => onPanelChange('layers')}><Layers3/>Layers</button>
        <button className={activePanel === 'time' ? 'active' : ''} aria-current={activePanel === 'time' ? 'page' : undefined} onClick={() => onPanelChange('time')}><Clock3/>Time</button>
      </nav>
      {children}
    </section>
  </div>
}
