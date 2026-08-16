import { validateSignal } from '../lib/signal'
import type { Signal } from '../types/signal'

export function createDemoSignals(now = Date.now()): Signal[] {
  const base = [
    { id: 'demo-quake-1', type: 'earthquake', title: 'M 6.1 — 84 km east of Hualien, Taiwan', summary: 'Strong offshore earthquake detected by the demonstration feed.', timestamp: now - 38 * 60000, lat: 24.08, lng: 122.48, magnitude: 6.1, severity: 76, provider: 'demo-usgs', place: 'Hualien, Taiwan' },
    { id: 'demo-fire-1', type: 'fire', title: 'Thermal anomaly cluster — Southern California', summary: 'Three high-confidence thermal detections observed during two satellite passes.', timestamp: now - 74 * 60000, lat: 34.18, lng: -117.32, severity: 64, provider: 'demo-firms', place: 'Southern California' },
    { id: 'demo-weather-1', type: 'weather', title: 'Tornado warning — Central Oklahoma', summary: 'A demonstration warning polygon is active for a severe rotating storm.', timestamp: now - 18 * 60000, lat: 35.41, lng: -97.52, severity: 82, provider: 'demo-nws', place: 'Central Oklahoma' },
    { id: 'demo-aircraft-1', type: 'aircraft', title: 'Elevated aviation density — Eastern Mediterranean', summary: 'Regional aircraft density is 2.9× the demonstration baseline.', timestamp: now - 43 * 60000, lat: 35.2, lng: 31.1, severity: 58, provider: 'demo-opensky', place: 'Eastern Mediterranean' },
    { id: 'demo-media-1', type: 'media', title: 'Regional media activity increase — Eastern Mediterranean', summary: 'Article volume is 4.1× the demonstration baseline. This reflects coverage, not verified ground truth.', timestamp: now - 31 * 60000, lat: 35.9, lng: 30.3, severity: 51, provider: 'demo-gdelt', place: 'Eastern Mediterranean' },
    { id: 'demo-satellite-1', type: 'satellite', title: 'Earth-observation pass — Eastern Mediterranean', summary: 'A demonstration satellite pass intersects the selected observation region.', timestamp: now - 27 * 60000, lat: 36.4, lng: 30.8, severity: 24, provider: 'demo-satnogs', place: 'Eastern Mediterranean' },
    { id: 'demo-space-1', type: 'space-weather', title: 'G2 geomagnetic storm watch', summary: 'Demonstration global space-weather activity with possible auroral effects.', timestamp: now - 2.4 * 3600000, lat: 66.5, lng: -20, severity: 49, provider: 'demo-swpc', place: 'High Northern Latitudes' },
  ] as const

  return base.map((item) => validateSignal({
    id: item.id,
    source: { provider: item.provider, dataset: 'NEXUS deterministic demonstration', retrievedAt: now, freshness: 'demo' },
    type: item.type,
    title: item.title,
    summary: item.summary,
    timestamp: item.timestamp,
    location: { latitude: item.lat, longitude: item.lng },
    magnitude: 'magnitude' in item ? item.magnitude : undefined,
    severity: item.severity,
    confidence: 0.92,
    entities: [{ id: `demo-location-${item.place.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, type: 'REGION', name: item.place }],
    attributes: { demo: true },
    provenance: [{ label: 'DEMO_DATA', description: 'Deterministic representative data for offline exploration and testing.' }],
    expiresAt: now + 7 * 86400000,
  }))
}
