import { db } from '../lib/db'
import { validateSignal } from '../lib/signal'
import { buildTemporal, lineage } from '../lib/temporal'
import type { Signal } from '../types/signal'
import { fetchWithTimeout, ProviderError, providerHttpError, type SignalProvider, type SignalQueryContext } from './types'

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"' && line[index + 1] === '"' && quoted) { value += '"'; index += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { cells.push(value); value = '' }
    else value += char
  }
  cells.push(value)
  return cells
}

function parseAcquired(date: string, time: string): number {
  const padded = time.padStart(4, '0')
  const parsed = Date.parse(`${date}T${padded.slice(0, 2)}:${padded.slice(2)}:00Z`)
  return Number.isFinite(parsed) ? parsed : Date.now()
}

function confidenceWeight(value: string): number {
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return Math.max(0, Math.min(1, numeric / 100))
  return value.toLowerCase() === 'h' ? 1 : value.toLowerCase() === 'n' ? .7 : .4
}

function confidenceLabel(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'h') return 'high'
  if (normalized === 'n') return 'nominal'
  if (normalized === 'l') return 'low'
  return value.trim() ? `provider category ${value.trim()}` : 'not supplied'
}

export function normalizeFirmsCsv(csv: string, retrievedAt = Date.now()): Signal[] {
  if (csv.length > 12_000_000) throw new ProviderError('FIRMS response exceeded the safe size limit', 'firms', false)
  const lines = csv.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  if (lines.length - 1 > 12_000) throw new ProviderError('FIRMS record cap exceeded; coverage is unknown, so the partial response was rejected', 'firms', true)
  const headerLine = lines.shift()
  if (!headerLine) return []
  const headers = parseCsvLine(headerLine).map((header) => header.trim().toLowerCase())
  const index = Object.fromEntries(headers.map((header, position) => [header, position]))
  const cell = (row: string[], name: string) => row[index[name] ?? -1] ?? ''
  return lines.flatMap((line) => {
    const row = parseCsvLine(line)
    const latitude = Number(cell(row, 'latitude'))
    const longitude = Number(cell(row, 'longitude'))
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return []
    const confidence = confidenceWeight(cell(row, 'confidence'))
    const detectionConfidence = confidenceLabel(cell(row, 'confidence'))
    const frp = Number(cell(row, 'frp'))
    const brightness = Number(cell(row, 'bright_ti4') || cell(row, 'brightness'))
    const timestamp = parseAcquired(cell(row, 'acq_date'), cell(row, 'acq_time'))
    const satellite = cell(row, 'satellite') || 'Satellite'
    const instrument = cell(row, 'instrument') || 'VIIRS'
    const upstreamKey = `firms:${satellite.toLowerCase()}:${instrument.toLowerCase()}:${timestamp}:${latitude.toFixed(4)}:${longitude.toFixed(4)}`
    const severity = Math.min(100, 24 + confidence * 35 + (Number.isFinite(frp) ? Math.min(30, Math.log10(Math.max(1, frp)) * 12) : 0))
    return [validateSignal({
      id: upstreamKey,
      source: { provider: 'firms', dataset: 'NASA FIRMS VIIRS NOAA-20 NRT', url: 'https://firms.modaps.eosdis.nasa.gov/', retrievedAt, freshness: 'delayed', ...lineage('nasa-firms', 'primary-observation', upstreamKey) },
      type: 'fire',
      title: `Thermal detection — ${instrument} / ${satellite}`,
      summary: `Satellite thermal anomaly with ${detectionConfidence} detection confidence${Number.isFinite(frp) ? ` and ${frp.toFixed(1)} MW fire radiative power` : ''}. A thermal detection does not always indicate an uncontrolled wildfire.`,
      timestamp,
      temporal: buildTemporal({ observedAt: timestamp, confirmedAt: retrievedAt, precision: 'minute', basis: 'sensor-observation' }),
      location: { latitude, longitude },
      severity,
      entities: [{ id: `satellite-${satellite.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, type: 'SATELLITE', name: satellite }],
      attributes: { satellite, instrument, brightness: Number.isFinite(brightness) ? brightness : undefined, fireRadiativePowerMw: Number.isFinite(frp) ? frp : undefined, confidence: cell(row, 'confidence'), confidenceLabel: detectionConfidence, dayNight: cell(row, 'daynight'), scan: cell(row, 'scan'), track: cell(row, 'track') },
      provenance: [{ label: 'OPEN_DATA', description: 'Near-real-time satellite thermal detection from NASA FIRMS. Detection is observational and may require verification.', sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/' }],
      expiresAt: retrievedAt + 7 * 86400000,
    })]
  })
}

export const firmsProvider: SignalProvider = {
  id: 'firms',
  name: 'NASA FIRMS',
  description: 'Near-real-time VIIRS active-fire and thermal-anomaly detections.',
  cadenceMs: 15 * 60000,
  dataClass: 'open-data',
  async isAvailable() { return navigator.onLine },
  async fetchSignals(context: SignalQueryContext) {
    const credential = await db.settings.get('firmsMapKey')
    const key = typeof credential?.value === 'string' ? credential.value.trim() : ''
    if (!key) throw new ProviderError('Optional FIRMS key not configured', 'firms', false, 401)
    const days = Math.max(1, Math.min(5, Math.ceil((context.until - context.since) / 86400000)))
    const response = await fetchWithTimeout(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/VIIRS_NOAA20_NRT/world/${days}`, { signal: context.signal, headers: { Accept: 'text/csv' } }, 12000)
    if (!response.ok) throw providerHttpError(response, 'firms')
    return normalizeFirmsCsv(await response.text()).filter((signal) => signal.timestamp >= context.since)
  },
}
