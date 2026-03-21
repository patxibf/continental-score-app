import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Game as GameType, Round } from '@/lib/api'
import { ROUNDS_INFO, AVATAR_EMOJIS } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { toast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'

function LiveScoreboard({ game, totals }: { game: GameType; totals: Record<string, number> }) {
  const sorted = [...game.players].sort((a, b) => (totals[a.playerId] || 0) - (totals[b.playerId] || 0))
  const minScore = Math.min(...Object.values(totals))
  const maxScore = Math.max(...Object.values(totals))

  return (
    <div className="felt-card overflow-hidden">
      <div className="px-4 py-3 border-b border-[rgba(201,168,76,0.08)]">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Scoreboard</p>
      </div>
      {sorted.map((gp, idx) => {
        const total = totals[gp.playerId] || 0
        const isLeading = total === minScore && Object.values(totals).some(v => v > 0)
        const pct = maxScore > 0 ? (total / maxScore) * 100 : 0

        return (
          <div key={gp.playerId} className="flex items-center gap-3 px-4 py-2.5 border-b border-[rgba(201,168,76,0.06)] last:border-0">
            <span className="text-xs text-muted-foreground w-4 text-center font-mono">{idx + 1}</span>
            <span className="text-xl">{AVATAR_EMOJIS[gp.player.avatar] || '🎮'}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm font-medium truncate">{gp.player.name}</span>
                {isLeading && <span className="text-[10px] text-[var(--gold)]">★</span>}
              </div>
              <div className="score-bar">
                <div className="score-bar-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <span
              className="font-mono text-lg font-semibold flex-shrink-0"
              style={{ color: isLeading ? 'var(--gold-bright)' : 'var(--gold)', fontFamily: 'Cormorant Garamond, serif' }}
            >
              {total}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function ScoreEntry({
  game, roundNumber, onSubmit, isSubmitting, initialData, onCancel,
}: {
  game: GameType; roundNumber: number
  onSubmit: (scores: { playerId: string; points: number; wentOut: boolean; wentOutInOneGo: boolean }[]) => void
  isSubmitting: boolean
  initialData?: Round
  onCancel?: () => void
}) {
  const roundInfo = ROUNDS_INFO[roundNumber - 1]
  const isLastRound = roundNumber === 7

  const [scores, setScores] = useState<Record<string, string>>(() => {
    if (!initialData) return Object.fromEntries(game.players.map(gp => [gp.playerId, '']))
    return Object.fromEntries(
      game.players.map(gp => {
        const s = initialData.scores.find(s => s.playerId === gp.playerId)
        if (!s || s.wentOut) return [gp.playerId, '']
        return [gp.playerId, String(s.points)]
      }),
    )
  })

  const [wentOut, setWentOut] = useState<string | null>(() => {
    if (!initialData) return null
    const s = initialData.scores.find(s => s.wentOut && s.points >= 0)
    return s?.playerId ?? null
  })

  const [wentOutInOneGo, setWentOutInOneGo] = useState<string | null>(() => {
    if (!initialData) return null
    const s = initialData.scores.find(s => s.wentOut && s.points < 0)
    return s?.playerId ?? null
  })

  const handlePlayerClick = (playerId: string) => {
    if (wentOutInOneGo === playerId) {
      setWentOut(null)
      setWentOutInOneGo(null)
    } else if (wentOut === playerId) {
      setWentOutInOneGo(playerId)
    } else {
      setWentOut(playerId)
      setWentOutInOneGo(null)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const result = game.players.map(gp => {
      const isOut = wentOut === gp.playerId || wentOutInOneGo === gp.playerId
      const isOneGo = wentOutInOneGo === gp.playerId
      const rawScore = scores[gp.playerId]
      const effectiveScore = isLastRound && rawScore === '' ? '250' : rawScore
      return {
        playerId: gp.playerId,
        points: isOut ? 0 : parseInt(effectiveScore, 10),
        wentOut: isOut,
        wentOutInOneGo: isOneGo,
      }
    })
    const invalid = result.some(r => !r.wentOut && (isNaN(r.points)))
    if (invalid) {
      toast({ title: 'Enter scores for all players', variant: 'destructive' })
      return
    }
    onSubmit(result)
  }

  return (
    <div className="felt-card overflow-hidden">
      <div className="px-4 py-3 border-b border-[rgba(201,168,76,0.08)] flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--gold)]">Round {roundNumber}</p>
          <p className="text-xs text-muted-foreground">{roundInfo?.description} · {roundInfo?.cardsDealt} cards</p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full border border-[rgba(201,168,76,0.3)] text-[var(--gold)] bg-[rgba(201,168,76,0.06)]">
          {initialData ? 'Editing' : 'Enter scores'}
        </span>
      </div>
      <form onSubmit={handleSubmit} className="p-4 space-y-2">
        <p className="text-xs text-muted-foreground mb-3">
          Tap once to mark who went out (0 pts) · Tap again for one-go ({-(roundNumber * 10)} pts)
          {isLastRound && ' · Empty scores default to 250 pts'}
        </p>
        {game.players.map(gp => {
          const isOut = wentOut === gp.playerId
          const isOneGo = wentOutInOneGo === gp.playerId
          const isSelected = isOut || isOneGo
          return (
            <div key={gp.playerId} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handlePlayerClick(gp.playerId)}
                className={`flex items-center gap-2.5 flex-1 p-3 rounded-xl border-2 transition-all duration-150 ${
                  isOneGo
                    ? 'border-[rgba(100,200,100,0.5)] bg-[rgba(100,200,100,0.08)]'
                    : isOut
                    ? 'border-[rgba(201,168,76,0.5)] bg-[rgba(201,168,76,0.08)]'
                    : 'border-[rgba(201,168,76,0.08)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(201,168,76,0.2)]'
                }`}
              >
                <span className="text-xl">{AVATAR_EMOJIS[gp.player.avatar] || '🎮'}</span>
                <span className={`text-sm font-medium transition-colors ${isOneGo ? 'text-green-400' : isOut ? 'text-[var(--gold)]' : ''}`}>
                  {gp.player.name}
                </span>
                {isOneGo && (
                  <span className="ml-auto text-xs text-green-400 font-semibold">
                    ONE GO ⚡ {-(roundNumber * 10)}
                  </span>
                )}
                {isOut && !isOneGo && <span className="ml-auto text-xs text-[var(--gold)] font-semibold">OUT 🏆</span>}
              </button>
              {!isSelected ? (
                <Input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  className="w-20 text-center font-mono bg-[rgba(255,255,255,0.04)] border-[rgba(201,168,76,0.2)] focus:border-[var(--gold)] focus:ring-0 h-12"
                  style={{ fontSize: '16px' }}
                  value={scores[gp.playerId]}
                  onChange={e => setScores(prev => ({ ...prev, [gp.playerId]: e.target.value }))}
                  placeholder={isLastRound ? '250' : '0'}
                />
              ) : (
                <div className={`w-20 h-12 flex items-center justify-center rounded-xl font-mono font-bold border ${
                  isOneGo
                    ? 'bg-[rgba(100,200,100,0.1)] text-green-400 border-[rgba(100,200,100,0.3)]'
                    : 'bg-[rgba(201,168,76,0.1)] text-[var(--gold)] border-[rgba(201,168,76,0.3)]'
                }`}>
                  {isOneGo ? -(roundNumber * 10) : 0}
                </div>
              )}
            </div>
          )
        })}
        <div className="flex gap-2 mt-4">
          {onCancel && (
            <Button type="button" variant="outline" className="flex-1 h-11" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          )}
          <Button type="submit" className="flex-1 h-11" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : initialData ? `Save Round ${roundNumber}` : `Submit Round ${roundNumber}`}
          </Button>
        </div>
      </form>
    </div>
  )
}

export default function GamePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isGroupAdmin } = useAuth()
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [abortDialogOpen, setAbortDialogOpen] = useState(false)
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null)

  const { data: game, isLoading } = useQuery<GameType>({
    queryKey: ['game', id],
    queryFn: () => api.get<GameType>(`/games/${id}`),
    refetchInterval: 30000,
  })

  const submitRoundMutation = useMutation({
    mutationFn: (data: { roundNumber: number; scores: { playerId: string; points: number; wentOut: boolean; wentOutInOneGo: boolean }[] }) =>
      api.post<Round>(`/games/${id}/rounds`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', id] })
      toast({ title: 'Round saved!' })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const editRoundMutation = useMutation({
    mutationFn: ({ roundId, scores }: { roundId: string; scores: { playerId: string; points: number; wentOut: boolean; wentOutInOneGo: boolean }[] }) =>
      api.patch<Round>(`/rounds/${roundId}`, { scores }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', id] })
      setEditingRoundId(null)
      toast({ title: 'Round updated!' })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const abortMutation = useMutation({
    mutationFn: () => api.delete(`/games/${id}`),
    onSuccess: () => {
      toast({ title: 'Game aborted' })
      navigate(`/seasons/${game?.seasonId}`)
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const closeMutation = useMutation({
    mutationFn: () => api.post(`/games/${id}/close`, { confirm: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', id] })
      toast({ title: 'Game closed!' })
      navigate(`/games/${id}/history`)
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>
  if (!game) return <p className="text-muted-foreground">Game not found</p>

  const completedRounds = game.rounds?.length || 0
  const nextRound = completedRounds + 1
  const isGameComplete = completedRounds >= 7
  const totals = game.totals || {}

  return (
    <div className="space-y-4 fade-up">
      {/* Header with breadcrumb */}
      <div className="flex items-center justify-between">
        <div>
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <button
              onClick={() => navigate(`/seasons/${game.seasonId}`)}
              className="hover:text-[var(--gold)] transition-colors"
            >
              Season
            </button>
            <span>›</span>
            <span>Game</span>
          </nav>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">In progress</p>
          <h1 className="text-3xl font-bold text-[var(--gold)]" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
            Game
          </h1>
        </div>
        {game.status === 'IN_PROGRESS' && isGroupAdmin && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAbortDialogOpen(true)} className="text-xs text-destructive border-destructive/40 hover:bg-destructive/10">
              Abort
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCloseDialogOpen(true)} className="text-xs">
              Close Game
            </Button>
          </div>
        )}
      </div>

      {/* Round progress */}
      <div className="flex gap-1.5 items-center">
        {ROUNDS_INFO.map(r => (
          <div
            key={r.roundNumber}
            className="flex-1 h-1.5 rounded-full transition-all duration-500"
            style={{
              background: r.roundNumber <= completedRounds
                ? 'linear-gradient(to right, var(--gold-dim), var(--gold))'
                : r.roundNumber === nextRound
                ? 'rgba(201,168,76,0.25)'
                : 'rgba(201,168,76,0.08)',
            }}
          />
        ))}
        <span className="text-xs font-mono text-muted-foreground ml-1 flex-shrink-0">
          {Math.min(nextRound, 7)}/7
        </span>
      </div>

      <LiveScoreboard game={game} totals={totals} />

      {game.status === 'IN_PROGRESS' && !isGameComplete && (
        <ScoreEntry
          key={nextRound}
          game={game}
          roundNumber={nextRound}
          onSubmit={scores => submitRoundMutation.mutate({ roundNumber: nextRound, scores })}
          isSubmitting={submitRoundMutation.isPending}
        />
      )}

      {isGameComplete && game.status === 'IN_PROGRESS' && isGroupAdmin && (
        <div className="felt-card p-6 text-center border-[rgba(201,168,76,0.3)] gold-glow">
          <p className="text-2xl mb-1" style={{ fontFamily: 'Cormorant Garamond, serif', color: 'var(--gold)' }}>
            All 7 rounds complete!
          </p>
          <p className="text-sm text-muted-foreground mb-4">Ready to close the game?</p>
          <Button onClick={() => setCloseDialogOpen(true)} className="w-full h-11">
            Close & Save Results
          </Button>
        </div>
      )}

      {/* Completed rounds */}
      {game.rounds && game.rounds.length > 0 && (
        <div>
          <div className="suit-divider text-xs my-4">Completed Rounds</div>
          <div className="space-y-2 stagger">
            {[...game.rounds].reverse().map(round => (
              editingRoundId === round.id ? (
                <ScoreEntry
                  key={round.id}
                  game={game}
                  roundNumber={round.roundNumber}
                  initialData={round}
                  onSubmit={scores => editRoundMutation.mutate({ roundId: round.id, scores })}
                  isSubmitting={editRoundMutation.isPending}
                  onCancel={() => setEditingRoundId(null)}
                />
              ) : (
                <div key={round.id} className="felt-card p-4 fade-up">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-[var(--gold)]">Round {round.roundNumber}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{ROUNDS_INFO[round.roundNumber - 1]?.description}</span>
                      {game.status === 'IN_PROGRESS' && isGroupAdmin && (
                        <button
                          onClick={() => setEditingRoundId(round.id)}
                          className="text-xs text-muted-foreground hover:text-[var(--gold)] transition-colors px-1.5 py-0.5 rounded border border-transparent hover:border-[rgba(201,168,76,0.3)]"
                          title="Edit round"
                        >
                          ✏️
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {round.scores.map(score => (
                      <div key={score.playerId} className="flex items-center gap-2 text-sm">
                        <span>{AVATAR_EMOJIS[score.player.avatar] || '🎮'}</span>
                        <span className="text-xs text-muted-foreground truncate flex-1">{score.player.name}</span>
                        <span className="font-mono text-xs text-[var(--gold)] flex-shrink-0">
                          {score.wentOut
                            ? score.points < 0 ? `${score.points} ⚡` : '0 🏆'
                            : score.points}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      <Dialog open={abortDialogOpen} onOpenChange={setAbortDialogOpen}>
        <DialogContent className="bg-[var(--felt-card)] border-[rgba(201,168,76,0.2)]">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.5rem' }}>
              Abort Game
            </DialogTitle>
            <DialogDescription>
              This will permanently delete the game and all its rounds. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbortDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => abortMutation.mutate()}
              disabled={abortMutation.isPending}
            >
              {abortMutation.isPending ? 'Aborting…' : 'Abort Game'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="bg-[var(--felt-card)] border-[rgba(201,168,76,0.2)]">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.5rem' }}>
              Close Game
            </DialogTitle>
            <DialogDescription>This action is irreversible. Final standings:</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {[...game.players]
              .sort((a, b) => (totals[a.playerId] || 0) - (totals[b.playerId] || 0))
              .map((gp, idx) => (
                <div key={gp.playerId} className="flex items-center gap-3">
                  <span className="text-sm w-5">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}</span>
                  <span className="text-xl">{AVATAR_EMOJIS[gp.player.avatar] || '🎮'}</span>
                  <span className="flex-1 text-sm">{gp.player.name}</span>
                  <span className="font-mono text-sm text-[var(--gold)]">{totals[gp.playerId] || 0} pts</span>
                </div>
              ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloseDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => closeMutation.mutate()}
              disabled={closeMutation.isPending}
            >
              {closeMutation.isPending ? 'Closing…' : 'Close Game'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
