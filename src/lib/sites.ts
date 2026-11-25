/**
 * Site data + ranking for the USF Tampa campus.
 *
 * Geometry comes live from USF's public ArcGIS layers (buildings, parking lots),
 * the same sources the BULLS ECOOPS hackathon project used. Every number is a
 * screening estimate built from stated assumptions, not a measurement.
 */

import area from '@turf/area'
import type { Feature, FeatureCollection, Geometry } from 'geojson'

const ARC = 'https://services6.arcgis.com/eohpBf8Xt7P2A4up/ArcGIS/rest/services'
const LAYERS = {
  buildings: `${ARC}/USF_Building_Footprints/FeatureServer/1/query`,
  parking: `${ARC}/Parking_Lots_Garages/FeatureServer/1/query`,
}

/** Rough Tampa campus envelope (lon/lat). Keeps other USF campuses out. */
const TAMPA_BBOX = '-82.440,28.040,-82.390,28.090'

/** Assumptions shown in the UI so nobody mistakes estimates for measurements. */
export const ASSUMPTIONS = {
  annualRainMm: 1200, // Tampa long-run average, roughly 47 in/yr
  runoffRoof: 0.9,
  runoffLot: 0.8,
  lotRunoffHarvested: 0, // lot runoff carries oil and grit, so none of it counts as harvestable
  m2PerParkingSpace: 30, // one stall plus its share of the aisle; used when a lot lists no spaces
  solarKwhPerKwYear: 1500, // Florida typical yield
  panelKwPerM2: 0.2,
  usableRoof: 0.3, // setbacks, HVAC, shading
  usableLot: 0.6, // canopy over the lot's footprint
}

export type SiteKind = 'building' | 'lot'

export interface Site {
  id: string
  name: string
  kind: SiteKind
  areaM2: number
  waterGalPerYear: number
  solarKwhPerYear: number
  /** m2 of parked cars a canopy would shade (spaces x m2PerParkingSpace); 0 for roofs */
  shadeM2: number
  lon: number
  lat: number
}

export interface RankedSite extends Site {
  score: number
  parts: { water: number; solar: number; shade: number }
}

export interface Weights {
  water: number
  solar: number
  shade: number
}

export type SiteFeature = Feature<Geometry, Record<string, unknown>>

async function queryLayer(url: string): Promise<FeatureCollection> {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    f: 'geojson',
    outSR: '4326',
    geometry: TAMPA_BBOX,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
  })
  const res = await fetch(`${url}?${params}`)
  if (!res.ok) throw new Error(`ArcGIS request failed (${res.status})`)
  const json = (await res.json()) as FeatureCollection & { error?: { message?: string } }
  if (json.error) throw new Error(json.error.message ?? 'ArcGIS returned an error')
  return json
}

function bboxCenter(geometry: Geometry): [number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const [x, y] = c as number[]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    } else if (Array.isArray(c)) c.forEach(walk)
  }
  if ('coordinates' in geometry) walk(geometry.coordinates)
  return [(minX + maxX) / 2, (minY + maxY) / 2]
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export function buildSite(f: Feature, kind: SiteKind, i: number): { site: Site; feature: SiteFeature } | null {
  if (!f.geometry) return null
  const p = (f.properties ?? {}) as Record<string, unknown>
  const areaM2 = area(f)
  if (!(areaM2 > 20)) return null // ignore slivers

  const a = ASSUMPTIONS
  const rainM = a.annualRainMm / 1000
  // Water: only clean roof rain counts. Lots shed rain too, but it is not harvestable.
  const runoff = kind === 'building' ? a.runoffRoof : a.runoffLot * a.lotRunoffHarvested
  // Shade: how many cars a canopy covers. Use the lot's listed spaces, else estimate from area.
  const listedSpaces = typeof p.LOT_SPACES === 'number' && p.LOT_SPACES > 0 ? p.LOT_SPACES : 0
  const spaces = listedSpaces || areaM2 / a.m2PerParkingSpace
  const usable = kind === 'building' ? a.usableRoof : a.usableLot
  const name =
    kind === 'building'
      ? str(p.LONGNAME) || str(p.SHORTNAME) || str(p.BUILDINGID) || `Building ${i + 1}`
      : `Parking: ${[p.LOT_NUMBER ? `Lot ${p.LOT_NUMBER}` : '', str(p.BUILDING_NAME)].filter(Boolean).join(' near ') || str(p.LOT_ID) || `lot ${i + 1}`}`

  const [lon, lat] = bboxCenter(f.geometry)
  const site: Site = {
    id: `${kind}-${p.OBJECTID ?? p.OBJECTID_12 ?? i}`,
    name,
    kind,
    areaM2,
    waterGalPerYear: areaM2 * rainM * runoff * 264.172,
    solarKwhPerYear: areaM2 * usable * a.panelKwPerM2 * a.solarKwhPerKwYear,
    shadeM2: kind === 'lot' ? spaces * a.m2PerParkingSpace : 0,
    lon,
    lat,
  }
  return { site, feature: { ...f, properties: { ...p, siteId: site.id } } as SiteFeature }
}

export async function loadCampusSites(): Promise<{ sites: Site[]; features: SiteFeature[] }> {
  const [b, l] = await Promise.all([queryLayer(LAYERS.buildings), queryLayer(LAYERS.parking)])
  const sites: Site[] = []
  const features: SiteFeature[] = []
  const add = (fc: FeatureCollection, kind: SiteKind) =>
    fc.features.forEach((f, i) => {
      const built = buildSite(f, kind, i)
      if (built) {
        sites.push(built.site)
        features.push(built.feature)
      }
    })
  add(b, 'building')
  add(l, 'lot')
  return { sites, features }
}

/**
 * Percentile of each value among all values: the share of sites it beats.
 * Scaling by the largest site instead lets a few huge lots flatten everyone else,
 * so moving a slider barely reorders the list. Percentiles keep every weight meaningful.
 */
function percentiles(values: number[]): number[] {
  if (values.length < 2) return values.map(() => 0.5)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  if (lo === hi) return values.map(() => 0.5)
  return values.map((v) => values.filter((o) => o < v).length / (values.length - 1))
}

/** Clamp to 0-1 and renormalize so weights sum to 1 (equal if all zero). */
export function normalizeWeights(w: Weights): Weights {
  const c = {
    water: Math.min(1, Math.max(0, w.water)),
    solar: Math.min(1, Math.max(0, w.solar)),
    shade: Math.min(1, Math.max(0, w.shade)),
  }
  const total = c.water + c.solar + c.shade
  if (total === 0) return { water: 1 / 3, solar: 1 / 3, shade: 1 / 3 }
  return { water: c.water / total, solar: c.solar / total, shade: c.shade / total }
}

/** Percentile each metric across all sites, weight it, rank by 0-100 score. */
export function rankSites(sites: Site[], weights: Weights): RankedSite[] {
  if (!sites.length) return []
  const w = normalizeWeights(weights)
  const water = percentiles(sites.map((s) => s.waterGalPerYear))
  const solar = percentiles(sites.map((s) => s.solarKwhPerYear))
  const shade = percentiles(sites.map((s) => s.shadeM2))
  return sites
    .map((s, i) => ({
      ...s,
      score: Math.round(100 * (w.water * water[i] + w.solar * solar[i] + w.shade * shade[i]) * 10) / 10,
      parts: { water: water[i], solar: solar[i], shade: shade[i] },
    }))
    .sort((a, b) => b.score - a.score)
}

export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US')
