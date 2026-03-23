import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, AuthUser } from '@/lib/api'
import { useNavigate } from 'react-router-dom'

export function useAuth() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: user, isLoading } = useQuery<AuthUser>({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<AuthUser>('/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const loginMutation = useMutation({
    mutationFn: (credentials: { email: string; password: string; groupId?: string }) =>
      api.post<AuthUser>('/auth/login', credentials),
    onSuccess: (data) => {
      if (data.requiresGroupSelection) {
        queryClient.setQueryData(['auth', 'me'], data)
        navigate('/pick-group')
        return
      }
      queryClient.setQueryData(['auth', 'me'], data)
      if (data.role === 'admin') {
        navigate('/admin')
      } else {
        navigate('/dashboard')
      }
    },
  })

  const logoutMutation = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      queryClient.clear()
      navigate('/login')
    },
    onError: () => {
      queryClient.clear()
      navigate('/login')
    },
  })

  const resendVerificationMutation = useMutation({
    mutationFn: () => api.post('/auth/resend-verification'),
  })

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isGroupAdmin: user?.role === 'admin' || user?.groupRole === 'owner' || user?.groupRole === 'admin',
    emailVerified: user?.emailVerified ?? true, // true for admin (no email)
    login: loginMutation.mutate,
    loginError: loginMutation.error?.message,
    isLoggingIn: loginMutation.isPending,
    logout: logoutMutation.mutate,
    resendVerification: resendVerificationMutation.mutate,
    isResending: resendVerificationMutation.isPending,
  }
}
