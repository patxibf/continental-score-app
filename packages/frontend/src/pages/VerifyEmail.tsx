import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { api } from '@/lib/api'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    const token = params.get('token')
    if (!token) { setStatus('error'); return }

    api.post('/auth/verify-email', { token })
      .then(() => {
        setStatus('success')
        setTimeout(() => navigate('/dashboard'), 2000)
      })
      .catch(() => setStatus('error'))
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="felt-card p-12 text-center max-w-sm w-full">
        {status === 'loading' && <p className="text-muted-foreground">Verifying…</p>}
        {status === 'success' && (
          <>
            <p className="text-4xl mb-4">✅</p>
            <p className="font-semibold text-lg">Email verified!</p>
            <p className="text-muted-foreground text-sm mt-1">Redirecting to dashboard…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="text-4xl mb-4">❌</p>
            <p className="font-semibold">Link expired or invalid</p>
            <Link to="/dashboard" className="text-sm text-[var(--cobalt)] hover:underline mt-3 block">
              Go to dashboard
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
