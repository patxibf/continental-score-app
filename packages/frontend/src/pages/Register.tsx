import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, AuthUser } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AVATAR_EMOJIS } from '@/lib/utils'
import { toast } from '@/hooks/useToast'

const AVATARS = Object.keys(AVATAR_EMOJIS)

export default function Register() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [groupName, setGroupName] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [avatar, setAvatar] = useState('cat')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const registerMutation = useMutation({
    mutationFn: (data: object) => api.post<AuthUser>('/auth/register', data),
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'me'], data)
      navigate('/dashboard')
      toast({ title: 'Welcome! Check your email to verify your account.' })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }
    setPasswordError('')
    registerMutation.mutate({ groupName, playerName, avatar, email, password })
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[var(--cobalt-light)] opacity-[0.08] blur-[120px]" />
      </div>

      <div className="w-full max-w-sm relative fade-up">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3 select-none">🃏</div>
          <h1 className="text-4xl font-bold text-[var(--cobalt)]">Continental</h1>
          <p className="text-sm text-muted-foreground tracking-widest uppercase mt-1">Create your group</p>
        </div>

        <div className="felt-card p-8 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Group Name</Label>
              <Input
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="The Card Sharks"
                required
                minLength={2}
                className="bg-[hsl(var(--secondary))] border-[var(--border-color)] h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Your Name</Label>
              <Input
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                placeholder="Alice"
                required
                minLength={2}
                className="bg-[hsl(var(--secondary))] border-[var(--border-color)] h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Avatar</Label>
              <div className="grid grid-cols-5 gap-2">
                {AVATARS.map(key => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAvatar(key)}
                    className={`h-10 rounded-lg text-xl flex items-center justify-center border-2 transition-all ${
                      avatar === key
                        ? 'border-[var(--cobalt)] bg-[rgba(37,99,235,0.08)]'
                        : 'border-border hover:border-[rgba(37,99,235,0.3)]'
                    }`}
                  >
                    {AVATAR_EMOJIS[key]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="bg-[hsl(var(--secondary))] border-[var(--border-color)] h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Password</Label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                required
                minLength={8}
                autoComplete="new-password"
                className="bg-[hsl(var(--secondary))] border-[var(--border-color)] h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Confirm Password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="bg-[hsl(var(--secondary))] border-[var(--border-color)] h-11"
              />
            </div>

            {passwordError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{passwordError}</p>
            )}

            <Button type="submit" className="w-full h-11 mt-2" disabled={registerMutation.isPending}>
              {registerMutation.isPending ? 'Creating…' : 'Create Group'}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-[var(--cobalt)] hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
