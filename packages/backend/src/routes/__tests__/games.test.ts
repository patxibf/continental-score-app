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
    expect(res.json().status).toBe('CLOSED')
  })
})

describe('POST /api/games/:id/close — pot settlement', () => {
  // p1 scores: 10×7 = 70 (winner), p2: 20×7 = 140, p3: 30×7 = 210
  // totalPot=15, contribution=5 → winnerShare=15, p1 net=+10, p2/p3=-5
  function makePotGame() {
    return {
      id: 'game-1',
      status: 'IN_PROGRESS',
      totalPot: { toString: () => '15.00' },
      season: { contributionAmount: { toString: () => '5.00' } },
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
    }
  }

  it('writes correct potAwarded for single winner (p1 wins)', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(makePotGame() as any)
    vi.mocked(prisma.gamePlayer.update).mockResolvedValue({} as any)
    vi.mocked(prisma.game.update).mockResolvedValueOnce({
      id: 'game-1', status: 'CLOSED', closedAt: new Date(),
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/close',
      payload: { confirm: true },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)

    const updateCalls = vi.mocked(prisma.gamePlayer.update).mock.calls
    expect(updateCalls).toHaveLength(3)

    const p1Call = updateCalls.find(c => c[0].where.gameId_playerId?.playerId === 'p1')
    const p2Call = updateCalls.find(c => c[0].where.gameId_playerId?.playerId === 'p2')
    const p3Call = updateCalls.find(c => c[0].where.gameId_playerId?.playerId === 'p3')

    expect(p1Call![0].data.potAwarded).toBeCloseTo(10, 2)  // 15 - 5 = 10
    expect(p2Call![0].data.potAwarded).toBeCloseTo(-5, 2)
    expect(p3Call![0].data.potAwarded).toBeCloseTo(-5, 2)
  })

  it('handles 2-way tie: p1+p2 win, p3 loses (£5, 3 players)', async () => {
    // p1=70, p2=70 (tie), p3=210 — totalPot=15, winnerShare=7.50
    // p1/p2 net = 7.50-5 = 2.50, p3 = -5
    const tieGame = {
      ...makePotGame(),
      rounds: Array.from({ length: 7 }, (_, i) => ({
        id: `r${i + 1}`, roundNumber: i + 1,
        scores: [
          { playerId: 'p1', points: 10, wentOut: false },
          { playerId: 'p2', points: 10, wentOut: false },
          { playerId: 'p3', points: 30, wentOut: false },
        ],
      })),
    }
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(tieGame as any)
    vi.mocked(prisma.gamePlayer.update).mockResolvedValue({} as any)
    vi.mocked(prisma.game.update).mockResolvedValueOnce({ id: 'game-1', status: 'CLOSED', closedAt: new Date() } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/close',
      payload: { confirm: true },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    const updateCalls = vi.mocked(prisma.gamePlayer.update).mock.calls
    const p1 = updateCalls.find(c => c[0].where.gameId_playerId?.playerId === 'p1')
    const p2 = updateCalls.find(c => c[0].where.gameId_playerId?.playerId === 'p2')
    const p3 = updateCalls.find(c => c[0].where.gameId_playerId?.playerId === 'p3')
    expect(p1![0].data.potAwarded).toBeCloseTo(2.5, 2)
    expect(p2![0].data.potAwarded).toBeCloseTo(2.5, 2)
    expect(p3![0].data.potAwarded).toBeCloseTo(-5, 2)
  })

  it('full-table tie: all players get potAwarded=0', async () => {
    // p1=p2=p3=70 (all tied) — each wins, winnerShare = 15/3 = 5, net = 5-5 = 0
    const allTieGame = {
      ...makePotGame(),
      rounds: Array.from({ length: 7 }, (_, i) => ({
        id: `r${i + 1}`, roundNumber: i + 1,
        scores: [
          { playerId: 'p1', points: 10, wentOut: false },
          { playerId: 'p2', points: 10, wentOut: false },
          { playerId: 'p3', points: 10, wentOut: false },
        ],
      })),
    }
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(allTieGame as any)
    vi.mocked(prisma.gamePlayer.update).mockResolvedValue({} as any)
    vi.mocked(prisma.game.update).mockResolvedValueOnce({ id: 'game-1', status: 'CLOSED', closedAt: new Date() } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/close',
      payload: { confirm: true },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    const updateCalls = vi.mocked(prisma.gamePlayer.update).mock.calls
    for (const call of updateCalls) {
      expect(call[0].data.potAwarded).toBeCloseTo(0, 2)
    }
  })

  it('3-way tie with truncation: 4 players (£5), 3 winners (winnerShare=6.66 truncated)', async () => {
    // totalPot=20, winnerShare = floor(20/3 * 100)/100 = floor(666.66)/100 = 6.66
    // p1/p2/p3 net = 6.66 - 5 = 1.66, p4 net = -5
    const truncGame = {
      id: 'game-1',
      status: 'IN_PROGRESS',
      totalPot: { toString: () => '20.00' },
      season: { contributionAmount: { toString: () => '5.00' } },
      players: [
        { playerId: 'p1', player: { id: 'p1', name: 'Alice', avatar: 'cat' } },
        { playerId: 'p2', player: { id: 'p2', name: 'Bob', avatar: 'fox' } },
        { playerId: 'p3', player: { id: 'p3', name: 'Carol', avatar: 'bear' } },
        { playerId: 'p4', player: { id: 'p4', name: 'Dave', avatar: 'wolf' } },
      ],
      rounds: Array.from({ length: 7 }, (_, i) => ({
        id: `r${i + 1}`, roundNumber: i + 1,
        scores: [
          { playerId: 'p1', points: 10, wentOut: false },  // total=70 (winner)
          { playerId: 'p2', points: 10, wentOut: false },  // total=70 (winner)
          { playerId: 'p3', points: 10, wentOut: false },  // total=70 (winner)
          { playerId: 'p4', points: 30, wentOut: false },  // total=210 (loser)
        ],
      })),
    }
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(truncGame as any)
    vi.mocked(prisma.gamePlayer.update).mockResolvedValue({} as any)
    vi.mocked(prisma.game.update).mockResolvedValueOnce({ id: 'game-1', status: 'CLOSED', closedAt: new Date() } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/close',
      payload: { confirm: true },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    const updateCalls = vi.mocked(prisma.gamePlayer.update).mock.calls
    expect(updateCalls).toHaveLength(4)

    const winner = updateCalls.find(c => c[0].where.gameId_playerId?.playerId === 'p1')
    const loser = updateCalls.find(c => c[0].where.gameId_playerId?.playerId === 'p4')
    // winnerShare = Math.floor(20/3 * 100) / 100 = 6.66
    expect(winner![0].data.potAwarded).toBeCloseTo(1.66, 2)  // 6.66 - 5
    expect(loser![0].data.potAwarded).toBeCloseTo(-5, 2)
  })

  it('uses $transaction to wrap potAwarded writes and game close atomically', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(makePotGame() as any)
    vi.mocked(prisma.gamePlayer.update).mockResolvedValue({} as any)
    vi.mocked(prisma.game.update).mockResolvedValueOnce({ id: 'game-1', status: 'CLOSED', closedAt: new Date() } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/close',
      payload: { confirm: true },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(vi.mocked(prisma.$transaction)).toHaveBeenCalledOnce()
    // $transaction should receive an array (not a callback)
    const txArg = vi.mocked(prisma.$transaction).mock.calls[0][0]
    expect(Array.isArray(txArg)).toBe(true)
    expect(txArg).toHaveLength(4) // 3 gamePlayer.update + 1 game.update
  })

  it('skips pot settlement when totalPot is null (pot disabled)', async () => {
    const noPotGame = {
      ...makePotGame(),
      totalPot: null,
    }
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(noPotGame as any)
    vi.mocked(prisma.game.update).mockResolvedValueOnce({ id: 'game-1', status: 'CLOSED', closedAt: new Date() } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/close',
      payload: { confirm: true },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    // gamePlayer.update should NOT be called
    expect(vi.mocked(prisma.gamePlayer.update)).not.toHaveBeenCalled()
  })

  it('skips pot settlement and closes normally when totalPot is set but contributionAmount is null (defensive fallback)', async () => {
    const fallbackGame = {
      ...makePotGame(),
      totalPot: { toString: () => '15.00' },
      season: { contributionAmount: null },
    }
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(fallbackGame as any)
    vi.mocked(prisma.game.update).mockResolvedValueOnce({ id: 'game-1', status: 'CLOSED', closedAt: new Date() } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/close',
      payload: { confirm: true },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    // gamePlayer.update should NOT be called (contributionAmount is null)
    expect(vi.mocked(prisma.gamePlayer.update)).not.toHaveBeenCalled()
  })
})

describe('POST /api/seasons/:seasonId/games — totalPot', () => {
  it('sets totalPot when season has pot enabled (3 players at £5)', async () => {
    vi.mocked(prisma.season.findFirst).mockResolvedValueOnce({
      id: 's1', groupId: 'group-1', status: 'ACTIVE',
      potEnabled: true, contributionAmount: { toString: () => '5.00' },
    } as any)
    vi.mocked(prisma.groupPlayer.findMany).mockResolvedValueOnce([
      { groupId: 'group-1', playerId: 'p1' },
      { groupId: 'group-1', playerId: 'p2' },
      { groupId: 'group-1', playerId: 'p3' },
    ] as any)
    vi.mocked(prisma.game.create).mockResolvedValueOnce({
      id: 'game-1', seasonId: 's1', status: 'IN_PROGRESS',
      totalPot: '15.00', players: [], createdAt: new Date(),
    } as any)
    vi.mocked(prisma.seasonPlayer.upsert).mockResolvedValue({} as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/seasons/s1/games',
      payload: { playerIds: ['p1', 'p2', 'p3'] },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(201)
    // Verify totalPot was passed to prisma.game.create
    const createCall = vi.mocked(prisma.game.create).mock.calls[0][0]
    expect(Number(createCall.data.totalPot)).toBeCloseTo(15, 2)
  })

  it('leaves totalPot null when pot is disabled', async () => {
    vi.mocked(prisma.season.findFirst).mockResolvedValueOnce({
      id: 's1', groupId: 'group-1', status: 'ACTIVE',
      potEnabled: false, contributionAmount: null,
    } as any)
    vi.mocked(prisma.groupPlayer.findMany).mockResolvedValueOnce([
      { groupId: 'group-1', playerId: 'p1' },
      { groupId: 'group-1', playerId: 'p2' },
    ] as any)
    vi.mocked(prisma.game.create).mockResolvedValueOnce({
      id: 'game-1', seasonId: 's1', status: 'IN_PROGRESS',
      totalPot: null, players: [], createdAt: new Date(),
    } as any)
    vi.mocked(prisma.seasonPlayer.upsert).mockResolvedValue({} as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/seasons/s1/games',
      payload: { playerIds: ['p1', 'p2'] },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(201)
    const createCall = vi.mocked(prisma.game.create).mock.calls[0][0]
    expect(createCall.data.totalPot).toBeUndefined()
  })
})
