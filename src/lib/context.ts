import type { Signal } from '../types/signal'

export type ContextConfidence = 'observed' | 'reported' | 'derived' | 'estimated' | 'predicted'

export interface ContextCard {
  headline: string
  plainLanguageSummary: string
  whyItMatters?: string
  whatHappensNext?: string
  affectedArea?: string
  timing?: string
  confidence: ContextConfidence
  recommendedAwareness?: string
  technicalFacts: Array<{ label: string; value: string }>
  methodology: string
}

const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined

function earthquakeContext(signal: Signal): ContextCard {
  const magnitude = signal.magnitude ?? number(signal.attributes.magnitude)
  const depth = number(signal.attributes.depthKm)
  const felt = number(signal.attributes.feltReports)
  const tsunami = signal.attributes.tsunami === true
  const place = signal.entities?.find((entity) => entity.type === 'LOCATION')?.name ?? signal.title.replace(/^M\s*[\d.]+\s*[-–—]?\s*/i, '')
  const descriptor = magnitude === undefined ? 'Earthquake' : magnitude >= 7 ? 'Major earthquake' : magnitude >= 6 ? 'Strong earthquake' : magnitude >= 5 ? 'Moderate earthquake' : magnitude >= 4 ? 'Light earthquake' : 'Minor earthquake'
  return {
    headline: `${descriptor}${place ? ` near ${place}` : ''}`,
    plainLanguageSummary: `${magnitude === undefined ? 'An earthquake' : `A magnitude ${magnitude.toFixed(1)} earthquake`} occurred${place ? ` near ${place}` : ''}${depth === undefined ? '.' : ` about ${Math.round(depth)} km below the surface.`}`,
    whyItMatters: tsunami ? 'The source flagged this event for tsunami evaluation; consult the linked official warning authority for current guidance.' : felt ? `${Math.round(felt)} people have submitted shaking reports to USGS.` : magnitude !== undefined && magnitude >= 5 ? 'Earthquakes of this size can produce noticeable or damaging shaking near the epicenter.' : 'Smaller earthquakes are common globally, but local effects depend on depth, distance, and ground conditions.',
    whatHappensNext: magnitude !== undefined && magnitude >= 5 ? 'Aftershocks are possible. Authoritative estimates may change as seismic data are reviewed.' : 'USGS may refine the magnitude and location as more stations report.',
    affectedArea: place,
    confidence: 'observed',
    recommendedAwareness: tsunami ? 'Check official tsunami messages before approaching coastal areas.' : undefined,
    technicalFacts: [magnitude === undefined ? undefined : { label: 'Magnitude', value: magnitude.toFixed(1) }, depth === undefined ? undefined : { label: 'Depth', value: `${Math.round(depth)} km` }, felt === undefined ? undefined : { label: 'Felt reports', value: Math.round(felt).toLocaleString() }].filter(Boolean) as Array<{ label: string; value: string }>,
    methodology: 'Plain-language context is generated deterministically from USGS magnitude, depth, review, felt-report, and tsunami fields. It is not a damage assessment.',
  }
}

function weatherContext(signal: Signal): ContextCard {
  const event = text(signal.attributes.event) ?? signal.title.split('—')[0]!.trim()
  const area = text(signal.attributes.areaDescription)?.split(';')[0]?.trim() ?? signal.entities?.find((entity) => entity.type === 'REGION')?.name
  const instruction = text(signal.attributes.instruction)
  const certainty = text(signal.attributes.certainty)
  const urgency = text(signal.attributes.urgency)
  const cyclone = signal.source.provider === 'nhc'
  return {
    headline: cyclone ? `${signal.title} is being tracked` : `${event}${area ? ` for ${area}` : ''}`,
    plainLanguageSummary: signal.summary ?? `${event} is active${area ? ` for ${area}` : ''}.`,
    whyItMatters: cyclone ? 'Official forecast tracks show the likely path and uncertainty, not a guaranteed route.' : urgency === 'Immediate' ? 'The alert identifies an immediate hazard. Read the official instructions before making decisions.' : 'Conditions could affect safety, travel, or property in the named area.',
    whatHappensNext: signal.endTime ? `The current message is scheduled through ${new Date(signal.endTime).toLocaleString()}; it may be updated or replaced sooner.` : 'The issuing authority may update the alert as conditions change.',
    affectedArea: area,
    confidence: cyclone ? 'predicted' : certainty === 'Observed' ? 'observed' : 'reported',
    recommendedAwareness: instruction?.slice(0, 420),
    technicalFacts: [text(signal.attributes.severity) ? { label: 'Official severity', value: text(signal.attributes.severity)! } : undefined, certainty ? { label: 'Certainty', value: certainty } : undefined, urgency ? { label: 'Urgency', value: urgency } : undefined].filter(Boolean) as Array<{ label: string; value: string }>,
    methodology: 'Language is assembled from official NWS/NHC fields. Forecast geometry represents uncertainty and is not a guaranteed path.',
  }
}

