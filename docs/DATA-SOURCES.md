# Data sources

## USGS Earthquakes

- Endpoint: official real-time GeoJSON summary feeds.
- Authentication: none.
- Freshness: live when the request succeeds; Workbox can supply a clearly labeled cached response when offline.
- Captured: magnitude, place, depth, event and update time, tsunami flag, alert, significance, review state, felt reports, coordinates, and canonical source URL.
- Safety: maximum feature count, schema validation, bounded request time, safe URL protocol, and coordinate validation.

## Demo Network

Deterministic representative data guarantees an explorable product and stable tests without external availability. It is visibly marked `DEMO DATA` in every record and provenance surface.

## Adapter backlog

NWS alerts and SWPC should follow because they are official, keyless sources. Open-Meteo should provide contextual weather rather than ordinary map noise. FIRMS should be optional when credentials are required. GDELT must remain labeled as media activity. OpenSky must use viewport loading, strict rate awareness, and short retention. SatNOGS should add orbital context without implying authoritative satellite intent.
