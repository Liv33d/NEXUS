# Architecture

NEXUS is a static, local-first Progressive Web App. The core application requires no backend.

## Boundaries

1. Provider adapters fetch and parse untrusted remote payloads.
2. Zod validation rejects malformed coordinates, unsafe URLs, oversized collections, and invalid semantics.
3. Valid records become normalized `Signal` objects with H3 cells and explicit provenance.
4. IndexedDB persists recent Signals, provider state, Discoveries, settings, Watches, and bounded daily H3 Memory aggregates.
5. Deterministic engines derive relationships and Discoveries. They do not call generative AI.
6. Globe, onboard atlas, list, timeline, and accessibility views consume only normalized data. Provider-native geometry never bypasses the sanitizer.

## Visualization layers

- The globe uses bundled NASA Earth imagery so its foundational appearance remains available offline.
- Country boundaries and a compact public-domain Natural Earth city catalog are bundled. Label density follows camera altitude and proximity, so cities emerge during regional zoom without sending a request or covering the planet in text.
- Globe illumination is calculated per geographic surface coordinate from the current subsolar latitude/longitude. Camera rotation never influences day/night classification. Users may override live illumination with explicit full-day or full-night presentation modes.
- The 2D investigation view uses a bundled Natural Earth SVG atlas with touch pan/pinch, zoom-aware signal thinning, and sanitized alert polygons, so geography remains available offline and on constrained iPhones.
- Environmental raster overlays are independent of the Signal pipeline because they are visual context, not discrete claims. Each carries visible attribution and an honest freshness label. The globe uses a current NOAA radar export; connected Detail Map mode prefers RainViewer's latest globally composited frame and automatically falls back to NOAA. Neither path invents historical frames.
- Current merged GOES-East/West GeoColor is requested directly from NOAA/NESDIS as a WGS84 export and placed on a separate, low-opacity additive globe sphere so dark source pixels cannot extinguish the illuminated Earth. It is an observation layer, not a global forecast.
- Browsers without WebGL 2 receive a coordinate-precise, keyboard-accessible Signal list instead of a geographically misleading illustration.

### Geographic lifecycle contract

- GlobeGL and MapLibre are long-lived renderers. Provider-status changes never recreate them.
- Camera motion stays inside the renderer while a gesture or inertial animation is active. React receives one guarded `GeographicView` when movement settles.
- Globe and map share that validated camera target and convert between globe altitude and map zoom, preserving context across mode switches.
- Each renderer owns exactly one container `ResizeObserver`, coalesces resizing into animation frames, and handles WebGL context loss/restoration explicitly.
- Signal, polygon and track changes update bounded data layers incrementally. They do not rebuild the renderer.

- Active NHC geometry and selected CelesTrak OMM elements are normalized during a scheduled GitHub Pages build. These small same-origin snapshots solve upstream CORS constraints and enforce provider-friendly polling without adding a proprietary runtime backend.
- Observer's orbital propagation runs in a dedicated worker. GBIF LIFE context is bounded, permissive-license filtered, and fetched only for a selected place.
- Migration Watch is opt-in and lazy. It compares two bounded 14-day GBIF Aves samples, rejects restrictive/unknown licenses, aggregates observations to H3 resolution 3, and renders centroid shifts as explicitly derived corridors. Raw wildlife coordinates are not exposed on the globe.
- Solar System is a lazy-loaded renderer isolated from the long-lived Earth renderer. Astronomy Engine calculates heliocentric J2000 positions locally; distances and body radii are visually scaled and disclosed in-product.

Provider failure is isolated. The application continues with cached data and its deterministic Demo Mode.

## Watch pipeline

Watch evaluation is provider-independent: `Provider → Signal → WatchRule → WatchTrigger → WatchDeliveryAdapter`. Current place/radius rules evaluate severity and optional Signal categories, persist triggers in IndexedDB, deduplicate the same Signal for 24 hours, and apply a 15-minute per-rule cooldown. The current delivery adapter is in-app; a future native adapter can add push without modifying providers.

## Performance

The globe and map renderers are separate lazy chunks. Visible globe points are bounded, MapLibre clusters source data, filtering occurs before rendering, high-frequency sources receive shorter retention, WebGL pauses while hidden, device pixel ratio is capped, and polling only runs while the document is visible. Radar and satellite layers are opt-in and pause under battery saver. Raster caches use strict entry and age limits. Quality, automatic, and battery modes provide explicit user control. Future high-volume adapters should normalize and H3-index in Web Workers.

IndexedDB is a progressive enhancement rather than a launch dependency. If Safari denies storage, provider retrieval and deterministic analysis continue in memory; cached history and persistence alone become unavailable. Saved-case signal references are protected from retention pruning.

Ambient Earth is explicitly user-initiated. It requests the browser Screen Wake Lock where supported, fades chrome after inactivity, restores controls on touch, and releases the lock when the user leaves Earth or the mode is disabled.

Geometry is validated at the normalized Signal boundary. Only bounded Point, Polygon, and MultiPolygon geometry with finite WGS84 coordinates is retained; area rings must close and the total coordinate count is capped before either renderer receives the payload.

## Expansion

New providers implement `SignalProvider`; new visual layers consume `Signal` subsets. Neither requires changes to the database contract or discovery engine.
