import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '@/test/wrapper'
import Admin from '../Admin'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  }
})
import { api } from '@/lib/api'

vi.mock('@/hooks/useToast', () => ({ toast: vi.fn() }))

const mockGroups = [
  { id: 'g1', name: 'Poker Night', slug: 'poker-night', createdAt: '2026-01-01', currency: 'EUR' },
  { id: 'g2', name: 'Card Club', slug: 'card-club', createdAt: '2026-02-01', currency: 'GBP' },
]

function renderAdmin() {
  return renderWithProviders(<Admin />, { initialEntries: ['/admin'] })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.get).mockResolvedValue(mockGroups)
})

describe('Admin — currency badge in group list', () => {
  it('shows EUR currency badge next to a group with EUR currency', async () => {
    renderAdmin()

    await waitFor(() => expect(screen.getByText('Poker Night')).toBeInTheDocument())

    expect(screen.getByText('€')).toBeInTheDocument()
  })

  it('shows GBP currency badge next to a group with GBP currency', async () => {
    renderAdmin()

    await waitFor(() => expect(screen.getByText('Card Club')).toBeInTheDocument())

    expect(screen.getByText('£')).toBeInTheDocument()
  })
})

describe('Admin — group list', () => {
  it('shows group slug below group name', async () => {
    renderAdmin()

    await waitFor(() => expect(screen.getByText('Poker Night')).toBeInTheDocument())

    expect(screen.getByText('@poker-night')).toBeInTheDocument()
    expect(screen.getByText('@card-club')).toBeInTheDocument()
  })

  it('calls delete endpoint and invalidates list when confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(api.delete).mockResolvedValue({})

    renderAdmin()

    await waitFor(() => expect(screen.getByText('Poker Night')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /delete poker night/i }))

    await waitFor(() => {
      expect(vi.mocked(api.delete)).toHaveBeenCalledWith('/admin/groups/g1')
    })
  })

  it('does not call delete endpoint when confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderAdmin()

    await waitFor(() => expect(screen.getByText('Poker Night')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /delete poker night/i }))

    expect(vi.mocked(api.delete)).not.toHaveBeenCalled()
  })
})
