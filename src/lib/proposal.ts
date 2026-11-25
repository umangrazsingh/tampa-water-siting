/**
 * The three DeepSpace integrations this app uses:
 *  - openweathermap/forecast : 5-day Tampa outlook, quoted in the proposal
 *  - anthropic/chat-completion : drafts the proposal text
 *  - email/send : emails the proposal to the signed-in user
 * Request shapes checked against `npx deepspace integrations info <name>`
 */

import { integration } from 'deepspace'
import { ASSUMPTIONS } from '@/lib/sites'

interface SavedSite {
  name: string
  kind: string
  score: number
  waterGalPerYear: number
  solarKwhPerYear: number
}

function unwrap<T>(res: { success?: boolean; data?: T; error?: string }): T {
  if (res.success === false) throw new Error(res.error ?? 'Integration call failed')
  return (res.data ?? (res as unknown as T)) as T
}

export interface RainOutlook {
  rainySteps: number
  totalSteps: number
}

/**
 * The forecast endpoint returns temp, humidity and a text description per 3-hour
 * step, with no rainfall amount. So we count the steps described as rain and
 * report that, instead of inventing a millimeter figure.
 */
export async function getRainOutlook(): Promise<RainOutlook> {
  const res = await integration.post<unknown>('openweathermap/forecast', { q: 'Tampa,US', units: 'imperial' })
  const data = unwrap<unknown>(res as never)
  const list = (Array.isArray(data) ? data : ((data as Record<string, unknown>)?.list ?? [])) as Array<{ description?: string }>
  if (!list.length) throw new Error('Forecast returned no entries')
  const rainySteps = list.filter((e) => /rain|drizzle|thunder|shower/i.test(e.description ?? '')).length
  return { rainySteps, totalSteps: list.length }
}

function pullText(data: unknown): string {
  const d = data as Record<string, any>
  return (
    d?.content?.[0]?.text ??
    d?.text ??
    d?.choices?.[0]?.message?.content ??
    d?.message?.content ??
    d?.output ??
    ''
  )
}

export async function draftProposal(site: SavedSite, outlook: RainOutlook | null): Promise<string> {
  const a = ASSUMPTIONS
  const concept =
    site.kind === 'building'
      ? 'Concept to evaluate: rooftop solar plus a rainwater cistern fed from the roof'
      : 'Concept to evaluate: solar parking canopy for shade'
  const facts = [
    'Location: USF Tampa campus, Tampa, Florida (hot, humid, no snow)',
    concept,
    `Site: ${site.name} (${site.kind === 'building' ? 'building roof' : 'parking lot'}), USF Tampa campus`,
    `Screening score: ${site.score}/100 (relative ranking among campus roofs and lots)`,
    // Lots harvest no water (lotRunoffHarvested is 0), so only roofs get a rainwater line.
    ...(site.kind === 'building'
      ? [`Estimated rainwater capture: ${Math.round(site.waterGalPerYear)} gallons/year (assumed ${a.annualRainMm} mm rain, runoff ${a.runoffRoof})`]
      : []),
    `Estimated solar output: ${Math.round(site.solarKwhPerYear)} kWh/year (assumed ${a.solarKwhPerKwYear} kWh per kW, ${site.kind === 'building' ? a.usableRoof : a.usableLot} of area usable)`,
    outlook == null
      ? 'Five-day Tampa forecast: unavailable'
      : `Five-day Tampa forecast: rain is expected in ${outlook.rainySteps} of ${outlook.totalSteps} three-hour periods (no rainfall amounts available)`,
  ].join('\n')

  const res = await integration.post<unknown>('anthropic/chat-completion', {
    model: 'claude-haiku-4-5',
    max_tokens: 700,
    system:
      'You write short, plain facilities proposals for a university sustainability office. Use ONLY the facts given. Describe only the concept given; do not add other designs such as permeable paving. Do not mention goals, programs, weather hazards, or maintenance chores. Do not describe the visibility, activity, surroundings or neighbors of the site; the only facts about the site are the ones listed. Do not state anything about sun exposure, orientation, EV charging, percentages of runoff reduced, costs, payback, vendors or incentives unless it appears in the facts. Label every figure as an estimate. If a fact is missing, put it under "What to verify first" instead of guessing. Plain text only, no code fences, under 250 words. Sections: Why this site, What we would build, Expected benefit, What to verify first.',
    messages: [{ role: 'user', content: `Draft a one-page proposal for this site.\n\n${facts}` }],
  })
  const text = pullText(unwrap(res as never)).trim()
  if (!text) throw new Error('The model returned no text')
  return text
}

export async function emailProposal(to: string, siteName: string, proposal: string): Promise<void> {
  const res = await integration.post('email/send', {
    to,
    subject: `Proposal draft: ${siteName}`,
    text: `${proposal}\n\nAll figures are screening estimates from the Tampa water siting tool.`,
  })
  unwrap(res as never)
}
