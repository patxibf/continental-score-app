import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/wrapper'
import GamePage from '../Game'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  }
})
import { api } from '@/lib/api'

vi.mock('@/hooks/useToast', () => ({ toast: vi.fn() }))
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }))

const adminUser = { role: 'group', groupAccess: 'admin', groupId: 'g1', groupName: 'TestGroup' }

function makeGame(roundCount: number) {
  return {
    id: 'game-1',
    seasonId: 's1',
    status: 'IN_PROGRESS',
    createdAt: '2026-01-01',
    players: [
      { id: 'gp1', gameId: 'game-1', playerId: 'p1', player: { id: 'p1', name: 'Alice', avatar: 'cat' } },
      { id: 'gp2', gameId: 'game-1', playerId: 'p2', player: { id: 'p2', name: 'Bob', avatar: 'fox' } },
    ],
    rounds: Array.from({ length: roundCount }, (_, i) => ({
      id: `r${i + 1}`,
      roundNumber: i + 1,
      completedAt: '2026-01-01',
      scores: [
        { id: `rs${i}a`, roundId: `r${i + 1}`, playerId: 'p1', points: 10, wentOut: false, player: { id: 'p1', name: 'Alice', avatar: 'cat' } },
        { id: `rs${i}b`, roundId: `r${i + 1}`, playerId: 'p2', points: 20, wentOut: false, player: { id: 'p2', name: 'Bob', avatar: 'fox' } },
      ],
    })),
    totals: { p1: roundCount * 10, p2: roundCount * 20 },
  }
}

function renderGamePage() {
  return renderWithProviders(<GamePage />, {
    initialEntries: ['/games/game-1'],
    routePath: '/games/:id',
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('GamePage — Close Game button visibility', () => {
  it('hides Close Game button when fewer than 7 rounds are played', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/auth/me') return adminUser
      if (path === '/games/game-1') return makeGame(3)
      return null
    })

    renderGamePage()

    await waitFor(() => expect(screen.getAllByText('Alice').length).toBeGreaterThan(0))
    expect(screen.queryByRole('button', { name: /^close game$/i })).not.toBeInTheDocument()
  })

  it('shows Close Game button once all 7 rounds are played', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/auth/me') return adminUser
      if (path === '/games/game-1') return makeGame(7)
      return null
    })

    renderGamePage()

    await waitFor(() => expect(screen.getAllByText('Alice').length).toBeGreaterThan(0))
    expect(screen.getByRole('button', { name: /^close game$/i })).toBeInTheDocument()
  })
})
