import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Season, Game, Standing } from '@/lib/api'
import { AVATAR_EMOJIS, CURRENCY_SYMBOL } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { toast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import { Plus, ChevronRight, Lock, Trophy, Star } from 'lucide-react'

export default function SeasonDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { isGroupAdmin, user } = useAuth()
  const currencySymbol = CURRENCY_SYMBOL[user?.currency ?? 'EUR'] ?? '€'
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [standingsSort, setStandingsSort] = useState<'points' | 'wins'>('points')

  const { data: seasons } = useQuery<Season[]>({
    queryKey: ['seasons'],
    queryFn: () => api.get<Season[]>('/seasons'),
  })
  const season = seasons?.find(s => s.id === id)

  const { data: games } = useQuery<Game[]>({
    queryKey: ['games', id],
    queryFn: () => api.get<Game[]>(`/seasons/${id}/games`),
    enabled: !!id,
  })

  const { data: standings } = useQuery<Standing[]>({
    queryKey: ['standings', id],
    queryFn: () => api.get<Standing[]>(`/seasons/${id}/standings`),
    enabled: !!id,
  })

  const closeMutation = useMutation({
    mutationFn: () => api.post(`/seasons/${id}/close`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasons'] })
      queryClient.invalidateQueries({ queryKey: ['games', id] })
      toast({ title: 'Season closed' })
      setCloseDialogOpen(false)
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  if (!season) return <p className="text-muted-foreground">Loading…</p>

  const sortedStandings = standings
    ? [...standings].sort((a, b) =>
        standingsSort === 'wins'
          ? b.wins - a.wins || a.totalPoints - b.totalPoints
          : a.totalPoints - b.totalPoints
      )
    : []

  const maxPts = standings && standings.length > 0
    ? Math.max(...standings.map(s => s.totalPoints))
    : 0
  const maxWins = standings && standings.length > 0
    ? Math.max(...standings.map(s => s.wins))
    : 0

  return (
    <div className="space-y-6 fade-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Season</p>
          <h1 className="text-4xl font-bold text-[var(--cobalt)]">
            {season.name}
          </h1>
          <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full border ${
            season.status === 'ACTIVE'
              ? 'border-[rgba(37,99,235,0.4)] text-[var(--cobalt)] bg-[rgba(37,99,235,0.06)]'
              : 'border-[rgba(0,0,0,0.1)] text-muted-foreground'
          }`}>
            {season.status}
          </span>
        </div>
        {season.status === 'ACTIVE' && isGroupAdmin && (
          <div className="flex gap-2 mt-1">
            <Button variant="outline" size="sm" onClick={() => setCloseDialogOpen(true)} className="gap-1.5 text-xs">
              <Lock className="h-3 w-3" />
              Close
            </Button>
          </div>
        )}
      </div>

      {/* New game button */}
      {season.status === 'ACTIVE' && isGroupAdmin && (
        <Link to={`/seasons/${id}/games/new`} className="block">
          <Button className="w-full gap-2 h-11">
            <Plus className="h-4 w-4" />
            New Game
          </Button>
        </Link>
      )}

      {/* Earnings Leaderboard */}
      {season.potEnabled && standings && standings.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-[var(--cobalt-dark)]">Earnings</h2>
            {season.contributionAmount && (
              <p className="text-sm text-muted-foreground">
                {currencySymbol}{parseFloat(season.contributionAmount).toFixed(2)} per game
              </p>
            )}
          </div>
          <div className="space-y-2">
            {[...standings]
              .sort((a, b) => b.totalEarnings - a.totalEarnings)
              .map((s, idx) => {
                const earnings = s.totalEarnings
                const isPositive = earnings > 0
                const isNegative = earnings < 0
                const formatted = `${isPositive ? '+' : isNegative ? '-' : ''}${currencySymbol}${Math.abs(earnings).toFixed(2)}`

                return (
                  <div key={s.playerId} className="felt-card p-4 flex items-center gap-4">
                    <div className="w-8 text-center flex-shrink-0">
                      <span className="text-xs font-mono text-muted-foreground">{idx + 1}</span>
                    </div>
                    <span className="text-2xl flex-shrink-0">{AVATAR_EMOJIS[s.playerAvatar] || '🎮'}</span>
                    <div className="flex-1">
                      <span className="font-semibold text-sm">{s.playerName}</span>
                    </div>
                    <span className={`font-mono text-sm font-semibold ${
                      isPositive ? 'text-green-600' : isNegative ? 'text-muted-foreground' : ''
                    }`}>
                      {formatted}
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Standings */}
      {standings && standings.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="suit-divider text-xs flex-1">Standings</div>
            <div className="flex gap-1 ml-4 flex-shrink-0 bg-[rgba(37,99,235,0.06)] rounded-lg p-0.5 border border-[rgba(37,99,235,0.12)]">
              <button
                onClick={() => setStandingsSort('points')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-all duration-150 ${
                  standingsSort === 'points'
                    ? 'bg-[var(--cobalt)] text-[hsl(var(--background))] font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Star className="h-3 w-3" />
                Points
              </button>
              <button
                onClick={() => setStandingsSort('wins')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-all duration-150 ${
                  standingsSort === 'wins'
                    ? 'bg-[var(--cobalt)] text-[hsl(var(--background))] font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Trophy className="h-3 w-3" />
                Wins
              </button>
            </div>
          </div>
          <div className="felt-card overflow-hidden">
            {sortedStandings.map((s, idx) => {
              const pct = standingsSort === 'wins'
                ? (maxWins > 0 ? (s.wins / maxWins) * 100 : 0)
                : (maxPts > 0 ? (s.totalPoints / maxPts) * 100 : 0)
              return (
                <div key={s.playerId} className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(37,99,235,0.06)] last:border-0">
                  <span className="text-sm font-mono text-muted-foreground w-5 text-center">
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                  </span>
                  <span className="text-lg">{AVATAR_EMOJIS[s.playerAvatar] || '🎮'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate">{s.playerName}</span>
                      <span className="text-xs text-muted-foreground font-mono flex-shrink-0 ml-2">{s.gamesPlayed}g</span>
                    </div>
                    <div className="score-bar">
                      <div className="score-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="stat-number text-lg leading-none">{standingsSort === 'wins' ? s.wins : s.totalPoints}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{standingsSort === 'wins' ? 'wins' : 'pts'}</p>
                  </div>
                  <div className="flex-shrink-0 text-right min-w-[2.5rem]">
                    <p className="text-xs font-mono text-muted-foreground leading-none">{standingsSort === 'wins' ? s.totalPoints : s.wins}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{standingsSort === 'wins' ? 'pts' : 'wins'}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Games list */}
      <div>
        <div className="suit-divider text-xs mb-4">Games</div>
        <div className="space-y-2 stagger">
          {games?.map(game => (
            <Link
              key={game.id}
              to={game.status === 'IN_PROGRESS' ? `/games/${game.id}` : `/games/${game.id}/history`}
            >
              <div className="felt-card px-4 py-3 flex items-center justify-between hover:border-[rgba(37,99,235,0.3)] transition-all duration-200 group fade-up">
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
                      ? 'border-[rgba(37,99,235,0.4)] text-[var(--cobalt)] bg-[rgba(37,99,235,0.08)]'
                      : 'border-[rgba(0,0,0,0.08)] text-muted-foreground'
                  }`}>
                    {game.status === 'IN_PROGRESS' ? '● Live' : 'Done'}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-[var(--cobalt)] transition-colors" />
                </div>
              </div>
            </Link>
          ))}
          {games?.length === 0 && (
            <div className="felt-card p-8 text-center">
              <p className="text-muted-foreground text-sm">No games yet</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="bg-white border-[var(--border-color)]">
          <DialogHeader>
            <DialogTitle style={{ fontSize: '1.5rem' }}>
              Close Season
            </DialogTitle>
            <DialogDescription>
              This will close all in-progress games and lock the season permanently.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloseDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending}>
              {closeMutation.isPending ? 'Closing…' : 'Close Season'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
