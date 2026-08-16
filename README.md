# NEXUS

> **See the world connect.**

NEXUS is a mobile-first, privacy-friendly global signal discovery system. It transforms legitimate public data into a traceable model of what is happening on Earth—without paid APIs, accounts, trackers, a proprietary backend, or runtime AI.

The current release is a working multi-source vertical slice. It includes a cinematic interactive globe and atlas view, live USGS earthquakes, NWS severe-weather alerts, NASA EONET natural events, NOAA space weather, optional NASA FIRMS thermal detections, Open‑Meteo Observer context, normalized Signals, H3 indexing, local persistence, temporal filtering, bounded conservative correlation, anomaly scoring, Discoveries, saved Cases, offline PWA support, provider health, and source provenance.

## Quick start

```bash
npm install
npm run dev
```

Production verification:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

For a single self-contained HTML file suitable for temporary phone previews:

```bash
npm run build:phone-preview
```

The output is `dist-preview/nexus-phone-preview.html`. The installable PWA still requires normal HTTPS hosting so service workers and Home Screen installation work correctly.

## Architecture

```mermaid
flowchart TD
  A[Public providers] --> B[Isolated adapters]
  B --> C[Validated Signal]
  C --> D[H3 + temporal engine]
  C --> E[IndexedDB]
  D --> F[Correlation + anomaly]
  F --> G[Discoveries]
  E --> H[Globe and accessible views]
  G --> H
```

- **UI:** React, TypeScript, Vite, React Globe GL, Three.js
- **State:** Zustand
- **Persistence:** Dexie/IndexedDB with bounded retention
- **Validation:** Zod at provider boundaries
- **Spatial engine:** H3 plus deterministic distance calculations
- **Offline:** Vite PWA/Workbox application shell and USGS runtime cache
- **Data boundary:** visualizations never consume provider-native payloads

## Supported sources

| Source | State | Notes |
|---|---|---|
| USGS Earthquakes | Live | Official global real-time GeoJSON |
| NWS Alerts | Live | Official U.S. watches, warnings, and advisories with polygons |
| NASA EONET | Live/delayed | Keyless global natural events from authoritative source aggregation |
| NOAA SWPC | Live | Global NOAA R/S/G space-weather scales |
| NASA FIRMS | Optional live/delayed | User-supplied free MAP key stored only on-device |
| Open‑Meteo | On demand | Weather, wind, air quality, sunrise, and sunset in Observer Mode |
| NEXUS Demo Network | Built in | Deterministic, isolated replacement mode for exploration and testing |

## Privacy and credibility

- No accounts, analytics, ads, telemetry, or cloud profile.
- Saved Cases and settings stay in local IndexedDB.
- Location is requested only from Observer Mode, with an explanation first.
- Every Signal carries provider, freshness, timestamp, and provenance.
- Correlations state measurable proximity and never claim causation.
- Demonstration data is always marked `DEMO DATA` and never presented as live.

## Deployment

NEXUS builds to static files in `dist/`. The included `Deploy NEXUS` workflow publishes `main` through GitHub Pages when Pages is configured to use GitHub Actions. The relative Vite base also supports Cloudflare Pages, Netlify, and Vercel without platform coupling.

## Limitations

- The current atlas is a lightweight offline overview; detailed MapLibre investigation maps and replay tracks remain sequenced work.
- Baselines are currently recent-device baselines; longer statistical history will improve anomaly context.
- FIRMS requires the user to enter a free NASA MAP key locally; it is never committed or bundled.
- Globe texture is intentionally bundled and stylized so the core Earth experience remains offline-capable.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for sequenced expansion and [`docs/RESEARCH.md`](docs/RESEARCH.md) for open-source research and license notes.

## License

No project license has been selected yet. Dependencies retain their respective licenses. Choose a project license before public distribution.
