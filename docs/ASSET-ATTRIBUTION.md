# Asset and map attribution

NEXUS keeps attribution visible in the map and records bundled visual sources here.

| Asset or service | Source | Use |
|---|---|---|
| Earth surface texture | NASA EOSDIS GIBS `BlueMarble_ShadedRelief_Bathymetry` | Bundled globe texture; NASA/U.S. government source imagery |
| Radar tiles | NOAA/NWS MRMS base reflectivity MapServer | Optional live 2D context layer |
| Low-zoom raster enhancement | OpenFreeMap / Natural Earth | Connected Earth reference; in-map attribution retained |
| Offline country geometry | Natural Earth 1:110m Admin 0 countries | Public-domain, bundled 2D fallback geometry |
| Terrain relief and star field | `vasturiano/three-globe` example assets | Bundled globe presentation assets from an MIT-licensed repository |

Provider or tile attribution must not be hidden, removed from the map, or obscured by NEXUS controls.
# Geographic data

- Globe country boundaries and populated-place labels: Natural Earth, public domain, transformed from the 1:110m countries and 1:10m populated-places datasets.
