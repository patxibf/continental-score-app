import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { api, AuthUser } from '@/lib/api'
import { toast } from '@/hooks/useToast'

export default function PickGroup() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: user } = useQuery<AuthUser>({ queryKey: ['auth', 'me'] })

  const switchMutation = useMutation({
    mutationFn: (groupId: string) => api.post<AuthUser>('/auth/switch-group', { groupId }),
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'me'], data)
      navigate('/dashboard')
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const groups = user?.groups ?? []

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm fade-up">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🃏</div>
          <h1 className="text-3xl font-bold text-[var(--cobalt)]">Pick a group</h1>
          <p className="text-sm text-muted-foreground mt-1">You belong to multiple groups</p>
        </div>
        <div className="space-y-2">
          {groups.map(g => (
            <button
              key={g.groupId}
              onClick={() => switchMutation.mutate(g.groupId)}
              disabled={switchMutation.isPending}
              className="w-full felt-card p-4 text-left hover:border-[rgba(37,99,235,0.3)] transition-all"
            >
              <p className="font-semibold">{g.groupName}</p>
              <p className="text-xs text-muted-foreground">{g.groupRole}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
