import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Group } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from '@/hooks/useToast'
import { Plus, Pencil, Trash2 } from 'lucide-react'

function GroupDialog({
  open, onClose, group,
}: {
  open: boolean; onClose: () => void; group?: Group
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(group?.name || '')
  const [username, setUsername] = useState(group?.username || '')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (open) {
      setName(group?.name || '')
      setUsername(group?.username || '')
      setPassword('')
    }
  }, [open, group])

  const mutation = useMutation({
    mutationFn: (data: { name?: string; username?: string; password?: string }) =>
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
    if (!group && !username.trim()) { toast({ title: 'Username is required', variant: 'destructive' }); return }
    if (!group && username.length < 3) { toast({ title: 'Username must be at least 3 characters', variant: 'destructive' }); return }
    if ((!group && password.length < 6) || (password && password.length < 6)) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' }); return
    }
    const data: Record<string, string> = { name }
    if (!group) data.username = username
    if (password) data.password = password
    mutation.mutate(data)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[var(--felt-card)] border-[rgba(201,168,76,0.2)]">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.5rem' }}>
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
              className="bg-[rgba(255,255,255,0.04)] border-[rgba(201,168,76,0.2)] focus:border-[var(--gold)] focus:ring-0"
            />
          </div>
          {!group && (
            <div className="space-y-2">
              <Label htmlFor="group-username" className="text-xs uppercase tracking-widest text-muted-foreground">
                Username
              </Label>
              <Input
                id="group-username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="lowercase, numbers, hyphens"
                required
                className="bg-[rgba(255,255,255,0.04)] border-[rgba(201,168,76,0.2)] focus:border-[var(--gold)] focus:ring-0"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="group-password" className="text-xs uppercase tracking-widest text-muted-foreground">
              Password {group && <span className="normal-case tracking-normal text-muted-foreground/60">(leave blank to keep)</span>}
            </Label>
            <Input
              id="group-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required={!group}
              className="bg-[rgba(255,255,255,0.04)] border-[rgba(201,168,76,0.2)] focus:border-[var(--gold)] focus:ring-0"
            />
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
          <h1 className="text-4xl font-bold text-[var(--gold)]" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
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
          {[1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-[rgba(201,168,76,0.04)] animate-pulse" />)}
        </div>
      )}

      <div className="space-y-2 stagger">
        {groups?.map(group => (
          <div key={group.id} className="felt-card px-4 py-3.5 flex items-center justify-between fade-up">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[rgba(201,168,76,0.1)] flex items-center justify-center text-sm border border-[rgba(201,168,76,0.15)]">
                🃏
              </div>
              <div>
                <p className="font-semibold text-sm">{group.name}</p>
                <p className="text-xs text-muted-foreground">@{group.username}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-[var(--gold)]"
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
