# Open-source research

| Repository | Concept studied | Technique used | Code reused | License consideration |
|---|---|---|---|---|
| [vasturiano/react-globe.gl](https://github.com/vasturiano/react-globe.gl) | Mobile-capable Three.js globe layers | Declarative bounded point/ring layers and camera flight | No project code copied; public API used | MIT |
| [vasturiano/globe.gl earthquake example](https://github.com/vasturiano/react-globe.gl/tree/master/example/earthquakes) | USGS events on a globe | Normalize official GeoJSON before creating points | No source copied | MIT |
| [maplibre/maplibre-gl-js](https://github.com/maplibre/maplibre-gl-js) | Detailed 2D investigation maps | Reserved as a lazy future layer rather than initial bundle cost | None | BSD-3-Clause |
| [visgl/deck.gl](https://github.com/visgl/deck.gl) | Large-scale geospatial layers | Future H3/MapLibre integration boundary | None | MIT |
| [uber/h3-js](https://github.com/uber/h3-js) | Hierarchical spatial indexing | Type-aware cell assignment and neighborhood correlation | Public API used | Apache-2.0 |
| [kevtoe/worldview](https://github.com/kevtoe/worldview) | Multi-source live globe | Studied layer breadth; NEXUS retains stricter provenance and restrained presentation | None | MIT at time reviewed; verify before reuse |
| [Panos1221/WorldPulse](https://github.com/Panos1221/WorldPulse) | Disaster/source aggregation | Compared provider isolation and user-facing source labeling | None | MIT at time reviewed; verify before reuse |

Official USGS guidance recommends real-time GeoJSON feeds for automated display applications, so the first live adapter uses those feeds rather than catalog searches.
