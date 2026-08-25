import { describe, expect, it } from 'vitest'
import type { Signal } from '../types/signal'
import { allLayerIds, layerPresets, livingEarthLayerIds, signalLayerId, visibleWithLayers } from './layers'

const signal = (provider: string, type: Signal['type']): Signal => ({
  id: `${provider}-${type}`,
  source: { provider, retrievedAt: 1, freshness: 'live' },
  type,
  title: 'Test',
  timestamp: 1,
  attributes: {},
  provenance: [],
})

describe('composable Earth layers', () => {
  it('separates a calm Living Earth preset from the power-user everything collection', () => {
    expect(new Set(allLayerIds).size).toBe(allLayerIds.length)
    expect(layerPresets.world).toEqual(livingEarthLayerIds)
    expect(layerPresets.world.length).toBeLessThan(allLayerIds.length)
    expect(allLayerIds).toEqual(expect.arrayContaining(layerPresets.world))
  })

  it('adds contextual atmosphere to migration without making it exclusive', () => {
    expect(layerPresets.migration).toEqual(expect.arrayContaining(['migration', 'life', 'clouds', 'weather-alerts']))
  })

  it('routes provider-specific phenomena before generic signal categories', () => {
    expect(signalLayerId(signal('openfema', 'environment'))).toBe('fema')
    expect(signalLayerId(signal('nhc', 'weather'))).toBe('storms')
    expect(signalLayerId(signal('nws', 'weather'))).toBe('weather-alerts')
  })

  it('preserves independent compatible signals in one enabled set', () => {
    const enabled = new Set(layerPresets.world)
    expect(visibleWithLayers(signal('openfema', 'environment'), enabled)).toBe(true)
    expect(visibleWithLayers(signal('usgs', 'earthquake'), enabled)).toBe(true)
    expect(visibleWithLayers(signal('nws', 'weather'), enabled)).toBe(true)
  })
})
