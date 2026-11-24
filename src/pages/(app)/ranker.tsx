/**
 * Campus site ranker. Public on purpose: the map and ranking need no account.
 * Saving a shortlist, drafting proposals and emailing them need sign-in.
 */

import { useEffect, useMemo, useState } from 'react'
import CampusMap from '@/components/CampusMap'
import ShortlistPanel from '@/components/ShortlistPanel'
import {
  ASSUMPTIONS,
  fmt,
  loadCampusSites,
  normalizeWeights,
  rankSites,
  type Site,
  type SiteFeature,
  type Weights,
} from '@/lib/sites'

const SLIDERS: { key: keyof Weights; label: string; hint: string }[] = [
  { key: 'water', label: 'Rainwater harvest', hint: 'Catchment area x Tampa rainfall' },
  { key: 'solar', label: 'Solar output', hint: 'Usable roof or canopy area' },
  { key: 'shade', label: 'Shade for people', hint: 'Parking lots only (hot asphalt)' },
]

export default function RankerPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [features, setFeatures] = useState<SiteFeature[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [weights, setWeights] = useState<Weights>({ water: 0.5, solar: 0.3, shade: 0.2 })
  const [kind, setKind] = useState<'all' | 'building' | 'lot'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    loadCampusSites()
      .then((d) => {
        if (!alive) return
        setSites(d.sites)
        setFeatures(d.features)
        setStatus('ready')
      })
      .catch((e: unknown) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Could not load campus data')
        setStatus('error')
      })
    return () => {
      alive = false
    }
  }, [])

  const ranked = useMemo(() => rankSites(sites, weights), [sites, weights])
  const visible = useMemo(() => ranked.filter((r) => kind === 'all' || r.kind === kind), [ranked, kind])
  const selected = ranked.find((r) => r.id === selectedId) ?? null
  const norm = normalizeWeights(weights)

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Where should USF Tampa harvest water and make shade first?</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Every campus building roof and parking lot, ranked by how much rainwater it could capture and how much
          solar canopy it could carry. Drag the weights to change what matters, then shortlist sites and draft a proposal.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-5 rounded-lg border border-border bg-card p-4">
          <div className="space-y-4">
            {SLIDERS.map((s) => (
              <div key={s.key}>
                <div className="flex justify-between text-sm">
                  <label htmlFor={`w-${s.key}`} className="font-medium text-foreground">{s.label}</label>
                  <span className="tabular-nums text-muted-foreground">{Math.round(norm[s.key] * 100)}%</span>
                </div>
                <input
                  id={`w-${s.key}`}
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(weights[s.key] * 100)}
                  onChange={(e) => setWeights((w) => ({ ...w, [s.key]: Number(e.target.value) / 100 }))}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">{s.hint}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2 text-sm">
            {(['all', 'building', 'lot'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-md border px-3 py-1 ${kind === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'}`}
              >
                {k === 'all' ? 'All' : k === 'building' ? 'Roofs' : 'Lots'}
              </button>
            ))}
          </div>

          <ol className="max-h-[360px] space-y-1 overflow-y-auto pr-1 text-sm">
            {status === 'loading' && <li className="text-muted-foreground">Loading campus layers...</li>}
            {status === 'ready' && <li className="pb-1 text-xs text-muted-foreground">{features.length} roofs and lots loaded</li>}
            {status === 'error' && <li className="text-destructive">Could not load campus data: {error}</li>}
            {visible.slice(0, 25).map((r, i) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelectedId(r.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted ${selectedId === r.id ? 'bg-muted' : ''}`}
                >
                  <span className="truncate">{i + 1}. {r.name}</span>
                  <span className="tabular-nums text-muted-foreground">{r.score}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <section className="space-y-4">
          <div className="h-[460px]">
            <CampusMap features={features} ranked={ranked} selectedId={selectedId} onSelect={setSelectedId} />
          </div>

          {selected ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-lg font-semibold text-foreground">{selected.name}</h2>
              <p className="text-sm text-muted-foreground">
                {selected.kind === 'building' ? 'Roof' : 'Parking lot'} | score {selected.score}/100 | {fmt(selected.areaM2)} m2
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-muted-foreground">Rainwater (estimated)</dt><dd className="font-medium">{fmt(selected.waterGalPerYear)} gal/yr</dd></div>
                <div><dt className="text-muted-foreground">Solar (estimated)</dt><dd className="font-medium">{fmt(selected.solarKwhPerYear)} kWh/yr</dd></div>
              </dl>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Click a roof or lot on the map, or pick one from the list.</p>
          )}

          <ShortlistPanel selected={selected} />
        </section>
      </div>

      <footer className="rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">How to read these numbers</p>
        <p className="mt-1">
          Areas are measured from USF's public ArcGIS footprints. Everything else is an assumption: {ASSUMPTIONS.annualRainMm} mm
          of rain a year, {ASSUMPTIONS.runoffRoof} roof and {ASSUMPTIONS.runoffLot} lot runoff, {fmt(ASSUMPTIONS.solarKwhPerKwYear)} kWh
          per kW per year, {ASSUMPTIONS.usableRoof * 100}% of a roof and {ASSUMPTIONS.usableLot * 100}% of a lot usable for solar.
          Scores are relative rankings, not engineering designs.
        </p>
      </footer>
    </div>
  )
}
