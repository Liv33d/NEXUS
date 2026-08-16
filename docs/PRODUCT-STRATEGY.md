# NEXUS product strategy

## Product promise

NEXUS is the fastest, most compelling way to notice something happening on Earth, understand why it is interesting, and trace it back to evidence.

It is not a weather app with extra layers, a marker directory, a surveillance catalog, or a news reader. The signature loop is:

1. **Notice** — reveal one meaningful change without overwhelming the user.
2. **Travel** — move the Earth to the place with cinematic spatial continuity.
3. **Understand** — explain what changed versus a transparent baseline.
4. **Witness** — open relevant public cameras or sensor views when permitted.
5. **Verify** — inspect every observation, timestamp, source, and uncertainty.
6. **Remember** — save the discovery locally and replay how it evolved.

## Release quality test

A feature belongs only when it materially improves at least one of SEE, CONNECT, EXPLORE, or VERIFY. Every release must also pass these questions:

- Can a new user understand the screen within five seconds?
- Does the Earth remain the dominant visual surface?
- Is the most important action obvious with one thumb?
- Are unavailable, delayed, forecast, modeled, and cached data unmistakable?
- Does a derived statement explain its inputs?
- Is a disaster presented with restraint?
- Can the feature stop polling, animating, and decoding when hidden?
- Is the experience still useful without location permission, an account, or a credential?

## Product structure

### Earth

Earth is an editorial spatial canvas, not a layer control panel. The default view shows only a small, semantically thinned set of important Signals and Discoveries. Search, layers, legends, and provider status open in sheets. The globe is the emotional overview; the 2D map is a precise investigation instrument.

### Pulse

The current Discover feed evolves into **Pulse**: a bounded sequence of the most interesting changes on Earth. A Pulse item must be a major authoritative event, a meaningful spatial-temporal cluster, or a multi-source convergence. Ordinary feed records never become Pulse items merely because they exist.

Each card answers:

- What changed?
- Where and when?
- Compared with what baseline?
- Which independent sources contribute?
- How fresh is the evidence?
- Why did NEXUS select it?

### Cases

Cases are durable local investigations, not bookmarks. A Case contains selected evidence, notes, a chronological replay, source snapshots, exported provenance, and the state of derived metrics at save time. Future source changes must not silently rewrite a saved Case.

### Observer

Observer is an ambient world window for any searched, tapped, or saved place. It combines local time, daylight, weather, air quality, nearby Signals, and eligible public cameras. It must work without location permission. A low-motion display mode reduces polling and can keep an iPhone upright as an ambient terminal.

## Signature experiences

### World Pulse opening

The first launch should reveal the Earth unobstructed, then introduce at most three high-value events with restrained pulses. A short contextual line such as “220 public observations · 5 sources · updated 32 seconds ago” replaces a dashboard of metrics.

### Guided flight

Selecting an item initiates a continuous globe flight. The destination label appears during motion; the evidence sheet arrives only after the geographic context is visible. Reduced-motion users receive an immediate cut with the same information.

### What changed here?

Every investigation begins with a deterministic delta statement. Examples:

- “18 earthquakes were observed in this H3 region during six hours; the previous seven-day hourly median was 4.”
- “Three independent providers reported related storm activity within 81 km and 42 minutes.”

The comparison window, sample size, and limitations are inspectable. NEXUS never translates correlation into causation.

### Reality replay

Replay animates discrete evidence arrival rather than a generic timeline thumb. Events appear at their authoritative timestamps, the camera follows the evolving geographic center, and the discovery score changes only when its inputs change. Replay state is windowed and persisted as compact snapshots.

### Portal

Portal is the camera-centered extension of Observer. It presents one permitted public view full screen, surrounded by minimal local context. Swiping moves to a geographically and thematically diverse view rather than another camera from the same city.

Camera playback rules:

- never autoplay on the map or over cellular in battery-saver mode;
- distinguish live stream, recent snapshot, timelapse, and source link;
- display capture time rather than retrieval time when available;
- pause immediately when hidden;
- show attribution and usage rights before playback;
- do not archive footage by default;
- never ingest unsecured, residential, facial-recognition, or personally targeted cameras.

### Lens mode

Instead of dozens of independent switches, a Lens configures a coherent question:

- **Storm** — warnings, radar, cyclone tracks, pressure, wind, buoys, cameras.
- **Fire** — thermal detections, perimeters, smoke, AQI, wind, official incident sources.
- **Seismic** — earthquakes, volcano state, tsunami messages, nearby gauges and cameras.
- **Ocean** — buoys, wave height, water temperature, storms, tsunami systems.
- **Orbit** — selected satellites, launches, space weather, ground observations.
- **Infrastructure** — macroscopic internet outages and authoritative public notices.

