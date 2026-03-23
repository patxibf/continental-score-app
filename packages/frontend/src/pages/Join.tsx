import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api, InvitationPreview } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/useToast'

export default function Join() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, isLoading: authLoading } = useAuth()
  const token = searchParams.get('token') ?? ''

  const { data: invitation, isLoading, error } = useQuery<InvitationPreview>({
    queryKey: ['invitation', token],
    queryFn: () => api.get<InvitationPreview>(`/players/invitation/${token}`),
    enabled: !!token,
    retry: false,
  })

  const claimMutation = useMutation({
    mutationFn: () => api.post<{ message: string }>('/players/invitation/claim', { token }),
    onSuccess: () => {
      toast({ title: 'Welcome! You have joined the group.' })
      navigate('/dashboard')
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="felt-card p-10 text-center max-w-sm">
          <p className="text-4xl mb-3">🔗</p>
          <p className="text-muted-foreground">Invalid invitation link.</p>
        </div>
      </div>
    )
  }

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (error || !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="felt-card p-10 text-center max-w-sm">
          <p className="text-4xl mb-3">⚠️</p>
          <h1 className="text-xl font-bold mb-2">Invalid or expired invitation</h1>
          <p className="text-muted-foreground">This invitation link is no longer valid. Ask your group admin to resend it.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="felt-card p-10 text-center max-w-sm space-y-4">
        <p className="text-4xl mb-2">🎴</p>
        <h1 className="text-2xl font-bold text-[var(--cobalt)]">You're invited!</h1>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">{invitation.playerName}</span>, you've been invited to join{' '}
          <span className="font-semibold text-foreground">{invitation.groupName}</span> on Continental.
        </p>
        {user ? (
          <Button
            className="w-full"
            disabled={claimMutation.isPending}
            onClick={() => claimMutation.mutate()}
          >
            {claimMutation.isPending ? 'Joining…' : 'Accept Invitation'}
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={() => navigate(`/login?next=/join?token=${token}`)}
          >
            Log in to accept
          </Button>
        )}
      </div>
    </div>
  )
}
