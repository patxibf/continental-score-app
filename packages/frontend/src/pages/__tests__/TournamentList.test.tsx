import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/wrapper'
import TournamentList from '../TournamentList'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  }
})
import { api } from '@/lib/api'

vi.mock('@/hooks/useToast', () => ({ toast: vi.fn() }))

function renderTournamentList() {
  return renderWithProviders(<TournamentList />, { initialEntries: ['/tournaments'] })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/auth/me') return { role: 'user', groupRole: 'member', groupId: 'g1', groupName: 'TestGroup', groupSlug: 'testgroup', email: 'test@example.com', emailVerified: true }
    if (path === '/tournaments') return []
    return []
  })
})

describe('TournamentList', () => {
  it('renders tournament cards', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/auth/me') return { role: 'user', groupRole: 'member', groupId: 'g1', groupName: 'TestGroup', groupSlug: 'testgroup', email: 'test@example.com', emailVerified: true }
      if (path === '/tournaments') return [
        { id: 't1', name: 'Christmas 2026', status: 'IN_PROGRESS', playerCount: 12, createdAt: '2026-12-01T00:00:00Z' }
      ]
      return []
    })
    renderTournamentList()
    expect(await screen.findByText('Christmas 2026')).toBeInTheDocument()
    expect(await screen.findByText('In Progress')).toBeInTheDocument()
    expect(await screen.findByText('12 players')).toBeInTheDocument()
  })

  it('renders empty state when no tournaments', async () => {
    renderTournamentList()
    expect(await screen.findByText(/no tournaments/i)).toBeInTheDocument()
  })

  it('hides New Tournament button for non-admins', async () => {
    renderTournamentList()
    await screen.findByText(/no tournaments/i)
    expect(screen.queryByRole('link', { name: /new tournament/i })).not.toBeInTheDocument()
  })
})