function fireContext(signal: Signal): ContextCard {
  const confidence = number(signal.confidence)
  const frp = number(signal.attributes.fireRadiativePowerMw)
  return {
    headline: 'Satellite detected unusual heat',
    plainLanguageSummary: 'A satellite observed a thermal anomaly at this location. It may indicate active fire, industrial heat, or another hot surface and is not automatically a confirmed wildfire.',
    whyItMatters: frp !== undefined && frp >= 50 ? 'The measured radiant heat is comparatively strong, so persistent or nearby detections deserve closer inspection.' : 'Repeated detections and agreement with official incidents provide stronger evidence than one satellite pixel.',
    whatHappensNext: 'Later satellite passes may confirm whether the heat persists. Weather and official incident reports provide additional context.',
    confidence: 'observed',
    technicalFacts: [confidence === undefined ? undefined : { label: 'Source confidence', value: `${Math.round(confidence * 100)}%` }, frp === undefined ? undefined : { label: 'Radiative power', value: `${frp.toFixed(1)} MW` }, text(signal.attributes.satellite) ? { label: 'Satellite', value: text(signal.attributes.satellite)! } : undefined].filter(Boolean) as Array<{ label: string; value: string }>,
    methodology: 'Context preserves NASA FIRMS terminology: a thermal anomaly is an observation, not automatic confirmation of an uncontrolled wildfire.',
  }
}

function femaContext(signal: Signal): ContextCard {
  const incidentType = text(signal.attributes.incidentType) ?? 'disaster'
  const areas = Array.isArray(signal.attributes.designatedAreas) ? signal.attributes.designatedAreas.filter((value): value is string => typeof value === 'string') : []
  const programs = Array.isArray(signal.attributes.assistancePrograms) ? signal.attributes.assistancePrograms.filter((value): value is string => typeof value === 'string') : []
  return {
    headline: `Federal ${incidentType.toLowerCase()} declaration`,
    plainLanguageSummary: signal.summary ?? 'FEMA has published a federal disaster declaration for the affected area.',
    whyItMatters: programs.length ? `The declaration authorizes ${programs.join(', ').toLowerCase()} for eligible response or recovery work.` : 'A declaration records a federal disaster action; eligibility and assistance depend on the official declaration details.',
    whatHappensNext: 'Designated areas and assistance programs can change through later amendments.',
    affectedArea: areas.slice(0, 3).join(', '),
    confidence: 'reported',
    technicalFacts: [{ label: 'Disaster number', value: String(signal.attributes.disasterNumber ?? '—') }, { label: 'Declaration', value: String(signal.attributes.declarationType ?? '—') }, { label: 'Areas listed', value: String(areas.length) }],
    methodology: 'Context is generated from OpenFEMA Disaster Declarations Summaries. State-level map placement is approximate; official designated-area text remains authoritative.',
  }
}

