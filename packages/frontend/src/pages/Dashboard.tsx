import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { api, Season, Game } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { AVATAR_EMOJIS } from '@/lib/utils'
import { Plus, ChevronRight } from 'lucide-react'

export default function Dashboard() {
  const { user } = useAuth()

  const { data: seasons } = useQuery<Season[]>({
    queryKey: ['seasons'],
    queryFn: () => api.get<Season[]>('/seasons'),
  })

  const activeSeason = seasons?.find(s => s.status === 'ACTIVE')

  const { data: recentGames } = useQuery<Game[]>({
    queryKey: ['games', activeSeason?.id],
    queryFn: () => api.get<Game[]>(`/seasons/${activeSeason!.id}/games`),
    enabled: !!activeSeason,
  })

  const inProgressGame = recentGames?.find(g => g.status === 'IN_PROGRESS')

  return (
    <div className="space-y-6 fade-up">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Welcome back</p>
        <h1
          className="text-4xl font-bold text-[var(--gold)]"
          style={{ fontFamily: 'Cormorant Garamond, serif' }}
        >
          {user?.groupName || 'Dashboard'}
        </h1>
      </div>

      {/* Live game banner */}
      {inProgressGame && (
        <Link to={`/games/${inProgressGame.id}`}>
          <div className="relative overflow-hidden rounded-xl border border-[rgba(201,168,76,0.35)] bg-[var(--felt-card)] p-5 gold-glow transition-all duration-300 hover:border-[rgba(201,168,76,0.55)]">
            {/* Background glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--gold)] opacity-[0.04] rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--gold)] animate-pulse" />
                  <span className="text-xs uppercase tracking-widest text-[var(--gold)]">Live Game</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Round {(inProgressGame._count?.rounds || 0) + 1} of 7
                </p>
                <div className="flex gap-2 mt-3">
                  {inProgressGame.players.map(gp => (
                    <span key={gp.playerId} className="text-xl" title={gp.player.name}>
                      {AVATAR_EMOJIS[gp.player.avatar] || '🎮'}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-end gap-3">
                <span className="text-[var(--gold)] text-sm font-medium">Continue →</span>
                {/* Round progress */}
                <div className="flex gap-1">
                  {Array.from({ length: 7 }, (_, i) => (
                    <div
                      key={i}
                      className="w-4 h-1 rounded-full"
                      style={{
                        background: i < (inProgressGame._count?.rounds || 0)
                          ? 'var(--gold)'
                          : i === (inProgressGame._count?.rounds || 0)
                          ? 'rgba(201,168,76,0.4)'
                          : 'rgba(201,168,76,0.1)',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* Active season card */}
      {activeSeason ? (
        <div className="felt-card p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Active Season</p>
              <h2
                className="text-2xl font-bold text-foreground"
                style={{ fontFamily: 'Cormorant Garamond, serif' }}
              >
                {activeSeason.name}
              </h2>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full border border-[rgba(201,168,76,0.3)] text-[var(--gold)] bg-[rgba(201,168,76,0.06)]">
              Active
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-[rgba(201,168,76,0.05)] rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-[var(--gold)]" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
                {activeSeason._count?.games || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Games</p>
            </div>
            <div className="bg-[rgba(201,168,76,0.05)] rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-[var(--gold)]" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
                {activeSeason._count?.players || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Players</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Link to={`/seasons/${activeSeason.id}`} className="flex-1">
              <Button variant="outline" className="w-full text-xs h-9">View Season</Button>
            </Link>
            <Link to={`/seasons/${activeSeason.id}/games/new`} className="flex-1">
              <Button className="w-full text-xs h-9 gap-1">
                <Plus className="h-3.5 w-3.5" />
                New Game
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="felt-card p-8 text-center">
          <p className="text-4xl mb-3">🎴</p>
          <p className="text-muted-foreground mb-4">No active season</p>
          <Link to="/seasons">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create Season
            </Button>
          </Link>
        </div>
      )}

      {/* Recent games */}
      {recentGames && recentGames.length > 0 && (
        <div>
          <div className="suit-divider text-xs mb-4">Recent Games</div>
          <div className="space-y-2 stagger">
            {recentGames.slice(0, 5).map(game => (
              <Link
                key={game.id}
                to={game.status === 'IN_PROGRESS' ? `/games/${game.id}` : `/games/${game.id}/history`}
              >
                <div className="felt-card px-4 py-3 flex items-center justify-between hover:border-[rgba(201,168,76,0.3)] transition-all duration-200 group fade-up">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {game.players.slice(0, 4).map(gp => (
                        <span key={gp.playerId} className="text-base">
                          {AVATAR_EMOJIS[gp.player.avatar] || '🎮'}
                        </span>
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(game.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      game.status === 'IN_PROGRESS'
                        ? 'border-[rgba(201,168,76,0.4)] text-[var(--gold)] bg-[rgba(201,168,76,0.08)]'
                        : 'border-[rgba(255,255,255,0.08)] text-muted-foreground'
                    }`}>
                      {game.status === 'IN_PROGRESS' ? '● Live' : 'Done'}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-[var(--gold)] transition-colors" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
