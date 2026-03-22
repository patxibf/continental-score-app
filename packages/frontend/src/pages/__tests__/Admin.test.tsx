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
  { id: 'g1', name: 'Poker Night', username: 'poker-night', createdAt: '2026-01-01', currency: 'EUR', hasMemberPassword: false },
  { id: 'g2', name: 'Card Club', username: 'card-club', createdAt: '2026-02-01', currency: 'GBP', hasMemberPassword: true },
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

describe('Admin — currency selector in new group dialog', () => {
  it('currency selector defaults to EUR when creating a new group', async () => {
    renderAdmin()

    await waitFor(() => expect(screen.getByText('Poker Night')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /new/i }))

    await waitFor(() => expect(screen.getByLabelText(/currency/i)).toBeInTheDocument())

    const select = screen.getByLabelText(/currency/i) as HTMLSelectElement
    expect(select.value).toBe('EUR')
  })

  it('includes currency in create group payload', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'g3', name: 'New Group', username: 'new-group', currency: 'GBP', createdAt: '2026-03-01' })

    renderAdmin()

    await waitFor(() => expect(screen.getByText('Poker Night')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /new/i }))

    await waitFor(() => expect(screen.getByLabelText(/group name/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/group name/i), { target: { value: 'New Group' } })
    fireEvent.change(screen.getByLabelText(/admin password/i), { target: { value: 'secret123' } })

    const currencySelect = screen.getByLabelText(/currency/i)
    fireEvent.change(currencySelect, { target: { value: 'GBP' } })

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(vi.mocked(api.post)).toHaveBeenCalledWith(
        '/admin/groups',
        expect.objectContaining({ currency: 'GBP' }),
      )
    })
  })
})

describe('Admin — currency selector in edit group dialog', () => {
  it('pre-populates the currency selector with the group stored currency when opening edit dialog', async () => {
    renderAdmin()

    await waitFor(() => expect(screen.getByText('Card Club')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /edit card club/i }))

    await waitFor(() => expect(screen.getByLabelText(/currency/i)).toBeInTheDocument())

    const select = screen.getByLabelText(/currency/i) as HTMLSelectElement
    expect(select.value).toBe('GBP')
  })
})
