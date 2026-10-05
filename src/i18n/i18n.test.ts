import { describe, expect, it } from 'vitest'
import { t } from '.'

describe('t', () => {
  it('returns the Russian string for a key', () => {
    expect(t('appTitle')).toBe('Фотокарта мира')
  })
})

describe('t with parameters', () => {
  it('fills in placeholders', () => {
    expect(t('processing', { done: 2, total: 5 })).toBe('Обрабатываем 2 из 5…')
  })

  it('leaves unknown placeholders as they are', () => {
    expect(t('photoCount', {})).toBe('{count} фото')
  })
})
