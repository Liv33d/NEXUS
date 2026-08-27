# NEXUS definitive pass — 2026-08-25

> Historical V2 record. V3 removed the migration and Solar System paths described below; see `V3_NOTES.md`.

This pass deliberately prioritizes a stable, understandable Earth over feature count.

## Product decisions

- Earth owns the full outward zoom range. Earth camera movement must never navigate to Space.
- Solar System code is preserved but is not part of production navigation. See `SPACE-ISOLATION.md`.
- `Living Earth` is a curated, readable preset. `Show everything` is a separate explicit power-user action.
- Selecting or focusing a domain emphasizes it without silently disabling compatible layers.
- A visible forecast path, area, migration corridor, taxon cluster, or signal must resolve to an intelligence object.
- Derived bird migration describes changing observation patterns, not individual tracked birds.
- NASA FIRMS points remain thermal anomalies until independent evidence supports a stronger classification.

## Geographic renderer decisions

- The globe remains a long-lived renderer; provider refreshes must update layer data rather than recreate it.
- The detailed map updates raster tile URLs through the existing MapLibre raster source.
- Raster replacements must be atomic: keep the last good visual until the new texture is ready.
- Map pixel ratio is capped by performance mode to reduce iPhone GPU and memory pressure.
- The previous globe cloud shell was removed. It attempted to derive clouds from a full true-color Earth image and could render snow, ice, or land as cloud, producing a second misaligned Earth. Cloud imagery is currently detailed-map-only and must not be called globally live.

## Data-honesty decisions

- Human summaries lead; raw percentages, coordinates, provider fields, and methodology remain in expanded details.
- Thermal classification is conservative and evidence-aware: unclassified, persistent, possible fire, or possible volcanic activity.
- Proximity is not proof. Related signals can raise confidence but must not be described as causation.
- Weather, imagery, observations, derived movement, forecasts, and cached data must retain distinct freshness labels.

## Commercial and provider risks

- Open-Meteo's free/open-access service is not a commercial production entitlement. A commercial release needs an appropriate plan or a provider migration.
- GBIF occurrence media can carry record-specific licensing and incomplete attribution. Media eligibility must be checked per asset.
- BirdCast public visualizations are valuable research context, but production ingestion requires an explicit data-access and licensing review.
- Hurricane models must remain secondary to official forecasts; ATCF/NHC and model-source terms must be recorded before distribution.

## Deferred intentionally

- A global observed cloud globe layer, until a geographically correct, timestamped, commercially sustainable source and renderer are available.
- A MapLibre globe pilot that could eventually unify globe and detailed-map rendering. It must be benchmarked against the existing globe before replacement.
- Bird tracks, origins, destinations, and causal weather explanations without telemetry or defensible range data.
- Reintroducing Space until it is isolated in route, renderer, state, network, and performance ownership.

## Next architectural objective

Build the evidence-backed phenomenon pipeline and universal selection contract across the current normalized signals, while piloting a single-renderer Earth path behind a feature flag.
