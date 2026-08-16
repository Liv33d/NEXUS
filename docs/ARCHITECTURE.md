# Architecture

NEXUS is a static, local-first Progressive Web App. The core application requires no backend.

## Boundaries

1. Provider adapters fetch and parse untrusted remote payloads.
2. Zod validation rejects malformed coordinates, unsafe URLs, oversized collections, and invalid semantics.
3. Valid records become normalized `Signal` objects with H3 cells and explicit provenance.
4. IndexedDB persists recent Signals, provider state, Discoveries, settings, and bounded response caches.
5. Deterministic engines derive relationships and Discoveries. They do not call generative AI.
6. Globe, MapLibre, list, timeline, and accessibility views consume only normalized data. Provider-native geometry never bypasses the sanitizer.

## Visualization layers

- The globe uses bundled NASA Earth imagery so its foundational appearance remains available offline.
- MapLibre is lazy-loaded only when 2D investigation mode is requested. It uses a real Web Mercator basemap, native GeoJSON layers, clustering, heatmaps, and validated alert polygons.
- Environmental raster overlays are independent of the Signal pipeline because they are visual context, not discrete claims. Each carries visible attribution and an honest freshness label. NOAA replay changes only the requested observation time and never synthesizes frames.
- Browsers without WebGL 2 receive a coordinate-precise, keyboard-accessible Signal list instead of a geographically misleading illustration.

Provider failure is isolated. The application continues with cached data and its deterministic Demo Mode.

## Performance

The globe and map renderers are separate lazy chunks. Visible globe points are bounded, MapLibre clustering is GPU-native, filtering occurs before rendering, high-frequency sources receive shorter retention, WebGL pauses while hidden, device pixel ratio is capped, and polling only runs while the document is visible. Radar animation is user-initiated, stops loading while the page is hidden, and is disabled automatically under reduced-motion preferences. Map, radar, and satellite caches use strict entry and age limits. Future high-volume adapters should normalize and H3-index in Web Workers.

Geometry is validated at the normalized Signal boundary. Only bounded Point, Polygon, and MultiPolygon geometry with finite WGS84 coordinates is retained; area rings must close and the total coordinate count is capped before MapLibre receives the payload.

## Expansion

New providers implement `SignalProvider`; new visual layers consume `Signal` subsets. Neither requires changes to the database contract or discovery engine.
