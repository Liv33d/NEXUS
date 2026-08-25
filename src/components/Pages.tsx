import { Activity, BellRing, Bird, BookmarkCheck, CloudRain, CloudSun, Compass, Download, Droplets, ExternalLink, Gauge, LocateFixed, MapPin, Navigation, NotebookPen, Orbit, Radio, Search, ShieldCheck, Sparkles, Star, Sunrise, Sunset, Thermometer, Trash2, Waves, Wind, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { dedupeLocationLabel, displayPrecipitation, displayPressure, displayTemperature, displayVisibility, displayWindSpeed, fetchMarineContext, fetchObserverContext, formatObserverWallTime, observerWeatherSummary, searchObserverPlaces, weatherCodeLabel, type MarineContext, type ObserverContext, type ObserverPlace, type TemperatureUnit } from '../providers/openMeteo'
import { exportCase } from '../lib/caseExport'
import { distanceKm } from '../lib/geo'
import { searchSignals } from '../lib/search'
import type { Discovery, Signal } from '../types/signal'
import type { WatchRule } from '../types/watch'
import { evaluateWatch, evaluateWeatherWatch, placeWatchId } from '../lib/watch'
import { EmptyState } from './Chrome'
import { DiscoveryCard } from './DiscoveryCard'
import { fetchLifeContext, type LifeContext } from '../providers/gbif'
import { calculateOrbitalPasses, loadOrbitalElements, type OrbitalPass } from '../lib/orbits'
import { WeatherForecast } from './WeatherForecast'
import type { NexusIntelligenceObject } from '../types/intelligence'
import { observerTaxonToIntelligence, orbitalPassToIntelligence, signalToIntelligence } from '../lib/intelligence'

export function DiscoverPage({ discoveries, signals, selectedId, onOpen, onSave, onNotes, onRemove }: { discoveries: Discovery[]; signals: Signal[]; selectedId?: string; onOpen(id: string): void; onSave(id: string): void; onNotes(id: string, notes: string): void; onRemove(id: string): void }) {
  const selected = discoveries.find((item) => item.id === selectedId)
  if (selected) {
    const members = signals.filter((signal) => selected.signalIds.includes(signal.id)).sort((a, b) => a.timestamp - b.timestamp)
    const strongestRelationships = [...selected.relationships].sort((a, b) => b.confidence - a.confidence).slice(0, 6)
    const scoreParts = selected.scoreComponents ? [
      ['Typical severity', selected.scoreComponents.typicalSeverity],
      ['Peak severity', selected.scoreComponents.peakSeverity],
      ['Evidence volume', selected.scoreComponents.evidence],
      ['Source diversity', selected.scoreComponents.diversity],
      ['Baseline shift', selected.scoreComponents.deviation ?? 0],
    ] as const : []
    return <main className="page investigation"><button className="text-button" onClick={() => onOpen('')}>← Discoveries</button><div className="eyebrow">INVESTIGATION · {selected.level}</div><h1>{selected.title}</h1><p className="lead">{selected.description}</p>{selected.status === 'saved' ? <section className="case-workbench"><header><BookmarkCheck/><span><strong>Saved Case</strong><small>Evidence references are protected from automatic pruning.</small></span></header><label><NotebookPen/> Investigator notes<textarea key={`${selected.id}-${selected.notes?.length ?? 0}`} defaultValue={selected.notes ?? ''} maxLength={10000} placeholder="Record observations, questions, and follow-up…" onBlur={(event) => onNotes(selected.id, event.currentTarget.value)}/></label><div><button onClick={() => void exportCase(selected, members)}><Download/> Export evidence</button><button className="danger" onClick={() => onRemove(selected.id)}><Trash2/> Remove Case</button></div></section> : <button className="save-case-action" onClick={() => onSave(selected.id)}><BookmarkCheck/> Save as Case</button>}<div className="investigation-score"><span>NEXUS priority score</span><strong>{selected.score}</strong><small>Derived ranking indicator—not probability, certainty, or causation</small>{scoreParts.length > 0 && <div className="score-explanation">{scoreParts.map(([label, value]) => <div key={label}><span>{label}</span><i><b style={{ width: `${Math.min(value * 3, 100)}%` }}/></i><strong>+{value}</strong></div>)}</div>}</div><h2>Observed timeline</h2><div className="timeline">{members.map((signal) => <div key={signal.id}><i/><time>{new Date(signal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><section><strong>{signal.title}</strong><span>{signal.source.provider} · {signal.provenance[0]?.label.replaceAll('_', ' ')}</span></section></div>)}</div>{strongestRelationships.length > 0 && <><h2>Strongest connections</h2>{strongestRelationships.map((relationship) => <div className="connection" key={relationship.id}><ShieldCheck size={17}/><span>{relationship.reason}<small>Observed correlation only</small></span></div>)}{selected.relationships.length > strongestRelationships.length && <p className="connection-summary">{selected.relationships.length - strongestRelationships.length} weaker pairwise observations are suppressed to reduce noise.</p>}</>}<h2>Evidence and sources</h2><div className="evidence-list">{members.map((signal) => signal.source.url ? <a href={signal.source.url} target="_blank" rel="noreferrer" key={signal.id}><span><strong>{signal.title}</strong><small>{signal.source.dataset ?? signal.source.provider} · {signal.source.freshness}</small></span><ExternalLink/></a> : <div key={signal.id}><span><strong>{signal.title}</strong><small>{signal.source.dataset ?? signal.source.provider} · source URL unavailable</small></span></div>)}</div></main>
  }
  return <main className="page"><div className="page-heading"><div><span className="eyebrow">A SHORT GLOBAL BRIEFING</span><h1>Earth Today</h1></div><span className="count-pill">{discoveries.length} active</span></div><p className="lead">The most meaningful departures from recent activity, explained without invented causes.</p>{discoveries.length ? <div className="card-stack">{discoveries.map((discovery, index) => <DiscoveryCard key={discovery.id} discovery={discovery} index={index} onOpen={() => onOpen(discovery.id)} onSave={() => onSave(discovery.id)}/>)}</div> : <EmptyState icon={<Activity/>} title="A quiet global moment">Current signals remain explorable on Earth. NEXUS will surface a story when activity meaningfully departs from its recent pattern.</EmptyState>}</main>
}

export function CasesPage({ discoveries, watches, signals, onOpen, onObserve, onUnwatch }: { discoveries: Discovery[]; watches: WatchRule[]; signals: Signal[]; onOpen(id: string): void; onObserve(place: ObserverPlace): void; onUnwatch(latitude: number, longitude: number): Promise<void> }) {
  const saved = discoveries.filter((item) => item.status === 'saved')
  return <main className="page"><div className="page-heading"><div><span className="eyebrow">LOCAL & PRIVATE</span><h1>Your Earth</h1></div></div>{saved.length ? <><h2 className="section-title">Saved stories</h2><div className="card-stack">{saved.map((discovery, index) => <DiscoveryCard key={discovery.id} discovery={discovery} index={index} onOpen={() => onOpen(discovery.id)} onSave={() => undefined}/>)}</div></> : <EmptyState icon={<ShieldCheck/>} title="Nothing saved yet">Save an Earth Today story to preserve its evidence locally. Nothing is uploaded.</EmptyState>}<h2 className="section-title">Watched places <small>IN‑APP</small></h2>{watches.length ? <div className="watch-list">{watches.map((watch) => { const match = evaluateWatch(watch, signals); return <div key={watch.id}><BellRing/><button onClick={() => onObserve({ id: watch.id, name: watch.target.name, subtitle: `${watch.conditions.radiusKm} km · severity ${watch.conditions.minimumSeverity}+`, latitude: watch.target.latitude, longitude: watch.target.longitude })}><strong>{watch.target.name}</strong><small>{match.signalIds.length ? `${match.signalIds.length} elevated nearby now` : 'No elevated nearby activity'} · {watch.conditions.radiusKm} km</small></button><button aria-label={`Stop watching ${watch.target.name}`} onClick={() => void onUnwatch(watch.target.latitude, watch.target.longitude)}><X/></button></div> })}</div> : <p className="quiet-copy">Watch a place or object to surface meaningful changes whenever NEXUS is open.</p>}</main>
}

export function ObserverPage({ signals, initialPlace, watches, onWatch, onUnwatch, onSelectIntelligence }: { signals: Signal[]; initialPlace?: ObserverPlace; watches: WatchRule[]; onWatch(place: ObserverPlace): Promise<void>; onUnwatch(latitude: number, longitude: number): Promise<void>; onSelectIntelligence(object: NexusIntelligenceObject): void }) {
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | undefined>(() => initialPlace ? { latitude: initialPlace.latitude, longitude: initialPlace.longitude } : undefined)
  const [placeName, setPlaceName] = useState<string | undefined>(() => initialPlace ? [initialPlace.name, initialPlace.subtitle].filter(Boolean).join(', ') : undefined)
  const [placeQuery, setPlaceQuery] = useState('')
  const [placeResults, setPlaceResults] = useState<ObserverPlace[]>([])
  const [searching, setSearching] = useState(false)
  const [denied, setDenied] = useState(false)
  const [context, setContext] = useState<ObserverContext>()
  const [marine, setMarine] = useState<MarineContext>()
  const [life, setLife] = useState<LifeContext>()
  const [passes, setPasses] = useState<OrbitalPass[]>([])
  const [orbitState, setOrbitState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [contextState, setContextState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [now, setNow] = useState(Date.now())
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>(() => {
    try {
      const stored = localStorage.getItem('nexus:temperatureUnit')
      if (stored === 'celsius' || stored === 'fahrenheit') return stored
    } catch { /* Use regional default. */ }
    const region = navigator.language.split('-')[1]?.toUpperCase()
    return ['US', 'PR', 'VI', 'GU', 'AS', 'MP', 'BS', 'BZ', 'KY', 'LR', 'FM', 'MH', 'PW'].includes(region ?? '') ? 'fahrenheit' : 'celsius'
  })
  const [savedPlaces, setSavedPlaces] = useState<ObserverPlace[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem('nexus:observerPlaces') ?? '[]') as unknown
      if (!Array.isArray(value)) return []
      return value.filter((item): item is ObserverPlace => Boolean(item && typeof item === 'object' && 'id' in item && 'name' in item && 'latitude' in item && 'longitude' in item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.latitude === 'number' && typeof item.longitude === 'number' && Math.abs(item.latitude) <= 90 && Math.abs(item.longitude) <= 180)).slice(0, 6).map((item) => ({ ...item, name: dedupeLocationLabel(item.name) }))
    } catch { return [] }
  })
  const currentPlaceId = location ? `saved-${location.latitude.toFixed(4)}-${location.longitude.toFixed(4)}` : undefined
  const currentWatch = location ? watches.find((watch) => watch.id === placeWatchId(location.latitude, location.longitude)) : undefined
  const watched = Boolean(currentWatch)
  const nearby = location ? signals.filter((signal) => signal.location && distanceKm(location, signal.location) <= 500).sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0)).slice(0, 6) : []
  const watchMatches = currentWatch ? evaluateWatch(currentWatch, signals).signalIds.length : 0
  const weatherWatch = currentWatch ? evaluateWeatherWatch(currentWatch, context, signals, now) : undefined
  const request = () => navigator.geolocation?.getCurrentPosition((position) => { setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }); setPlaceName('Current location') }, () => setDenied(true), { enableHighAccuracy: false, timeout: 8000 })
  const findPlace = async () => {
    if (placeQuery.trim().length < 2) return
    setSearching(true)
    try { setPlaceResults(await searchObserverPlaces(placeQuery)) } catch { setPlaceResults([]) } finally { setSearching(false) }
  }
  const selectPlace = (place: ObserverPlace) => {
    setLocation({ latitude: place.latitude, longitude: place.longitude })
    setPlaceName(typeof place.id === 'string' && place.id.startsWith('saved-') ? place.name : [place.name, place.subtitle].filter(Boolean).join(', '))
    setPlaceResults([])
    setPlaceQuery('')
  }
  const saveCurrentPlace = () => {
    if (!location) return
    const name = placeName ?? `${location.latitude.toFixed(2)}°, ${location.longitude.toFixed(2)}°`
    const existing = savedPlaces.find((item) => item.id === currentPlaceId)
    const place: ObserverPlace = { id: currentPlaceId!, name, subtitle: existing?.subtitle ?? 'Saved observation point', ...location }
    setSavedPlaces((places) => [place, ...places.filter((item) => item.id !== place.id)].slice(0, 6))
  }
  const toggleWatch = () => {
    if (!location || !currentPlaceId) return
    const name = placeName ?? `${location.latitude.toFixed(2)}°, ${location.longitude.toFixed(2)}°`
    const existing = savedPlaces.find((place) => place.id === currentPlaceId)
    const place: ObserverPlace = { id: currentPlaceId, name, subtitle: existing?.subtitle ?? '250 km · elevated activity', ...location }
    setSavedPlaces((places) => [place, ...places.filter((item) => item.id !== currentPlaceId)].slice(0, 6))
    if (watched) void onUnwatch(location.latitude, location.longitude)
    else void onWatch(place)
  }
  useEffect(() => { try { localStorage.setItem('nexus:observerPlaces', JSON.stringify(savedPlaces)) } catch { /* Private storage unavailable. */ } }, [savedPlaces])
  useEffect(() => { try { localStorage.setItem('nexus:temperatureUnit', temperatureUnit) } catch { /* Private storage unavailable. */ } }, [temperatureUnit])
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer) }, [])
  useEffect(() => {
    if (!location) return
    const controller = new AbortController()
    const load = () => {
      if (document.visibilityState === 'hidden') return
      setContextState((state) => state === 'ready' ? state : 'loading')
      void Promise.allSettled([
        fetchObserverContext(location.latitude, location.longitude, controller.signal),
        fetchMarineContext(location.latitude, location.longitude, controller.signal),
        fetchLifeContext(location.latitude, location.longitude, controller.signal),
      ]).then(([weatherResult, marineResult, lifeResult]) => {
        if (weatherResult.status === 'fulfilled') { setContext(weatherResult.value); setContextState('ready') }
        else if (!controller.signal.aborted) setContextState('error')
        if (marineResult.status === 'fulfilled' && marineResult.value && distanceKm(location, { latitude: marineResult.value.gridLatitude, longitude: marineResult.value.gridLongitude }) <= 150) setMarine(marineResult.value)
        else setMarine(undefined)
        if (lifeResult.status === 'fulfilled') setLife(lifeResult.value)
        else setLife(undefined)
      })
    }
    load()
    const timer = window.setInterval(load, 10 * 60_000)
    document.addEventListener('visibilitychange', load)
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', load) }
  }, [location])
  useEffect(() => {
    if (!location) { setPasses([]); return }
    const controller = new AbortController()
    setOrbitState('loading')
    void loadOrbitalElements(controller.signal)
      .then((snapshot) => calculateOrbitalPasses(snapshot.objects, location.latitude, location.longitude))
      .then((value) => { if (!controller.signal.aborted) { setPasses(value); setOrbitState('ready') } })
      .catch(() => { if (!controller.signal.aborted) { setPasses([]); setOrbitState('error') } })
    return () => controller.abort()
  }, [location])
  const localClock = (() => { try { return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit', timeZone: context?.timezone }).format(now) } catch { return new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) } })()
  const unitMark = temperatureUnit === 'fahrenheit' ? 'F' : 'C'
  const windUnit = temperatureUnit === 'fahrenheit' ? 'mph' : 'km/h'
  const precipitationUnit = temperatureUnit === 'fahrenheit' ? 'in' : 'mm'
  const visibilityUnit = temperatureUnit === 'fahrenheit' ? 'mi' : 'km'
  const pressureUnit = temperatureUnit === 'fahrenheit' ? 'inHg' : 'hPa'
  const watchedIds = new Set(watches.map((watch) => watch.id))
  return <main className="page observer-page"><div className="page-heading"><div><span className="eyebrow">YOUR EARTH</span><h1>Understand this place</h1></div><div className="observer-heading-tools"><div className="temperature-toggle" role="group" aria-label="Temperature unit"><button className={temperatureUnit === 'fahrenheit' ? 'active' : ''} aria-pressed={temperatureUnit === 'fahrenheit'} onClick={() => setTemperatureUnit('fahrenheit')}>°F</button><button className={temperatureUnit === 'celsius' ? 'active' : ''} aria-pressed={temperatureUnit === 'celsius'} onClick={() => setTemperatureUnit('celsius')}>°C</button></div><Radio className="observer-radio"/></div></div>{!location ? <div className="permission-card observer-picker"><MapPin/><h2>Choose an observation point</h2><p>Search anywhere without sharing your location, or use the device location only when you choose.</p>{savedPlaces.length > 0 && <div className="saved-observers"><span>YOUR EARTH</span>{savedPlaces.map((place) => { const isWatched = watchedIds.has(placeWatchId(place.latitude, place.longitude)); return <div key={place.id}><button onClick={() => selectPlace(place)}>{isWatched ? <BellRing/> : <Star/>}<span><strong>{place.name}</strong><small>{isWatched ? `Watching · ${place.subtitle}` : place.subtitle}</small></span></button><button aria-label={`Remove ${place.name}`} onClick={() => setSavedPlaces((places) => places.filter((item) => item.id !== place.id))}><X/></button></div> })}</div>}<form className="place-search" onSubmit={(event) => { event.preventDefault(); void findPlace() }}><Search/><input value={placeQuery} onChange={(event) => setPlaceQuery(event.target.value)} placeholder="City, region, country, or postal code…" aria-label="Search for an observation point"/><button disabled={placeQuery.trim().length < 2 || searching}>{searching ? 'Searching…' : 'Search'}</button></form>{placeResults.length > 0 && <div className="place-results">{placeResults.map((place) => <button key={place.id} onClick={() => selectPlace(place)}><span><strong>{place.name}</strong><small>{place.subtitle || `${place.latitude.toFixed(2)}°, ${place.longitude.toFixed(2)}°`}</small></span><Navigation/></button>)}</div>}<div className="observer-divider"><span>or</span></div><button className="secondary-action" onClick={request}><LocateFixed/> Use current location</button>{denied && <small>Location wasn’t available. Search for a place instead, or enable location in browser settings.</small>}</div> : <div className="observer-dashboard"><div className="observer-hero"><span>OBSERVING · {context?.timezone ?? 'LOCAL'}</span><strong>{placeName ?? `${location.latitude.toFixed(2)}°, ${location.longitude.toFixed(2)}°`}</strong><time>{localClock}</time>{context && <div className="observer-weather"><b>{Math.round(displayTemperature(context.temperature, temperatureUnit))}°{unitMark}</b><small>{weatherCodeLabel(context.weatherCode)} · feels {Math.round(displayTemperature(context.apparentTemperature, temperatureUnit))}°</small></div>}{context && <p className="weather-plain-summary">{observerWeatherSummary(context)}</p>}</div><div className="observer-location-actions"><button onClick={() => { setLocation(undefined); setContext(undefined); setMarine(undefined); setContextState('idle') }}>Change location</button><button onClick={saveCurrentPlace}><Star/> Save</button><button className={watched ? 'watching' : ''} onClick={toggleWatch}><BellRing/> {watched ? 'Watching' : 'Watch'}</button></div>{watched && <div className={`watch-status ${watchMatches || weatherWatch?.active ? 'active' : ''}`}><BellRing/><span><strong>{weatherWatch?.active ? weatherWatch.reasons[0] : watchMatches ? `${watchMatches} elevated signal${watchMatches === 1 ? '' : 's'} nearby` : 'No meaningful watch change'}</strong><small>{weatherWatch?.active && weatherWatch.reasons.length > 1 ? `${weatherWatch.reasons.slice(1).join(' · ')} · ` : ''}In-app checks · 250 km · severe alerts / 70% rain / 60 km/h wind</small></span></div>}<div className="ambient-grid weather-now-grid"><div><CloudSun/><span>Weather</span><strong>{contextState === 'loading' ? 'Loading…' : context ? weatherCodeLabel(context.weatherCode) : 'Unavailable'}</strong></div><div><Wind/><span>Wind</span><strong>{context ? `${Math.round(displayWindSpeed(context.windSpeed, temperatureUnit))} ${windUnit}` : '—'}</strong></div><div><Gauge/><span>Air quality</span><strong>{context?.aqi ? `AQI ${Math.round(context.aqi)}` : '—'}</strong></div><div><Droplets/><span>Humidity</span><strong>{context?.relativeHumidity === undefined ? '—' : `${Math.round(context.relativeHumidity)}%`}</strong></div><div><CloudSun/><span>Cloud cover</span><strong>{context ? `${Math.round(context.cloudCover)}%` : '—'}</strong></div><div><CloudRain/><span>Precipitation</span><strong>{context ? `${displayPrecipitation(context.precipitation, temperatureUnit).toFixed(temperatureUnit === 'fahrenheit' ? 2 : 1)} ${precipitationUnit}` : '—'}</strong></div><div><Compass/><span>Visibility</span><strong>{context?.visibility === undefined ? '—' : `${displayVisibility(context.visibility, temperatureUnit).toFixed(1)} ${visibilityUnit}`}</strong></div><div><Gauge/><span>Pressure</span><strong>{context ? `${displayPressure(context.pressure, temperatureUnit).toFixed(temperatureUnit === 'fahrenheit' ? 2 : 0)} ${pressureUnit}` : '—'}</strong></div><div><Sunrise/><span>Sunrise</span><strong>{context ? formatObserverWallTime(context.sunrise) : '—'}</strong></div><div><Sunset/><span>Sunset</span><strong>{context ? formatObserverWallTime(context.sunset) : '—'}</strong></div><div><Activity/><span>Within 500 km</span><strong>{nearby.length}</strong></div></div>{context && <WeatherForecast hourly={context.hourly24} daily={context.daily5} unit={temperatureUnit} observedAt={context.observedAt} retrievedAt={context.retrievedAt}/>} {marine && <><h2 className="section-title">Around here · Ocean <small>MODELED · OPEN‑METEO</small></h2><div className="marine-grid"><div><Waves/><span>Wave height</span><strong>{marine.waveHeight !== undefined ? `${marine.waveHeight.toFixed(1)} m` : '—'}</strong><small>{marine.wavePeriod ? `${marine.wavePeriod.toFixed(0)} sec period` : 'Model grid'}</small></div><div><Thermometer/><span>Sea surface</span><strong>{marine.seaSurfaceTemperature !== undefined ? `${Math.round(displayTemperature(marine.seaSurfaceTemperature, temperatureUnit))}°${unitMark}` : '—'}</strong><small>Nearest sea cell</small></div><div><Compass/><span>Current</span><strong>{marine.currentVelocity !== undefined ? `${marine.currentVelocity.toFixed(1)} km/h` : '—'}</strong><small>{marine.currentDirection !== undefined ? `${Math.round(marine.currentDirection)}° flow` : 'Modeled'}</small></div></div><p className="model-note">Marine conditions are model estimates from the nearest sea grid and are not suitable for navigation.</p></>}{life && <><h2 className="section-title life-title"><Bird/> What lives here? <small>OBSERVED · GBIF</small></h2><div className="life-list">{life.taxa.length ? life.taxa.slice(0, 6).map((taxon) => <button type="button" key={taxon.id} onClick={() => location && onSelectIntelligence(observerTaxonToIntelligence(taxon, life, location))}>{taxon.media ? <img src={taxon.media.url} alt="" loading="lazy" referrerPolicy="no-referrer"/> : <Bird/>}<span><strong>{taxon.commonName ?? taxon.scientificName}</strong><small>{taxon.commonName ? taxon.scientificName : taxon.taxonomicClass ?? taxon.kingdom} · {taxon.count} sampled record{taxon.count === 1 ? '' : 's'} · tap to understand</small></span><Navigation/></button>) : <p className="quiet-copy">No permissively licensed recent occurrence records were found in this bounded sample.</p>}</div><p className="model-note">{life.methodology} <a href="https://www.gbif.org/citation-guidelines" target="_blank" rel="noreferrer">Citation guidance</a></p></>}<><h2 className="section-title orbit-title"><Orbit/> What is overhead? <small>LOCAL ORBIT PROPAGATION</small></h2><div className="orbit-list">{orbitState === 'loading' ? <p className="quiet-copy">Calculating the next 24 hours on this device…</p> : passes.length ? passes.slice(0, 4).map((pass) => <button type="button" key={`${pass.catalogId}-${pass.start}`} onClick={() => location && onSelectIntelligence(orbitalPassToIntelligence(pass, location))}><Orbit/><span><strong>{pass.objectName}</strong><small>{new Date(pass.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · peaks {pass.maxElevation}° · {pass.darkSky ? 'dark-sky pass' : 'daylight/twilight'} · tap to understand</small></span><Navigation/></button>) : <p className="quiet-copy">{orbitState === 'error' ? 'Orbital elements are temporarily unavailable.' : 'No selected station rises above 18° in the next 24 hours.'}</p>}</div><p className="model-note">Passes are propagated locally from CelesTrak OMM elements using SGP4. Visibility still depends on illumination, weather, obstructions, and fresh orbital data.</p></>{contextState === 'error' && <p className="context-error">Local weather is temporarily unavailable. Nearby NEXUS sources remain active.</p>}<h2 className="section-title">What else is happening nearby?</h2><div className="nearby-list">{nearby.length ? nearby.map((signal) => <button type="button" key={signal.id} onClick={() => onSelectIntelligence(signalToIntelligence(signal))}><span className={`type-dot ${signal.type}`}/><section><strong>{signal.title}</strong><small>{signal.source.provider} · {signal.source.freshness} · tap to understand</small></section><Navigation/></button>) : <p className="quiet-copy">No qualifying signals are currently within 500 km.</p>}</div></div>}</main>
}

export function SearchPanel({ signals, onSelect, onPlace }: { signals: Signal[]; onSelect(signal: Signal): void; onPlace(place: ObserverPlace): void }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchSignals(signals, query, 8), [query, signals])
  const [places, setPlaces] = useState<ObserverPlace[]>([])
  const [placeState, setPlaceState] = useState<'idle' | 'loading' | 'ready'>('idle')
  useEffect(() => {
    if (query.trim().length < 2) { setPlaces([]); setPlaceState('idle'); return }
    const controller = new AbortController()
    setPlaceState('loading')
    const timer = window.setTimeout(() => {
      void searchObserverPlaces(query, controller.signal).then((value) => { setPlaces(value.slice(0, 4)); setPlaceState('ready') }).catch(() => { if (!controller.signal.aborted) { setPlaces([]); setPlaceState('ready') } })
    }, 320)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query])
  const hasResults = results.length > 0 || places.length > 0
  return <div className="search-panel universal-search"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Place, signal, event, or source…" aria-label="Search NEXUS"/>{query.trim().length >= 2 && <div className="search-results">{places.length > 0 && <div className="search-result-label">PLACES</div>}{places.map((place) => <button key={`place-${place.id}`} onClick={() => { onPlace(place); setQuery('') }}><MapPin size={15}/><span>{place.name}<small>{place.subtitle || `${place.latitude.toFixed(2)}°, ${place.longitude.toFixed(2)}°`}</small></span><Navigation size={14}/></button>)}{results.length > 0 && <div className="search-result-label">CURRENT EVIDENCE</div>}{results.map((signal) => <button key={signal.id} onClick={() => { onSelect(signal); setQuery('') }}><Activity size={15}/><span>{signal.title}<small>{signal.type} · {signal.source.provider}</small></span><Navigation size={14}/></button>)}{!hasResults && placeState === 'loading' && <div className="search-loading">Resolving place…</div>}{!hasResults && placeState === 'ready' && <div className="search-empty">No place or current evidence matches this query.<small>Try a city with its country or region for precise results.</small></div>}</div>}</div>
}

export function SurpriseButton({ onClick }: { onClick(): void }) { return <button className="surprise-button" onClick={onClick}><Sparkles size={16}/> Surprise me</button> }
