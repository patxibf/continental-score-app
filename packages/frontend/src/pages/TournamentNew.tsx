import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, Player, BracketPreview, getTournamentPreview } from '@/lib/api'
import { AVATAR_EMOJIS } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/useToast'
import { Check } from 'lucide-react'

type Step = 1 | 2 | 3 | 4

export default function TournamentNew() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [name, setName] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<BracketPreview | null>(null)
  const [stageConfigs, setStageConfigs] = useState<{ startRound: number; endRound: number }[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const { data: players } = useQuery<Player[]>({
    queryKey: ['players'],
    queryFn: () => api.get<Player[]>('/players'),
  })

  const activePlayers = players?.filter(p => p.active) || []

  const togglePlayer = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const canAdvanceStep1 = name.trim().length > 0 && selectedIds.size >= 3

  const handleNextStep1 = async () => {
    if (!canAdvanceStep1) return
    setLoadingPreview(true)
    try {
      const result = await getTournamentPreview(selectedIds.size)
      setPreview(result)
      const configs = result.stages.map((_stage, idx) => {
        const isFinal = idx === result.stages.length - 1
        return isFinal
          ? { startRound: 1, endRound: 7 }
          : { startRound: 5, endRound: 7 }
      })
      setStageConfigs(configs)
      setStep(2)
    } catch (err) {
      toast({ title: (err as Error).message, variant: 'destructive' })
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleCreate = async () => {
    if (!preview) return
    setSubmitting(true)
    try {
      const tournament = await api.post<{ id: string }>('/tournaments', {
        name: name.trim(),
        playerIds: Array.from(selectedIds),
        stageConfigs,
      })
      navigate(`/tournaments/${tournament.id}`)
    } catch (err) {
      toast({ title: (err as Error).message, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 1) {
    return (
      <div className="space-y-6 fade-up">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Step 1 of 4</p>
          <h1 className="text-4xl font-bold text-[var(--cobalt)]">New Tournament</h1>
          <p className="text-sm text-muted-foreground mt-1">Name your tournament and select players</p>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">Tournament name</label>
          <input
            type="text"
            placeholder="Tournament name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border border-border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--cobalt)]"
          />
        </div>

        <div>
          <p className="text-sm font-medium text-foreground mb-2">Select players (minimum 3)</p>
          <div className="space-y-2 stagger">
            {activePlayers.map(player => {
              const selected = selectedIds.has(player.id)
              return (
                <button
                  key={player.id}
                  onClick={() => togglePlayer(player.id)}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all duration-150 fade-up ${
                    selected
                      ? 'border-[rgba(37,99,235,0.5)] bg-[rgba(37,99,235,0.06)]'
                      : 'border-border bg-white hover:border-[rgba(37,99,235,0.25)]'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl border transition-all ${
                      selected ? 'border-[rgba(37,99,235,0.5)] bg-[rgba(37,99,235,0.1)]' : 'border-border bg-transparent'
                    }`}>
                      {AVATAR_EMOJIS[player.avatar] || '🎮'}
                    </div>
                    <span className={`font-semibold transition-colors ${selected ? 'text-[var(--cobalt)]' : ''}`}>
                      {player.name}
                    </span>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    selected ? 'border-[var(--cobalt)] bg-[var(--cobalt)]' : 'border-border'
                  }`}>
                    {selected && <Check className="h-3 w-3 text-[hsl(var(--background))]" strokeWidth={3} />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="sticky bottom-20 pb-2">
          <Button
            className="w-full h-12 text-base"
            onClick={handleNextStep1}
            disabled={!canAdvanceStep1 || loadingPreview}
          >
            {loadingPreview ? 'Loading…' : 'Next →'}
          </Button>
        </div>
      </div>
    )
  }

  if (step === 2 && preview) {
    const lastIdx = preview.stages.length - 1
    return (
      <div className="space-y-6 fade-up">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Step 2 of 4</p>
          <h1 className="text-4xl font-bold text-[var(--cobalt)]">Bracket Preview</h1>
          <p className="text-sm text-muted-foreground mt-1">Review and confirm your tournament structure</p>
        </div>

        <div className="space-y-4">
          {preview.stages.map((stage, idx) => {
            const isFinal = idx === lastIdx
            return (
              <div key={stage.stageNumber} className="felt-card p-4 rounded-xl border border-border">
                {isFinal ? (
                  <div className="text-center">
                    <p className="text-lg font-bold text-[var(--cobalt)]">Final</p>
                    <p className="text-sm text-muted-foreground">{stage.playersPerTable} players</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">Stage {stage.stageNumber}</p>
                    <p className="text-base font-bold">{stage.tableCount} tables</p>
                    <p className="text-sm text-muted-foreground">{stage.playersPerTable} players each</p>
                    <p className="text-sm text-[var(--cobalt)] font-medium mt-1">{stage.advancePerTable} advance per table</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex gap-3 sticky bottom-20 pb-2">
          <Button variant="outline" className="flex-1 h-12" onClick={() => setStep(1)}>
            ← Back
          </Button>
          <Button className="flex-1 h-12" onClick={() => setStep(3)}>
            Next →
          </Button>
        </div>
      </div>
    )
  }

  if (step === 3 && preview) {
    const lastIdx = preview.stages.length - 1
    const updateStageConfig = (stageIdx: number, r: number) => {
      setStageConfigs(prev => {
        const next = [...prev]
        const cfg = { ...next[stageIdx] }
        if (r < cfg.startRound) {
          cfg.startRound = r
        } else if (r > cfg.endRound) {
          cfg.endRound = r
        } else if (r === cfg.startRound && r < cfg.endRound) {
          cfg.startRound = r + 1
        } else if (r === cfg.endRound && r > cfg.startRound) {
          cfg.endRound = r - 1
        }
        next[stageIdx] = cfg
        return next
      })
    }

    return (
      <div className="space-y-6 fade-up">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Step 3 of 4</p>
          <h1 className="text-4xl font-bold text-[var(--cobalt)]">Configure Rounds</h1>
          <p className="text-sm text-muted-foreground mt-1">Set the round range for each stage</p>
        </div>

        <div className="space-y-4">
          {preview.stages.map((stage, idx) => {
            const isFinal = idx === lastIdx
            const cfg = stageConfigs[idx] || { startRound: 1, endRound: 7 }
            return (
              <div key={stage.stageNumber} className="felt-card p-4 rounded-xl border border-border">
                <p className="text-sm font-semibold text-foreground mb-3">
                  {isFinal ? 'Final' : `Stage ${stage.stageNumber}`}
                </p>
                <div className="flex gap-1 mb-2">
                  {[1, 2, 3, 4, 5, 6, 7].map(r => {
                    const active = r >= cfg.startRound && r <= cfg.endRound
                    return (
                      <button
                        key={r}
                        aria-label={`R${r}`}
                        onClick={() => updateStageConfig(idx, r)}
                        className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                          active
                            ? 'bg-[var(--cobalt)] text-white'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        R{r}
                      </button>
                    )
                  })}
                </div>
                <p className="text-sm text-muted-foreground">
                  Rounds {cfg.startRound}–{cfg.endRound}
                </p>
              </div>
            )
          })}
        </div>

        <div className="flex gap-3 sticky bottom-20 pb-2">
          <Button variant="outline" className="flex-1 h-12" onClick={() => setStep(2)}>
            ← Back
          </Button>
          <Button className="flex-1 h-12" onClick={() => setStep(4)}>
            Next →
          </Button>
        </div>
      </div>
    )
  }

  if (step === 4 && preview) {
    const lastIdx = preview.stages.length - 1
    return (
      <div className="space-y-6 fade-up">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Step 4 of 4</p>
          <h1 className="text-4xl font-bold text-[var(--cobalt)]">Review & Start</h1>
          <p className="text-sm text-muted-foreground mt-1">Confirm your tournament details</p>
        </div>

        <div className="felt-card p-4 rounded-xl border border-border">
          <p className="text-lg font-bold text-foreground">{name}</p>
        </div>

        <div className="space-y-3">
          {preview.stages.map((stage, idx) => {
            const isFinal = idx === lastIdx
            const cfg = stageConfigs[idx] || { startRound: 1, endRound: 7 }
            return (
              <div key={stage.stageNumber} className="felt-card p-4 rounded-xl border border-border flex justify-between items-center">
                <p className="font-semibold text-foreground">
                  {isFinal ? 'Final' : `Stage ${stage.stageNumber}`}
                </p>
                <p className="text-sm text-muted-foreground">
                  Rounds {cfg.startRound}–{cfg.endRound}
                </p>
              </div>
            )
          })}
        </div>

        <div className="flex gap-3 sticky bottom-20 pb-2">
          <Button variant="outline" className="flex-1 h-12" onClick={() => setStep(3)}>
            ← Back
          </Button>
          <Button
            className="flex-1 h-12"
            onClick={handleCreate}
            disabled={submitting}
          >
            {submitting ? 'Creating…' : 'Start Tournament'}
          </Button>
        </div>
      </div>
    )
  }

  return null
}
