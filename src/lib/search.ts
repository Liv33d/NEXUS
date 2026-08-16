import type { Signal, SignalType } from '../types/signal'

const aliases: Array<[RegExp, SignalType]> = [
  [/\b(earthquake|earthquakes|quake|quakes|seismic)\b/i, 'earthquake'],
  [/\b(fire|fires|wildfire|wildfires|thermal|hotspot|hotspots)\b/i, 'fire'],
  [/\b(weather|storm|storms|tornado|tornadoes|flood|floods|hurricane|hurricanes|cyclone|cyclones)\b/i, 'weather'],
  [/\b(volcano|volcanoes|eruption|eruptions|environment|environmental)\b/i, 'environment'],
  [/\b(space weather|solar|geomagnetic|aurora)\b/i, 'space-weather'],
  [/\b(aircraft|airplane|airplanes|aviation|flight|flights)\b/i, 'aircraft'],
  [/\b(satellite|satellites|orbit|orbital)\b/i, 'satellite'],
]
const stopwords = new Set(['near', 'around', 'over', 'in', 'at', 'the', 'a', 'an', 'from', 'signal', 'signals', 'activity'])

export function searchSignals(signals: Signal[], query: string, limit = 10): Signal[] {
  const normalized = query.trim().toLowerCase()
  if (normalized.length < 2) return []
  const type = aliases.find(([pattern]) => pattern.test(normalized))?.[1]
  let residual = normalized
  for (const [pattern] of aliases) residual = residual.replace(pattern, ' ')
  const terms = residual.split(/[^a-z0-9]+/).filter((term) => term.length > 1 && !stopwords.has(term))

  return signals.flatMap((signal) => {
    if (type && signal.type !== type) return []
    const entityText = signal.entities?.map((entity) => entity.name).join(' ') ?? ''
    const text = `${signal.title} ${signal.summary ?? ''} ${signal.type} ${signal.source.provider} ${signal.source.dataset ?? ''} ${entityText}`.toLowerCase()
    if (terms.some((term) => !text.includes(term))) return []
    const score = terms.reduce((value, term) => value + (signal.title.toLowerCase().includes(term) ? 4 : entityText.toLowerCase().includes(term) ? 3 : 1), type ? 3 : 0) + (signal.severity ?? 0) / 100
    return [{ signal, score }]
  }).sort((a, b) => b.score - a.score || b.signal.timestamp - a.signal.timestamp).slice(0, limit).map(({ signal }) => signal)
}
