import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const mutation = useMutation({
    mutationFn: () => api.post('/auth/forgot-password', { email }),
    onSuccess: () => setSent(true),
  })

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="felt-card p-10 text-center max-w-sm w-full">
          <p className="text-3xl mb-4">📧</p>
          <p className="font-semibold">Check your email</p>
          <p className="text-sm text-muted-foreground mt-2">
            If that address is registered, you'll receive a reset link shortly.
          </p>
          <Link to="/login" className="text-sm text-[var(--cobalt)] hover:underline mt-4 block">
            Back to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm fade-up">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🃏</div>
          <h1 className="text-3xl font-bold text-[var(--cobalt)]">Forgot password?</h1>
        </div>
        <div className="felt-card p-8 space-y-5">
          <form onSubmit={e => { e.preventDefault(); mutation.mutate() }} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="bg-[hsl(var(--secondary))] border-[var(--border-color)] h-11"
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={mutation.isPending}>
              {mutation.isPending ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/login" className="text-[var(--cobalt)] hover:underline">Back to login</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
