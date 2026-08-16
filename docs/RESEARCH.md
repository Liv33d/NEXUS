# Open-source research

| Repository | Concept studied | Technique used | Code reused | License consideration |
|---|---|---|---|---|
| [vasturiano/react-globe.gl](https://github.com/vasturiano/react-globe.gl) | Mobile-capable Three.js globe layers | Declarative bounded point/ring layers and camera flight | No project code copied; public API used | MIT |
| [vasturiano/globe.gl earthquake example](https://github.com/vasturiano/react-globe.gl/tree/master/example/earthquakes) | USGS events on a globe | Normalize official GeoJSON before creating points | No source copied | MIT |
| [maplibre/maplibre-gl-js](https://github.com/maplibre/maplibre-gl-js) | Detailed 2D investigation maps | v6 is ESM-only; keep the detailed map lazy and use circle layers/clustering rather than thousands of DOM symbols | None | BSD-3-Clause |
| [visgl/deck.gl](https://github.com/visgl/deck.gl) | Large-scale geospatial layers | Future H3/MapLibre integration boundary | None | MIT |
| [uber/h3-js](https://github.com/uber/h3-js) | Hierarchical spatial indexing | Type-aware cell assignment and neighborhood correlation | Public API used | Apache-2.0 |
| [kevtoe/worldview](https://github.com/kevtoe/worldview) | Multi-source live globe | Studied layer breadth; NEXUS retains stricter provenance and restrained presentation | None | MIT at time reviewed; verify before reuse |
| [Panos1221/WorldPulse](https://github.com/Panos1221/WorldPulse) | Disaster/source aggregation | Compared provider isolation and user-facing source labeling | None | MIT at time reviewed; verify before reuse |
| [gamaware/earth-events-dashboard](https://github.com/gamaware/earth-events-dashboard) | NASA EONET event and storm-track display | Confirmed EONET v3 GeoJSON/CORS integration patterns; NEXUS independently normalizes into Signal | None | MIT |
| [opengeos/vite-maplibre-react](https://github.com/opengeos/vite-maplibre-react) | React 19, Vite, MapLibre, and GitHub Pages | Studied lazy map setup and static deployment structure | None | MIT |

Official USGS guidance recommends real-time GeoJSON feeds for automated display applications, so the first live adapter uses those feeds rather than catalog searches.

Official-source research also established these constraints:

- NWS describes `api.weather.gov` as cache-friendly JSON-LD/GeoJSON access to alerts and observations.
- NASA EONET v3 is the current API; v2.1 is deprecated. EONET supports event status, days, categories, bounds, GeoJSON, and point/polygon geometries.
- NOAA SWPC publishes its official JSON product directory through `services.swpc.noaa.gov`.
- NASA FIRMS requires a free MAP key and documents a 5,000-transaction per ten-minute default limit, so the provider is optional and conservatively polled.
- Open‑Meteo provides no-key non-commercial access with documented request limits; NEXUS uses it only on demand for Observer context.
- AviationWeather documents a 100-request/minute limit and explicitly disallows browser CORS, so it is not wired directly into the static PWA.
