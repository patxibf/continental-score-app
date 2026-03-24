import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/wrapper'
import TournamentDetail from '../TournamentDetail'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  }
})
import { api } from '@/lib/api'

vi.mock('@/hooks/useToast', () => ({ toast: vi.fn() }))

const mockTournament = {
  id: 't1',
  groupId: 'g1',
  name: 'Christmas 2026',
  status: 'IN_PROGRESS' as const,
  createdAt: '2026-12-01T00:00:00Z',
  participants: [],
  stages: [
    {
      id: 's1',
      tournamentId: 't1',
      stageNumber: 1,
      startRound: 5,
      endRound: 7,
      advancePerTable: 2,
      status: 'IN_PROGRESS' as const,
      tables: [
        {
          id: 'tbl1',
          stageId: 's1',
          tableNumber: 1,
          gameId: null,
          status: 'PENDING' as const,
          players: [
            { id: 'ttp1', tableId: 'tbl1', playerId: 'p1', player: { id: 'p1', name: 'Andres', avatar: 'cat', active: true, email: null }, isBye: false, advanced: false },
            { id: 'ttp2', tableId: 'tbl1', playerId: 'p2', player: { id: 'p2', name: 'Sofia', avatar: 'dog', active: true, email: null }, isBye: false, advanced: false },
          ]
        }
      ]
    }
  ]
}

const mockAuthMember = { role: 'user', groupRole: 'member', groupId: 'g1', groupName: 'TestGroup', groupSlug: 'testgroup', email: 'test@example.com', emailVerified: true }
const mockAuthAdmin = { role: 'user', groupRole: 'admin', groupId: 'g1', groupName: 'TestGroup', groupSlug: 'testgroup', email: 'test@example.com', emailVerified: true }

describe('TournamentDetail', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it('renders tournament name and status', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/auth/me') return mockAuthMember
      if (path === '/tournaments/t1') return mockTournament
      return null
    })
    renderWithProviders(<TournamentDetail />, { initialEntries: ['/tournaments/t1'], routePath: '/tournaments/:id' })
    expect(await screen.findByText('Christmas 2026')).toBeInTheDocument()
    expect(await screen.findByText('In Progress')).toBeInTheDocument()
  })

  it('renders table cards with player names', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/auth/me') return mockAuthMember
      if (path === '/tournaments/t1') return mockTournament
      return null
    })
    renderWithProviders(<TournamentDetail />, { initialEntries: ['/tournaments/t1'], routePath: '/tournaments/:id' })
    expect(await screen.findByText('Table 1')).toBeInTheDocument()
    expect(await screen.findByText('Andres')).toBeInTheDocument()
    expect(await screen.findByText('Sofia')).toBeInTheDocument()
  })

  it('shows advancement banner when all tables completed and not final stage', async () => {
    const completed = {
      ...mockTournament,
      stages: [{
        ...mockTournament.stages[0],
        tables: [{ ...mockTournament.stages[0].tables[0], status: 'COMPLETED' as const }]
      }]
    }
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/auth/me') return mockAuthAdmin
      if (path === '/tournaments/t1') return completed
      return null
    })
    renderWithProviders(<TournamentDetail />, { initialEntries: ['/tournaments/t1'], routePath: '/tournaments/:id' })
    expect(await screen.findByText(/review.*release/i)).toBeInTheDocument()
  })

  it('does not show advancement banner for final stage', async () => {
    const finalStage = {
      ...mockTournament,
      stages: [{
        ...mockTournament.stages[0],
        advancePerTable: 0, // final stage
        tables: [{ ...mockTournament.stages[0].tables[0], status: 'COMPLETED' as const }]
      }]
    }
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/auth/me') return mockAuthAdmin
      if (path === '/tournaments/t1') return finalStage
      return null
    })
    renderWithProviders(<TournamentDetail />, { initialEntries: ['/tournaments/t1'], routePath: '/tournaments/:id' })
    await screen.findByText('Christmas 2026') // wait for load
    expect(screen.queryByText(/review.*release/i)).not.toBeInTheDocument()
  })
})
