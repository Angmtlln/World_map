// Turns raw Natural Earth attributes into the small set of properties the app needs.
// Pure functions only, so the rules can be unit tested without the 20 MB source files.

export type Kind = 'country' | 'region'

export interface TerritoryProps {
  id: string
  kind: Kind
  name_ru: string
  name_en: string
}

export interface Feature<P> {
  type: 'Feature'
  properties: P
  geometry: unknown
}

export type CountryAttrs = Record<'ISO_A3' | 'ADM0_A3' | 'NAME_RU' | 'NAME_EN', string>
export type RegionAttrs = Record<'iso_3166_2' | 'name' | 'name_ru' | 'name_en', string>

export const RUSSIA_A3 = 'RUS'

// Natural Earth 5.1.1 errors in the Russian regions. Each fix names the NE `name` it
// expects, so the build fails loudly if a future NE release changes these records.
interface RegionFix {
  name: string
  set: Partial<TerritoryProps>
}

const REGION_FIXES: Record<string, RegionFix> = {
  // ISO 3166-2: RU-MOW is the city of Moscow, RU-MOS is Moscow Oblast. NE has them swapped.
  'RU-MOS': { name: 'Moskva', set: { id: 'RU-MOW' } },
  'RU-MOW': {
    name: 'Moskovskaya',
    set: { id: 'RU-MOS', name_ru: 'Московская область', name_en: 'Moscow Oblast' },
  },
  // Altai Krai carries the names of its neighbour, the Altai Republic.
  'RU-ALT': { name: 'Altay', set: { name_ru: 'Алтайский край', name_en: 'Altai Krai' } },
  // A nameless 37 km² island in Baydaratskaya Bay; it belongs to Yamalo-Nenets Okrug.
  'RU-X01~': { name: '', set: { id: 'RU-YAN' } },
}

export function countryProps(a: CountryAttrs): TerritoryProps {
  // ISO_A3 is -99 for France, Norway, Kosovo and a few special areas; ADM0_A3 is always set.
  const id = a.ISO_A3 !== '-99' ? a.ISO_A3 : a.ADM0_A3
  return { id, kind: 'country', name_ru: a.NAME_RU, name_en: a.NAME_EN }
}

export function regionProps(a: RegionAttrs): TerritoryProps {
  const props: TerritoryProps = {
    id: a.iso_3166_2,
    kind: 'region',
    name_ru: a.name_ru,
    name_en: a.name_en,
  }
  const fix = REGION_FIXES[a.iso_3166_2]
  if (!fix) return props
  if (fix.name !== a.name) {
    throw new Error(`Fix for ${a.iso_3166_2} expects NE name "${fix.name}", got "${a.name}"`)
  }
  return { ...props, ...fix.set }
}

// Features that share an id after the fixes (the nameless island and Yamal) are merged
// later by the dissolve step. Give the nameless parts the names of their namesake first,
// so it does not matter which record the dissolve keeps.
export function inheritNames(props: TerritoryProps[]): TerritoryProps[] {
  const named = new Map(props.filter((p) => p.name_ru).map((p) => [p.id, p]))
  return props.map((p) => {
    const source = named.get(p.id)
    return p.name_ru || !source ? p : { ...p, name_ru: source.name_ru, name_en: source.name_en }
  })
}

export function assertIds(props: TerritoryProps[]): void {
  for (const p of props) {
    if (!p.id || p.id === '-99' || !/^[A-Z0-9-]+$/.test(p.id)) {
      throw new Error(`Bad territory id "${p.id}" (${p.name_en})`)
    }
    if (!p.name_ru || !p.name_en) {
      throw new Error(`Missing name for ${p.id}`)
    }
  }
}

export function unappliedFixes(regionIds: string[]): string[] {
  const seen = new Set(regionIds)
  return Object.keys(REGION_FIXES).filter((id) => !seen.has(id))
}
