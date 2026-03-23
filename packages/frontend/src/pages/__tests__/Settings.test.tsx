import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '@/test/wrapper'
import Settings from '../Settings'

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

const adminUser = {
  role: 'user',
  groupRole: 'admin',
  groupId: 'g1',
  groupName: 'Test Group',
  groupSlug: 'test-group',
  email: 'admin@example.com',
  emailVerified: true,
}

const groupSettings = {
  id: 'g1',
  name: 'Test Group',
  slug: 'test-group',
  currency: 'EUR',
}

function renderSettings(user = ownerUser) {
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/auth/me') return user
    if (path === '/groups/current') return groupSettings
    return {}
  })
  return renderWithProviders(<Settings />, { initialEntries: ['/settings'] })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('Settings page', () => {
  it('renders group name and currency pre-populated', async () => {
    renderSettings()
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Group')).toBeInTheDocument()
    })
    // EUR button should appear selected
    expect(screen.getByText(/EUR/)).toBeInTheDocument()
  })

  it('calls PATCH /api/groups/current when Save is clicked', async () => {
    vi.mocked(api.patch).mockResolvedValueOnce({ ...groupSettings, name: 'New Name' })
    renderSettings()

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Group')).toBeInTheDocument()
    })

    const input = screen.getByDisplayValue('Test Group')
    fireEvent.change(input, { target: { value: 'New Name' } })

    const saveBtn = screen.getByRole('button', { name: /save settings/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(vi.mocked(api.patch)).toHaveBeenCalledWith(
        '/groups/current',
        expect.objectContaining({ name: 'New Name' }),
      )
    })
  })

  it('shows danger zone for owner', async () => {
    renderSettings(ownerUser)
    await waitFor(() => {
      expect(screen.getByText(/danger zone/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /delete group/i })).toBeInTheDocument()
  })

  it('hides danger zone for admin (non-owner)', async () => {
    renderSettings(adminUser)
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Group')).toBeInTheDocument()
    })
    expect(screen.queryByText(/danger zone/i)).not.toBeInTheDocument()
  })

  it('shows confirmation dialog when Delete Group is clicked', async () => {
    renderSettings(ownerUser)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete group/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /delete group/i }))

    await waitFor(() => {
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /yes, delete group/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('calls DELETE /api/groups/current when confirmed', async () => {
    vi.mocked(api.delete).mockResolvedValueOnce({ message: 'Group deleted' })
    renderSettings(ownerUser)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete group/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /delete group/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /yes, delete group/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /yes, delete group/i }))

    await waitFor(() => {
      expect(vi.mocked(api.delete)).toHaveBeenCalledWith('/groups/current')
    })
  })
})
