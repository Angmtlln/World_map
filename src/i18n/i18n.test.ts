import { describe, expect, it } from 'vitest'
import { formatDate, t } from '.'

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

describe('formatDate', () => {
  it('shows the camera date in Russian, without shifting the time zone', () => {
    // 23:30 on 31 December stays on the 31st wherever the browser is.
    expect(formatDate(Date.UTC(2023, 11, 31, 23, 30))).toMatch(/^31 декабря 2023/)
  })
})
