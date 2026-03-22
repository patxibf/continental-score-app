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
import { CURRENCY_SYMBOL } from '@/lib/utils'
import { Plus, ChevronRight } from 'lucide-react'

const isValidAmount = (val: string) => {
  const num = parseFloat(val)
  if (isNaN(num) || num <= 0) return false
  const parts = val.split('.')
  if (parts[1] && parts[1].length > 2) return false
  return true
}

export default function Seasons() {
  const queryClient = useQueryClient()
  const { isGroupAdmin, user } = useAuth()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [potEnabled, setPotEnabled] = useState(false)
  const [contributionAmount, setContributionAmount] = useState('')

  const currencySymbol = CURRENCY_SYMBOL[user?.currency ?? 'EUR'] ?? '€'

  const { data: seasons, isLoading } = useQuery<Season[]>({
    queryKey: ['seasons'],
    queryFn: () => api.get<Season[]>('/seasons'),
  })

  const createMutation = useMutation({
    mutationFn: (data: { name: string; potEnabled: boolean; contributionAmount?: number }) =>
      api.post<Season>('/seasons', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasons'] })
      toast({ title: 'Season created' })
      setDialogOpen(false)
      setName('')
      setPotEnabled(false)
      setContributionAmount('')
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  return (
    <div className="space-y-6 fade-up">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">All time</p>
          <h1 className="text-4xl font-bold text-[var(--cobalt)]">
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
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-accent animate-pulse" />)}
        </div>
      )}

      <div className="space-y-2 stagger">
        {seasons?.map(season => (
          <Link key={season.id} to={`/seasons/${season.id}`}>
            <div className="felt-card px-5 py-4 flex items-center justify-between hover:border-[rgba(37,99,235,0.3)] transition-all duration-200 group fade-up">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-sm">
                  🏆
                </div>
                <div>
                  <p className="font-semibold group-hover:text-[var(--cobalt)] transition-colors">{season.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {season._count?.games || 0} games · {season._count?.players || 0} players
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                  season.status === 'ACTIVE'
                    ? 'border-[rgba(37,99,235,0.4)] text-[var(--cobalt)] bg-[rgba(37,99,235,0.08)]'
                    : 'border-border text-muted-foreground'
                }`}>
                  {season.status === 'ACTIVE' ? 'Active' : 'Closed'}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-[var(--cobalt)] transition-colors" />
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
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) {
            setName('')
            setPotEnabled(false)
            setContributionAmount('')
          }
        }}>
          <DialogContent className="bg-white border-[var(--border-color)]">
            <DialogHeader>
              <DialogTitle style={{ fontSize: '1.5rem' }}>
                New Season
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={e => {
                e.preventDefault()
                createMutation.mutate({
                  name,
                  potEnabled,
                  ...(potEnabled && contributionAmount ? { contributionAmount: parseFloat(contributionAmount) } : {}),
                })
              }}
              className="space-y-4"
            >
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
                  className="focus:border-[var(--cobalt)] focus:ring-0"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="pot-enabled"
                  checked={potEnabled}
                  onChange={e => {
                    setPotEnabled(e.target.checked)
                    if (!e.target.checked) setContributionAmount('')
                  }}
                  aria-label="Money Pot"
                  className="h-4 w-4 cursor-pointer"
                />
                <Label htmlFor="pot-enabled" className="cursor-pointer text-sm font-medium">
                  Money Pot
                </Label>
              </div>
              {potEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="contribution-amount" className="text-xs uppercase tracking-widest text-muted-foreground">
                    Contribution Amount ({currencySymbol})
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      {currencySymbol}
                    </span>
                    <Input
                      id="contribution-amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={contributionAmount}
                      onChange={e => setContributionAmount(e.target.value)}
                      placeholder="0.00"
                      aria-label="Contribution Amount"
                      className="pl-7 focus:border-[var(--cobalt)] focus:ring-0"
                    />
                  </div>
                  {contributionAmount && !isValidAmount(contributionAmount) && (
                    <p className="text-xs text-destructive">
                      Amount must be greater than 0 with at most 2 decimal places.
                    </p>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || (potEnabled && (!contributionAmount || !isValidAmount(contributionAmount)))}
                >
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
