import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, Season } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import { Plus, ChevronRight } from 'lucide-react'

export default function Seasons() {
  const queryClient = useQueryClient()
  const { isGroupAdmin } = useAuth()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')

  const { data: seasons, isLoading } = useQuery<Season[]>({
    queryKey: ['seasons'],
    queryFn: () => api.get<Season[]>('/seasons'),
  })

  const createMutation = useMutation({
    mutationFn: (data: { name: string }) => api.post<Season>('/seasons', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasons'] })
      toast({ title: 'Season created' })
      setDialogOpen(false)
      setName('')
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  return (
    <div className="space-y-6 fade-up">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">All time</p>
          <h1 className="text-4xl font-bold text-[var(--gold)]" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
            Seasons
          </h1>
        </div>
        {isGroupAdmin && (
          <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-[rgba(201,168,76,0.04)] animate-pulse" />)}
        </div>
      )}

      <div className="space-y-2 stagger">
        {seasons?.map(season => (
          <Link key={season.id} to={`/seasons/${season.id}`}>
            <div className="felt-card px-5 py-4 flex items-center justify-between hover:border-[rgba(201,168,76,0.3)] transition-all duration-200 group fade-up">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-[rgba(201,168,76,0.08)] flex items-center justify-center text-sm">
                  🏆
                </div>
                <div>
                  <p className="font-semibold group-hover:text-[var(--gold)] transition-colors">{season.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {season._count?.games || 0} games · {season._count?.players || 0} players
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                  season.status === 'ACTIVE'
                    ? 'border-[rgba(201,168,76,0.4)] text-[var(--gold)] bg-[rgba(201,168,76,0.08)]'
                    : 'border-[rgba(255,255,255,0.08)] text-muted-foreground'
                }`}>
                  {season.status === 'ACTIVE' ? 'Active' : 'Closed'}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-[var(--gold)] transition-colors" />
              </div>
            </div>
          </Link>
        ))}
        {seasons?.length === 0 && (
          <div className="felt-card p-10 text-center">
            <p className="text-4xl mb-3">🎴</p>
            <p className="text-muted-foreground">No seasons yet</p>
          </div>
        )}
      </div>

      {isGroupAdmin && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-[var(--felt-card)] border-[rgba(201,168,76,0.2)]">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.5rem' }}>
                New Season
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={e => { e.preventDefault(); createMutation.mutate({ name }) }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="season-name" className="text-xs uppercase tracking-widest text-muted-foreground">
                  Season Name
                </Label>
                <Input
                  id="season-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Summer 2024"
                  required
                  className="bg-[rgba(255,255,255,0.04)] border-[rgba(201,168,76,0.2)] focus:border-[var(--gold)] focus:ring-0"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating…' : 'Create Season'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
