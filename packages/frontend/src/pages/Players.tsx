import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Player } from '@/lib/api'
import { AVATAR_OPTIONS, AVATAR_EMOJIS } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import { Plus, Pencil, Mail } from 'lucide-react'

function PlayerDialog({
  open, onClose, player,
}: {
  open: boolean; onClose: () => void; player?: Player
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(player?.name || '')
  const [avatar, setAvatar] = useState(player?.avatar || 'cat')

  useEffect(() => {
    if (open) {
      setName(player?.name || '')
      setAvatar(player?.avatar || 'cat')
    }
  }, [open, player])

  const mutation = useMutation({
    mutationFn: (data: { name: string; avatar: string }) =>
      player ? api.patch<Player>(`/players/${player.id}`, data) : api.post<Player>('/players', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] })
      toast({ title: player ? 'Player updated' : 'Player created' })
      onClose()
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-[var(--border-color)]">
        <DialogHeader>
          <DialogTitle style={{ fontSize: '1.5rem' }}>
            {player ? 'Edit Player' : 'New Player'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate({ name, avatar }) }} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-xs uppercase tracking-widest text-muted-foreground">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Player name"
              required
              className="bg-[hsl(var(--secondary))] border-[var(--border-color)] focus:border-[var(--cobalt)] focus:ring-0"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Avatar</Label>
            <div className="grid grid-cols-5 gap-2">
              {AVATAR_OPTIONS.map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAvatar(a)}
                  className={`text-2xl p-2.5 rounded-xl transition-all duration-150 ${
                    avatar === a
                      ? 'bg-[rgba(37,99,235,0.15)] border border-[rgba(37,99,235,0.5)] scale-110'
                      : 'bg-transparent border border-transparent hover:border-[var(--border-color)]'
                  }`}
                  title={a}
                >
                  {AVATAR_EMOJIS[a]}
                </button>
              ))}
            </div>
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

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (open) {
      setName('')
      setEmail('')
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: (data: { name: string; email: string }) =>
      api.post<{ message: string }>('/players/invite', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] })
      toast({ title: 'Invitation sent' })
      onClose()
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-[var(--border-color)]">
        <DialogHeader>
          <DialogTitle style={{ fontSize: '1.5rem' }}>Invite Player</DialogTitle>
        </DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate({ name, email }) }} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="invite-name" className="text-xs uppercase tracking-widest text-muted-foreground">Name</Label>
            <Input
              id="invite-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Player name"
              required
              minLength={2}
              maxLength={50}
              className="bg-[hsl(var(--secondary))] border-[var(--border-color)] focus:border-[var(--cobalt)] focus:ring-0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-email" className="text-xs uppercase tracking-widest text-muted-foreground">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="player@example.com"
              required
              className="bg-[hsl(var(--secondary))] border-[var(--border-color)] focus:border-[var(--cobalt)] focus:ring-0"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Sending…' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function Players() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | undefined>()
  const [inviteOpen, setInviteOpen] = useState(false)
  const { isGroupAdmin } = useAuth()

  const { data: players, isLoading } = useQuery<Player[]>({
    queryKey: ['players'],
    queryFn: () => api.get<Player[]>('/players'),
  })

  const openCreate = () => { setEditingPlayer(undefined); setDialogOpen(true) }
  const openEdit = (player: Player) => { setEditingPlayer(player); setDialogOpen(true) }

  return (
    <div className="space-y-6 fade-up">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Your group</p>
          <h1 className="text-4xl font-bold text-[var(--cobalt)]">
            Players
          </h1>
        </div>
        {isGroupAdmin && (
          <div className="flex gap-2">
            <Button onClick={() => setInviteOpen(true)} size="sm" variant="outline" className="gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              Invite
            </Button>
            <Button onClick={openCreate} size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-accent animate-pulse" />)}
        </div>
      )}

      <div className="space-y-2 stagger">
        {players?.map(player => {
          const isPending = player.userId === null || player.userId === undefined && player.inviteToken != null
          // A true pending invite: userId is null/undefined but email exists
          const isInvited = player.userId == null && player.email != null

          return (
            <div key={player.id} className="felt-card px-4 py-3 flex items-center justify-between fade-up">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl border border-border ${isInvited ? 'bg-muted' : 'bg-accent'}`}>
                  {isInvited ? '🕒' : (AVATAR_EMOJIS[player.avatar] || '🎮')}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{player.name}</p>
                    {isInvited && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                        Invited
                      </span>
                    )}
                  </div>
                  {isInvited && player.email && (
                    <p className="text-xs text-muted-foreground">{player.email}</p>
                  )}
                  {!player.active && (
                    <p className="text-xs text-muted-foreground">Inactive</p>
                  )}
                </div>
              </div>
              {isGroupAdmin && !isInvited && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(player)}
                  className="text-muted-foreground hover:text-[var(--cobalt)] h-8 w-8"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )
        })}
        {players?.length === 0 && (
          <div className="felt-card p-10 text-center">
            <p className="text-4xl mb-3">🎭</p>
            <p className="text-muted-foreground">No players yet</p>
          </div>
        )}
      </div>

      <PlayerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        player={editingPlayer}
      />
      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </div>
  )
}
