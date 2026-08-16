# Discovery engine

A Discovery is a deterministic collection of potentially related Signals. Current scoring combines average member severity, event count, and provider diversity, normalized to 0–100.

| Score | Label |
|---:|---|
| 0–20 | Routine |
| 21–40 | Elevated |
| 41–60 | Unusual |
| 61–80 | Significant |
| 81–100 | Exceptional |

The score is a navigation aid, not a probability or claim of causation. Titles are generated from Signal types and transparent location entities. A high-severity Signal may form a single-source Discovery; multi-source proximity increases investigative value.

Longer-term work will maintain per-cell, per-category temporal baselines and expose every score component in the investigation view.
