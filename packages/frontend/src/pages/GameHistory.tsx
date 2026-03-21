import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, Game as GameType } from '@/lib/api'
import { ROUNDS_INFO, AVATAR_EMOJIS } from '@/lib/utils'

export default function GameHistory() {
  const { id } = useParams<{ id: string }>()

  const { data: game, isLoading } = useQuery<GameType>({
    queryKey: ['game', id],
    queryFn: () => api.get<GameType>(`/games/${id}`),
  })

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>
  if (!game) return <p className="text-muted-foreground">Game not found</p>

  const totals = game.totals || {}
  const sorted = [...game.players].sort((a, b) => (totals[a.playerId] || 0) - (totals[b.playerId] || 0))
  const winner = sorted[0]
  const maxPts = Math.max(...Object.values(totals))

  return (
    <div className="space-y-6 fade-up">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Final Results</p>
        <h1 className="text-4xl font-bold text-[var(--cobalt-dark)]">
          Game Over
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date(game.createdAt).toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Winner spotlight */}
      {winner && (
        <div className="relative overflow-hidden rounded-xl border border-[rgba(37,99,235,0.4)] bg-white p-6 text-center gold-glow">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.07),transparent_70%)] pointer-events-none" />
          <p className="text-3xl mb-2">🏆</p>
          <span className="text-4xl">{AVATAR_EMOJIS[winner.player.avatar] || '🎮'}</span>
          <h2 className="text-2xl font-bold text-[var(--cobalt-dark)] mt-2">
            {winner.player.name}
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            {totals[winner.playerId] || 0} points · Winner
          </p>
        </div>
      )}

      {/* All standings */}
      <div className="felt-card overflow-hidden">
        {sorted.map((gp, idx) => {
          const pts = totals[gp.playerId] || 0
          const pct = maxPts > 0 ? (pts / maxPts) * 100 : 0
          return (
            <div key={gp.playerId} className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(37,99,235,0.06)] last:border-0">
              <span className="w-6 text-center text-sm">
                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : <span className="font-mono text-xs text-muted-foreground">{idx + 1}</span>}
              </span>
              <span className="text-xl">{AVATAR_EMOJIS[gp.player.avatar] || '🎮'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{gp.player.name}</span>
                </div>
                <div className="score-bar">
                  <div className="score-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="stat-number text-xl flex-shrink-0">{pts}</span>
            </div>
          )
        })}
      </div>

      {/* Round breakdown */}
      {game.rounds && game.rounds.length > 0 && (
        <div>
          <div className="suit-divider text-xs mb-4">Round Breakdown</div>
          <div className="space-y-2 stagger">
            {game.rounds.map(round => (
              <div key={round.id} className="felt-card p-4 fade-up">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-[var(--cobalt)]">
                    Round {round.roundNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ROUNDS_INFO[round.roundNumber - 1]?.description}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {round.scores
                    .sort((a, b) => a.points - b.points)
                    .map(score => (
                      <div key={score.playerId} className="flex items-center gap-2 text-sm">
                        <span>{AVATAR_EMOJIS[score.player.avatar] || '🎮'}</span>
                        <span className="text-muted-foreground text-xs truncate flex-1">{score.player.name}</span>
                        <span className="font-mono text-xs text-[var(--cobalt)] flex-shrink-0">
                          {score.wentOut ? '0 🏆' : score.points}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
