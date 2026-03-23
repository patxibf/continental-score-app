import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Group } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/useToast'
import { Trash2 } from 'lucide-react'
import { CURRENCY_SYMBOL } from '@/lib/utils'

export default function Admin() {
  const queryClient = useQueryClient()

  const { data: groups, isLoading } = useQuery<Group[]>({
    queryKey: ['admin', 'groups'],
    queryFn: () => api.get<Group[]>('/admin/groups'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/groups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'groups'] })
      toast({ title: 'Group deleted' })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  return (
    <div className="space-y-6 fade-up">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Administration</p>
          <h1 className="text-4xl font-bold text-[var(--cobalt)]">
            Groups
          </h1>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-accent animate-pulse" />)}
        </div>
      )}

      <div className="space-y-2 stagger">
        {groups?.map(group => (
          <div key={group.id} className="felt-card px-4 py-3.5 flex items-center justify-between fade-up">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[rgba(37,99,235,0.1)] flex items-center justify-center text-sm border border-[rgba(37,99,235,0.15)]">
                🃏
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{group.name}</p>
                  <span className="text-xs text-muted-foreground border border-[var(--border-color)] rounded px-1.5 py-0.5 leading-none">
                    {CURRENCY_SYMBOL[group.currency] || group.currency}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">@{group.slug}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${group.name}`}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (confirm(`Delete "${group.name}"? This cannot be undone.`)) {
                    deleteMutation.mutate(group.id)
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        {groups?.length === 0 && (
          <div className="felt-card p-10 text-center">
            <p className="text-muted-foreground text-sm">No groups yet. Groups are created via self-serve registration.</p>
          </div>
        )}
      </div>
    </div>
  )
}
