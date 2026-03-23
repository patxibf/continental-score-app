import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { useAuth } from '../useAuth'

// Mock the api module so we control what login/logout return
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  }
})
import { api } from '@/lib/api'

// Mock useNavigate to capture navigation calls
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual as object, useNavigate: () => mockNavigate }
})

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.get).mockResolvedValue(undefined as any) // /auth/me returns nothing by default
})

describe('useAuth — login', () => {
  it('navigates to /admin when logged in as admin', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ role: 'admin', username: 'admin' })

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })
    act(() => { result.current.login({ email: 'admin@example.com', password: 'pass' }) })

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin'))
  })

  it('navigates to /dashboard when logged in as group', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ role: 'group', groupId: 'g1', groupName: 'My Group' })

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })
    act(() => { result.current.login({ email: 'mygroup@example.com', password: 'pass' }) })

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'))
  })

  it('navigates to /pick-group when requiresGroupSelection is true', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      requiresGroupSelection: true,
      groups: [{ id: 'g1', name: 'My Group', slug: 'my-group' }],
    })

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })
    act(() => { result.current.login({ email: 'user@example.com', password: 'pass' }) })

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pick-group'))
  })
})

describe('useAuth — logout', () => {
  it('navigates to /login when logout API call succeeds', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({})

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })
    act(() => { result.current.logout() })

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'))
  })

  it('still navigates to /login when logout API call fails', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })
    act(() => { result.current.logout() })

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'))
  })
})
