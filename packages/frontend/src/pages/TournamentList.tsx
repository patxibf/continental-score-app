import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, TournamentSummary } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { ChevronRight, Plus } from 'lucide-react'

const STATUS_LABEL: Record<TournamentSummary['status'], string> = {
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
}

const STATUS_CLASS: Record<TournamentSummary['status'], string> = {
  IN_PROGRESS: 'bg-green-100 text-green-700 border border-green-300',
  COMPLETED: 'bg-slate-100 text-slate-600 border border-slate-300',
}

export default function TournamentList() {
  const { isGroupAdmin } = useAuth()

  const { data: tournaments, isLoading } = useQuery<TournamentSummary[]>({
    queryKey: ['tournaments'],
    queryFn: () => api.get<TournamentSummary[]>('/tournaments'),
  })

  return (
    <div className="space-y-6 fade-up">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">All time</p>
          <h1 className="text-4xl font-bold text-[var(--cobalt)]">
            Tournaments
          </h1>
        </div>
        {isGroupAdmin && (
          <Link
            to="/tournaments/new"
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New Tournament
          </Link>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-accent animate-pulse" />)}
        </div>
      )}

      <div className="space-y-2 stagger">
        {tournaments?.map(tournament => (
          <Link key={tournament.id} to={`/tournaments/${tournament.id}`}>
            <div className="felt-card px-5 py-4 flex items-center justify-between hover:border-[rgba(37,99,235,0.3)] transition-all duration-200 group fade-up">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-sm">
                  🏆
                </div>
                <div>
                  <p className="font-semibold group-hover:text-[var(--cobalt)] transition-colors">{tournament.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span>{tournament.playerCount} players</span>
                    <span> · </span>
                    <span>{new Date(tournament.createdAt).toLocaleDateString()}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CLASS[tournament.status]}`}>
                  {STATUS_LABEL[tournament.status]}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-[var(--cobalt)] transition-colors" />
              </div>
            </div>
          </Link>
        ))}
        {tournaments?.length === 0 && (
          <div className="felt-card p-10 text-center">
            <p className="text-4xl mb-3">🏆</p>
            <p className="text-muted-foreground">No tournaments yet</p>
          </div>
        )}
      </div>
    </div>
  )
}
