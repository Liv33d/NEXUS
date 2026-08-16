# Correlation engine

The initial engine compares located Signals inside bounded recent windows. It records geographic distance, temporal difference, same or neighboring H3 cells, and provider diversity.

Relationships use plain observed language: “Signals occurred within X km and Y minutes.” They never say one Signal caused another. Every relationship links the original Signal IDs, so the UI can trace the statement to provenance.

Future work will add transparent shared-entity matching, configurable thresholds by Signal type, and worker-based candidate generation for high-volume feeds.
