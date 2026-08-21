# NEXUS recovery and integration audit

Audit date: 2026-08-21

This document uses strict states: **IMPLEMENTED** means working end-to-end; **PARTIAL** means meaningful functionality exists but important pieces are absent; **PLACEHOLDER** means UI/schema without a working capability; **MISSING** means no meaningful implementation; **BROKEN** means present but unreliable; **DEFERRED** means intentionally postponed for a documented reason.

## Geographic regression boundary

- Known-good reference: `8a555617a822468b9857fc9e35f6194ffc4af64f` (PR #21 merge).
- Regression change: `e4f802368ae33f0f5ee94d17543a53e09e85ba9d` (PR #22 implementation), merged as `726b2285e4be88941370e18aaa037d75cf1d9968`.
- Recovery branch: `codex/stabilize-geography`.

### Root causes

1. PR #22 wired GlobeGL's continuous `onZoom` stream directly to React state. During drag, damping, zoom and auto-rotation, this repeatedly scanned the 3,116-city catalog, replaced label arrays and reconciled all GlobeGL data layers. The renderer itself was not recreated, but its declarative scene was churned on the animation hot path.
2. `App` subscribed to the entire Zustand store, derived a fresh visible-Signal array on every provider-status update, and passed fresh inline callbacks to Earth renderers. Provider health transitions therefore caused avoidable globe/map prop updates even when geographic data was unchanged.
3. Both WebGL views lacked a container-owned, frame-coalesced resize contract. The globe used `window.innerWidth/innerHeight`; MapLibre relied on generic window handling. This left orientation changes vulnerable to stale iOS visual-viewport dimensions.
4. Globe and map cameras were component-local. Switching renderers deliberately unmounted one and mounted the other at a hard-coded camera, which looked like a jump or reset rather than a continuous Earth experience.
5. Neither geographic renderer exposed a controlled recovery state for `webglcontextlost` / `webglcontextrestored`.

The PR #22 MapLibre additions used incremental `GeoJSONSource.setData` calls and did **not** introduce map-instance recreation. Map-specific symptoms came primarily from resize timing, camera loss and upstream style/network availability.

## Repairs

- City labels are retained, but camera-driven label selection now commits only when OrbitControls reports an interaction `end`; there are no React updates during drag/inertia.
- Globe props use stable Signal arrays and callbacks across provider-status updates.
- Both renderers use one container `ResizeObserver`, coalesced with `requestAnimationFrame`, plus `visualViewport` resize handling.
- Globe and map share one validated `GeographicView`; altitude/zoom conversion is tested and mode switches preserve target and scale.
- Invalid/NaN camera values are clamped before reaching either renderer.
- Both canvases handle WebGL context loss/restoration with a restrained recovery state.
- MapLibre remains long-lived: one instance per mounted theme, incremental Signal/area/track source updates, one cleanup path.

## Performance evidence

| Path | Before | After |
|---|---|---|
| Globe camera → React | Continuous `onZoom` callbacks during animation | One guarded commit after interaction settles |
| City selection | Up to 3,116 distance calculations per accepted camera callback | Same bounded calculation only after settled movement |
| Provider status update | Fresh visible array and Earth callback identities | Stable visible array/callbacks unless geographic inputs change |
| Orientation | Window dimensions, browser timing dependent | Container dimensions, RAF-coalesced, visual-viewport aware |
| Mode switch | Hard-coded camera reset | Shared validated camera target and equivalent scale |
| Context interruption | No user-facing recovery contract | Explicit pause/recover/resize/resume handling |

Scene limits remain bounded: at most 1,200 globe points (350 in battery mode), 24 animated rings (8 battery), 44 nearby city labels, 260 country features, and 5,000 clustered MapLibre points.

## Feature integration matrix

| Capability | State | Evidence / limitation | Priority |
|---|---|---|---|
| Geo Engine: globe | IMPLEMENTED | React GlobeGL/Three.js, validated Signals, live lighting, bounded layers | P0 stabilized |
| Geo Engine: detailed map | IMPLEMENTED | MapLibre/OpenFreeMap with onboard Natural Earth fallback | P0 stabilized |
| Map ↔ globe continuity | IMPLEMENTED | Shared target and equivalent zoom/altitude; selection/layers/time remain App-owned | P0 completed |
| Semantic zoom / city labels | IMPLEMENTED | 3,116 bundled Natural Earth places; nearby labels appear after settled zoom | P0 repaired |
| Country boundaries | IMPLEMENTED | Bundled public-domain Natural Earth outlines | — |
| Region/road/landmark detail | PARTIAL | Connected MapLibre supplies progressive OSM detail; globe itself does not become a street renderer | P2 |
| Portrait | IMPLEMENTED | Safe-area-aware mobile-first Earth and sheets | Ongoing polish |
| Landscape | PARTIAL | Intentional compact Earth and Observer layouts exist; device visual QA remains ongoing | P1 |
| Orientation preservation | IMPLEMENTED | Shared camera plus container resize lifecycle | P0 completed |
| PWA install/application shell | IMPLEMENTED | Manifest, icons, generated service worker, Pages deployment | — |
| Offline | IMPLEMENTED | Shell, bundled Earth/atlas, stored Signals/Cases/Watches; connected tiles correctly degrade | — |
| Accessibility | PARTIAL | Semantic pages/lists, focus states, reduced motion, non-globe fallback; full VoiceOver audit missing | P1 |
| Adaptive performance | PARTIAL | automatic/quality/battery modes and object caps; no runtime FPS/thermal governor | P2 |
| Earthquakes | IMPLEMENTED | Official USGS adapter, normalization, cache, timeline | — |
| Volcano activity | IMPLEMENTED | Official USGS elevated-status feed | — |
| Severe weather alerts | IMPLEMENTED | Official NWS U.S. alerts with bounded polygons; not global | — |
| Active cyclones | IMPLEMENTED | Scheduled official NHC track/cone snapshot; NHC basins only | — |
| Fires / thermal anomalies | IMPLEMENTED | NASA FIRMS with optional user MAP key | — |
| Space weather | IMPLEMENTED | NOAA SWPC scales | — |
| Natural events | IMPLEMENTED | NASA EONET and GDACS adapters | — |
| Aviation | MISSING | Demo Signals only; OpenSky rate/auth/reliability and mobile-density policy not integrated | P2 |
| Maritime traffic | DEFERRED | No suitable free, global, commercial-ready live AIS source | P3 |
| Weather radar | PARTIAL | RainViewer best effort with NOAA MRMS fallback; provider coverage/CORS are not a global guarantee | P1 reliability |
| Satellite cloud imagery | PARTIAL | NOAA GOES East/West observation overlay; not polar/global coverage | P2 |
| Observer place search | IMPLEMENTED | Ranked Open-Meteo geocoding with country/admin disambiguation | — |
| Observer device location | IMPLEMENTED | Permission requested only after user action | — |
| Observer reverse geocoding | PARTIAL | Device position remains “Current location”; authoritative reverse lookup is not integrated | P2 |
| Local time/daylight/weather/AQI | IMPLEMENTED | Timezone-aware Open-Meteo context with °F/°C and sunrise/sunset | — |
| Ocean context | PARTIAL | Bounded modeled wave/SST/current context; no bathymetry, buoys or wildlife layer | P2 |
| Ambient reduced chrome | IMPLEMENTED | Idle control hiding, wake lock when supported, status chips hidden | — |
| Ambient portrait/landscape | PARTIAL | Functional responsive layouts; extended real-device burn-in/thermal QA missing | P1 |
| Languages/i18n | MISSING | English-only; no message catalog | P2 |
| Metric/imperial | PARTIAL | Temperature and wind follow °F/°C choice; distance/marine units are not granular | P2 |
| Performance modes | IMPLEMENTED | automatic/quality/battery controls affect pixel ratio and animation/object limits | — |
| Privacy/storage controls | IMPLEMENTED | Local-first, no analytics/account, erase flow, retention pruning | — |
| Provider health | IMPLEMENTED | Live/cached/rate-limited/error state per provider | — |
| Watch: places/radius/categories | IMPLEMENTED | Local rules consume normalized Signals; thresholds/types supported in rules | P1 completed |
| Watch: dedupe/cooldown | IMPLEMENTED | Durable WatchTrigger records with per-rule cooldown and per-Signal dedupe | P1 completed |
| Watch: delivery abstraction | IMPLEMENTED | In-app adapter boundary; providers contain no notification logic | P1 completed |
| Watch: editable thresholds UI | MISSING | Defaults are transparent but not user-editable | P2 |
| Watch: entities/events/satellites/species/Pulse | MISSING | Requires target-union schema and domain-specific evaluators; not faked | P2/P3 |
| Atlas geography/flags/population/languages | MISSING | Place context is observational, not a sourced country dossier | P2 |
| Atlas government/leadership | DEFERRED | Requires current authoritative political data and update governance | P3 |
| Atlas history/conflicts | MISSING | No sourced spatiotemporal entity corpus | P3 |
| LIFE nearby species | IMPLEMENTED | Bounded GBIF occurrences, permissive-license filter, source links | — |
| LIFE ecosystems/threat/endemic context | MISSING | Occurrence records do not establish ecosystem or conservation status | P2 |
| Bird migration | DEFERRED | Integration boundary researched; no lawful global real-time feed, so no synthetic migration | P3 |
| Wildlife movement | DEFERRED | Scientific datasets need per-project licensing and sensitive-location policy | P3 |
| Culture / art / architecture | MISSING | Met API researched only; no product surface | P3 |
| Timeline windows/replay | IMPLEMENTED | NOW–7D filtering and timestamp replay of retained evidence | — |
| Planetary Memory | IMPLEMENTED | Daily H3/type/provider aggregates; seven prior days required | — |
| Explainable Pulse baseline | IMPLEMENTED | Capped deviation component and learning/established disclosure | — |
| Historical months/years/THEN-NOW | MISSING | Retention and historical datasets not sufficient | P3 |
| Satellites / ISS passes | PARTIAL | Selected station OMM snapshots and local SGP4 next-pass calculation | P2 |
| Launches / rockets | MISSING | Launch Library 2 researched but not integrated | P2 |
| Moon / planets / sky positions | MISSING | No ephemeris/sky renderer | P3 |
| Visible From Here | PARTIAL | Station passes work; illumination geometry, planets and event catalog are incomplete | P2 |
| Bathymetry/currents/waves | PARTIAL | Currents/waves/SST in Observer; bathymetry and map visualization missing | P2 |
| Entities / relationships / provenance | PARTIAL | Normalized Signal entities, conservative Signal relationships and source trails exist; no durable entity graph | P1 |
| Discoveries / Surprise Me | IMPLEMENTED | Deterministic ranking, diversity guard and investigation flow | — |
| Earth Today | MISSING | No daily briefing product | P3 |
| Natural phenomena catalog | MISSING | Live feeds may contain phenomena, but there is no sourced catalog system | P3 |

## Why requested work remains incomplete

- **Provider/legal constraint:** live AIS, bird migration and wildlife telemetry lack one free, global, commercial-ready source with stable browser delivery.
- **Architectural prerequisite:** Atlas, Culture and broad Connections need durable place/entity identity and source-aware content schemas before UI.
- **Scientific prerequisite:** Moon/planet visibility, deep time and historical borders require trustworthy ephemerides or reconstructed datasets, not decorative approximations.
- **Performance/product constraint:** aviation, biodiversity and labels cannot be dumped onto the Earth without semantic zoom, aggregation and relevance policy.
- **Implementation omitted:** i18n, editable Watch thresholds, reverse geocoding, launches and Earth Today remain real missing work—not “implemented” interfaces.

## Deliberate rejection

- A second globe or a wholesale geographic rewrite: rejected because current renderers are capable and the regression was lifecycle/state ownership.
- Thousands of always-visible city/species/aircraft markers: rejected as unreadable and unsafe for mobile performance.
- Fabricated migration, causation or historical precision: rejected on trust grounds.
- Runtime AI narration: rejected because it violates NEXUS's deterministic, offline-friendly cost and provenance principles.