Lenses reduce cognitive load, define legend semantics, and set appropriate refresh intervals.

## Camera federation

There is no legal, free, reliable worldwide “all cameras” API. NEXUS therefore uses provider modules plus a versioned static catalog generated by scheduled GitHub Actions.

Each camera record requires:

- stable provider and camera identifiers;
- coordinates and public-place category;
- stream, snapshot, timelapse, and source URLs as distinct fields;
- attribution, terms URL, allowed presentation mode, and region;
- last verification, last successful image, and expected refresh interval;
- operational, stale, seasonal, offline, or rights-review status;
- public-place, wildlife, transport, scientific, or hazard purpose;
- a sensitivity review flag.

Initial federation priorities are official USGS volcano cameras, NOAA buoy cameras, National Park Service camera directories, and transportation agencies that explicitly publish reusable camera metadata. Provider pages with ambiguous embedding rights remain source links. Windy Webcams may be optional user-supplied access but cannot be a core dependency.

## Data opportunities

High-value next sources, in priority order:

1. USGS Volcano Hazards elevated-state notices and official webcams.
2. NOAA NDBC buoy observations and BuoyCAMs.
3. NHC tropical cyclone forecast and best-track GIS products.
4. USGS Water Data streamflow, gauge height, and flood-impact locations.
5. NASA GIBS geostationary GOES/Himawari imagery with explicit footprints and timestamps.
6. NOAA Aviation Weather worldwide SIGMETs and bounded METAR context.
7. Georgia Tech IODA macroscopic internet outage alerts.
8. Launch Library 2 upcoming launches and space events.
9. CelesTrak selected-object orbital elements propagated locally with SGP4.
10. ReliefWeb reports as humanitarian source material, labeled separately from physical observations.

Sources requiring credentials remain optional and local. Browser-hostile or CORS-disabled sources require a scheduled static snapshot only when their terms allow redistribution; core functionality cannot require a private proxy.

## Information design rules

- The default Earth view contains no permanent search field, metrics table, timeline, and layer row simultaneously.
- One floating action opens Search; one opens the Lens sheet.
- Timelines appear only when a time-aware layer is active.
- Legends are contextual and never rely on color alone.
- Counts use human units and scope: “12 visible in 24h,” not “12 signals.”
- Technical provider health belongs in Settings; a small freshness indicator belongs on Earth.
- A bottom sheet has a collapsed preview, a useful half-height state, and a full investigation state.
- The back action preserves camera, zoom, selected time, and Lens.
- Empty states always provide a next action.

## Trust model

Every displayed assertion is one of:

- **Observed** — directly reported by the named source.
- **Modeled** — forecast or estimated field from a named model.
- **Derived** — deterministic calculation with inspectable inputs.
- **Correlated** — spatial, temporal, or entity proximity without causal claim.
- **Media activity** — reporting volume, never treated as confirmation.

Freshness is independent of trust class. An official record can be delayed; an open-data sensor can be live; cached data can still be authoritative but is not current.

## Performance budgets

- First interactive shell under 1.5 seconds on a recent iPhone over warm cache.
- No more than 60 high-detail globe objects at world scale.
- No camera video, orbit propagation, radar animation, or polling while hidden.
- Map and globe engines remain separately lazy-loaded.
- A single active WebGL context; view switches dispose the previous renderer.
- Discovery derivation and high-volume normalization move to workers before adding aircraft or dense sensor networks.
- Persist bounded snapshots, never unlimited raw tracks.

## Release sequence

### Quality reset

- Replace dashboard-like Earth chrome with contextual sheets.
- Establish a polished dark vector basemap and coverage-aware imagery.
- Finish discovery selectivity, component scores, and evidence summarization.
- Make Observer searchable, saveable, and useful without permissions.

### Witness layer

- Ship Camera Registry, camera health checks, clustering, preview cards, and Portal.
- Start with official scientific, wildlife, buoy, and explicitly reusable transport feeds.
- Add camera-to-Signal proximity as an observation only.

### Living planet

- Add volcano, ocean buoy, flood gauge, smoke/AQI, cyclone, and aviation-weather providers.
- Introduce Storm, Fire, Seismic, Ocean, and Orbit Lenses.
- Add daylight terminator and local solar context calculated on-device.

### Deep investigation

- Ship transparent temporal baselines and “What changed?” explanations.
- Build source snapshots, case notes, replay, and portable Case export.
- Add a focused entity graph only where recurring entities add investigative value.

### Delight

- Portal diversity engine, curated “World in five minutes,” spatial audio/sonification as optional accessibility-aware ambience, shareable provenance cards, and home-screen quick actions.

