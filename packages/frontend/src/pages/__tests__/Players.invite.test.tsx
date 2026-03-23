import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '@/test/wrapper'
import Players from '../Players'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  }
})
import { api } from '@/lib/api'

vi.mock('@/hooks/useToast', () => ({ toast: vi.fn() }))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { role: 'user', groupRole: 'owner' },
    isLoading: false,
    isAuthenticated: true,
    isGroupAdmin: true,
  }),
}))

const mockPlayers = [
  {
    id: 'p1', name: 'Alice', avatar: 'cat', email: null, active: true,
    createdAt: '2026-01-01', userId: 'u1', role: 'MEMBER',
  },
  {
    id: 'p2', name: 'Bob', avatar: 'fox', email: 'bob@example.com', active: true,
    createdAt: '2026-01-01', userId: null, role: 'MEMBER', inviteToken: 'token-abc',
  },
]

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/players') return mockPlayers
    if (path === '/auth/me') return { role: 'user', groupRole: 'owner' }
    return []
  })
})

describe('Players page — invite flow', () => {
  it('shows the Invite button for group admins', async () => {
    renderWithProviders(<Players />)
    await waitFor(() => expect(screen.getByText('Invite')).toBeInTheDocument())
  })

  it('shows an Invited badge for players with userId=null', async () => {
    renderWithProviders(<Players />)
    await waitFor(() => expect(screen.getByText('Invited')).toBeInTheDocument())
  })

  it('shows pending player email under their name', async () => {
    renderWithProviders(<Players />)
    await waitFor(() => expect(screen.getByText('bob@example.com')).toBeInTheDocument())
  })

  it('opens InviteDialog when Invite button is clicked', async () => {
    renderWithProviders(<Players />)
    await waitFor(() => screen.getByText('Invite'))
    fireEvent.click(screen.getByText('Invite'))
    await waitFor(() => expect(screen.getByText('Invite Player')).toBeInTheDocument())
  })

  it('submits invite form and shows success toast', async () => {
    const { toast } = await import('@/hooks/useToast')
    vi.mocked(api.post).mockResolvedValueOnce({ message: 'Invitation sent' })

    renderWithProviders(<Players />)
    await waitFor(() => screen.getByText('Invite'))
    fireEvent.click(screen.getByText('Invite'))

    await waitFor(() => screen.getByLabelText('Name'))

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Charlie' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'charlie@example.com' } })
    fireEvent.click(screen.getByText('Send Invite'))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/players/invite', { name: 'Charlie', email: 'charlie@example.com' })
      expect(toast).toHaveBeenCalledWith({ title: 'Invitation sent' })
    })
  })
})
