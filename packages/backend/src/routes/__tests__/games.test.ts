import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp, groupToken } from '../../test/helpers.js'
import type { FastifyInstance } from 'fastify'

vi.mock('../../lib/prisma.js')
import { prisma } from '../../lib/prisma.js'

let app: FastifyInstance

function mockGameWithRounds(n: number) {
  return {
    id: 'game-1',
    status: 'IN_PROGRESS',
    season: { id: 's1', name: 'Spring', groupId: 'group-1' },
    players: [
      { playerId: 'p1', player: { id: 'p1', name: 'Alice', avatar: 'cat' } },
      { playerId: 'p2', player: { id: 'p2', name: 'Bob', avatar: 'fox' } },
    ],
    rounds: Array.from({ length: n }, (_, i) => ({
      id: `r${i + 1}`,
      roundNumber: i + 1,
      scores: [
        { playerId: 'p1', points: 10, wentOut: false },
        { playerId: 'p2', points: 20, wentOut: false },
      ],
    })),
  }
}

beforeEach(async () => {
  app = await buildApp()
  vi.resetAllMocks()
})

afterEach(async () => {
  await app?.close()
})

describe('POST /api/games/:id/close', () => {
  it('returns 400 when game has fewer than 7 rounds', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(mockGameWithRounds(3) as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/close',
      payload: { confirm: true },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/all 7 rounds/i)
  })

  it('returns 400 when game has 0 rounds', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(mockGameWithRounds(0) as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/close',
      payload: { confirm: true },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/all 7 rounds/i)
  })

  it('closes game successfully when all 7 rounds are complete', async () => {
    const mockGame = mockGameWithRounds(7) as any
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(mockGame)
    vi.mocked(prisma.game.update).mockResolvedValueOnce({
      id: 'game-1',
      status: 'CLOSED',
      closedAt: new Date(),
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/close',
      payload: { confirm: true },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
  })
})
