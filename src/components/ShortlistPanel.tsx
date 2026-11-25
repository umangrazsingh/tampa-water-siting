import { useState } from 'react'
import { AuthOverlay, useMutations, useQuery, useUser } from 'deepspace'
import { Button, useToast } from '@/components/ui'
import { fmt, type RankedSite } from '@/lib/sites'
import { draftProposal, emailProposal, getRainOutlook } from '@/lib/proposal'

interface Saved {
  siteId: string
  name: string
  kind: string
  score: number
  waterGalPerYear: number
  solarKwhPerYear: number
  proposal?: string
  ownerId: string
}

export default function ShortlistPanel({ selected }: { selected: RankedSite | null }) {
  const { user } = useUser()
  const toast = useToast()
  const [showAuth, setShowAuth] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const { records } = useQuery<Saved>('shortlist', { orderBy: 'createdAt', orderDir: 'desc' })
  const { ready, createConfirmed, putConfirmed, removeConfirmed } = useMutations<Saved>('shortlist')

  if (!user) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <p className="font-medium text-foreground">Your shortlist</p>
        <p className="mt-1 text-muted-foreground">Sign in to save sites, draft proposals and email them.</p>
        <Button className="mt-3" onClick={() => setShowAuth(true)}>Sign in</Button>
        {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
      </div>
    )
  }

  const alreadySaved = selected ? records.some((r) => r.data.siteId === selected.id) : false

  const save = async () => {
    if (!selected) return
    try {
      await createConfirmed({
        siteId: selected.id,
        name: selected.name,
        kind: selected.kind,
        score: selected.score,
        waterGalPerYear: Math.round(selected.waterGalPerYear),
        solarKwhPerYear: Math.round(selected.solarKwhPerYear),
        ownerId: user.id,
      })
      toast.success('Saved', `${selected.name} added to your shortlist.`)
    } catch (e) {
      toast.error('Could not save', e instanceof Error ? e.message : 'Try again.')
    }
  }

  const draft = async (rec: { recordId: string; data: Saved }) => {
    setBusyId(rec.recordId)
    try {
      let outlook: Awaited<ReturnType<typeof getRainOutlook>> | null = null
      let outlookNote: string
      try {
        outlook = await getRainOutlook()
        outlookNote = `Five-day Tampa outlook (OpenWeatherMap): rain is forecast in ${outlook.rainySteps} of ${outlook.totalSteps} three-hour periods.`
      } catch (e) {
        console.warn('[forecast]', e)
        const why = e instanceof Error ? e.message : 'unknown error'
        outlookNote = `Five-day Tampa outlook: unavailable (${why}).`
        toast.warning('Rain forecast unavailable', why)
      }
      const text = `${await draftProposal(rec.data, outlook)}\n\n${outlookNote}`
      await putConfirmed(rec.recordId, { proposal: text })
      setOpenId(rec.recordId)
    } catch (e) {
      toast.error('Could not draft proposal', e instanceof Error ? e.message : 'Try again.')
    } finally {
      setBusyId(null)
    }
  }

  const send = async (rec: { data: Saved }) => {
    if (!rec.data.proposal || !user.email) return
    try {
      await emailProposal(user.email, rec.data.name, rec.data.proposal)
      toast.success('Sent', `Proposal emailed to ${user.email}.`)
    } catch (e) {
      toast.error('Could not send email', e instanceof Error ? e.message : 'Try again.')
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-foreground">Your shortlist ({records.length})</p>
        <Button onClick={() => void save()} disabled={!ready || !selected || alreadySaved}>
          {alreadySaved ? 'Saved' : selected ? 'Add selected site' : 'Select a site first'}
        </Button>
      </div>

      {records.length === 0 && <p className="text-sm text-muted-foreground">Nothing saved yet.</p>}

      <ul className="space-y-3">
        {records.map((rec) => (
          <li key={rec.recordId} className="rounded-md border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-foreground">{rec.data.name}</p>
                <p className="text-xs text-muted-foreground">
                  score {rec.data.score} | {fmt(rec.data.waterGalPerYear)} gal/yr | {fmt(rec.data.solarKwhPerYear)} kWh/yr
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" loading={busyId === rec.recordId} onClick={() => void draft(rec)}>
                  {rec.data.proposal ? 'Redraft' : 'Draft proposal'}
                </Button>
                {rec.data.proposal && (
                  <>
                    <Button variant="secondary" onClick={() => setOpenId(openId === rec.recordId ? null : rec.recordId)}>
                      {openId === rec.recordId ? 'Hide' : 'View'}
                    </Button>
                    <Button variant="secondary" onClick={() => void send(rec)}>Email me</Button>
                  </>
                )}
                <Button variant="secondary" onClick={() => void removeConfirmed(rec.recordId)}>Remove</Button>
              </div>
            </div>
            {openId === rec.recordId && rec.data.proposal && (
              <pre className="mt-3 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs text-foreground">{rec.data.proposal}</pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
