import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '@/test/wrapper'
import TournamentNew from '../TournamentNew'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
    getTournamentPreview: vi.fn(),
  }
})
import { api, getTournamentPreview } from '@/lib/api'

vi.mock('@/hooks/useToast', () => ({ toast: vi.fn() }))

const mockPlayers = [
  { id: 'p1', name: 'Andres', avatar: 'cat', active: true, email: null, role: 'ADMIN' as const, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'p2', name: 'Sofia', avatar: 'dog', active: true, email: null, role: 'MEMBER' as const, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'p3', name: 'Mikel', avatar: 'fox', active: true, email: null, role: 'MEMBER' as const, createdAt: '2026-01-01T00:00:00Z' },
]

const mockPreview2Stage = {
  stages: [
    { stageNumber: 1, tableCount: 3, playersPerTable: 4, advancePerTable: 2 },
    { stageNumber: 2, tableCount: 1, playersPerTable: 6, advancePerTable: 0 },
  ]
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/auth/me') return { role: 'user', groupRole: 'admin', groupId: 'g1', groupName: 'TestGroup', groupSlug: 'testgroup', email: 'test@example.com', emailVerified: true }
    if (path === '/players') return mockPlayers
    return []
  })
  vi.mocked(getTournamentPreview).mockResolvedValue(mockPreview2Stage)
})

describe('TournamentNew wizard', () => {
  it('shows step 1 initially with name input and player list', async () => {
    renderWithProviders(<TournamentNew />, { initialEntries: ['/tournaments/new'] })
    expect(await screen.findByPlaceholderText(/tournament name/i)).toBeInTheDocument()
    expect(await screen.findByText('Andres')).toBeInTheDocument()
  })

  it('blocks Next on step 1 until name and 3+ players selected', async () => {
    renderWithProviders(<TournamentNew />, { initialEntries: ['/tournaments/new'] })
    const nextBtn = await screen.findByRole('button', { name: /next/i })
    expect(nextBtn).toBeDisabled()
  })

  it('advances to step 2 after valid step 1', async () => {
    renderWithProviders(<TournamentNew />, { initialEntries: ['/tournaments/new'] })

    fireEvent.change(await screen.findByPlaceholderText(/tournament name/i), {
      target: { value: 'Christmas 2026' }
    })
    fireEvent.click(await screen.findByText('Andres'))
    fireEvent.click(await screen.findByText('Sofia'))
    fireEvent.click(await screen.findByText('Mikel'))

    fireEvent.click(screen.getByRole('button', { name: /next/i }))

    expect(await screen.findByText(/bracket/i)).toBeInTheDocument()
  })

  it('renders bracket preview on step 2 with tables and advance count', async () => {
    renderWithProviders(<TournamentNew />, { initialEntries: ['/tournaments/new'] })

    fireEvent.change(await screen.findByPlaceholderText(/tournament name/i), {
      target: { value: 'Test Tournament' }
    })
    fireEvent.click(await screen.findByText('Andres'))
    fireEvent.click(await screen.findByText('Sofia'))
    fireEvent.click(await screen.findByText('Mikel'))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))

    expect(await screen.findByText('3 tables')).toBeInTheDocument()
    expect(await screen.findByText('4 players each')).toBeInTheDocument()
    expect(await screen.findByText(/2 advance/i)).toBeInTheDocument()
    expect(await screen.findByText('Final')).toBeInTheDocument()
  })
})
