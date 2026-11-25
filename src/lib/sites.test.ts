import { describe, expect, it } from 'vitest'
import { normalizeWeights, rankSites, type Site } from './sites'

const site = (id: string, kind: Site['kind'], water: number, solar: number, shade: number): Site => ({
  id,
  name: id,
  kind,
  areaM2: 1000,
  waterGalPerYear: water,
  solarKwhPerYear: solar,
  shadeM2: shade,
  lon: -82.41,
  lat: 28.06,
})

// A: best for water. B: best for solar. C: a parking lot, the only one with shade.
const sites = [
  site('A', 'building', 1000, 100, 0),
  site('B', 'building', 100, 1000, 0),
  site('C', 'lot', 500, 500, 800),
]

describe('normalizeWeights', () => {
  it('rescales weights so they sum to 1', () => {
    const w = normalizeWeights({ water: 0.25, solar: 0.25, shade: 0.5 })
    expect(w.water + w.solar + w.shade).toBeCloseTo(1)
    expect(w.shade).toBeCloseTo(0.5)
  })

  it('falls back to equal weights when all are zero', () => {
    const w = normalizeWeights({ water: 0, solar: 0, shade: 0 })
    expect(w.water).toBeCloseTo(1 / 3)
    expect(w.solar).toBeCloseTo(1 / 3)
    expect(w.shade).toBeCloseTo(1 / 3)
  })

  it('clamps out-of-range weights to 0-1 before scaling', () => {
    const w = normalizeWeights({ water: 5, solar: -3, shade: 0 })
    expect(w.water).toBeCloseTo(1)
    expect(w.solar).toBeCloseTo(0)
  })
})

describe('rankSites', () => {
  it('ranks the best water site first when only water counts', () => {
    const ranked = rankSites(sites, { water: 1, solar: 0, shade: 0 })
    expect(ranked[0].id).toBe('A')
    expect(ranked[0].score).toBe(100)
  })

  it('changes the winner when the weights change', () => {
    expect(rankSites(sites, { water: 1, solar: 0, shade: 0 })[0].id).toBe('A')
    expect(rankSites(sites, { water: 0, solar: 1, shade: 0 })[0].id).toBe('B')
  })

  it('gives shade credit only to parking lots', () => {
    const ranked = rankSites(sites, { water: 0, solar: 0, shade: 1 })
    expect(ranked[0].id).toBe('C')
    expect(ranked.find((r) => r.id === 'A')?.score).toBe(0)
  })

  it('keeps every score between 0 and 100', () => {
    for (const r of rankSites(sites, { water: 0.5, solar: 0.3, shade: 0.2 })) {
      expect(r.score).toBeGreaterThanOrEqual(0)
      expect(r.score).toBeLessThanOrEqual(100)
    }
  })

  it('is not flattened by one huge outlier site', () => {
    const many = [
      site('HUGE', 'lot', 1_000_000, 1_000_000, 1_000_000),
      site('W', 'building', 300, 100, 0),
      site('S', 'building', 100, 300, 0),
      site('M', 'building', 200, 200, 0),
    ]
    const waterFirst = rankSites(many, { water: 1, solar: 0, shade: 0 }).map((r) => r.id)
    const solarFirst = rankSites(many, { water: 0, solar: 1, shade: 0 }).map((r) => r.id)
    expect(waterFirst.indexOf('W')).toBeLessThan(waterFirst.indexOf('S'))
    expect(solarFirst.indexOf('S')).toBeLessThan(solarFirst.indexOf('W'))
  })

  it('returns an empty list for no sites', () => {
    expect(rankSites([], { water: 1, solar: 1, shade: 1 })).toEqual([])
  })
})
