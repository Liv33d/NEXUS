# V3 data-truth boundary

This pass adds a compatibility temporal and lineage contract without claiming
that the complete ingestion architecture has shipped.

## Implemented in the bounded pass

- Source observation, issue, validity, confirmation, and retrieval times can be
  represented separately while legacy `timestamp` readers continue to work.
- NHC, USGS Volcano, GDACS, EONET, and FIRMS populate the new truth fields.
- GDACS event identity is stable across episode revisions.
- FIRMS detection identity is independent of CSV row order.
- Discovery relationships use explicit type-pair bounds.
- Discovery grouping is anchored and diameter-bounded rather than a transitive
  union of every nearby signal.
- Local baselines require 28 recorded days from the same providers and do not
  assume that a missing day had zero activity. Consumer anomaly claims remain
  disabled until coverage denominators exist.
- Refresh generations own UI, persistence, derivation, and Watch side effects.
- Successful providers become visible progressively; a stale generation rolls
  back its database transaction.
- One temporal relevance policy covers visible windows, discovery, and Watch.
- Empty results retain the prior provider slice until the provider can declare
  complete coverage.

## Intentionally deferred

- A provider-result envelope and persisted coverage ledger.
- A Dexie migration and indexes for temporal, lineage, coverage, and canonical
  entity records.
- Cross-provider canonical entity tables and terminal upstream-source
  resolution.
- Coverage-qualified anomaly baselines. Recorded-day memory is learning-only,
  not proof of complete observation coverage.
- NHC forecast-point validity timestamps in the scheduled KML build. The
  normalizer preserves them when supplied but does not invent them.

Until those items land, transport success must not be described as complete
coverage, aggregators must not automatically count as independent evidence,
and cached current-state products must not be labeled live.
