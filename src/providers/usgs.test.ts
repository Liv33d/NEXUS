import { describe, expect, it } from 'vitest'
import { normalizeUsgs } from './usgs'

describe('USGS normalization', () => {
  it('normalizes a GeoJSON feature into a traceable signal', () => {
    const [signal] = normalizeUsgs({ features:[{ id:'abc', properties:{mag:4.2,place:'Test Region',time:1000,updated:1200,url:'https://earthquake.usgs.gov/event/abc',title:'M 4.2 - Test Region',felt:2,cdi:null,mmi:null,alert:null,status:'reviewed',tsunami:0,sig:300,type:'earthquake'}, geometry:{type:'Point',coordinates:[-82,28,10]} }] }, 2000)
    expect(signal?.id).toBe('usgs-abc')
    expect(signal?.location?.h3Index).toBeTruthy()
    expect(signal?.provenance[0]?.label).toBe('OFFICIAL_SOURCE')
  })
})
