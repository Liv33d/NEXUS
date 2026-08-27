import { describe, expect, it } from 'vitest'
import { normalizeEonet } from './eonet'
import { normalizeFirmsCsv } from './firms'
import { normalizeGdacs } from './gdacs'
import { normalizeNws } from './nws'
import { normalizeSwpc } from './swpc'
import { normalizeVolcanoes } from './volcano'
import { normalizeOpenFema } from './openfema'
import { normalizeUsgs } from './usgs'
import { providerHttpError } from './types'

describe('official provider normalization', () => {
  it('honors both numeric and HTTP-date Retry-After headers', () => {
    const retryDate = 'Sun, 16 Aug 2026 19:00:00 GMT'
    expect(providerHttpError(new Response(null, { status: 429, headers: { 'Retry-After': retryDate } }), 'test').retryAt).toBe(Date.parse(retryDate))
    expect((providerHttpError(new Response(null, { status: 429, headers: { 'Retry-After': '30' } }), 'test').retryAt ?? 0) - Date.now()).toBeGreaterThan(29_000)
  })

  it('normalizes GDACS impact alerts without presenting them as local warnings', () => {
    const [signal] = normalizeGdacs({ type:'FeatureCollection', features:[{ type:'Feature', geometry:{ type:'Point', coordinates:[-82.46,27.95] }, properties:{ eventid:42, episodeid:3, eventtype:'TC', name:'Example Cyclone', alertlevel:'Orange', alertscore:2.1, fromdate:'2026-08-15T12:00:00Z', todate:'2026-08-18T12:00:00Z', country:'United States', url:{ details:'https://www.gdacs.org/report.aspx?eventid=42' } } }] }, Date.parse('2026-08-16T00:00:00Z'))
    expect(signal?.source.provider).toBe('gdacs')
    expect(signal?.type).toBe('weather')
    expect(signal?.severity).toBe(70.1)
    expect(signal?.summary).toContain('not a local emergency warning')
    expect(signal?.geometry?.type).toBe('Point')
    expect(signal?.id).toBe('gdacs-tc-42')
    expect(signal?.source.revisionKey).toBe('3')
  })

  it('treats GDACS episodes as revisions of one event identity', () => {
    const event = (episodeid: number) => ({ type:'FeatureCollection', features:[{ type:'Feature', geometry:{ type:'Point', coordinates:[-82.46,27.95] }, properties:{ eventid:42, episodeid, eventtype:'TC', name:'Example Cyclone', alertlevel:'Orange', fromdate:'2026-08-15T12:00:00Z', datemodified:`2026-08-${15 + episodeid}T12:00:00Z`, country:'United States' } }] })
    const [first] = normalizeGdacs(event(1), Date.parse('2026-08-16T00:00:00Z'))
    const [second] = normalizeGdacs(event(2), Date.parse('2026-08-17T00:00:00Z'))
    expect(first?.id).toBe(second?.id)
    expect(first?.source.revisionKey).not.toBe(second?.source.revisionKey)
    expect(second?.temporal?.updatedAt).toBe(Date.parse('2026-08-17T12:00:00Z'))
  })

  it('normalizes an NWS alert polygon with source semantics', () => {
    const [signal] = normalizeNws({ features: [{ id: 'https://api.weather.gov/alerts/urn:oid:test', geometry: { type: 'Polygon', coordinates: [[[-98, 35], [-97, 35], [-97, 36], [-98, 35]]] }, properties: { id: 'urn:oid:test', areaDesc: 'Central Oklahoma', sent: '2026-08-15T20:00:00Z', effective: '2026-08-15T20:00:00Z', onset: '2026-08-15T20:05:00Z', expires: '2026-08-15T21:00:00Z', ends: '2026-08-15T21:00:00Z', status: 'Actual', messageType: 'Alert', category: 'Met', severity: 'Extreme', certainty: 'Observed', urgency: 'Immediate', event: 'Tornado Warning', senderName: 'NWS Norman OK', headline: 'Observed tornado warning' } }] }, Date.parse('2026-08-15T20:01:00Z'))
    expect(signal?.type).toBe('weather')
    expect(signal?.severity).toBe(99)
    expect(signal?.location?.h3Index).toBeTruthy()
    expect(signal?.provenance[0]?.label).toBe('OFFICIAL_SOURCE')
    expect(signal?.source.url).toBe('https://api.weather.gov/alerts/urn:oid:test')
  })

  it('retains an active NWS alert without geometry for non-map surfaces', () => {
    const [signal] = normalizeNws({ features: [{ id: 'https://api.weather.gov/alerts/no-geometry', geometry: null, properties: { id: 'urn:oid:no-geometry', areaDesc: 'Affected forecast zones', sent: '2026-08-15T20:00:00Z', effective: '2026-08-15T20:00:00Z', expires: '2026-08-15T21:00:00Z', event: 'Severe Thunderstorm Warning', severity: 'Severe', certainty: 'Likely', urgency: 'Immediate' } }] }, Date.parse('2026-08-15T20:01:00Z'))
    expect(signal?.location).toBeUndefined()
    expect(signal?.attributes.geometryAvailable).toBe(false)
    expect(signal?.temporal?.basis).toBe('product-validity')
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
    expect(signals.every((signal) => signal.temporal?.basis === 'sensor-observation')).toBe(true)
    expect(signals.every((signal) => signal.source.upstreamKey?.endsWith('-current'))).toBe(true)
  })

  it('keeps USGS occurrence time distinct from retrieval and product revision time', () => {
    const observedAt = Date.parse('2026-08-20T10:00:00Z')
    const updatedAt = Date.parse('2026-08-20T10:05:00Z')
    const retrievedAt = Date.parse('2026-08-27T12:00:00Z')
    const [signal] = normalizeUsgs({ features: [{ id: 'abc', properties: { mag: 4.2, place: 'Test region', time: observedAt, updated: updatedAt, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/abc', detail: 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=abc', felt: null, cdi: null, mmi: null, alert: null, status: 'reviewed', tsunami: 0, sig: 300, type: 'earthquake', title: 'M 4.2 - Test region' }, geometry: { type: 'Point', coordinates: [-120, 35, 8] } }] }, retrievedAt)
    expect(signal?.temporal).toMatchObject({ observedAt, updatedAt, confirmedAt: retrievedAt, effectiveAt: observedAt, basis: 'event-occurrence' })
    expect(signal?.source.revisionKey).toBe(String(updatedAt))
  })

  it('models FEMA declaration issue, incident validity, and retrieval independently', () => {
    const retrievedAt = Date.parse('2026-08-27T12:00:00Z')
    const [signal] = normalizeOpenFema({ DisasterDeclarationsSummaries: [{ disasterNumber: 1234, state: 'CA', declarationType: 'DR', declarationDate: '2026-08-20T00:00:00Z', incidentType: 'Fire', declarationTitle: 'Test Fire', incidentBeginDate: '2026-08-18T00:00:00Z', incidentEndDate: '2026-08-25T00:00:00Z', designatedArea: 'Test County', lastRefresh: '2026-08-26T00:00:00Z' }] }, retrievedAt)
    expect(signal?.temporal).toMatchObject({ issuedAt: Date.parse('2026-08-20T00:00:00Z'), validFrom: Date.parse('2026-08-18T00:00:00Z'), validUntil: Date.parse('2026-08-25T00:00:00Z'), updatedAt: Date.parse('2026-08-26T00:00:00Z'), confirmedAt: retrievedAt, basis: 'publisher-issue' })
    expect(signal?.source.sourceRole).toBe('administrative')
  })

  it('parses FIRMS CSV and preserves thermal provenance', () => {
    const csv = 'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n34.123,-117.456,341.2,0.4,0.4,2026-08-15,1942,N20,VIIRS,h,2.0NRT,298.1,44.6,D'
    const [signal] = normalizeFirmsCsv(csv, Date.parse('2026-08-15T20:00:00Z'))
    expect(signal?.type).toBe('fire')
    expect(signal?.attributes.fireRadiativePowerMw).toBe(44.6)
    expect(signal?.confidence).toBeUndefined()
    expect(signal?.attributes.confidenceLabel).toBe('high')
    expect(signal?.provenance[0]?.description).toContain('thermal detection')
    expect(signal?.temporal?.observedAt).toBe(Date.parse('2026-08-15T19:42:00Z'))
  })

  it('keeps FIRMS identity stable when CSV row ordering changes', () => {
    const header = 'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,frp,daynight'
    const rows = [
      '34.123,-117.456,341.2,0.4,0.4,2026-08-15,1942,N20,VIIRS,h,44.6,D',
      '34.124,-117.457,339.0,0.4,0.4,2026-08-15,1943,N20,VIIRS,n,30.1,D',
    ]
    const ids = (ordered: string[]) => normalizeFirmsCsv([header, ...ordered].join('\n')).map((signal) => signal.id).sort()
    expect(ids(rows)).toEqual(ids([...rows].reverse()))
  })

  it('keeps only elevated official USGS volcano states', () => {
    const feature = (name: string, alertLevel: string, colorCode: string) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [-155.29, 19.42] }, properties: { volcanoName: name, vnum: name, volcanoCd: name, volcanoUrl: 'https://www.usgs.gov/volcanoes/test', volcanoImage: '', obs: 'hvo', region: 'Hawaii', noticeSynopsis: `${name} status`, noticeUrl: 'https://volcanoes.usgs.gov/hans2/view/notice/test', alertLevel, colorCode, alertDate: '2026-08-16 12:00:00', colorDate: '2026-08-16 12:00:00', nvewsThreat: 'Very High Threat' } })
    const signals = normalizeVolcanoes({ type: 'FeatureCollection', features: [feature('Elevated', 'WATCH', 'ORANGE'), feature('Routine', 'NORMAL', 'GREEN')] }, Date.parse('2026-08-16T12:05:00Z'))
    expect(signals).toHaveLength(1)
    expect(signals[0]?.title).toContain('Volcano Watch')
    expect(signals[0]?.severity).toBe(78)
    expect(signals[0]?.provenance[0]?.label).toBe('OFFICIAL_SOURCE')
    expect(signals[0]?.timestamp).toBe(Date.parse('2026-08-16T12:00:00Z'))
    expect(signals[0]?.temporal?.issuedAt).toBe(Date.parse('2026-08-16T12:00:00Z'))
    expect(signals[0]?.temporal?.confirmedAt).toBe(Date.parse('2026-08-16T12:05:00Z'))
    expect(signals[0]?.temporal?.observedAt).toBeUndefined()
  })
})
