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

const SLIDERS: { key: keyof Weights; label: string; hint: string; color: string }[] = [
  { key: 'water', label: 'Rainwater harvest', hint: 'Roof catchment x Tampa rainfall', color: '#55C8F5' },
  { key: 'solar', label: 'Solar output', hint: 'Usable roof or canopy area', color: '#F3C66D' },
  { key: 'shade', label: 'Shade for people', hint: 'Parking spaces a canopy would cover', color: '#54E6A5' },
]

const COLOR = { water: '#55C8F5', solar: '#F3C66D', shade: '#54E6A5' }

const PRESETS: { label: string; w: Weights }[] = [
  { label: 'Balanced', w: { water: 0.34, solar: 0.33, shade: 0.33 } },
  { label: 'Water', w: { water: 0.7, solar: 0.15, shade: 0.15 } },
  { label: 'Energy', w: { water: 0.15, solar: 0.7, shade: 0.15 } },
  { label: 'Heat relief', w: { water: 0.15, solar: 0.15, shade: 0.7 } },
]
const DEFAULT_WEIGHTS: Weights = { water: 0.5, solar: 0.3, shade: 0.2 }

/** A thin bar filled to `pct` (0-100). */
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: color,
          boxShadow: `0 0 6px ${color}66`,
        }}
      />
    </div>
  )
}

/** One stat tile in the details card. */
function Stat({ label, value, note, color, pct }: { label: string; value: string; note: string; color: string; pct: number }) {
  return (
    <div className="rounded-md border border-[#343B36] bg-[#252A27]/60 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
        {label}
      </div>
      <div className="mt-2 font-mono text-base font-semibold tabular-nums text-[#E8ECE9]">{value}</div>
      <div className="mb-3 text-xs text-muted-foreground">{note}</div>
      <Bar pct={pct} color={color} />
    </div>
  )
}

