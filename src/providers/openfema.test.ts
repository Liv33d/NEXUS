import { describe, expect, it } from 'vitest'
import { normalizeOpenFema } from './openfema'

const record = (area: string, overrides: Record<string, unknown> = {}) => ({
  disasterNumber: 4999,
  state: 'PR',
  declarationType: 'DR',
  declarationDate: '2026-08-20T12:00:00Z',
  incidentType: 'Flood',
  declarationTitle: 'TEST FLOOD',
  incidentBeginDate: '2026-08-19T00:00:00Z',
  incidentEndDate: null,
  designatedArea: area,
  fipsStateCode: '72',
  fipsCountyCode: null,
  ihProgramDeclared: false,
  iaProgramDeclared: false,
  paProgramDeclared: true,
  hmProgramDeclared: false,
  lastRefresh: '2026-08-21T00:00:00Z',
  ...overrides,
})

describe('OpenFEMA normalization', () => {
  it('fuses designated areas into one declaration context', () => {
    const [signal] = normalizeOpenFema({ DisasterDeclarationsSummaries: [record('Caguas Municipio'), record('Ponce Municipio')] }, Date.parse('2026-08-21T12:00:00Z'))
    expect(signal?.source.provider).toBe('openfema')
    expect(signal?.attributes.designatedAreas).toEqual(['Caguas Municipio', 'Ponce Municipio'])
    expect(signal?.attributes.assistancePrograms).toContain('Public assistance')
    expect(signal?.location?.accuracy).toBe(500_000)
    expect(signal?.summary).toContain('Caguas Municipio and Ponce Municipio')
    expect(signal?.provenance[0]?.description).toContain('state or territory center')
  })
})
