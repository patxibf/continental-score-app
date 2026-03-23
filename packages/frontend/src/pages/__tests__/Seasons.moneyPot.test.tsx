import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '@/test/wrapper'
import Seasons from '../Seasons'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  }
})
import { api } from '@/lib/api'

vi.mock('@/hooks/useToast', () => ({ toast: vi.fn() }))

const mockSeasons = [
  {
    id: 's1',
    name: 'Spring 2026',
    status: 'ACTIVE',
    groupId: 'g1',
    createdAt: '2026-01-01',
    potEnabled: false,
    contributionAmount: null,
    _count: { games: 2, players: 3 },
  },
]

function renderSeasons() {
  return renderWithProviders(<Seasons />, { initialEntries: ['/seasons'] })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/auth/me') return { role: 'user', groupRole: 'owner', groupId: 'g1', groupName: 'TestGroup', groupSlug: 'testgroup', email: 'test@example.com', emailVerified: true, currency: 'EUR' }
    if (path === '/seasons') return mockSeasons
    return []
  })
})

describe('New Season dialog — Money Pot', () => {
  it('pot toggle is off by default and amount input is not visible', async () => {
    renderSeasons()

    await waitFor(() => expect(screen.getByText('Spring 2026')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /new/i }))

    await waitFor(() => expect(screen.getByText('New Season')).toBeInTheDocument())

    const toggle = screen.getByRole('checkbox', { name: /money pot/i })
    expect(toggle).not.toBeChecked()

    expect(screen.queryByLabelText(/contribution amount/i)).not.toBeInTheDocument()
  })

  it('amount input appears when pot toggle is enabled', async () => {
    renderSeasons()

    await waitFor(() => expect(screen.getByText('Spring 2026')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /new/i }))

    await waitFor(() => expect(screen.getByRole('checkbox', { name: /money pot/i })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('checkbox', { name: /money pot/i }))

    await waitFor(() => expect(screen.getByLabelText(/contribution amount/i)).toBeInTheDocument())

    expect(screen.getByText('€')).toBeInTheDocument()
  })

  it('submit is disabled when pot enabled and amount is empty', async () => {
    renderSeasons()

    await waitFor(() => expect(screen.getByText('Spring 2026')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /new/i }))

    await waitFor(() => expect(screen.getByRole('checkbox', { name: /money pot/i })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('checkbox', { name: /money pot/i }))

    await waitFor(() => expect(screen.getByLabelText(/contribution amount/i)).toBeInTheDocument())

    const submitButton = screen.getByRole('button', { name: /create season/i })
    expect(submitButton).toBeDisabled()
  })

  it('submit is disabled when pot enabled and amount is invalid (zero or >2dp)', async () => {
    renderSeasons()

    await waitFor(() => expect(screen.getByText('Spring 2026')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /new/i }))

    await waitFor(() => expect(screen.getByRole('checkbox', { name: /money pot/i })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('checkbox', { name: /money pot/i }))

    await waitFor(() => expect(screen.getByLabelText(/contribution amount/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/contribution amount/i), { target: { value: '0' } })

    const submitButton = screen.getByRole('button', { name: /create season/i })
    expect(submitButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/contribution amount/i), { target: { value: '1.999' } })
    expect(submitButton).toBeDisabled()
  })

  it('shows validation error when amount is invalid', async () => {
    renderSeasons()

    await waitFor(() => expect(screen.getByText('Spring 2026')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /new/i }))

    await waitFor(() => expect(screen.getByRole('checkbox', { name: /money pot/i })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('checkbox', { name: /money pot/i }))

    await waitFor(() => expect(screen.getByLabelText(/contribution amount/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/contribution amount/i), { target: { value: '0' } })

    await waitFor(() =>
      expect(screen.getByText('Amount must be greater than 0 with at most 2 decimal places.')).toBeInTheDocument()
    )
  })
})
