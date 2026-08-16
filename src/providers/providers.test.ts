import { describe, expect, it } from 'vitest'
import { normalizeEonet } from './eonet'
import { normalizeFirmsCsv } from './firms'
import { normalizeGdacs } from './gdacs'
import { normalizeNws } from './nws'
import { normalizeSwpc } from './swpc'

describe('official provider normalization', () => {
  it('normalizes GDACS impact alerts without presenting them as local warnings', () => {
    const [signal] = normalizeGdacs({ type:'FeatureCollection', features:[{ type:'Feature', geometry:{ type:'Point', coordinates:[-82.46,27.95] }, properties:{ eventid:42, episodeid:3, eventtype:'TC', name:'Example Cyclone', alertlevel:'Orange', alertscore:2.1, fromdate:'2026-08-15T12:00:00Z', todate:'2026-08-18T12:00:00Z', country:'United States', url:{ details:'https://www.gdacs.org/report.aspx?eventid=42' } } }] }, Date.parse('2026-08-16T00:00:00Z'))
    expect(signal?.source.provider).toBe('gdacs')
    expect(signal?.type).toBe('weather')
    expect(signal?.severity).toBe(70.1)
    expect(signal?.summary).toContain('not a local emergency warning')
    expect(signal?.geometry?.type).toBe('Point')
  })

  it('normalizes an NWS alert polygon with source semantics', () => {
    const [signal] = normalizeNws({ features: [{ id: 'https://api.weather.gov/alerts/urn:oid:test', geometry: { type: 'Polygon', coordinates: [[[-98, 35], [-97, 35], [-97, 36], [-98, 35]]] }, properties: { id: 'urn:oid:test', areaDesc: 'Central Oklahoma', sent: '2026-08-15T20:00:00Z', effective: '2026-08-15T20:00:00Z', onset: '2026-08-15T20:05:00Z', expires: '2026-08-15T21:00:00Z', ends: '2026-08-15T21:00:00Z', status: 'Actual', messageType: 'Alert', category: 'Met', severity: 'Extreme', certainty: 'Observed', urgency: 'Immediate', event: 'Tornado Warning', senderName: 'NWS Norman OK', headline: 'Observed tornado warning' } }] }, Date.parse('2026-08-15T20:01:00Z'))
    expect(signal?.type).toBe('weather')
    expect(signal?.severity).toBe(99)
    expect(signal?.location?.h3Index).toBeTruthy()
    expect(signal?.provenance[0]?.label).toBe('OFFICIAL_SOURCE')
    expect(signal?.source.url).toBe('https://api.weather.gov/alerts/urn:oid:test')
  })

  it('keeps only the latest EONET geometry for an event', () => {
    const feature = (date: string, coordinates: [number, number]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties: { id: 'EONET_1', title: 'Wildfire Test', description: null, link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1', closed: null, date, magnitudeValue: null, magnitudeUnit: null, magnitudeDescription: null, categories: [{ id: 'wildfires', title: 'Wildfires' }], sources: [{ id: 'test', url: 'https://example.com/event' }] } })
    const signals = normalizeEonet({ features: [feature('2026-08-14T00:00:00Z', [-120, 34]), feature('2026-08-15T00:00:00Z', [-119, 35])] })
    expect(signals).toHaveLength(1)
    expect(signals[0]?.location?.longitude).toBe(-119)
    expect(signals[0]?.type).toBe('fire')
    expect(signals[0]?.source.freshness).toBe('delayed')
  })

  it('creates global SWPC signals only for active NOAA scales', () => {
    const signals = normalizeSwpc({
      '0': { DateStamp: '2026-08-15', TimeStamp: '20:00:00', R: { Scale: '0', Text: 'none' }, S: { Scale: '1', Text: 'minor radiation storm' }, G: { Scale: '3', Text: 'strong geomagnetic storm' } },
      '1': { DateStamp: '2026-08-16', TimeStamp: '00:00:00', R: { Scale: null, Text: null }, S: { Scale: null, Text: null }, G: { Scale: '0', Text: 'none' } },
    })
    expect(signals.map((signal) => signal.title)).toEqual(['Solar radiation storm — S1', 'Geomagnetic storm — G3'])
    expect(signals.every((signal) => !signal.location)).toBe(true)
  })

  it('parses FIRMS CSV and preserves thermal provenance', () => {
    const csv = 'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n34.123,-117.456,341.2,0.4,0.4,2026-08-15,1942,N20,VIIRS,h,2.0NRT,298.1,44.6,D'
    const [signal] = normalizeFirmsCsv(csv, Date.parse('2026-08-15T20:00:00Z'))
    expect(signal?.type).toBe('fire')
    expect(signal?.attributes.fireRadiativePowerMw).toBe(44.6)
    expect(signal?.confidence).toBe(.94)
    expect(signal?.provenance[0]?.description).toContain('thermal detection')
  })
})
