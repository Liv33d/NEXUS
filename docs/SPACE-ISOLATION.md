# Space isolation

The Solar System renderer is preserved in `src/components/SolarSystemView.tsx` and its calculation helpers remain covered by unit tests, but it is intentionally absent from production navigation.

Earth camera altitude is exclusively geographic state. `GlobeView` must never trigger a route, renderer replacement, or Space experience from pinch or wheel zoom. This is protected by the mobile layout contract test.

If Space returns, it must be loaded from an explicit destination outside the Earth gesture lifecycle. It may share normalized entities and Observer orbital-pass calculations, but it must not own Earth camera state, register listeners on Earth controls, or cause the Earth renderer to unmount during ordinary zoom.
