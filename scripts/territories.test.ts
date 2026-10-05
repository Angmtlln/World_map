import { describe, expect, it } from 'vitest'
import {
  assertIds,
  countryProps,
  inheritNames,
  regionProps,
  unappliedFixes,
  type RegionAttrs,
} from './territories.ts'

const region = (iso: string, name: string, name_ru = 'Имя', name_en = 'Name'): RegionAttrs => ({
  iso_3166_2: iso,
  name,
  name_ru,
  name_en,
})

describe('countryProps', () => {
  it('uses ISO_A3 when it is set', () => {
    const p = countryProps({
      ISO_A3: 'PSE',
      ADM0_A3: 'PSX',
      NAME_RU: 'Палестина',
      NAME_EN: 'Palestine',
    })
    expect(p).toEqual({ id: 'PSE', kind: 'country', name_ru: 'Палестина', name_en: 'Palestine' })
  })

  it('falls back to ADM0_A3 when ISO_A3 is -99', () => {
    const p = countryProps({ ISO_A3: '-99', ADM0_A3: 'FRA', NAME_RU: 'Франция', NAME_EN: 'France' })
    expect(p.id).toBe('FRA')
  })
})

describe('regionProps', () => {
  it('keeps ordinary regions as they are', () => {
    expect(regionProps(region('RU-TA', 'Tatarstan', 'Татарстан', 'Republic of Tatarstan'))).toEqual(
      {
        id: 'RU-TA',
        kind: 'region',
        name_ru: 'Татарстан',
        name_en: 'Republic of Tatarstan',
      },
    )
  })

  it('swaps the Moscow city and Moscow Oblast codes', () => {
    expect(regionProps(region('RU-MOS', 'Moskva')).id).toBe('RU-MOW')
    const oblast = regionProps(region('RU-MOW', 'Moskovskaya', 'Москва', 'Moscow'))
    expect(oblast).toMatchObject({
      id: 'RU-MOS',
      name_ru: 'Московская область',
      name_en: 'Moscow Oblast',
    })
  })

  it('fixes the names of Altai Krai', () => {
    const p = regionProps(region('RU-ALT', 'Altay', 'Республика Алтай', 'Altai Republic'))
    expect(p).toMatchObject({ name_ru: 'Алтайский край', name_en: 'Altai Krai' })
  })

  it('fails when Natural Earth changes a record a fix relies on', () => {
    expect(() => regionProps(region('RU-MOS', 'Moscow Oblast'))).toThrow(/expects NE name "Moskva"/)
  })
})

describe('inheritNames', () => {
  it('gives the nameless island the names of Yamalo-Nenets Okrug', () => {
    const island = regionProps(region('RU-X01~', '', '', ''))
    const yamal = regionProps(region('RU-YAN', 'Yamal-Nenets', 'ЯНАО', 'Yamalo-Nenets'))
    const [fixed] = inheritNames([island, yamal])
    expect(fixed).toMatchObject({ id: 'RU-YAN', name_ru: 'ЯНАО', name_en: 'Yamalo-Nenets' })
  })
})

describe('assertIds', () => {
  it('rejects a missing ISO code', () => {
    const bad = { id: '-99', kind: 'country' as const, name_ru: 'Х', name_en: 'X' }
    expect(() => assertIds([bad])).toThrow(/Bad territory id/)
  })

  it('rejects a territory without a name', () => {
    const bad = { id: 'RU-YAN', kind: 'region' as const, name_ru: '', name_en: '' }
    expect(() => assertIds([bad])).toThrow(/Missing name/)
  })
})

describe('unappliedFixes', () => {
  it('lists fixes whose region is absent from the data', () => {
    expect(unappliedFixes(['RU-MOS', 'RU-MOW', 'RU-ALT'])).toEqual(['RU-X01~'])
  })
})
