# Signal schema

`Signal` is the stable internal contract between providers, persistence, analysis, and visualization.

Required fields identify the record, source, type, title, observation time, extensible attributes, and provenance. Location and geometry are optional because global and space-weather events are not naturally point events. Provider-specific semantics remain in `attributes`; shared semantics such as severity and confidence are normalized.

Severity is a display and prioritization input from 0–100. Confidence is a bounded 0–1 indication of source/record confidence. Neither is presented as statistical certainty. `source.freshness` distinguishes live, delayed, cached, and demo records.

Located Signals receive H3 cells at type-appropriate resolution. Aircraft and fire use finer cells than global context, while earthquakes use a regional resolution.
