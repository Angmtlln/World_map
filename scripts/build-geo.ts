// Builds public/data/world.topo.json from Natural Earth 10m:
// countries (without Russia) + Russian regions, simplified together in one topology
// so shared borders stay identical. Run with `npm run geo`.

import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import mapshaper from 'mapshaper'
import {
  assertIds,
  countryProps,
  inheritNames,
  regionProps,
  RUSSIA_A3,
  unappliedFixes,
  type CountryAttrs,
  type Feature,
  type RegionAttrs,
  type TerritoryProps,
} from './territories.ts'

const NE_URL = 'https://naciscdn.org/naturalearth/10m/cultural'
const COUNTRIES = 'ne_10m_admin_0_countries'
const REGIONS = 'ne_10m_admin_1_states_provinces'
const DATA_DIR = 'data'
const OUT_DIR = 'public/data'
const OUT_FILE = 'world.topo.json'

// Share of vertices kept (Visvalingam, weighted). Tuned to fit MAX_BYTES.
const SIMPLIFY = '8%'
const QUANTIZATION = 1e5
const MAX_BYTES = 500 * 1024

interface FeatureCollection<P> {
  type: 'FeatureCollection'
  features: Feature<P>[]
}

async function download(name: string): Promise<string> {
  const path = `${DATA_DIR}/${name}.zip`
  if (existsSync(path)) return path
  console.log(`Downloading ${name}.zip`)
  const res = await fetch(`${NE_URL}/${name}.zip`)
  if (!res.ok) throw new Error(`Download of ${name} failed: HTTP ${res.status}`)
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(path, new Uint8Array(await res.arrayBuffer()))
  return path
}

async function readLayer<P>(zip: string, layer: string, filter: string) {
  const out = await mapshaper.applyCommands(
    `-i ${zip} -target ${layer} -filter '${filter}' -o format=geojson out.json`,
  )
  return JSON.parse(String(out['out.json'])) as FeatureCollection<P>
}

function withProps<P>(
  fc: FeatureCollection<P>,
  props: TerritoryProps[],
): FeatureCollection<TerritoryProps> {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f, i) => ({ ...f, properties: props[i] })),
  }
}

async function main() {
  const [countriesZip, regionsZip] = await Promise.all([download(COUNTRIES), download(REGIONS)])

  const rawCountries = await readLayer<CountryAttrs>(
    countriesZip,
    COUNTRIES,
    `ADM0_A3 !== "${RUSSIA_A3}"`,
  )
  const rawRegions = await readLayer<RegionAttrs>(regionsZip, REGIONS, `adm0_a3 === "${RUSSIA_A3}"`)

  const countryList = rawCountries.features.map((f) => countryProps(f.properties))
  const regionList = inheritNames(rawRegions.features.map((f) => regionProps(f.properties)))
  assertIds([...countryList, ...regionList])

  const missing = unappliedFixes(rawRegions.features.map((f) => f.properties.iso_3166_2))
  if (missing.length) throw new Error(`Region fixes not applied: ${missing.join(', ')}`)

  const countryIds = new Set(countryList.map((p) => p.id))
  if (countryIds.size !== countryList.length) throw new Error('Duplicate country ids')

  const out = await mapshaper.applyCommands(
    [
      '-i countries.json regions.json combine-files',
      '-target regions -dissolve id copy-fields=kind,name_ru,name_en',
      `-simplify ${SIMPLIFY} weighted keep-shapes`,
      `-o target=* format=topojson id-field=id quantization=${QUANTIZATION} ${OUT_FILE}`,
    ].join(' '),
    {
      'countries.json': withProps(rawCountries, countryList),
      'regions.json': withProps(rawRegions, regionList),
    },
  )

  const topojson = String(out[OUT_FILE])
  const bytes = Buffer.byteLength(topojson)
  if (bytes > MAX_BYTES) {
    throw new Error(
      `Output is ${Math.round(bytes / 1024)} KB, over ${MAX_BYTES / 1024} KB; lower SIMPLIFY`,
    )
  }
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(`${OUT_DIR}/${OUT_FILE}`, topojson)

  const regionCount = new Set(regionList.map((p) => p.id)).size
  console.log(`Countries: ${countryList.length}, Russian regions: ${regionCount}`)
  console.log(`Wrote ${OUT_DIR}/${OUT_FILE}: ${(bytes / 1024).toFixed(0)} KB`)
}

await main()
