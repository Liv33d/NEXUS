import { describe, expect, it } from 'vitest'
import { selectVernacularName } from './gbifPresentation'

const names = [
  { vernacularName: 'Paruline flamboyante', language: 'fra' },
  { vernacularName: 'American Redstart', language: 'eng' },
  { vernacularName: 'Candelita', language: 'spa', country: 'PR' },
  { vernacularName: 'Pavito migratorio', language: 'spa' },
]

describe('GBIF common-name localization', () => {
  it('maps browser language tags to GBIF ISO 639-3 codes', () => {
    expect(selectVernacularName(names, 'en-US')).toBe('American Redstart')
    expect(selectVernacularName(names, 'fr-FR')).toBe('Paruline flamboyante')
  })

  it('prefers an available country-specific name before the base language', () => {
    expect(selectVernacularName(names, 'es-PR')).toBe('Candelita')
    expect(selectVernacularName(names, 'es-MX')).toBe('Pavito migratorio')
  })

  it('falls back to English rather than inventing a localized name', () => {
    expect(selectVernacularName(names, 'is-IS')).toBe('American Redstart')
  })

  it('rejects checklist abbreviations that are not human names', () => {
    expect(selectVernacularName([{ vernacularName: 'BASW', language: 'eng' }, { vernacularName: 'Barn Swallow', language: 'eng' }], 'en-US')).toBe('Barn Swallow')
  })
})
