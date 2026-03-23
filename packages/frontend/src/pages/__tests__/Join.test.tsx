import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '@/test/wrapper'
import Join from '../Join'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  }
})
import { api } from '@/lib/api'

vi.mock('@/hooks/useToast', () => ({ toast: vi.fn() }))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderJoin(token?: string, isAuthenticated = false) {
  const url = token ? `/join?token=${token}` : '/join'
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/auth/me') {
      if (isAuthenticated) return { role: 'user', groupRole: 'member', userId: 'u1' }
      throw new Error('Unauthorized')
    }
    if (path === `/players/invitation/${token}`) {
      return { playerName: 'Alice', groupName: 'Test Group' }
    }
    throw new Error('Not found')
  })

  return renderWithProviders(<Join />, {
    initialEntries: [url],
    routePath: '/join',
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mockNavigate.mockReset()
})

describe('/join page', () => {
  it('shows player and group name from the invitation', async () => {
    renderJoin('abc123')
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Test Group')).toBeInTheDocument()
    })
  })

  it('shows "Log in to accept" when user is not authenticated', async () => {
    renderJoin('abc123', false)
    await waitFor(() => {
      expect(screen.getByText('Log in to accept')).toBeInTheDocument()
    })
  })

  it('shows "Accept Invitation" button when user is authenticated', async () => {
    renderJoin('abc123', true)
    await waitFor(() => {
      expect(screen.getByText('Accept Invitation')).toBeInTheDocument()
    })
  })

  it('shows error state for invalid token', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/auth/me') throw new Error('Unauthorized')
      if (path === '/players/invitation/bad-token') throw new Error('INVALID_TOKEN')
      throw new Error('Not found')
    })

    renderWithProviders(<Join />, {
      initialEntries: ['/join?token=bad-token'],
      routePath: '/join',
    })

    await waitFor(() => {
      expect(screen.getByText('Invalid or expired invitation')).toBeInTheDocument()
    })
  })

  it('shows error when no token in URL', async () => {
    vi.mocked(api.get).mockImplementation(async () => {
      throw new Error('Unauthorized')
    })

    renderWithProviders(<Join />, {
      initialEntries: ['/join'],
      routePath: '/join',
    })

    await waitFor(() => {
      expect(screen.getByText('Invalid invitation link.')).toBeInTheDocument()
    })
  })

  it('navigates to /dashboard after claiming invite', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/auth/me') return { role: 'user', groupRole: 'member', userId: 'u1' }
      if (path === '/players/invitation/abc123') return { playerName: 'Alice', groupName: 'Test Group' }
      throw new Error('Not found')
    })
    vi.mocked(api.post).mockResolvedValueOnce({ message: 'Invitation claimed' })

    renderWithProviders(<Join />, {
      initialEntries: ['/join?token=abc123'],
      routePath: '/join',
    })

    await waitFor(() => screen.getByText('Accept Invitation'))
    fireEvent.click(screen.getByText('Accept Invitation'))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/players/invitation/claim', { token: 'abc123' })
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })
})
