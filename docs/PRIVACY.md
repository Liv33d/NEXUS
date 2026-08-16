# Privacy

NEXUS has no account, analytics, advertising, tracker, or telemetry requirement. Application state, cached Signals, saved Discoveries, and Cases are stored in the browser’s local IndexedDB.

Observer Mode explains the purpose of location access before requesting permission. Coordinates are used locally to filter nearby public Signals and request on-demand weather context from Open‑Meteo; NEXUS does not operate a location backend. A user may also search for a place without granting location access. Saved Observer points remain in local browser storage. The browser and upstream public data sources retain their own policies.

External data is treated as untrusted. Provider payloads are validated, strings render through React escaping, external URLs are protocol-checked, and datasets are bounded before visualization.

The Storage screen reports local usage and includes a confirmed erase action. Erasing local data removes cached provider responses, Signals, saved Cases, credentials, settings, and saved Observer points from that browser. Bounded retention and automatic pruning prevent live data from growing without limit.
