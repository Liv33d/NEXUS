import { describe, expect, it } from 'vitest'
import { validateSignal } from './signal'

describe('validateSignal', () => {
  it('adds an H3 index to valid located signals', () => {
    const signal = validateSignal({ id:'x', source:{provider:'test',retrievedAt:1,freshness:'demo'}, type:'earthquake', title:'Test', timestamp:1, location:{latitude:27.95,longitude:-82.46}, attributes:{}, provenance:[{label:'DEMO_DATA',description:'test'}] })
    expect(signal.location?.h3Index).toMatch(/^[0-9a-f]+$/)
  })
  it('rejects invalid coordinates', () => {
    expect(() => validateSignal({ id:'x', source:{provider:'test',retrievedAt:1,freshness:'demo'}, type:'earthquake', title:'Test', timestamp:1, location:{latitude:127,longitude:0}, attributes:{}, provenance:[] })).toThrow()
  })
})
