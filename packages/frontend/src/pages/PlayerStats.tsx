import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueries } from '@tanstack/react-query'
import { api, H2HResult, AllTimePlayer } from '@/lib/api'
import { AVATAR_EMOJIS } from '@/lib/utils'
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Area, AreaChart,
} from 'recharts'

interface PlayerStatsData {
  player: { id: string; name: string; avatar: string }
  gamesPlayed: number
  totalPoints: number
  avgPoints: number
  bestGame: number | null
  worstGame: number | null
  recentGames: Array<{
    gameId: string
    seasonName: string
    totalPoints: number
    roundsPlayed: number
    date: string
  }>
}

const COBALT = '#2563eb'
const COBALT_DARK = '#1e3a8a'
const COBALT_MID = '#3b5cc4'

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="felt-card px-3 py-2 text-xs">
      <p className="text-muted-foreground mb-0.5">{label}</p>
      <p className="font-mono text-[var(--cobalt-dark)] font-semibold">{payload[0].value} pts</p>
    </div>
  )
}

function StatTile({ value, label, highlight }: { value: string | number; label: string; highlight?: boolean }) {
  return (
    <div className={`felt-card p-4 text-center ${highlight ? 'border-[var(--cobalt)]' : ''}`}>
      <p
        className="leading-none mb-1.5"
        style={{
          fontSize: '2rem',
          fontWeight: 600,
          color: highlight ? 'var(--cobalt-dark)' : 'var(--cobalt)',
        }}
      >
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  )
}

export default function PlayerStats() {
  const { id } = useParams<{ id: string }>()

  const { data: stats, isLoading } = useQuery<PlayerStatsData>({
    queryKey: ['player-stats', id],
    queryFn: () => api.get<PlayerStatsData>(`/players/${id}/stats`),
  })

  const { data: alltimePlayers } = useQuery<AllTimePlayer[]>({
    queryKey: ['stats', 'alltime'],
    queryFn: () => api.get<AllTimePlayer[]>('/stats/alltime'),
  })

  const opponents = alltimePlayers?.filter(p => p.playerId !== id) ?? []

  const h2hQueries = useQueries({
    queries: opponents.map(opp => ({
      queryKey: ['stats', 'h2h', id, opp.playerId],
      queryFn: () => api.get<H2HResult>(`/stats/h2h?playerA=${id}&playerB=${opp.playerId}`),
      enabled: !!id && opponents.length > 0,
    })),
  })

  if (isLoading) {
    return (
      <div className="space-y-6 fade-up">
        <div className="h-24 rounded-xl bg-accent animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 rounded-xl bg-accent animate-pulse" />)}
        </div>
      </div>
    )
  }
  if (!stats) return <p className="text-muted-foreground">Player not found</p>

  const chartData = [...stats.recentGames].reverse().map((g, i) => ({
    game: `G${i + 1}`,
    pts: g.totalPoints,
    date: new Date(g.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
  }))

  const avg = stats.avgPoints

  return (
    <div className="space-y-6 fade-up">
      {/* Header */}
      <div className="felt-card p-5 flex items-center gap-5">
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center text-4xl border border-[var(--border-color)]">
            {AVATAR_EMOJIS[stats.player.avatar] || '🎮'}
          </div>
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-[var(--cobalt)]">
            {stats.player.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {stats.gamesPlayed} {stats.gamesPlayed === 1 ? 'game' : 'games'} played
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile value={stats.avgPoints} label="Avg pts / game" highlight />
        <StatTile value={stats.bestGame ?? '—'} label="Best game" />
        <StatTile value={stats.worstGame ?? '—'} label="Worst game" />
        <StatTile value={stats.gamesPlayed} label="Total games" />
      </div>

      {/* Score history chart */}
      {chartData.length > 1 && (
        <div className="felt-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
            Score History
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="areaCobalt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COBALT} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={COBALT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="game" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(37,99,235,0.2)', strokeWidth: 1 }} />
              <ReferenceLine
                y={avg}
                stroke={COBALT_MID}
                strokeDasharray="3 3"
                label={{ value: `avg ${avg}`, fill: COBALT_MID, fontSize: 9, position: 'right' }}
              />
              <Area
                type="monotone"
                dataKey="pts"
                stroke={COBALT_DARK}
                strokeWidth={2}
                fill="url(#areaCobalt)"
                dot={{ fill: COBALT, strokeWidth: 0, r: 3 }}
                activeDot={{ fill: COBALT_DARK, r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Performance indicator */}
      {stats.bestGame !== null && stats.worstGame !== null && stats.bestGame !== stats.worstGame && (
        <div className="felt-card p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Score range</p>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-[var(--cobalt-dark)] font-mono w-10 text-right">{stats.bestGame}</span>
            <div className="flex-1 relative h-2 rounded-full bg-[rgba(37,99,235,0.1)] overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full rounded-full"
                style={{
                  background: `linear-gradient(to right, var(--cobalt-mid), var(--cobalt-dark))`,
                  width: `${((avg - stats.bestGame) / (stats.worstGame - stats.bestGame)) * 100}%`,
                }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[var(--cobalt)] border-2 border-[hsl(var(--background))]"
                style={{
                  left: `calc(${((avg - stats.bestGame) / (stats.worstGame - stats.bestGame)) * 100}% - 6px)`,
                }}
              />
            </div>
            <span className="text-muted-foreground font-mono w-10">{stats.worstGame}</span>
          </div>
          <p className="text-center text-[10px] text-muted-foreground mt-1">best ← avg → worst</p>
        </div>
      )}

      {/* Recent games */}
      {stats.recentGames.length > 0 && (
        <div>
          <div className="suit-divider text-xs mb-4">Recent Games</div>
          <div className="space-y-2 stagger">
            {stats.recentGames.map(game => (
              <Link key={game.gameId} to={`/games/${game.gameId}/history`}>
                <div className="felt-card px-4 py-3 flex items-center justify-between hover:border-[rgba(37,99,235,0.3)] transition-all duration-200 group fade-up">
                  <div>
                    <p className="font-medium text-sm group-hover:text-[var(--cobalt)] transition-colors">
                      {game.seasonName}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(game.date).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' · '}{game.roundsPlayed} rounds
                    </p>
                  </div>
                  <span
                    className="font-mono text-lg font-semibold"
                    style={{ color: 'var(--cobalt)' }}
                  >
                    {game.totalPoints}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Head-to-Head */}
      {opponents.length > 0 && h2hQueries.some(q => q.data && q.data.gamesPlayed > 0) && (
        <div>
          <div className="suit-divider text-xs mb-4">Head-to-Head</div>
          <div className="space-y-2">
            {opponents.map((opp, i) => {
              const h2h = h2hQueries[i]?.data
              if (!h2h || h2h.gamesPlayed === 0) return null
              return (
                <div key={opp.playerId} className="felt-card px-4 py-3 flex items-center gap-3">
                  <span className="text-lg">{AVATAR_EMOJIS[opp.avatar ?? ''] || '🎮'}</span>
                  <span className="flex-1 text-sm font-medium">{opp.name}</span>
                  <div className="flex items-center gap-2 text-sm font-mono">
                    <span className="text-[var(--cobalt-dark)] font-semibold">{h2h.winsA}W</span>
                    <span className="text-muted-foreground">–</span>
                    <span className="text-muted-foreground">{h2h.winsB}L</span>
                    {h2h.ties > 0 && (
                      <span className="text-muted-foreground">– {h2h.ties}T</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
