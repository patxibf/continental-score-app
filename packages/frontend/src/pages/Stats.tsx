import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, Standing } from '@/lib/api'
import { AVATAR_EMOJIS } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, Cell,
} from 'recharts'

const COBALT = '#2563eb'
const COBALT_MID = '#3b5cc4'
const COBALT_DARK = '#1e3a8a'
const PALETTE = ['#6b8ce8', COBALT, COBALT_MID, COBALT_DARK, '#1a3070', '#142558', '#0e1a40', '#09122e']

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="felt-card px-3 py-2 text-sm">
      <p className="text-[var(--cobalt)] font-semibold">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="text-foreground/80">
          {p.name}: <span className="font-mono text-[var(--cobalt-dark)]">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

function WinRateRing({ winRate, size = 72 }: { winRate: number; size?: number }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const fill = (winRate / 100) * circ

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(37,99,235,0.1)" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="url(#cobaltGrad)" strokeWidth={6}
        strokeDasharray={`${fill} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.22,1,0.36,1)' }}
      />
      <defs>
        <linearGradient id="cobaltGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={COBALT_MID} />
          <stop offset="100%" stopColor={COBALT_DARK} />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default function Stats() {
  const { data: leaderboard, isLoading } = useQuery<Standing[]>({
    queryKey: ['stats', 'all-time'],
    queryFn: () => api.get<Standing[]>('/stats/all-time'),
  })

  if (isLoading) {
    return (
      <div className="space-y-6 fade-up">
        <h1 className="text-4xl font-bold text-[var(--cobalt-dark)]">
          Statistics
        </h1>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-xl bg-accent animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!leaderboard || leaderboard.length === 0) {
    return (
      <div className="space-y-6 fade-up">
        <h1 className="text-4xl font-bold text-[var(--cobalt-dark)]">
          Statistics
        </h1>
        <div className="felt-card p-12 text-center">
          <p className="text-5xl mb-4">🎴</p>
          <p className="text-muted-foreground">No stats yet — play some games first!</p>
        </div>
      </div>
    )
  }

  const maxAvg = Math.max(...leaderboard.map(s => s.avgPoints ?? 0))
  const barData = leaderboard.map(s => ({
    name: s.playerName.split(' ')[0],
    avg: s.avgPoints ?? 0,
    games: s.gamesPlayed,
  }))

  const pieData = leaderboard.map((s, i) => ({
    name: s.playerName.split(' ')[0],
    value: s.wins,
    fill: PALETTE[i] || PALETTE[PALETTE.length - 1],
  }))

  return (
    <div className="space-y-8 fade-up">
      <div>
        <h1 className="text-4xl font-bold text-[var(--cobalt-dark)]">
          Statistics
        </h1>
        <div className="flex items-center justify-between mt-1">
          <p className="text-muted-foreground text-sm tracking-wide">All-time standings</p>
          <Link to="/stats/alltime">
            <Button variant="outline" size="sm" className="text-xs">All-Time →</Button>
          </Link>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="space-y-2 stagger">
        {leaderboard.map((s, idx) => {
          const pct = maxAvg > 0 ? ((s.avgPoints ?? 0) / maxAvg) * 100 : 0
          const medal = ['🥇', '🥈', '🥉'][idx]

          return (
            <Link key={s.playerId} to={`/stats/players/${s.playerId}`}>
              <div className="felt-card p-4 hover:border-[rgba(37,99,235,0.3)] transition-all duration-300 hover:shadow-[0_0_20px_rgba(37,99,235,0.08)] group fade-up">
                <div className="flex items-center gap-4">
                  {/* Rank */}
                  <div className="w-8 text-center flex-shrink-0">
                    {medal ? (
                      <span className="text-lg">{medal}</span>
                    ) : (
                      <span className="text-xs font-mono text-muted-foreground">{idx + 1}</span>
                    )}
                  </div>

                  {/* Avatar */}
                  <span className="text-2xl flex-shrink-0">{AVATAR_EMOJIS[s.playerAvatar] || '🎮'}</span>

                  {/* Name + bar */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-sm group-hover:text-[var(--cobalt)] transition-colors truncate">
                        {s.playerName}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground flex-shrink-0 ml-2">
                        {s.gamesPlayed}g
                      </span>
                    </div>
                    <div className="score-bar">
                      <div className="score-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex-shrink-0 text-right">
                    <p className="stat-number text-xl leading-none">{s.avgPoints}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">avg pts</p>
                  </div>

                  {/* Win rate ring */}
                  <div className="flex-shrink-0 relative">
                    <WinRateRing winRate={s.winRate ?? 0} size={52} />
                    <span
                      className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-[var(--cobalt)]"
                      style={{ transform: 'rotate(0deg)' }}
                    >
                      {s.winRate}%
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Avg Points Bar Chart */}
      {leaderboard.length > 1 && (
        <div className="felt-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
            Average Points per Game
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(37,99,235,0.05)' }} />
              <Bar dataKey="avg" radius={[4, 4, 0, 0]} name="Avg pts">
                {barData.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? COBALT_DARK : i === 1 ? COBALT : COBALT_MID} opacity={i > 2 ? 0.6 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Wins radial */}
      {leaderboard.some(s => s.wins > 0) && (
        <div className="felt-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Total Wins</p>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={160} height={160}>
              <RadialBarChart
                cx="50%" cy="50%"
                innerRadius={28} outerRadius={72}
                data={pieData.filter(d => d.value > 0)}
                startAngle={90} endAngle={-270}
              >
                <RadialBar dataKey="value" cornerRadius={4} background={{ fill: 'rgba(37,99,235,0.05)' }} />
                <Tooltip content={<CustomTooltip />} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {leaderboard.filter(s => s.wins > 0).map((s, i) => (
                <div key={s.playerId} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PALETTE[i] }} />
                  <span className="text-xs text-muted-foreground truncate flex-1">{s.playerName.split(' ')[0]}</span>
                  <span className="text-xs font-mono text-[var(--cobalt)] flex-shrink-0">{s.wins}W</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
