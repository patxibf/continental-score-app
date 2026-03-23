import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, GroupSettings } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { CURRENCY_SYMBOL } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/useToast'

export default function Settings() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isOwner = user?.groupRole === 'owner'

  const { data: group } = useQuery<GroupSettings>({
    queryKey: ['group-settings'],
    queryFn: () => api.get<GroupSettings>('/groups/current'),
  })

  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<'GBP' | 'EUR' | 'USD'>('EUR')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    if (group) {
      setName(group.name)
      setCurrency(group.currency)
    }
  }, [group])

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; currency?: string }) =>
      api.patch('/groups/current', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-me'] })
      queryClient.invalidateQueries({ queryKey: ['group-settings'] })
      toast({ title: 'Settings saved' })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete('/groups/current'),
    onSuccess: () => {
      navigate('/login')
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate({ name, currency })
  }

  return (
    <div className="space-y-8 fade-up">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Group</p>
        <h1 className="text-4xl font-bold text-[var(--cobalt)]">Settings</h1>
      </div>

      {/* Group Info */}
      <div className="felt-card p-5 space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Group Info</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group-name" className="text-xs uppercase tracking-widest text-muted-foreground">
              Group Name
            </Label>
            <Input
              id="group-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Group name"
              required
              minLength={2}
              maxLength={50}
              className="bg-[hsl(var(--secondary))] border-[var(--border-color)] focus:border-[var(--cobalt)] focus:ring-0"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Currency</Label>
            <div className="flex gap-2">
              {(['GBP', 'EUR', 'USD'] as const).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                    currency === c
                      ? 'bg-[rgba(37,99,235,0.1)] border-[rgba(37,99,235,0.5)] text-[var(--cobalt)]'
                      : 'bg-transparent border-[var(--border-color)] text-muted-foreground hover:border-[var(--cobalt)]'
                  }`}
                >
                  {CURRENCY_SYMBOL[c]} {c}
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" disabled={updateMutation.isPending} className="w-full">
            {updateMutation.isPending ? 'Saving…' : 'Save Settings'}
          </Button>
        </form>
      </div>

      {/* Danger Zone — owner only */}
      {isOwner && (
        <div className="felt-card p-5 space-y-4 border border-red-200">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-red-600">Danger Zone</h2>
          <p className="text-sm text-muted-foreground">
            Permanently delete this group and all its data. This action cannot be undone.
          </p>

          {!showDeleteConfirm ? (
            <Button
              variant="ghost"
              className="w-full border border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete Group
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-red-700">
                Are you sure? This will permanently delete the group and all associated data.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate()}
                >
                  {deleteMutation.isPending ? 'Deleting…' : 'Yes, Delete Group'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
