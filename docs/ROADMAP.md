# Roadmap

## Shipped foundation

- Mobile-first OLED design system and installable offline shell
- Interactive 3D Earth with semantic point limits and event pulses
- Normalized Signal schema, validation, provenance, and freshness
- Live USGS vertical slice and deterministic multi-source Demo Mode
- Live NWS, NASA EONET, NOAA SWPC, and optional NASA FIRMS adapters
- Open‑Meteo Observer weather, air-quality, and daylight context
- Provider retry/deduplication, cached fallback, and health control surface
- NASA-textured globe and lazy MapLibre investigation map with clustering, alert polygons, and accessible no-WebGL fallback
- Best-effort RainViewer radar frames with official NOAA/NWS U.S. fallback and a bundled Natural Earth offline map fallback
- User-controlled recent radar animation with reduced-motion and visibility safeguards
- Global GDACS impact alerts for cyclones, floods, volcanoes, droughts, and wildfires
- Preserved, bounded NWS alert geometry and auditable investigation source lists
- Bounded spatial-time candidate generation for mobile-safe correlation
- H3 indexing, temporal windows, conservative relationships, Discoveries
- IndexedDB retention, durable Case notes and evidence export, deterministic command search, and permission-free saved Observer places
- Global Signal replay, contextual Lens presets, recovery UI, and production PWA icons
- Unit tests and GitHub Actions verification

## Next

1. Build the federated Camera Registry, health checker, clustering, and consent-aware Portal experience.
2. Add USGS volcano/HVO camera, NOAA buoy/BuoyCAM, NHC cyclone, and USGS water providers.
3. Build transparent per-H3 temporal baselines, component scores, and “What changed?” explanations.
4. Add timestamp- and footprint-aware GOES/Himawari geostationary imagery.
5. Move FIRMS normalization and candidate generation into Web Workers before adding dense sources.
6. Add IODA outage, Launch Library 2, selected CelesTrak orbit, and bounded aviation-weather modules.
7. Add focused entity graph with bounded progressive expansion.
8. Continue accessibility, battery, storage-management, and mobile performance audits on real devices.
