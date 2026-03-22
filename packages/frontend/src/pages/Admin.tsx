import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Group } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from '@/hooks/useToast'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { CURRENCY_SYMBOL } from '@/lib/utils'

function toSlugPreview(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

function GroupDialog({
  open, onClose, group,
}: {
  open: boolean; onClose: () => void; group?: Group
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(group?.name || '')
  const [password, setPassword] = useState('')
  const [memberPassword, setMemberPassword] = useState('')
  const [currency, setCurrency] = useState<'GBP' | 'EUR' | 'USD'>(group?.currency ?? 'EUR')

  useEffect(() => {
    if (open) {
      setName(group?.name || '')
      setPassword('')
      setMemberPassword('')
      setCurrency(group?.currency ?? 'EUR')
    }
  }, [open, group])

  const mutation = useMutation({
    mutationFn: (data: { name?: string; password?: string; memberPassword?: string }) =>
      group
        ? api.patch<Group>(`/admin/groups/${group.id}`, data)
        : api.post<Group>('/admin/groups', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'groups'] })
      toast({ title: group ? 'Group updated' : 'Group created' })
      onClose()
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { toast({ title: 'Group name is required', variant: 'destructive' }); return }
    if ((!group && password.length < 6) || (password && password.length < 6)) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' }); return
    }
    if (memberPassword && memberPassword.length < 6) {
      toast({ title: 'Member password must be at least 6 characters', variant: 'destructive' }); return
    }
    const payload: Record<string, string> = { name }
    if (password) payload.password = password
    if (memberPassword) payload.memberPassword = memberPassword
    payload.currency = currency
    mutation.mutate(payload)
  }

  const slugPreview = toSlugPreview(name)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-[var(--border-color)]">
        <DialogHeader>
          <DialogTitle style={{ fontSize: '1.5rem' }}>
            {group ? 'Edit Group' : 'New Group'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group-name" className="text-xs uppercase tracking-widest text-muted-foreground">
              Group Name
            </Label>
            <Input
              id="group-name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="bg-[hsl(var(--secondary))] border-[var(--border-color)] focus:border-[var(--cobalt)] focus:ring-0"
            />
            {!group && name && (
              <p className="text-xs text-muted-foreground">Login handle: @{slugPreview || '…'}</p>
            )}
            {group && (
              <p className="text-xs text-muted-foreground">Login handle: @{group.username}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency" className="text-xs uppercase tracking-widest text-muted-foreground">
              Currency
            </Label>
            <select
              id="currency"
              value={currency}
              onChange={e => setCurrency(e.target.value as 'GBP' | 'EUR' | 'USD')}
              className="w-full rounded-md border border-[var(--border-color)] bg-[hsl(var(--secondary))] px-3 py-2 text-sm focus:border-[var(--cobalt)] focus:outline-none"
            >
              <option value="EUR">€ EUR</option>
              <option value="GBP">£ GBP</option>
              <option value="USD">$ USD</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-password" className="text-xs uppercase tracking-widest text-muted-foreground">
              Admin Password {group && <span className="normal-case tracking-normal text-muted-foreground/60">(leave blank to keep)</span>}
            </Label>
            <Input
              id="group-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required={!group}
              className="bg-[hsl(var(--secondary))] border-[var(--border-color)] focus:border-[var(--cobalt)] focus:ring-0"
            />
          </div>
          {/* Member Password */}
          <div className="space-y-1.5">
            <Label htmlFor="member-password" className="text-xs uppercase tracking-widest text-muted-foreground">
              Member Password
            </Label>
            <Input
              id="member-password"
              type="password"
              value={memberPassword}
              onChange={e => setMemberPassword(e.target.value)}
              placeholder="Optional — share with players for view-only access"
              className="bg-[hsl(var(--secondary))] border-[var(--border-color)] focus:border-[var(--cobalt)] focus:ring-0"
            />
            <p className="text-xs text-muted-foreground">
              Members can view scores and submit rounds, but cannot manage seasons, games, or players.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function Admin() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | undefined>()

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
          <h1 className="text-4xl font-bold text-[var(--cobalt-dark)]">
            Groups
          </h1>
        </div>
        <Button onClick={() => { setEditingGroup(undefined); setDialogOpen(true) }} size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
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
                  {group.hasMemberPassword && (
                    <span className="text-xs text-muted-foreground border border-[var(--border-color)] rounded px-1.5 py-0.5 leading-none">
                      Members enabled
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">@{group.username}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-[var(--cobalt)]"
                onClick={() => { setEditingGroup(group); setDialogOpen(true) }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
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
            <p className="text-muted-foreground text-sm">No groups yet</p>
          </div>
        )}
      </div>

      <GroupDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        group={editingGroup}
      />
    </div>
  )
}
