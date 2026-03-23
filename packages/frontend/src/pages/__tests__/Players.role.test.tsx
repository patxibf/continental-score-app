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

const ownerUser = {
  role: 'user',
  groupRole: 'owner',
  groupId: 'g1',
  groupName: 'Test Group',
  groupSlug: 'test-group',
  email: 'owner@example.com',
  emailVerified: true,
}

const memberUser = {
  role: 'user',
  groupRole: 'member',
  groupId: 'g1',
  groupName: 'Test Group',
  groupSlug: 'test-group',
  email: 'member@example.com',
  emailVerified: true,
}

const players = [
  { id: 'p1', name: 'Alice', avatar: 'cat', active: true, createdAt: '2026-01-01', role: 'OWNER' },
  { id: 'p2', name: 'Bob', avatar: 'fox', active: true, createdAt: '2026-01-01', role: 'ADMIN' },
  { id: 'p3', name: 'Carol', avatar: 'bear', active: true, createdAt: '2026-01-01', role: 'MEMBER' },
]

function renderPlayers(user = ownerUser) {
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/auth/me') return user
    if (path === '/players') return players
    return []
  })
  return renderWithProviders(<Players />, { initialEntries: ['/players'] })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('Players page — role badges', () => {
  it('shows role badges for owner, admin, and member', async () => {
    renderPlayers()
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })
    expect(screen.getByText('owner')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('member')).toBeInTheDocument()
  })
})

describe('Players page — role change controls', () => {
  it('shows role selects for admin and member players (not owner) when user is group admin', async () => {
    renderPlayers(ownerUser)
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })
    // Bob (ADMIN) and Carol (MEMBER) should have role selects; Alice (OWNER) should not
    const selects = screen.getAllByRole('combobox')
    expect(selects).toHaveLength(2)
  })

  it('does not show role controls for regular members', async () => {
    renderPlayers(memberUser)
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('calls PATCH /api/players/:id/role when role select changes', async () => {
    vi.mocked(api.patch).mockResolvedValueOnce({ ...players[2], role: 'ADMIN' })
    renderPlayers(ownerUser)

    await waitFor(() => {
      expect(screen.getByText('Carol')).toBeInTheDocument()
    })

    // Carol's role select (MEMBER → ADMIN)
    const carolSelect = screen.getByRole('combobox', { name: /Change role for Carol/i })
    fireEvent.change(carolSelect, { target: { value: 'ADMIN' } })

    await waitFor(() => {
      expect(vi.mocked(api.patch)).toHaveBeenCalledWith(
        '/players/p3/role',
        { role: 'ADMIN' },
      )
    })
  })
})
