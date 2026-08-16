# Privacy

NEXUS has no account, analytics, advertising, tracker, or telemetry requirement. Application state, cached Signals, saved Discoveries, and Cases are stored in the browser’s local IndexedDB.

Observer Mode explains the purpose of location access before requesting permission. Coordinates are used locally to filter nearby public Signals and are not transmitted by NEXUS. The browser and upstream public data sources retain their own policies.

External data is treated as untrusted. Provider payloads are validated, strings render through React escaping, external URLs are protocol-checked, and datasets are bounded before visualization.

An erase-local-data control and configurable retention are planned before the first stable release.
