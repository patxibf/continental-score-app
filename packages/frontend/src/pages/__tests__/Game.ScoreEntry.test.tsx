import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScoreEntry } from '../Game'
import type { Game as GameType } from '@/lib/api'

const mockGame: GameType = {
  id: 'game-1',
  seasonId: 's1',
  status: 'IN_PROGRESS',
  createdAt: '2026-01-01',
  players: [
    { id: 'gp1', gameId: 'game-1', playerId: 'p1', player: { id: 'p1', name: 'Alice', avatar: 'cat' } },
    { id: 'gp2', gameId: 'game-1', playerId: 'p2', player: { id: 'p2', name: 'Bob', avatar: 'fox' } },
  ],
}

// Suppress toast in tests
vi.mock('@/hooks/useToast', () => ({
  toast: vi.fn(),
}))
import { toast } from '@/hooks/useToast'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ScoreEntry — rendering', () => {
  it('renders all player names', () => {
    render(<ScoreEntry game={mockGame} roundNumber={1} onSubmit={vi.fn()} isSubmitting={false} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })
})

describe('ScoreEntry — went out toggle', () => {
  it('first tap marks player as OUT with 0 displayed', async () => {
    const user = userEvent.setup()
    render(<ScoreEntry game={mockGame} roundNumber={1} onSubmit={vi.fn()} isSubmitting={false} />)

    await user.click(screen.getByText('Alice').closest('button')!)

    expect(screen.getByText(/OUT 🏆/)).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('second tap cycles to ONE GO with negative score', async () => {
    const user = userEvent.setup()
    render(<ScoreEntry game={mockGame} roundNumber={3} onSubmit={vi.fn()} isSubmitting={false} />)

    const aliceBtn = screen.getByText('Alice').closest('button')!
    await user.click(aliceBtn) // first tap → OUT
    await user.click(aliceBtn) // second tap → ONE GO

    expect(screen.getByText(/ONE GO ⚡/)).toBeInTheDocument()
    expect(screen.getByText('-30')).toBeInTheDocument()
  })

  it('third tap deselects and restores the score input', async () => {
    const user = userEvent.setup()
    render(<ScoreEntry game={mockGame} roundNumber={1} onSubmit={vi.fn()} isSubmitting={false} />)

    const aliceBtn = screen.getByText('Alice').closest('button')!
    await user.click(aliceBtn) // → OUT
    await user.click(aliceBtn) // → ONE GO
    await user.click(aliceBtn) // → unselected

    expect(screen.queryByText(/OUT 🏆/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ONE GO/)).not.toBeInTheDocument()
  })
})

describe('ScoreEntry — submission validation', () => {
  it('shows a toast and does not call onSubmit when a score is empty (rounds 1–6)', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ScoreEntry game={mockGame} roundNumber={2} onSubmit={onSubmit} isSubmitting={false} />)

    // Mark Alice as out, leave Bob's score empty
    await user.click(screen.getByText('Alice').closest('button')!)
    await user.click(screen.getByRole('button', { name: /Submit Round 2/i }))

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('accepts empty scores on round 7 (defaults to 250) without an error toast', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ScoreEntry game={mockGame} roundNumber={7} onSubmit={onSubmit} isSubmitting={false} />)

    // Mark Alice as out, leave Bob's score empty
    await user.click(screen.getByText('Alice').closest('button')!)
    await user.click(screen.getByRole('button', { name: /Submit Round 7/i }))

    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ playerId: 'p2', points: 250 }),
      ]),
    )
  })

  it('passes correct scores to onSubmit including wentOut flags', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ScoreEntry game={mockGame} roundNumber={1} onSubmit={onSubmit} isSubmitting={false} />)

    // Mark Alice as out
    await user.click(screen.getByText('Alice').closest('button')!)
    // Enter Bob's score
    const bobInput = screen.getByPlaceholderText('0')
    await user.clear(bobInput)
    await user.type(bobInput, '25')
    await user.click(screen.getByRole('button', { name: /Submit Round 1/i }))

    expect(onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({ playerId: 'p1', wentOut: true, wentOutInOneGo: false }),
      expect.objectContaining({ playerId: 'p2', points: 25, wentOut: false }),
    ])
  })
})

describe('ScoreEntry — round 7 placeholder', () => {
  it('shows placeholder "250" on score inputs for round 7', () => {
    render(<ScoreEntry game={mockGame} roundNumber={7} onSubmit={vi.fn()} isSubmitting={false} />)
    const inputs = screen.getAllByPlaceholderText('250')
    expect(inputs.length).toBeGreaterThan(0)
  })

  it('shows placeholder "0" on score inputs for round 1', () => {
    render(<ScoreEntry game={mockGame} roundNumber={1} onSubmit={vi.fn()} isSubmitting={false} />)
    const inputs = screen.getAllByPlaceholderText('0')
    expect(inputs.length).toBeGreaterThan(0)
  })
})
