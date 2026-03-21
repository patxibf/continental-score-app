import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp, groupToken } from '../../test/helpers.js'
import type { FastifyInstance } from 'fastify'

vi.mock('../../lib/prisma.js')
import { prisma } from '../../lib/prisma.js'

let app: FastifyInstance

beforeEach(async () => {
  app = await buildApp()
  vi.resetAllMocks()
})

afterEach(async () => {
  await app?.close()
})

// Builds a game with two players and their round scores
function makeGame(p1Total: number, p2Total: number) {
  return {
    id: `game-${Math.random()}`,
    players: [
      { playerId: 'p1', player: { id: 'p1', name: 'Alice', avatar: 'cat' } },
      { playerId: 'p2', player: { id: 'p2', name: 'Bob', avatar: 'fox' } },
    ],
    rounds: [
      {
        scores: [
          { playerId: 'p1', points: p1Total },
          { playerId: 'p2', points: p2Total },
        ],
      },
    ],
  }
}

describe('GET /api/seasons/:id/standings', () => {
  it('returns standings sorted by lowest total points ascending', async () => {
    vi.mocked(prisma.season.findFirst).mockResolvedValueOnce({ id: 's1', groupId: 'group-1' } as any)
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce([makeGame(45, 67)] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/seasons/s1/standings',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    const standings = res.json()
    expect(standings[0].playerName).toBe('Alice')   // 45 pts
    expect(standings[1].playerName).toBe('Bob')     // 67 pts
  })

  it('gives the win to the player with the lowest score', async () => {
    vi.mocked(prisma.season.findFirst).mockResolvedValueOnce({ id: 's1', groupId: 'group-1' } as any)
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce([makeGame(30, 80)] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/seasons/s1/standings',
      cookies: { token: groupToken(app) },
    })

    const standings = res.json()
    const alice = standings.find((s: any) => s.playerName === 'Alice')
    const bob = standings.find((s: any) => s.playerName === 'Bob')
    expect(alice.wins).toBe(1)
    expect(bob.wins).toBe(0)
  })

  it('gives both players a win when they tie', async () => {
    vi.mocked(prisma.season.findFirst).mockResolvedValueOnce({ id: 's1', groupId: 'group-1' } as any)
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce([makeGame(50, 50)] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/seasons/s1/standings',
      cookies: { token: groupToken(app) },
    })

    const standings = res.json()
    for (const s of standings) {
      expect(s.wins).toBe(1)
    }
  })

  it('returns an empty array for a season with no closed games', async () => {
    vi.mocked(prisma.season.findFirst).mockResolvedValueOnce({ id: 's1', groupId: 'group-1' } as any)
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce([] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/seasons/s1/standings',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  it('returns 404 for a season belonging to a different group', async () => {
    vi.mocked(prisma.season.findFirst).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'GET',
      url: '/api/seasons/other-season/standings',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(404)
  })
})
