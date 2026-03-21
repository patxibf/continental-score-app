import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp, groupToken, memberToken } from '../../test/helpers.js'
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

describe('POST /api/seasons — member access', () => {
  it('returns 403 when called with member token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/seasons',
      payload: { name: 'Test Season' },
      cookies: { token: memberToken(app) },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /api/seasons — money pot validation', () => {
  it('creates season with potEnabled and contributionAmount', async () => {
    vi.mocked(prisma.season.create).mockResolvedValueOnce({
      id: 's1', name: 'Spring', groupId: 'group-1', status: 'ACTIVE',
      potEnabled: true, contributionAmount: '5.00', createdAt: new Date(), closedAt: null,
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/seasons',
      payload: { name: 'Spring', potEnabled: true, contributionAmount: 5 },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().potEnabled).toBe(true)
    expect(res.json().contributionAmount).toBe('5.00')
  })

  it('returns 400 when potEnabled but no contributionAmount', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/seasons',
      payload: { name: 'Spring', potEnabled: true },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when potEnabled with amount 0', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/seasons',
      payload: { name: 'Spring', potEnabled: true, contributionAmount: 0 },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when contributionAmount is negative', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/seasons',
      payload: { name: 'Spring', potEnabled: true, contributionAmount: -5 },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when contributionAmount has more than 2 decimal places', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/seasons',
      payload: { name: 'Spring', potEnabled: true, contributionAmount: 5.555 },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when contributionAmount exceeds 9999.99', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/seasons',
      payload: { name: 'Spring', potEnabled: true, contributionAmount: 10000 },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('creates season with pot disabled, contributionAmount null', async () => {
    vi.mocked(prisma.season.create).mockResolvedValueOnce({
      id: 's1', name: 'Spring', groupId: 'group-1', status: 'ACTIVE',
      potEnabled: false, contributionAmount: null, createdAt: new Date(), closedAt: null,
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/seasons',
      payload: { name: 'Spring', potEnabled: false },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().potEnabled).toBe(false)
    expect(res.json().contributionAmount).toBeNull()
  })
})

describe('PATCH /api/seasons/:id — potEnabled is immutable', () => {
  it('ignores potEnabled in PATCH body and returns existing values', async () => {
    vi.mocked(prisma.season.findFirst).mockResolvedValueOnce({
      id: 's1', name: 'Spring', groupId: 'group-1', status: 'ACTIVE',
      potEnabled: true, contributionAmount: '5.00', createdAt: new Date(), closedAt: null,
    } as any)
    vi.mocked(prisma.season.update).mockResolvedValueOnce({
      id: 's1', name: 'New Name', groupId: 'group-1', status: 'ACTIVE',
      potEnabled: true, contributionAmount: '5.00', createdAt: new Date(), closedAt: null,
    } as any)

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/seasons/s1',
      payload: { name: 'New Name', potEnabled: false },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    // potEnabled should remain true (the update mock returns the original value)
    expect(res.json().potEnabled).toBe(true)
    // Verify only name was passed to prisma.season.update
    expect(vi.mocked(prisma.season.update).mock.calls[0][0].data).toEqual({ name: 'New Name' })
  })
})

describe('GET /api/seasons/:id/standings — totalEarnings', () => {
  it('includes totalEarnings per player across closed games', async () => {
    vi.mocked(prisma.season.findFirst).mockResolvedValueOnce({
      id: 's1', groupId: 'group-1', status: 'ACTIVE', name: 'Spring',
      potEnabled: true, contributionAmount: '5.00',
      createdAt: new Date(), closedAt: null,
    } as any)

    // Two closed games: player p1 won game 1 (+10), lost game 2 (-5) → totalEarnings = 5
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce([
      {
        id: 'game-1', status: 'CLOSED',
        players: [
          {
            playerId: 'p1', potAwarded: { toString: () => '10.00' },
            player: { id: 'p1', name: 'Alice', avatar: 'cat' },
            rounds: [],
          },
          {
            playerId: 'p2', potAwarded: { toString: () => '-5.00' },
            player: { id: 'p2', name: 'Bob', avatar: 'fox' },
            rounds: [],
          },
        ],
        rounds: [],
      },
      {
        id: 'game-2', status: 'CLOSED',
        players: [
          {
            playerId: 'p1', potAwarded: { toString: () => '-5.00' },
            player: { id: 'p1', name: 'Alice', avatar: 'cat' },
            rounds: [],
          },
          {
            playerId: 'p2', potAwarded: { toString: () => '10.00' },
            player: { id: 'p2', name: 'Bob', avatar: 'fox' },
            rounds: [],
          },
        ],
        rounds: [],
      },
    ] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/seasons/s1/standings',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    const standings = res.json()
    const p1 = standings.find((s: any) => s.playerId === 'p1')
    const p2 = standings.find((s: any) => s.playerId === 'p2')
    expect(p1.totalEarnings).toBeCloseTo(5, 2)   // 10 + (-5) = 5
    expect(p2.totalEarnings).toBeCloseTo(5, 2)   // (-5) + 10 = 5
  })

  it('returns totalEarnings=0 when no pot or all zero games', async () => {
    vi.mocked(prisma.season.findFirst).mockResolvedValueOnce({
      id: 's1', groupId: 'group-1', status: 'ACTIVE', name: 'Spring',
      potEnabled: false, contributionAmount: null,
      createdAt: new Date(), closedAt: null,
    } as any)

    vi.mocked(prisma.game.findMany).mockResolvedValueOnce([
      {
        id: 'game-1', status: 'CLOSED',
        players: [
          {
            playerId: 'p1', potAwarded: null,
            player: { id: 'p1', name: 'Alice', avatar: 'cat' },
            rounds: [],
          },
        ],
        rounds: [],
      },
    ] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/seasons/s1/standings',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    const standings = res.json()
    const p1 = standings.find((s: any) => s.playerId === 'p1')
    expect(p1.totalEarnings).toBe(0)
  })
})

describe('POST /api/seasons/:id/close — pot settlement for in-progress games', () => {
  it('settles pot for in-progress game with 7 rounds when season closed', async () => {
    // Season with pot enabled
    vi.mocked(prisma.season.findFirst).mockResolvedValueOnce({
      id: 's1', groupId: 'group-1', status: 'ACTIVE',
      potEnabled: true, contributionAmount: { toString: () => '5.00' },
    } as any)

    // One in-progress game with 7 rounds, 3 players
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce([{
      id: 'game-1',
      status: 'IN_PROGRESS',
      totalPot: { toString: () => '15.00' },
      season: { contributionAmount: { toString: () => '5.00' }, potEnabled: true },
      players: [
        { playerId: 'p1', player: { id: 'p1', name: 'Alice', avatar: 'cat' } },
        { playerId: 'p2', player: { id: 'p2', name: 'Bob', avatar: 'fox' } },
        { playerId: 'p3', player: { id: 'p3', name: 'Carol', avatar: 'bear' } },
      ],
      rounds: Array.from({ length: 7 }, (_, i) => ({
        id: `r${i + 1}`,
        roundNumber: i + 1,
        scores: [
          { playerId: 'p1', points: 10, wentOut: false },
          { playerId: 'p2', points: 20, wentOut: false },
          { playerId: 'p3', points: 30, wentOut: false },
        ],
      })),
    }] as any)

    vi.mocked(prisma.gamePlayer.update).mockResolvedValue({} as any)
    vi.mocked(prisma.game.update).mockResolvedValueOnce({ id: 'game-1', status: 'CLOSED', closedAt: new Date() } as any)
    vi.mocked(prisma.season.update).mockResolvedValueOnce({
      id: 's1', name: 'Spring', groupId: 'group-1', status: 'CLOSED',
      potEnabled: true, contributionAmount: '5.00', createdAt: new Date(), closedAt: new Date(),
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/seasons/s1/close',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    // gamePlayer.update should have been called for each player
    expect(vi.mocked(prisma.gamePlayer.update)).toHaveBeenCalledTimes(3)
  })

  it('does NOT settle pot for in-progress game with fewer than 7 rounds', async () => {
    vi.mocked(prisma.season.findFirst).mockResolvedValueOnce({
      id: 's1', groupId: 'group-1', status: 'ACTIVE',
      potEnabled: true, contributionAmount: { toString: () => '5.00' },
    } as any)

    // Game with only 5 rounds
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce([{
      id: 'game-1',
      status: 'IN_PROGRESS',
      totalPot: { toString: () => '15.00' },
      season: { contributionAmount: { toString: () => '5.00' }, potEnabled: true },
      players: [
        { playerId: 'p1', player: { id: 'p1', name: 'Alice', avatar: 'cat' } },
        { playerId: 'p2', player: { id: 'p2', name: 'Bob', avatar: 'fox' } },
        { playerId: 'p3', player: { id: 'p3', name: 'Carol', avatar: 'bear' } },
      ],
      rounds: Array.from({ length: 5 }, (_, i) => ({
        id: `r${i + 1}`,
        roundNumber: i + 1,
        scores: [
          { playerId: 'p1', points: 10, wentOut: false },
          { playerId: 'p2', points: 20, wentOut: false },
          { playerId: 'p3', points: 30, wentOut: false },
        ],
      })),
    }] as any)

    vi.mocked(prisma.game.update).mockResolvedValueOnce({ id: 'game-1', status: 'CLOSED', closedAt: new Date() } as any)
    vi.mocked(prisma.season.update).mockResolvedValueOnce({
      id: 's1', name: 'Spring', groupId: 'group-1', status: 'CLOSED',
      potEnabled: true, contributionAmount: '5.00', createdAt: new Date(), closedAt: new Date(),
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/seasons/s1/close',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    // gamePlayer.update should NOT have been called (< 7 rounds)
    expect(vi.mocked(prisma.gamePlayer.update)).not.toHaveBeenCalled()
  })
})
