# Discovery engine

A Discovery is a deterministic collection of potentially related Signals. Current scoring combines typical severity, peak severity, event count, provider/type diversity, and—only after enough genuine device history exists—a bounded regional-deviation component, normalized to 0–100.

| Score | Label |
|---:|---|
| 0–20 | Routine |
| 21–40 | Elevated |
| 41–60 | Unusual |
| 61–80 | Significant |
| 81–100 | Exceptional |

The score is a navigation aid, not a probability or claim of causation. Titles are generated from Signal types and transparent location entities. A high-severity Signal may form a single-source Discovery; multi-source proximity increases investigative value.

## Planetary Memory

NEXUS aggregates normalized Signals into daily buckets by provider, Signal type, and H3 resolution-3 region. Raw ordinary Signals retain 30 days; daily aggregates retain 366 days. Rebuilding a bucket from deduplicated Signal IDs prevents refresh polling from inflating counts.

A regional baseline is established only after seven prior calendar days and a minimum measurable rate. Missing calendar days count as zero activity. Until then, the Discovery explicitly says `Memory learning` and deviation contributes zero points. Once established, the UI exposes current count, typical daily count, percent deviation, observation span, H3 region count, and method. Positive deviation adds at most 20 ranking points using a bounded logarithmic transform. Negative deviation is shown but does not inflate an anomaly score.

This is a local observational baseline, not a population model, causal explanation, or probability. Erasing local data also erases Planetary Memory.
