# NEXUS V3 architecture

NEXUS is a static, local-first Progressive Web App with no required account or application backend.

## Core boundaries

1. Provider adapters fetch and validate untrusted remote payloads.
2. Valid records become normalized `Signal` evidence with explicit temporal basis, provenance, lineage, and expiry.
3. IndexedDB stores bounded evidence, provider state, Watches, Cases, and learning-only regional memory.
4. `PresentedEntity` consolidates only exact upstream identities; proximity and similar names never silently merge events.
5. Deterministic discovery and context engines explain evidence without generative AI.
6. `NexusIntelligenceObject` is the single presentation contract for cards, sheets, Today, Search, LIFE, clusters, places, and selected Signals.

## Earth

MapLibre GL JS is the only WebGL Earth renderer. It starts from bundled Natural Earth geography, preserves one renderer instance, caps device pixel ratio, pauses source writes and weather layers while hidden, and falls back to the onboard SVG Atlas when WebGL or the connected renderer is unavailable. The Atlas has touch pan/pinch, an uncapped selection marker, and a synchronized keyboard-accessible object list.

Earth data uses stable sources for points, areas, forecast tracks, coarse LIFE cells/taxa, and the uncapped selection overlay. Pure collection builders apply deterministic spatial/domain quotas before global caps. Four semantic zoom bands change density and representation without toggling the underlying conceptual layer.

Portrait selection opens a controlled three-detent bottom sheet; landscape uses a measured side inspector. The inspector reports settled occlusion to the renderer so camera focus remains visible. Selection acknowledgement does not wait for remote media, and full-sheet mode never moves the camera.

Dynamic radar/satellite imagery is visual context rather than a discrete Signal. Rasters render below data and selection layers, retain source attribution, use bounded caches, and are labeled by retrieval freshness when the service does not expose an observation time.

The cold offline install precaches the small Atlas path. The connected MapLibre renderer and worker are separate online chunks, avoiding unnecessary parsing on no-WebGL and offline devices.

## LIFE and media

LIFE queries run only after the user zooms into a bounded visible region. CC0 occurrence records are aggregated into coarse H3 resolution-3 cells. A cell needs at least ten qualifying records and a displayed taxon needs at least five records in the same cell. NEXUS stores or presents no raw occurrence coordinate, occurrence link, observer identity, inferred centroid route, abundance, range, or migration claim.

Species media resolves only after selection. A reusable media path requires an exact commercial-use allowlist, HTTPS asset and source URLs, creator, traceable source, supported still-image MIME, and visible attribution. Caller-bound aborted requests are never cached. One failed enhancement does not collapse the base card.

## Truth and refresh

Each refresh owns an AbortSignal and monotonic generation. Fast providers commit progressively to the current UI; only the current generation may persist, derive, or deliver Watch triggers. A provider transport success is not automatically global truth: only semantically current records may contribute a live source, delayed responses stay labeled delayed/stored, and an empty response cannot clear prior evidence until a provider declares complete coverage.

`SignalTemporal` separates observation, issue, update, validity, confirmation, retrieval, precision, and basis. One relevance policy is used for visible windows, derivation, and Watch evaluation. Current-state products remain visible while freshly confirmed and valid even if their status began earlier; expired products are excluded everywhere.

Legacy records without a temporal contract use retrieval fallback and cannot be reinterpreted as observations. A future database migration and provider coverage ledger remain required before persisted anomaly baselines can graduate from learning mode.

## Failure and privacy

Provider failure is isolated. Cached evidence remains available with stored labeling; optional enhancements disappear independently. Erase removes IndexedDB, all `nexus:*` local storage, NEXUS/Workbox caches, module media/LIFE caches, Watches, selections, and in-memory state.

Geometry is sanitized at the Signal boundary. URLs and media are synchronously checked again at render time. Demo fixtures are compiled out of production and visibly labeled when used in development.

## Expansion rule

New feeds are deferred until they provide explicit coverage/completeness, truthful time semantics, stable upstream identity, licensing, failure fixtures, and a coherent intelligence-card experience. Data availability alone is not a product reason to add a layer.
