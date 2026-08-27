import { describe, expect, it } from 'vitest'
import { heroCardScenarios, heroScenario } from './heroCardScenarios'

describe('development-only Hero Card scenarios', () => {
  it('builds complete normalized intelligence objects from deterministic fixtures', () => {
    for (const scenario of heroCardScenarios) {
      const object = scenario.build()
      expect(object.domain).toBe(scenario.expected.domain)
      expect(object.title).toBe(scenario.expected.title)
      expect(object.summary.length).toBeGreaterThan(20)
      expect(object.methodology.length).toBeGreaterThan(20)
      expect(object.provenance[0]?.label).toBe('DEMO_DATA')
      expect(object.sourceSignal).toBeUndefined()
      if ('evidence' in scenario.expected) expect(object.evidence).toBe(scenario.expected.evidence)
      if (scenario.expected.mediaPolicy === 'licensed-fixture') {
        expect(object.media.length).toBeGreaterThan(0)
        expect(object.media.every((item) => item.license === 'CC0-1.0' && item.attribution.includes('NEXUS test suite'))).toBe(true)
      }
      else expect(object.media).toEqual([])
      expect(object.sourceUrl).toBeUndefined()
      expect(object.provenance).toHaveLength(1)
      expect(object.provenance[0]?.description).toContain('not a provider record')
    }
  })

  it('keeps the bird common name first without inventing movement', () => {
    const bird = heroScenario('bird').build()
    expect(bird.title).toBe('Gray-cheeked Thrush')
    expect(bird.scientificName).toBe('Catharus minimus')
    expect(bird.status).toBe('recent')
    expect(bird.movement).toBeUndefined()
    expect(bird.methodology).toContain('does not infer migration')
  })

  it('does not make unsupported flagship claims', () => {
    const hurricane = heroScenario('hurricane').build()
    expect(hurricane.status).toBe('forecast')
    expect(`${hurricane.summary} ${hurricane.facts.map((fact) => fact.value).join(' ')}`).not.toMatch(/category|mph|pressure|model agreement/i)
    const volcano = heroScenario('volcano').build()
    expect(volcano.facts).toEqual(expect.arrayContaining([{ label: 'Alert level', value: 'WATCH' }, { label: 'Aviation color', value: 'ORANGE' }]))
    expect(volcano.media).toEqual([])
    const place = heroScenario('place').build()
    expect(place.status).toBe('historical')
    expect(place.summary).not.toMatch(/currently|live weather/i)
  })

  it('separates an observed thermal anomaly from corroborated possible fire activity', () => {
    const unknown = heroScenario('fire-unclassified').build()
    const corroborated = heroScenario('fire-corroborated').build()
    expect(unknown.title).toBe('Unclassified thermal anomaly')
    expect(unknown.summary).toContain('not have enough corroborating evidence')
    expect(corroborated.title).toBe('Possible fire activity')
    expect(corroborated.evidence).toBe('possible')
    expect(corroborated.methodology).toContain('proximity does not prove causation')
  })
})
