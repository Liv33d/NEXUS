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

- Earth is a compositing environment rather than a mutually exclusive mode switch. `NexusLayerDefinition` records category, render order, semantic zoom, cost, provenance, and renderer strategy. Presets add compatible layers; they never silently erase the user's enabled state.
- The globe and detailed map use renderer-specific representations of the same active systems. LIFE becomes coarse density, migration becomes derived corridors, and high-volume Signals remain clustered or bounded. Focus changes emphasis and opacity rather than disabling unrelated layers.
- “Show Everything” enables every supported conceptual system while the renderers preserve mobile budgets through caps, clustering, coarse H3 cells, and semantic detail.

- The globe uses bundled NASA Earth imagery so its foundational appearance remains available offline.
- Country boundaries and a compact public-domain Natural Earth city catalog are bundled. Label density follows camera altitude and proximity, so cities emerge during regional zoom without sending a request or covering the planet in text.
- Globe illumination is calculated per geographic surface coordinate from the current subsolar latitude/longitude. Camera rotation never influences day/night classification. Users may override live illumination with explicit full-day or full-night presentation modes.
- The 2D investigation view uses a bundled Natural Earth SVG atlas with touch pan/pinch, zoom-aware signal thinning, and sanitized alert polygons, so geography remains available offline and on constrained iPhones.
- Environmental raster overlays are independent of the Signal pipeline because they are visual context, not discrete claims. Each retains attribution and honest freshness details in the layer inspector. The globe and connected Detail Map use official NOAA products; neither path invents historical frames or global coverage.
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
- Solar System is a lazy-loaded renderer isolated from the long-lived Earth renderer. It is entered by continuing to zoom outward from the main globe and begins focused on Earth's calculated heliocentric position; zooming back into Earth returns to the geographic renderer. Astronomy Engine calculates heliocentric J2000 positions locally; distances and body radii are visually scaled and disclosed in-product.

Provider failure is isolated. The application continues with cached data and its deterministic Demo Mode.

## Context engine

`Signal` remains the evidence record. The deterministic Context Engine converts normalized fields into a progressive explanation: what happened, why it matters, what may happen next, affected area, confidence, awareness, and technical facts. Initial templates cover earthquakes, official weather/cyclone messages, FIRMS thermal observations, and FEMA declarations. Source wording and official instructions are preserved; missing facts are not inferred. The default inspector is human-facing, while provenance and methodology remain under “Show the science.”

## Universal intelligence objects

`NexusIntelligenceObject` is the presentation boundary between evidence and interaction. Signals, species, derived migration corridors, coarse ecological cells, clusters, and places resolve into the same identity/media/context/movement/provenance/watch contract. Renderers emit selection events; they never build provider-specific inspectors. Portrait uses one progressive bottom inspector and landscape uses the same object in a side inspector, preserving the geographic scene.

Media is selection-lazy. The resolver first uses media already attached by an authoritative provider or a license-filtered biodiversity adapter, then may request bounded official detail products such as USGS ShakeMap/DYFI images. It never preloads media for the global feed. Each media object retains kind, creator, license, source, timestamp, freshness, and accessible alternative text.

Meaningful geometry is an entrance, not decoration: globe points, species points, migration corridors, ecological H3 aggregates, and city labels are selectable. MapLibre equivalents use the same callbacks. World scale aggressively limits corridors/cells and uses thinner, lower-opacity geometry; regional zoom progressively increases detail without changing the underlying layer state.

## Watch pipeline

Watch evaluation is provider-independent: `Provider → Signal → WatchRule → WatchTrigger → WatchDeliveryAdapter`. Current place/radius rules evaluate severity and optional Signal categories, persist triggers in IndexedDB, deduplicate the same Signal for 24 hours, and apply a 15-minute per-rule cooldown. The current delivery adapter is in-app; a future native adapter can add push without modifying providers.

## Performance

The globe and map renderers are separate lazy chunks. Visible globe points are bounded, MapLibre clusters source data, filtering occurs before rendering, high-frequency sources receive shorter retention, WebGL pauses while hidden, device pixel ratio is capped, and polling only runs while the document is visible. Radar and satellite layers are opt-in and pause under battery saver. Raster caches use strict entry and age limits. Quality, automatic, and battery modes provide explicit user control. Future high-volume adapters should normalize and H3-index in Web Workers.

IndexedDB is a progressive enhancement rather than a launch dependency. If Safari denies storage, provider retrieval and deterministic analysis continue in memory; cached history and persistence alone become unavailable. Saved-case signal references are protected from retention pruning.

Ambient Earth is explicitly user-initiated. It requests the browser Screen Wake Lock where supported, fades chrome after inactivity, restores controls on touch, and releases the lock when the user leaves Earth or the mode is disabled.

Geometry is validated at the normalized Signal boundary. Only bounded Point, Polygon, and MultiPolygon geometry with finite WGS84 coordinates is retained; area rings must close and the total coordinate count is capped before either renderer receives the payload.

## Expansion

New providers implement `SignalProvider`; new visual layers consume `Signal` subsets. Neither requires changes to the database contract or discovery engine.
