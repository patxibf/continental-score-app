import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/useToast'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const token = params.get('token') ?? ''

  const mutation = useMutation({
    mutationFn: () => api.post('/auth/reset-password', { token, password }),
    onSuccess: () => {
      toast({ title: 'Password updated. Please sign in.' })
      navigate('/login')
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      toast({ title: 'Passwords do not match', variant: 'destructive' })
      return
    }
    mutation.mutate()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm fade-up">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🃏</div>
          <h1 className="text-3xl font-bold text-[var(--cobalt)]">New password</h1>
        </div>
        <div className="felt-card p-8 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">New Password</Label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                required
                minLength={8}
                className="bg-[hsl(var(--secondary))] border-[var(--border-color)] h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Confirm Password</Label>
              <Input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                className="bg-[hsl(var(--secondary))] border-[var(--border-color)] h-11"
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={mutation.isPending || !token}>
              {mutation.isPending ? 'Saving…' : 'Set new password'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
