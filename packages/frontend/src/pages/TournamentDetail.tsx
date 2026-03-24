import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { toast } from '@/hooks/useToast'
import { api, Tournament, TournamentStage, TournamentTable, TournamentTablePlayer } from '@/lib/api'
import { ChevronRight, Trophy } from 'lucide-react'

const STATUS_LABEL: Record<Tournament['status'], string> = {
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
}

const STATUS_CLASS: Record<Tournament['status'], string> = {
  IN_PROGRESS: 'bg-green-100 text-green-700 border border-green-300',
  COMPLETED: 'bg-slate-100 text-slate-600 border border-slate-300',
}

const TABLE_STATUS_CLASS: Record<TournamentTable['status'], string> = {
  PENDING: 'bg-slate-100 text-slate-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
}

function TableCard({ table }: { table: TournamentTable }) {
  const activePlayers = table.players.filter(p => !p.isBye && p.player)
  return (
    <div className="felt-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Table {table.tableNumber}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full ${TABLE_STATUS_CLASS[table.status]}`}>
          {table.status === 'PENDING' ? 'Pending' : table.status === 'IN_PROGRESS' ? 'In Progress' : 'Completed'}
        </span>
      </div>
      <div className="space-y-1">
        {activePlayers.map(tp => (
          <div key={tp.id} className="flex items-center justify-between text-sm">
            <span className={tp.advanced ? 'text-green-600 font-medium' : ''}>
              {tp.player?.name}
              {tp.advanced && ' ✓'}
            </span>
            {tp.score !== undefined && (
              <span className="text-muted-foreground">{tp.score} pts</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function StageSection({ stage }: { stage: TournamentStage }) {
  const isFinal = stage.advancePerTable === 0
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">
          {isFinal ? 'Final' : `Stage ${stage.stageNumber}`}
        </h2>
        <span className="text-xs text-muted-foreground">
          Rounds {stage.startRound}–{stage.endRound}
        </span>
        {!isFinal && (
          <span className="text-xs text-muted-foreground">
            · {stage.advancePerTable} advance per table
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {stage.tables.map(table => (
          <TableCard key={table.id} table={table} />
        ))}
      </div>
    </div>
  )
}

export default function TournamentDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { isGroupAdmin } = useAuth()
  const [showModal, setShowModal] = useState(false)

  const { data: tournament, isLoading } = useQuery<Tournament>({
    queryKey: ['tournament', id],
    queryFn: () => api.get<Tournament>(`/tournaments/${id}`),
    enabled: !!id,
  })

  const advanceMutation = useMutation({
    mutationFn: () =>
      api.post(`/tournaments/${id}/stages/${currentStage!.id}/advance`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', id] })
      setShowModal(false)
    },
    onError: () => {
      toast({ title: 'Failed to advance stage. Please try again.', variant: 'destructive' })
    },
  })

  const currentStage = tournament?.stages.find(s => s.status === 'IN_PROGRESS')
  const allTablesComplete = currentStage?.tables.every(t => t.status === 'COMPLETED') ?? false
  const isFinalStage = currentStage?.advancePerTable === 0

  const showAdvancementBanner = isGroupAdmin && allTablesComplete && !isFinalStage && !!currentStage

  const advancingPlayers: TournamentTablePlayer[] = currentStage
    ? currentStage.tables.flatMap(t => t.players.filter(tp => tp.advanced && !tp.isBye))
    : []

  if (isLoading) {
    return (
      <div className="space-y-6 fade-up">
        <div className="h-12 rounded-xl bg-accent animate-pulse w-64" />
        <div className="h-6 rounded bg-accent animate-pulse w-32" />
      </div>
    )
  }

  if (!tournament) {
    return (
      <div className="felt-card p-10 text-center">
        <p className="text-muted-foreground">Tournament not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 fade-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Tournament</p>
          <h1 className="text-4xl font-bold text-[var(--cobalt)]">{tournament.name}</h1>
        </div>
        <span className={`text-sm px-3 py-1 rounded-full ${STATUS_CLASS[tournament.status]}`}>
          {STATUS_LABEL[tournament.status]}
        </span>
      </div>

      {/* Stage progress strip */}
      <div className="flex items-center gap-2">
        {tournament.stages.map((stage, i) => {
          const isCompleted = stage.status === 'COMPLETED'
          const isCurrent = stage.status === 'IN_PROGRESS'
          const isPending = stage.status === 'PENDING'
          const isFinal = stage.advancePerTable === 0
          return (
            <div key={stage.id} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <span
                className={[
                  'text-xs px-2 py-0.5 rounded border',
                  isCompleted ? 'bg-slate-100 text-slate-400 border-slate-200' : '',
                  isCurrent ? 'bg-blue-100 text-blue-700 border-blue-300 font-medium' : '',
                  isPending ? 'bg-transparent text-muted-foreground border-dashed border-slate-300' : '',
                ].join(' ')}
              >
                {isFinal ? 'Final' : `Stage ${stage.stageNumber}`}
              </span>
            </div>
          )
        })}
      </div>

      {/* Advancement banner */}
      {showAdvancementBanner && (
        <div className="felt-card p-4 border-amber-300 bg-amber-50 flex items-center justify-between">
          <p className="text-sm font-medium text-amber-800">
            All tables complete — ready to advance to the next stage.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="text-sm font-medium px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors"
          >
            Review & Release →
          </button>
        </div>
      )}

      {/* Stages */}
      <div className="space-y-8">
        {tournament.stages.map(stage => (
          <StageSection key={stage.id} stage={stage} />
        ))}
      </div>

      {/* Tournament complete */}
      {tournament.status === 'COMPLETED' && (
        <div className="felt-card p-8 text-center space-y-3">
          <Trophy className="h-12 w-12 mx-auto text-amber-500" />
          <h2 className="text-2xl font-bold">Tournament Complete</h2>
          <p className="text-muted-foreground">Congratulations to all participants!</p>
        </div>
      )}

      {/* Advancement confirmation modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl p-6 max-w-sm w-full mx-4 space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold">Advance to Next Stage</h2>
            {advancingPlayers.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">The following players will advance:</p>
                <ul className="space-y-1">
                  {advancingPlayers.map(tp => (
                    <li key={tp.id} className="text-sm font-medium text-green-600">
                      {tp.player?.name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Advancing all players from completed tables.
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 rounded-md border text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => advanceMutation.mutate()}
                disabled={advanceMutation.isPending}
                className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {advanceMutation.isPending ? 'Advancing…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
