import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/wrapper'
import Dashboard from '../Dashboard'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  }
})
import { api } from '@/lib/api'

vi.mock('@/hooks/useToast', () => ({ toast: vi.fn() }))

const activeSeason = {
  id: 's1', name: 'Spring 2026', status: 'ACTIVE', groupId: 'g1',
  createdAt: '2026-01-01', _count: { games: 2, players: 3 },
}

function makeInProgressGame(id: string) {
  return {
    id,
    seasonId: 's1',
    status: 'IN_PROGRESS',
    createdAt: '2026-01-01',
    players: [
      { id: `gp-${id}`, gameId: id, playerId: 'p1', player: { id: 'p1', name: 'Alice', avatar: 'cat' } },
    ],
    _count: { rounds: 2 },
  }
}

function renderDashboard() {
  return renderWithProviders(<Dashboard />, { initialEntries: ['/dashboard'] })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/auth/me') return { role: 'group', groupAccess: 'admin', groupId: 'g1', groupName: 'TestGroup' }
    if (path === '/seasons') return [activeSeason]
    if (path === '/seasons/s1/games') return []
    if (path === '/seasons/s1/standings') return []
    return []
  })
})

describe('Dashboard — live games', () => {
  it('shows no live game banner when there are no in-progress games', async () => {
    renderDashboard()

    await waitFor(() => expect(screen.getByText('Spring 2026')).toBeInTheDocument())
    expect(screen.queryByText('Live Game')).not.toBeInTheDocument()
  })

  it('shows one banner for a single in-progress game', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/auth/me') return { role: 'group', groupAccess: 'admin', groupId: 'g1', groupName: 'TestGroup' }
      if (path === '/seasons') return [activeSeason]
      if (path === '/seasons/s1/games') return [makeInProgressGame('game-1')]
      if (path === '/seasons/s1/standings') return []
      return []
    })

    renderDashboard()

    await waitFor(() => expect(screen.getAllByText('Live Game')).toHaveLength(1))
  })

  it('shows two banners when two games are simultaneously in-progress', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/auth/me') return { role: 'group', groupAccess: 'admin', groupId: 'g1', groupName: 'TestGroup' }
      if (path === '/seasons') return [activeSeason]
      if (path === '/seasons/s1/games') return [makeInProgressGame('game-1'), makeInProgressGame('game-2')]
      if (path === '/seasons/s1/standings') return []
      return []
    })

    renderDashboard()

    await waitFor(() => expect(screen.getAllByText('Live Game')).toHaveLength(2))
  })
})