export default function RankerPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [features, setFeatures] = useState<SiteFeature[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS)
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
    <div className="min-h-full bg-[#101211]"><div className="mx-auto max-w-[1600px] space-y-5 px-4 py-5 sm:px-6">
      <header>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#54E6A5]">USF Tampa · Siting analysis</div>
        <h1 className="mt-1 text-xl font-semibold text-[#E8ECE9]">Where should campus harvest water, generate solar and add shade first?</h1>
        <p className="mt-1 text-sm text-[#8A968E]">Set priorities, compare sites on the map, then shortlist and draft a proposal.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-5 rounded-lg border border-[#343B36] bg-[#191C1A] p-4">
          <div className="space-y-4">
            {SLIDERS.map((s) => (
              <div key={s.key}>
                <div className="flex items-center justify-between text-sm">
                  <label htmlFor={`w-${s.key}`} className="flex items-center gap-2 font-medium text-foreground">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}88` }} />
                    {s.label}
                  </label>
                  <span className="font-mono text-xs font-semibold tabular-nums" style={{ color: s.color }}>{Math.round(norm[s.key] * 100)}%</span>
                </div>
                <input
                  id={`w-${s.key}`}
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(weights[s.key] * 100)}
                  onChange={(e) => setWeights((w) => ({ ...w, [s.key]: Number(e.target.value) / 100 }))}
                  className="w-full"
                  style={{ accentColor: s.color }}
                />
                <p className="text-xs text-muted-foreground">{s.hint}</p>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8A968E]">Presets</span>
              <button onClick={() => setWeights(DEFAULT_WEIGHTS)} className="text-xs text-[#8A968E] hover:text-[#E8ECE9]">
                Reset
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setWeights(p.w)}
                  className="rounded-md border border-[#343B36] bg-[#252A27] px-2 py-1.5 text-xs text-[#C9D1CB] transition-colors duration-150 hover:border-[#54E6A5]/60 hover:text-[#E8ECE9]"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 text-sm">
            {(['all', 'building', 'lot'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-md border px-3 py-1 ${kind === k ? 'border-[#54E6A5]/70 bg-[#54E6A5]/15 text-[#54E6A5]' : 'border-[#343B36] text-[#C9D1CB] hover:text-[#E8ECE9]'}`}
              >
                {k === 'all' ? 'All' : k === 'building' ? 'Roofs' : 'Lots'}
              </button>
            ))}
          </div>

          <ol className="max-h-[420px] space-y-1 overflow-y-auto pr-1 text-sm">
            {status === 'loading' && <li className="text-muted-foreground">Loading campus layers...</li>}
            {status === 'ready' && <li className="pb-1 text-xs text-muted-foreground">{features.length} roofs and lots loaded</li>}
            {status === 'error' && <li className="text-destructive">Could not load campus data: {error}</li>}
            {visible.slice(0, 25).map((r, i) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full rounded-md px-2 py-1.5 text-left hover:bg-muted ${selectedId === r.id ? 'bg-[#252A27] ring-1 ring-inset ring-[#54E6A5]/60' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}.</span>
                      <span className="truncate">{r.name}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-[#E8ECE9]">{r.score.toFixed(1)}</span>
                  </div>
                  <div className="mt-1 pl-6">
                    <Bar pct={r.score} color="#54E6A5" />
                  </div>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <section className="space-y-4">
          <div className="flex flex-col gap-4 rounded-lg border border-[#343B36] bg-[#191C1A] px-4 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Weighting</div>
              <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
                {SLIDERS.map((sl) => (
                  <div
                    key={sl.key}
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${norm[sl.key] * 100}%`, background: sl.color, boxShadow: `0 0 8px ${sl.color}` }}
                  />
                ))}
              </div>
              <div className="mt-2 flex gap-4 text-xs">
                {SLIDERS.map((sl) => (
                  <span key={sl.key} className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: sl.color, boxShadow: `0 0 6px ${sl.color}` }} />
                    {sl.key === 'water' ? 'Water' : sl.key === 'solar' ? 'Solar' : 'Shade'}
                    <span className="font-semibold tabular-nums text-foreground">{Math.round(norm[sl.key] * 100)}%</span>
                  </span>
                ))}
              </div>
            </div>
            {visible[0] && (
              <button
                onClick={() => setSelectedId(visible[0].id)}
                className="flex min-w-0 items-center gap-3 border-[#343B36] text-left sm:max-w-[45%] sm:border-l sm:pl-4"
              >
                <div className="min-w-0">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Top pick</div>
                  <div className="truncate text-sm font-medium text-foreground hover:underline">{visible[0].name}</div>
                </div>
                <span
                  className="shrink-0 rounded-md px-2 py-1 font-mono text-sm font-semibold tabular-nums text-[#54E6A5]"
                  style={{ background: '#54E6A51a', boxShadow: 'inset 0 0 0 1px #54E6A555' }}
                >
                  {visible[0].score}
                </span>
              </button>
            )}
          </div>

          <div className="h-[560px]">
            <CampusMap features={features} ranked={ranked} selectedId={selectedId} onSelect={setSelectedId} />
          </div>

          {selected ? (
            <div className="rounded-lg border border-[#343B36] bg-[#191C1A] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-foreground">{selected.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selected.kind === 'building' ? 'Roof' : 'Parking lot'} · {fmt(selected.areaM2)} m²
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-3xl font-semibold tabular-nums text-[#54E6A5]">{selected.score.toFixed(1)}</div>
                  <div className="text-xs text-muted-foreground">score / 100</div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Stat
                  label="Rainwater"
                  value={selected.kind === 'building' ? `${fmt(selected.waterGalPerYear)} gal/yr` : 'None counted'}
                  note={selected.kind === 'building' ? 'from the roof' : 'lot runoff is not harvestable'}
                  color={COLOR.water}
                  pct={selected.parts.water * 100}
                />
                <Stat
                  label="Solar"
                  value={`${fmt(selected.solarKwhPerYear)} kWh/yr`}
                  note={selected.kind === 'building' ? 'rooftop panels' : 'canopy over the lot'}
                  color={COLOR.solar}
                  pct={selected.parts.solar * 100}
                />
                <Stat
                  label="Shade"
                  value={selected.kind === 'lot' ? `${fmt(selected.shadeM2 / ASSUMPTIONS.m2PerParkingSpace)} spaces` : 'Not counted'}
                  note={selected.kind === 'lot' ? 'parking spaces covered' : 'roofs give no public shade'}
                  color={COLOR.shade}
                  pct={selected.parts.shade * 100}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">All figures are estimates. Bars show how this site compares with every other site on campus.</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Click a roof or lot on the map, or pick one from the list.</p>
          )}

          <ShortlistPanel selected={selected} />
        </section>
      </div>

      <footer className="rounded-lg border border-[#343B36] bg-[#191C1A] p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">How to read these numbers</p>
        <p className="mt-1">
          Areas are measured from USF's public ArcGIS footprints. Everything else is an assumption: {ASSUMPTIONS.annualRainMm} mm
          of rain a year, {ASSUMPTIONS.runoffRoof} roof and {ASSUMPTIONS.runoffLot} lot runoff, {fmt(ASSUMPTIONS.solarKwhPerKwYear)} kWh
          per kW per year, {ASSUMPTIONS.usableRoof * 100}% of a roof and {ASSUMPTIONS.usableLot * 100}% of a lot usable for solar.
          Lots count no harvestable water, and shade counts parking spaces ({ASSUMPTIONS.m2PerParkingSpace} m² each when a lot lists none).
          Scores are relative rankings, not engineering designs.
        </p>
      </footer>
    </div></div>
  )
}
