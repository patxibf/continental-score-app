import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api, Player, Game as GameType } from '@/lib/api'
import { AVATAR_EMOJIS } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/useToast'
import { Check } from 'lucide-react'

export default function NewGame() {
  const { seasonId } = useParams<{ seasonId: string }>()
  const navigate = useNavigate()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: players } = useQuery<Player[]>({
    queryKey: ['players'],
    queryFn: () => api.get<Player[]>('/players'),
  })

  const createMutation = useMutation({
    mutationFn: (playerIds: string[]) =>
      api.post<GameType>(`/seasons/${seasonId}/games`, { playerIds }),
    onSuccess: game => { navigate(`/games/${game.id}`) },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const togglePlayer = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleStart = () => {
    if (selectedIds.size < 2) {
      toast({ title: 'Select at least 2 players', variant: 'destructive' })
      return
    }
    createMutation.mutate(Array.from(selectedIds))
  }

  const activePlayers = players?.filter(p => p.active) || []

  return (
    <div className="space-y-6 fade-up">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Let's play</p>
        <h1 className="text-4xl font-bold text-[var(--cobalt-dark)]">
          New Game
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Select 2–8 players</p>
      </div>

      <div className="space-y-2 stagger">
        {activePlayers.map(player => {
          const selected = selectedIds.has(player.id)
          return (
            <button
              key={player.id}
              onClick={() => togglePlayer(player.id)}
              className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all duration-150 fade-up ${
                selected
                  ? 'border-[rgba(37,99,235,0.5)] bg-[rgba(37,99,235,0.06)] shadow-[0_0_12px_rgba(37,99,235,0.08)]'
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
        {activePlayers.length === 0 && (
          <div className="felt-card p-10 text-center">
            <p className="text-4xl mb-3">🎭</p>
            <p className="text-muted-foreground">No players found — add players first</p>
          </div>
        )}
      </div>

      <div className="sticky bottom-20 pb-2">
        <Button
          className="w-full h-12 text-base gap-2"
          onClick={handleStart}
          disabled={selectedIds.size < 2 || createMutation.isPending}
        >
          {createMutation.isPending
            ? 'Starting…'
            : selectedIds.size < 2
            ? 'Select players to start'
            : `Start Game · ${selectedIds.size} players`}
        </Button>
      </div>
    </div>
  )
}