function volcanoContext(signal: Signal): ContextCard {
  const name = signal.entities?.find((entity) => entity.type === 'FACILITY')?.name ?? signal.title
  const alertLevel = text(signal.attributes.alertLevel) ?? 'elevated'
  const colorCode = text(signal.attributes.colorCode)
  const synopsis = signal.summary?.replace(/^[A-Z]+\s+[^—-]+[—-]\s*/i, '') ?? signal.summary
  return {
    headline: name,
    plainLanguageSummary: synopsis ?? `${name} has an elevated official volcano status.`,
    whyItMatters: colorCode === 'RED' || alertLevel === 'WARNING' ? 'The official status indicates hazardous eruptive activity may be occurring or imminent. Ash can also affect aviation.' : 'An elevated alert means activity is above typical background conditions and the responsible observatory is monitoring it closely.',
    whatHappensNext: 'The responsible volcano observatory may update the alert level as seismic, thermal, gas, and visual observations change.',
    affectedArea: text(signal.attributes.region), confidence: 'reported',
    technicalFacts: [{ label: 'Alert level', value: alertLevel }, colorCode ? { label: 'Aviation color', value: colorCode } : undefined, text(signal.attributes.observatory) ? { label: 'Observatory', value: text(signal.attributes.observatory)! } : undefined, text(signal.attributes.nvewsThreat) ? { label: 'NVEWS threat', value: text(signal.attributes.nvewsThreat)! } : undefined].filter(Boolean) as Array<{ label: string; value: string }>,
    methodology: 'Context is assembled from the current USGS Volcano Hazards Program alert level, aviation color code, observatory synopsis, and region. NEXUS does not infer an eruption.',
  }
}

function movingObjectContext(signal: Signal): ContextCard {
  const isSatellite = signal.type === 'satellite'
  const altitude = number(signal.attributes.altitudeMeters) ?? number(signal.attributes.altitude)
  const speed = number(signal.attributes.velocity) ?? number(signal.attributes.speed)
  const heading = number(signal.attributes.heading) ?? number(signal.attributes.track)
  return {
    headline: signal.title,
    plainLanguageSummary: signal.summary ?? `${isSatellite ? 'An orbital object' : 'An aircraft'} was reported at this position.`,
    whyItMatters: isSatellite ? 'Orbital positions are propagated from published elements and become less certain as those elements age.' : 'Public aircraft position feeds can be delayed, incomplete, or unavailable; identity and route are shown only when the provider supplies them.',
    whatHappensNext: isSatellite ? 'The object will continue along its calculated ground track. Local visibility also depends on sunlight, weather, and viewing geometry.' : 'The reported position may update as the aircraft moves through provider coverage.',
    confidence: isSatellite ? 'estimated' : 'reported',
    technicalFacts: [altitude === undefined ? undefined : { label: 'Altitude', value: `${Math.round(altitude >= 10_000 ? altitude / 1000 : altitude).toLocaleString()} ${altitude >= 10_000 ? 'km' : 'm'}` }, speed === undefined ? undefined : { label: 'Speed', value: speed.toLocaleString() }, heading === undefined ? undefined : { label: 'Heading', value: `${Math.round(heading)}°` }].filter(Boolean) as Array<{ label: string; value: string }>,
    methodology: isSatellite ? 'Position context is calculated locally from provider orbital elements where available.' : 'Context uses only fields supplied by the public aviation provider. Missing operator, type, origin, or destination values are not guessed.',
  }
}

export function buildSignalContext(signal: Signal): ContextCard {
  if (signal.type === 'earthquake') return earthquakeContext(signal)
  if (signal.type === 'fire') return fireContext(signal)
  if (signal.source.provider === 'openfema') return femaContext(signal)
  if (signal.source.provider === 'usgs-volcano') return volcanoContext(signal)
  if (signal.type === 'weather') return weatherContext(signal)
  if (signal.type === 'aircraft' || signal.type === 'satellite') return movingObjectContext(signal)
  return {
    headline: signal.title,
    plainLanguageSummary: signal.summary ?? 'NEXUS received this observation from the named source.',
    whyItMatters: (signal.severity ?? 0) >= 70 ? 'This signal is elevated enough to merit attention, but significance depends on local conditions and authoritative guidance.' : undefined,
    whatHappensNext: signal.endTime ? `The current published period ends ${new Date(signal.endTime).toLocaleString()}.` : undefined,
    confidence: signal.provenance.some((entry) => entry.label === 'DERIVED_METRIC') ? 'derived' : 'reported',
    technicalFacts: [],
    methodology: 'Context is generated deterministically from normalized source fields. Missing information is not inferred.',
  }
}

export function discoveryPlainLanguage(signalCount: number, sourceCount: number, deviationPercent?: number): string {
  if (deviationPercent !== undefined) return `${signalCount} recent observations are ${Math.abs(Math.round(deviationPercent))}% ${deviationPercent >= 0 ? 'above' : 'below'} the recent regional baseline.`
  return `${signalCount} related observation${signalCount === 1 ? '' : 's'} from ${sourceCount} independent source${sourceCount === 1 ? '' : 's'} occurred near one another.`
}
