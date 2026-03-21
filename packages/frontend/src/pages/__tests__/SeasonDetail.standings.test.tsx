import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/wrapper'
import SeasonDetail from '../SeasonDetail'

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

vi.mock('@/hooks/useToast', () => ({ toast: vi.fn() }))

const mockSeason = {
  id: 's1',
  name: 'Spring 2026',
  status: 'ACTIVE',
  groupId: 'g1',
  createdAt: '2026-01-01',
  _count: { games: 2, players: 3 },
}

// Alice: most wins (2), highest points (89)
// Bob:   1 win, 67 pts
// Carol: 0 wins, 45 pts  ← lowest points (wins the points ranking)
const mockStandings = [
  { playerId: 'p1', playerName: 'Alice', playerAvatar: 'cat', totalPoints: 89, gamesPlayed: 2, wins: 2 },
  { playerId: 'p2', playerName: 'Bob',   playerAvatar: 'fox', totalPoints: 67, gamesPlayed: 2, wins: 1 },
  { playerId: 'p3', playerName: 'Carol', playerAvatar: 'bear', totalPoints: 45, gamesPlayed: 2, wins: 0 },
]

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/seasons') return [mockSeason]
    if (path === '/seasons/s1/standings') return mockStandings
    if (path === '/seasons/s1/games') return []
    return []
  })
})

function renderSeasonDetail() {
  return renderWithProviders(<SeasonDetail />, {
    initialEntries: ['/seasons/s1'],
    routePath: '/seasons/:id',
  })
}

describe('SeasonDetail — standings toggle', () => {
  it('shows players sorted by points ascending by default (Carol first)', async () => {
    renderSeasonDetail()

    // Wait for standings to render
    await waitFor(() => expect(screen.getByText('Carol')).toBeInTheDocument())

    const rows = screen.getAllByText(/^(Alice|Bob|Carol)$/)
    // Carol (45 pts) first, then Bob (67 pts), then Alice (89 pts)
    expect(rows[0].textContent).toContain('Carol')
    expect(rows[1].textContent).toContain('Bob')
    expect(rows[2].textContent).toContain('Alice')
  })

  it('re-sorts by wins descending when "Wins" button is clicked (Alice first)', async () => {
    const user = userEvent.setup()
    renderSeasonDetail()

    await waitFor(() => expect(screen.getByText('Carol')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Wins/i }))

    const rows = screen.getAllByText(/^(Alice|Bob|Carol)$/)
    // Alice (2 wins) first, then Bob (1 win), then Carol (0 wins)
    expect(rows[0].textContent).toContain('Alice')
    expect(rows[1].textContent).toContain('Bob')
    expect(rows[2].textContent).toContain('Carol')
  })

  it('restores points order when "Points" button is clicked after switching to wins', async () => {
    const user = userEvent.setup()
    renderSeasonDetail()

    await waitFor(() => expect(screen.getByText('Carol')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Wins/i }))
    await user.click(screen.getByRole('button', { name: /Points/i }))

    const rows = screen.getAllByText(/^(Alice|Bob|Carol)$/)
    expect(rows[0].textContent).toContain('Carol')
  })
})
