import { describe, it, expect } from 'vitest'
import { buildShareText } from '../GameHistory'

const makeGame = (
  players: Array<{ id: string; name: string }>,
  roundScores: Array<Record<string, { points: number; wentOut: boolean }>>,
  seasonName = 'Summer 2026',
) => ({
  id: 'g1',
  seasonId: 's1',
  season: { id: 's1', name: seasonName },
  status: 'CLOSED' as const,
  createdAt: '2026-03-21T00:00:00Z',
  players: players.map(p => ({
    id: `gp-${p.id}`, gameId: 'g1', playerId: p.id,
    player: { id: p.id, name: p.name, avatar: 'cat' },
  })),
  rounds: [
    {
      id: 'r1', gameId: 'g1', roundNumber: 1,
      scores: players.map(p => ({
        id: `s-${p.id}`, roundId: 'r1', playerId: p.id,
        points: roundScores[0][p.id]?.points ?? 0,
        wentOut: roundScores[0][p.id]?.wentOut ?? false,
        player: { id: p.id, name: p.name, avatar: 'cat' },
      })),
    },
  ],
})

describe('buildShareText', () => {
  it('ranks players by ascending total score', () => {
    const game = makeGame(
      [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
      [{ p1: { points: 50, wentOut: false }, p2: { points: 20, wentOut: false } }],
    )
    const totals = { p1: 50, p2: 20 }
    const text = buildShareText(game, totals, 4)

    const lines = text.split('\n')
    expect(lines[2]).toContain('🏆')
    expect(lines[2]).toContain('Bob')   // lower score wins
    expect(lines[3]).toContain('2.')
    expect(lines[3]).toContain('Alice')
  })

  it('marks winner with 🏆 prefix', () => {
    const game = makeGame(
      [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
      [{ p1: { points: 10, wentOut: false }, p2: { points: 80, wentOut: false } }],
    )
    const text = buildShareText(game, { p1: 10, p2: 80 }, 1)
    expect(text).toContain('🏆 Alice')
  })

  it('adds ⚡ for players who went out', () => {
    const game = makeGame(
      [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
      [{ p1: { points: 0, wentOut: true }, p2: { points: 40, wentOut: false } }],
    )
    const text = buildShareText(game, { p1: 0, p2: 40 }, 2)
    expect(text).toContain('Alice · 0 pts ⚡')
    expect(text).not.toContain('Bob · 40 pts ⚡')
  })

  it('includes season name and game index in header', () => {
    const game = makeGame(
      [{ id: 'p1', name: 'Alice' }],
      [{ p1: { points: 10, wentOut: false } }],
      'Winter 2025',
    )
    const text = buildShareText(game, { p1: 10 }, 7)
    expect(text).toContain('Winter 2025, Game #7')
  })

  it('includes round count in footer', () => {
    const game = makeGame(
      [{ id: 'p1', name: 'Alice' }],
      [{ p1: { points: 10, wentOut: false } }],
    )
    const text = buildShareText(game, { p1: 10 }, 1)
    expect(text).toContain('Played 1 rounds · via Continental app')
  })
})
