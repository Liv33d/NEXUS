# Data sources

## USGS Earthquakes

- Endpoint: official real-time GeoJSON summary feeds.
- Authentication: none.
- Freshness: live when the request succeeds; Workbox can supply a clearly labeled cached response when offline.
- Captured: magnitude, place, depth, event and update time, tsunami flag, alert, significance, review state, felt reports, coordinates, and canonical source URL.
- Safety: maximum feature count, schema validation, bounded request time, safe URL protocol, and coordinate validation.

## National Weather Service

- Endpoint: `api.weather.gov/alerts/active` GeoJSON.
- Authentication: none.
- Coverage: U.S. alert areas; point centers are derived from validated polygons for globe rendering while full geometry remains on the Signal.
- Captured: event, headline, area, sent/effective/onset/end time, severity, certainty, urgency, status, sender, instructions, and original alert URL.
- Semantics: source severity and certainty are preserved separately; NEXUS converts them to bounded visual severity/confidence without claiming forecast certainty.

## NASA EONET v3

- Endpoint: official EONET v3 GeoJSON events API.
- Authentication: none.
- Coverage: global open natural events such as wildfires, severe storms, floods, volcanoes, and environmental events.
- Freshness: labeled delayed because EONET aggregates upstream sources rather than representing an instant sensor feed.
- Safety: bounded event count, latest geometry per event, category allow-list mapping, coordinate validation, and authoritative source links.

## NOAA Space Weather Prediction Center

- Endpoint: public NOAA Scale JSON product.
- Authentication: none.
- Coverage: global R (radio blackout), S (solar radiation storm), and G (geomagnetic storm) conditions.
- Representation: global Signals intentionally have no artificial point location. Only active scale levels create Signals; quiet conditions remain visible through provider health.

## NASA FIRMS

- Endpoint: Area CSV API using `VIIRS_NOAA20_NRT`.
- Authentication: a free NASA MAP key supplied by the user.
- Credential handling: stored only in local IndexedDB; never committed, logged, included in a URL outside the NASA request, or added to the service-worker cache.
- Captured: coordinates, acquisition time, satellite, instrument, confidence, brightness, fire radiative power, scan/track, and day/night flag.
- Semantics: every item is described as a thermal detection; NEXUS does not automatically claim that every hotspot is an uncontrolled wildfire.

## Open‑Meteo

- Use: on-demand Observer Mode context only, not ordinary-weather map noise.
- Authentication: none for the documented non-commercial tier.
- Captured: current temperature, apparent temperature, precipitation, cloud, wind, pressure, weather code, sunrise/sunset, U.S. AQI, and PM2.5.

## Demo Network

Deterministic representative data guarantees an explorable product and stable tests without external availability. Demo Mode replaces live data rather than silently mixing with it, and every record is visibly marked `DEMO DATA`.

## Adapter backlog

GDELT must remain labeled as media activity. OpenSky must use viewport loading, strict rate awareness, and short retention. SatNOGS should add orbital context without implying authoritative satellite intent. AviationWeather is not used directly from the static browser client because its official service currently disallows CORS.
