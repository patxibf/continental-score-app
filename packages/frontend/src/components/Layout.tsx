import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Home, Users, Trophy, BarChart3, Settings, LogOut } from 'lucide-react'

const navItems = [
  { to: '/dashboard', label: 'Home', icon: Home },
  { to: '/players', label: 'Players', icon: Users },
  { to: '/seasons', label: 'Seasons', icon: Trophy },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, emailVerified, resendVerification, isResending } = useAuth()
  const location = useLocation()

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-[rgba(37,99,235,0.12)] bg-[hsl(var(--background))]/90 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2.5 group">
            <span className="text-xl">🃏</span>
            <span
              className="hidden sm:block text-lg font-semibold tracking-wide text-[var(--cobalt)]"
            >
              Continental
            </span>
          </Link>
          <div className="flex items-center gap-1">
            {user?.role === 'admin' && (
              <Link to="/admin">
                <Button variant="ghost" size="sm" className="text-xs gap-1.5">
                  <Settings className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Admin</span>
                </Button>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logout()}
              className="text-muted-foreground hover:text-[var(--cobalt)]"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {user?.role === 'user' && !emailVerified && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 flex items-center justify-between gap-4">
          <p className="text-xs text-yellow-800">Please verify your email address.</p>
          <button
            onClick={() => resendVerification()}
            disabled={isResending}
            className="text-xs text-yellow-700 font-medium hover:underline flex-shrink-0"
          >
            {isResending ? 'Sending…' : 'Resend →'}
          </button>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        {children}
      </main>

      {/* Bottom nav — group users only */}
      {user?.role !== 'admin' && (
        <nav className="sticky bottom-0 z-40 border-t border-[rgba(37,99,235,0.12)] bg-[hsl(var(--background))]/90 backdrop-blur-md">
          <div className="max-w-2xl mx-auto flex">
            {navItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname.startsWith(to)
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    'flex-1 flex flex-col items-center py-2.5 text-xs gap-1 transition-all duration-200',
                    active
                      ? 'text-[var(--cobalt)]'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className={cn('h-5 w-5 transition-transform duration-200', active && 'scale-110')} />
                  <span className="font-medium">{label}</span>
                  {active && (
                    <span className="absolute bottom-0 h-[2px] w-8 bg-[var(--cobalt)] rounded-t-full" />
                  )}
                </Link>
              )
            })}
          </div>
        </nav>
      )}
    </div>
  )
}
