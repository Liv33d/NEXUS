# NEXUS V3 rebuild notes

V3 is a product and truth-model rebuild, not a renderer swap or another layer pack. Six independent tracks reviewed mobile product design, MapLibre rendering, LIFE/media, weather/hazards, data modeling, and architecture/performance. A separate architecture track challenged the combined findings and reassigned bounded implementation work.

## Product decision

NEXUS keeps MapLibre GL JS as its single Earth renderer. It already provides the globe-to-local camera, labels, vector/raster layers, picking, and clustering NEXUS needs in one stateful renderer. Three.js, react-globe.gl, Cesium, deck.gl, and WebGPU would add a second rendering architecture without fixing the current truth, selection, and editorial failures.

V3 centers three surfaces:

1. **Earth is the canvas.** Semantic representation and adaptive density replace indiscriminate point rendering.
2. **Today is the invitation.** A maximum of five diverse stories replaces the numbered discovery dashboard.
3. **The hero sheet is the story.** Selection opens immediately at the story detent while media resolves asynchronously.

## Implemented in this pass

- Time-sensitive APIs are no longer cached by the service worker. IndexedDB is the only normalized data fallback, so stored responses cannot silently become `LIVE`.
- Every refresh owns its request and generation. A later refresh aborts the earlier generation, stale results cannot commit, and successful providers become visible progressively instead of waiting for the slowest source.
- Persisted provider states restart as stored/unchecked. Global status is derived from network state, provider cadence, last successful checks, and stored evidence.
- Local erasure removes the database, every `nexus:*` local-storage value, NEXUS/Workbox runtime caches, module media/LIFE caches, selections, and LIFE UI state.
- New selections open at the story detent. Cluster callbacks use a selection epoch and camera movement cancels prior motion.
- Earth Today uses deterministic, diversity-limited editorial selection with no numbered `DISCOVERY ####` labels or consumer-facing priority score.
- “Surprise me” is connected to the Earth experience and avoids the five most recent selections.
- The degraded Earth experience shows an onboard atlas and a concise prioritized story list instead of an 80-row coordinate wall.
- Media license checks use an exact allowlist for CC0, Public Domain, CC BY, and U.S. Government works. Malformed, NC, ND, and SA labels are synchronously rejected; traceable HTTPS sources remain mandatory.
- GDACS source links must use HTTPS.
- Four semantic zoom bands use deterministic spatial/domain quotas, clustering, and bounded entity caps. Selection has its own uncapped source and never forces base-source reclustering.
- Weather rasters remain below data and selection layers. Hidden routes stop collection construction and remove staged weather requests; unrecovered WebGL context loss falls back to Atlas.
- The cold-offline Atlas is a 5 KB gzip chunk with an uncapped selection marker and a synchronized keyboard-accessible list. Connected MapLibre and its worker load separately only while online.
- Portrait camera focus waits for measured sheet occlusion; settled detents—not drag frames—drive reframing. Landscape and Atlas use the same occlusion contract.
- LIFE makes no orbit-scale request. Zoomed queries are bounded to the visible region, aggregated to coarse H3 cells, suppress cells below 10 records and taxa below 5, reject sensitive/generalized records, and retain no occurrence link or raw coordinate.
- LIFE media resolves after selection. Successful results—not caller-bound promises—are cached, names/media fail independently, malformed candidates fail closed, and attribution remains visible in every sheet state.
- Unsupported GBIF migration inference, the dormant GlobeGL/Solar System renderers, Three/Astronomy dependencies, obsolete textures, and an inert map-theme control were removed.
- A canonical temporal relevance rule keeps freshly confirmed current states visible, removes expired evidence from display/discovery/Watch, and suppresses legacy NHC geometry that has build time but no authoritative validity.
- Active USGS, NWS, SWPC, OpenFEMA, NHC, GDACS, EONET, FIRMS, and volcano records now distinguish occurrence, issue, update, validity, confirmation, and retrieval time. Legacy records use their original timestamp with an explicit unknown basis; retrieval alone cannot make an old event current.
- Discovery, thermal correlation, and Reality Replay use temporal intervals: observations remain point events, while official products/current states use bounded validity. Multi-day open events can contextualize current observations without pushing replay outside the selected window.
- Delayed sources cannot receive a near-real-time card label. Forecast, current-state, delayed, cached, and observed evidence are labeled from source semantics plus the canonical temporal model.
- Saving a Case transactionally persists the Discovery and its referenced Signal snapshot. The Case workbench is reachable from Your Earth for notes/export/removal, with a separate Open on Earth action. Protected evidence survives provider replacement, time-window changes, and reload without entering live Earth, Search, Today, Observer, layer counts, Surprise, or Watch evaluation.
- LIFE cache identity includes spatial cell, quantized query center, radius band, two-year query window, license policy, and privacy thresholds. A previous region disappears immediately while a new viewport loads. Cached LIFE evidence has a 72-hour hard maximum, disappears when that limit is exceeded offline, and remains labeled cached on both taxon and cluster cards.
- Short-interval repeat FIRMS pixels remain unclassified; the unsupported “persistent thermal activity” inference is disabled.
- PWA updates wait for all active tabs to close instead of force-reloading over unsaved Case notes. Media selectors use ordinary pressed buttons rather than an incomplete ARIA tab pattern.
- Coverage-free anomaly scoring is held in learning mode. Empty provider responses retain prior evidence until a completeness envelope can distinguish a true empty result from partial/unknown coverage.

