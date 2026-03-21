import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function Login() {
  const { login, loginError, isLoggingIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    login({ username, password })
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background atmosphere */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[var(--gold)] opacity-[0.04] blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-[var(--felt)] opacity-40 blur-[80px]" />
      </div>

      <div className="w-full max-w-sm relative fade-up">
        {/* Logo area */}
        <div className="text-center mb-10">
          <div className="text-6xl mb-4 select-none">🃏</div>
          <h1
            className="text-5xl font-bold text-[var(--gold)] mb-1"
            style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic' }}
          >
            Continental
          </h1>
          <p className="text-sm text-muted-foreground tracking-widest uppercase">
            Scorekeeper
          </p>
        </div>

        {/* Card */}
        <div className="felt-card p-8 space-y-6">
          <div className="suit-divider text-xs">Access</div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs uppercase tracking-widest text-muted-foreground">
                Group
              </Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="your-group"
                required
                autoComplete="username"
                className="bg-[rgba(255,255,255,0.04)] border-[rgba(201,168,76,0.2)] focus:border-[var(--gold)] focus:ring-0 placeholder:text-muted-foreground/40 h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs uppercase tracking-widest text-muted-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="bg-[rgba(255,255,255,0.04)] border-[rgba(201,168,76,0.2)] focus:border-[var(--gold)] focus:ring-0 h-11"
              />
            </div>

            {loginError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                {loginError}
              </p>
            )}

            <Button type="submit" className="w-full h-11 mt-2 text-sm" disabled={isLoggingIn}>
              {isLoggingIn ? 'Entering…' : 'Enter Club'}
            </Button>
          </form>
        </div>

        {/* Suits */}
        <p className="text-center text-muted-foreground/30 text-sm mt-8 tracking-widest select-none">
          ♠ ♥ ♦ ♣
        </p>
      </div>
    </div>
  )
}
