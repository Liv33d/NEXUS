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

## GDACS

- Endpoint: official GDACS Search API GeoJSON event list.
- Authentication: none.
- Coverage: global tropical cyclones, floods, volcanoes, droughts, and wildfires. Earthquakes are deliberately excluded because USGS is the stronger first-party seismic source already used by NEXUS.
- Semantics: GDACS combines hazard severity and exposure into automated impact alerts. NEXUS labels the feed delayed/open data and explicitly states that it is not a local emergency warning.
- Reliability: failure is isolated like every provider; cached records remain available and GDACS downtime cannot block other sources.

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

- Use: on-demand Observer Mode weather, air-quality, geocoding, and nearby marine context only—not ordinary-weather map noise.
- Authentication: none for the documented non-commercial tier.
- Captured: current temperature, apparent temperature, precipitation, cloud, wind, pressure, weather code, sunrise/sunset, U.S. AQI, and PM2.5.
- Marine context: wave height/direction/period, sea-surface temperature, and ocean-current velocity/direction from the nearest sea grid when that grid is within 150 km. These are labeled modeled and explicitly not suitable for navigation.
- Commercial note: the public no-key endpoint is documented for non-commercial use. A commercial NEXUS release must self-host the AGPL server where compatible or use Open-Meteo's commercial customer endpoint.

## NOAA National Hurricane Center

- Endpoint: official active KML feed and the linked advisory track/cone KMZ products.
- Authentication: none; North Atlantic, eastern Pacific, and central Pacific coverage.
- Delivery: fetched once during the scheduled GitHub Pages build because NHC does not guarantee browser CORS. The deployed same-origin GeoJSON snapshot contains only active forecast tracks and uncertainty cones.
- Semantics: forecast geometry is authoritative NHC output, but the cone is uncertainty—not a storm-size polygon or guaranteed path. NHC products must not be the sole input to life-safety decisions.

## GBIF LIFE context

- Endpoint: bounded `occurrence/search` query around an Observer point, capped at 120 recent records and cached in-session for six hours.
- Authentication: none.
- License policy: only CC0 and CC BY records with acceptable coordinate uncertainty enter the visible summary. CC BY-NC, unknown-license, and high-uncertainty records are excluded from the commercial-ready surface.
- Semantics: the UI reports sampled occurrence records, never population or abundance. Each taxon links to an individual occurrence and GBIF citation guidance.

## GBIF Migration Watch

- Endpoint: keyless GBIF Occurrence Search for Aves (`taxonKey=212`).
- Refresh/cache: opt-in only; two bounded 300-record windows, cached locally for six hours.
- License gate: only CC0 and CC BY records are processed. CC BY-NC and unknown licenses are excluded so the architecture remains commercially viable.
- Privacy: observations are aggregated to coarse H3 resolution 3 cells. Exact wildlife coordinates are not rendered.
- Semantics: animated corridors are changes in per-species observation centroids across two 14-day samples. They are `DERIVED`, not individual tracks, abundance estimates, or migration forecasts. Sampling effort can dominate the pattern.

## Astronomy Engine

- Runtime: local browser calculation; no API key and no network request.
- Method: VSOP87/NOVAS-based heliocentric J2000 ephemerides for Mercury through Neptune, Pluto, Earth, and the Moon.
- License: MIT.
- Semantics: orbital angles and positions are calculated for the displayed UTC instant. Logarithmic distance and enlarged body radii are used strictly for mobile legibility and are disclosed in the interface.

## CelesTrak orbital elements

- Endpoint: `GROUP=STATIONS&FORMAT=JSON`, using OMM-compatible JSON rather than legacy TLE-only parsing.
- Authentication: none.
- Rate governance: fetched by the scheduled static build no more than once per two-hour provider update, then served same-origin. The app never causes per-user CelesTrak requests.
- Computation: selected public space-station passes are propagated locally in a Web Worker with SGP4. Results are labeled as potential overhead/dark-sky passes; visibility still depends on illumination, weather, obstructions, and element age.

## Natural Earth populated places

- Dataset: 1:10m populated places plus 1:110m country boundaries, public domain.
- Use: a compact 3,116-place catalog (cities of 100,000+ plus national capitals) is bundled for offline, zoom-aware globe labels; MapLibre/OpenFreeMap remains the street-level detailed view.

## NOAA/NWS MRMS radar

- Endpoint: official NOAA `radar_base_reflectivity` ArcGIS MapServer bounded image export.
- Authentication: none.
- Coverage: CONUS and the other domains published by the service; empty pixels outside coverage are expected.
- Freshness: the upstream mosaic is normally updated about every five minutes. The current service is not time-enabled, and NEXUS does not imply historical playback.
- Storage: short-lived transparent exports are cached for resilience. Detail Map requests EPSG:3857 tiles so imagery stays geographically registered; the globe uses the bounded geographic export.

## RainViewer global radar

- Endpoint: public Weather Maps timeline and radar tile API.
- Authentication: none.
- Coverage: best-effort composite coverage from more than 1,200 radars across 150+ countries; gaps remain possible.
- Freshness: the latest published frame, normally refreshed every 5–10 minutes, is used only in connected Detail Map mode.
- Terms: personal, educational, and small-community use with mandatory attribution; no SLA. This is an enhancement rather than a core dependency, and NOAA MRMS remains the automatic fallback.

## OpenFreeMap basemap

- Endpoint: hosted Liberty vector style and OpenMapTiles/OSM tiles.
- Authentication: none; no registration or API key.
- Use: connected high-detail map only, with clustered Signal layers and projected environmental imagery.
- Resilience: a bundled Natural Earth atlas remains available as an explicit offline/failure mode.

## NASA EOSDIS GIBS imagery

- Endpoint: official EPSG:3857 WMTS corrected-reflectance true-color imagery.
- Authentication: none for the selected layer.
- Coverage: global where MODIS Terra observations are available.
- Freshness: NEXUS requests the previous completed UTC day to avoid showing partially populated global imagery and labels it delayed.
- Semantics: this is visual observation context, not a weather forecast and not a discrete Signal.

## NOAA/NESDIS merged GOES GeoColor

- Endpoint: official `MERGED_GeoColor` ArcGIS ImageServer bounded image export.
- Authentication: none.
- Coverage: merged GOES-East and GOES-West domains, approximately 76°S–76°N; it is not represented as complete global coverage.
- Freshness: latest operational imagery, normally refreshed every 10–15 minutes.
- Semantics: opt-in observed satellite context. The overlay carries visible NOAA attribution/freshness and remains separate from normalized Signals.

## Demo Network

Deterministic representative data guarantees an explorable product and stable tests without external availability. Demo Mode replaces live data rather than silently mixing with it, and every record is visibly marked `DEMO DATA`.

## Adapter backlog

GDELT must remain labeled as media activity. OpenSky must use viewport loading, strict rate awareness, and short retention. SatNOGS should add orbital context without implying authoritative satellite intent. AviationWeather is not used directly from the static browser client because its official service currently disallows CORS. RainViewer is an optional best-effort connected overlay rather than a core source because its free terms are narrower than NEXUS's long-term product ambitions. NASA GOES/Himawari GeoColor layers are verified as available through GIBS, but sub-daily timestamp discovery and frame caching must be completed before they are presented as near-real-time.
