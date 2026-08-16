# Architecture

NEXUS is a static, local-first Progressive Web App. The core application requires no backend.

## Boundaries

1. Provider adapters fetch and parse untrusted remote payloads.
2. Zod validation rejects malformed coordinates, unsafe URLs, oversized collections, and invalid semantics.
3. Valid records become normalized `Signal` objects with H3 cells and explicit provenance.
4. IndexedDB persists recent Signals, provider state, Discoveries, settings, and bounded response caches.
5. Deterministic engines derive relationships and Discoveries. They do not call generative AI.
6. Globe, onboard atlas, list, timeline, and accessibility views consume only normalized data. Provider-native geometry never bypasses the sanitizer.

## Visualization layers

- The globe uses bundled NASA Earth imagery so its foundational appearance remains available offline.
- The 2D investigation view uses a bundled Natural Earth SVG atlas with touch pan/pinch, zoom-aware signal thinning, and sanitized alert polygons, so geography remains available offline and on constrained iPhones.
- Environmental raster overlays are independent of the Signal pipeline because they are visual context, not discrete claims. Each carries visible attribution and an honest freshness label. Current NOAA radar is a bounded EPSG:4326 export; no historical frames are implied by the non-time-enabled service.
- Browsers without WebGL 2 receive a coordinate-precise, keyboard-accessible Signal list instead of a geographically misleading illustration.

Provider failure is isolated. The application continues with cached data and its deterministic Demo Mode.

## Performance

The globe and atlas renderers are separate lazy chunks. Visible globe points are bounded, the atlas semantically thins point density by zoom, filtering occurs before rendering, high-frequency sources receive shorter retention, WebGL pauses while hidden, device pixel ratio is capped, and polling only runs while the document is visible. Radar is opt-in and pauses under battery saver. Raster caches use strict entry and age limits. Future high-volume adapters should normalize and H3-index in Web Workers.

Geometry is validated at the normalized Signal boundary. Only bounded Point, Polygon, and MultiPolygon geometry with finite WGS84 coordinates is retained; area rings must close and the total coordinate count is capped before either renderer receives the payload.

## Expansion

New providers implement `SignalProvider`; new visual layers consume `Signal` subsets. Neither requires changes to the database contract or discovery engine.