## Research decisions

### Implement before new feeds

- Explicit observation/issue/validity/retrieval semantics
- Source lineage and canonical upstream identifiers
- Typed, diameter-limited correlation instead of transitive generic proximity
- Coverage-aware baselines that exclude outages and partial responses
- Semantic zoom and deterministic renderer caps
- Privacy-safe LIFE aggregation and ranked, licensed media
- Provider-chaos, rapid-selection, offline-truth, orientation, and accessibility tests

### Strong next data slices

- Official NHC storm objects with distinct official forecasts and model guidance
- NOAA/NESDIS time-enabled satellite and NOAA radar frames on selection
- NIFC/WFIGS wildfire incidents/perimeters for thermal correlation
- USGS earthquake detail products (ShakeMap, DYFI, PAGER)
- USGS Water, NOAA CO-OPS, and NDBC as a future Ocean/Water vertical slice
- Wikidata/Commons as a future place-media resolver with item-level rights checks

### Deferred or rejected

- New feeds before truth/model gates pass
- Terrain, PMTiles, WebGPU, Cesium, deck.gl, and a second globe renderer
- Scraped storm graphics, RainViewer, unofficial ECMWF graphics, and raw browser radar decoding
- Live AIS, aircraft feeds with unclear production rights, Global Fishing Watch without a backend, and media feeds with uncertain reuse rights
- Migration routes inferred from two capped GBIF samples
- Renderer-side claims such as “likely wildfire” or “most common species” without evidence infrastructure

## Release gates

- Typecheck, zero-warning lint, unit/integration tests, and production PWA build
- Fast provider results visible before slow providers settle
- Offline/stored data never labeled live
- Rapid bird → bird → earthquake → storm → bird selection leaves only the final object’s card, media, camera, and provenance
- Portrait and landscape sheet-aware camera framing
- No more than five Today stories; one lead; no discovery IDs or scores on the consumer surface
- Exact media-license rejection matrix
- Local-data erase verified across IndexedDB, localStorage, and CacheStorage
- Production bundle/precache measurements recorded after dead-renderer removal
- Physical-iPhone FPS and gesture evidence required before claiming 60 FPS

## Validation evidence

- TypeScript build: pass
- ESLint: pass with zero warnings
- Vitest: 172/172 tests across 40 files
- Production PWA build: pass
- Production dependency audit: zero vulnerabilities
- Hero Card Lab production exclusion: pass
- Single-file phone preview build: pass
- Main application entry: 148.83 KB gzip
- Effective initial JavaScript including storage and spatial chunks: 244.22 KB gzip
- Atlas entry: 4.98 KB gzip
- Connected Earth JS plus MapLibre worker: 381.98 KB gzip (386.96 KB including the Atlas entry)
- PWA precache: 896.88 KiB / 1.8 MiB budget

## Honest limits

Passing automated tests does not prove physical iPhone WebKit/WebGL performance, battery behavior, haptics, VoiceOver quality, or visual polish. Playwright WebKit/Chromium orientation and low-network E2E are also not installed in this repository. Those remain device release gates and must be reported as unverified until measured. A complete provider coverage ledger/DB migration, authoritative rich NHC media/model experience, WFIGS-backed wildfire confirmation, and full PAGER support remain intentionally unclaimed.
