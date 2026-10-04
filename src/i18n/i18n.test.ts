import { describe, expect, it } from 'vitest'
import { t } from '.'

describe('t', () => {
  it('returns the Russian string for a key', () => {
    expect(t('appTitle')).toBe('Фотокарта мира')
  })
})
