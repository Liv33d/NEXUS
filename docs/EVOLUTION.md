# NEXUS product evolution decisions

This decision log is grounded in the shipped application, current provider terms, mobile performance constraints, and the rule that Earth remains the interface. It is not a feature checklist.

## Build now

- **Universal place entry.** Earth search resolves real places globally and opens them as an Observer context instead of failing when no current Signal happens to mention the place.
- **Your Earth / local Watch foundation.** Saved points may be watched for elevated nearby Signals. Evaluation is explainable and local while NEXUS is open; background delivery is not implied.
- **Ocean context.** Coastal and ocean points show bounded, labeled wave, sea-surface-temperature and current model context. Oceans should not read as empty map area.
- **Pulse credibility.** Continue improving deterministic baselines, suppress single-feed noise, and show component scores and evidence scope before adding more feeds.
- **Adaptive rendering.** Keep a single WebGL context, pause hidden work, cap pixel ratio, and make AUTO the trustworthy default.

## Architect now / build later

- **LIFE context via GBIF and selected iNaturalist records.** Introduce a license-aware occurrence schema, sensitive-location policy, taxon identity, and per-dataset attribution before UI.
- **VISIBLE FROM HERE.** Use selected CelesTrak OMM groups, local SGP4 propagation, and device location/time. Retrieval must obey the two-hour source cadence and pass accuracy tests.
- **Atlas and Culture.** Resolve places and entities first; then add authoritative country context and open-access collection objects such as The Met, with object-to-place connections rather than generic prose.
- **NEXUS Memory.** Aggregate per H3 cell, category, and time bucket. Preserve summaries and seasonal baselines instead of accumulating unlimited raw records.
- **Native delivery boundary.** Keep Watch rules independent of delivery so a future Capacitor shell can add push, haptics, widgets, and background behavior without rewriting providers.

## Experiment

- **Bird migration fields.** Prototype seasonal/observed density corridors from datasets whose terms permit derived visualization. Do not call sparse occurrence dots a migration model.
- **Earth Today.** Test a calm, finite daily briefing generated from current Signals, saved places, and one sourced discovery—not an engagement feed.
- **Ambient chapters.** Weather, Orbit, Night, and Migration variants should be measured for legibility, burn-in risk, battery and thermal behavior before becoming settings.
- **Focused connection trails.** Prefer one selected entity and a few evidence-backed next steps over a giant force-directed graph.

## Reject

- **“All webcams everywhere.”** No lawful, reliable, free universal catalog exists. Federate official public/scientific cameras only when embedding and reuse rights are explicit.
- **Unbounded aircraft, vessel, satellite or wildlife dots.** They create visual noise, provider abuse, battery drain and a worse understanding of Earth.
- **Apple or Google tile harvesting.** Apple MapKit JS requires signed developer credentials; Google photorealistic tiles require billing. Neither is a no-key core PWA substrate.
- **News-volume-as-truth and causal anomaly copy.** Media activity can be a labeled signal, never confirmation. Correlation remains an observation.
- **A separate game economy.** Expeditions may guide real exploration, but coins, streak pressure, loot and disaster gamification do not belong in NEXUS.

## Product test

A release is successful when it makes Earth easier to touch, understand, connect, explore, or verify without increasing default chrome. A new provider that does not change a user decision or reveal meaningful context is not a product improvement.
