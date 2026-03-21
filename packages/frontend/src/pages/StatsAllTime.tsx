import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, AllTimePlayer } from '@/lib/api'
import { AVATAR_EMOJIS } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default function StatsAllTime() {
  const { data: players, isLoading } = useQuery<AllTimePlayer[]>({
    queryKey: ['stats', 'alltime'],
    queryFn: () => api.get<AllTimePlayer[]>('/stats/alltime'),
  })

  if (isLoading) {
    return (
      <div className="space-y-4 fade-up">
        <div className="h-8 w-32 bg-accent animate-pulse rounded" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 rounded-xl bg-accent animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 fade-up">
      <div className="flex items-center gap-3">
        <Link to="/stats">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Statistics</p>
          <h1 className="text-4xl font-bold text-[var(--cobalt-dark)]">All-Time</h1>
        </div>
      </div>

      {!players || players.length === 0 ? (
        <div className="felt-card p-12 text-center">
          <p className="text-5xl mb-4">🎴</p>
          <p className="text-muted-foreground">No stats yet — play some games first!</p>
        </div>
      ) : (
        <div className="space-y-2 stagger">
          {players.map((p, idx) => {
            const winPct = p.gamesPlayed > 0
              ? Math.round((p.wins / p.gamesPlayed) * 100)
              : 0
            const avgScore = p.gamesPlayed > 0
              ? Math.round(p.totalScore / p.gamesPlayed)
              : 0

            return (
              <div key={p.playerId} className="felt-card p-4 fade-up">
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-6 text-center text-sm font-mono text-muted-foreground">
                    {idx + 1}
                  </span>
                  <span className="text-2xl">{AVATAR_EMOJIS[p.avatar ?? ''] || '🎮'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{p.name}</span>
                      {p.badges.map(badge => (
                        <span
                          key={badge}
                          className="text-xs px-2 py-0.5 rounded-full bg-accent text-[var(--cobalt-dark)] border border-[rgba(37,99,235,0.2)]"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 ml-9 text-center">
                  <div>
                    <p className="font-mono font-semibold text-sm text-[var(--cobalt-dark)]">{p.gamesPlayed}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Games</p>
                  </div>
                  <div>
                    <p className="font-mono font-semibold text-sm text-[var(--cobalt-dark)]">{p.wins}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Wins</p>
                  </div>
                  <div>
                    <p className="font-mono font-semibold text-sm text-[var(--cobalt-dark)]">{winPct}%</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Win%</p>
                  </div>
                  <div>
                    <p className="font-mono font-semibold text-sm text-[var(--cobalt-dark)]">{avgScore}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg pts</p>
                  </div>
                </div>
                {p.currentStreak >= 2 && (
                  <div className="ml-9 mt-2 text-xs text-muted-foreground">
                    {p.streakType === 'win' ? '🔥' : '🧊'} {p.currentStreak}-game {p.streakType} streak
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
