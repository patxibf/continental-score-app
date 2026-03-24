import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp, groupToken } from '../../test/helpers.js'
import type { FastifyInstance } from 'fastify'

vi.mock('../../lib/prisma.js')
import { prisma } from '../../lib/prisma.js'

let app: FastifyInstance

// Minimal game fixture with 2 players and no existing rounds
const mockGame = (overrides = {}) => ({
  id: 'game-1',
  status: 'IN_PROGRESS',
  players: [
    { playerId: 'p1' },
    { playerId: 'p2' },
  ],
  rounds: [],
  ...overrides,
})

// Score payload for 2 players, no one out
const normalScores = [
  { playerId: 'p1', points: 15, wentOut: false, wentOutInOneGo: false },
  { playerId: 'p2', points: 30, wentOut: false, wentOutInOneGo: false },
]

beforeEach(async () => {
  app = await buildApp()
  vi.resetAllMocks()
})

afterEach(async () => {
  await app?.close()
})

describe('POST /api/games/:gameId/rounds', () => {
  it('stores 0 points for the player who went out (not one-go)', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(mockGame() as any)
    vi.mocked(prisma.round.create).mockResolvedValueOnce({
      id: 'r1',
      roundNumber: 1,
      scores: [
        { playerId: 'p1', points: 0, wentOut: true, player: { id: 'p1', name: 'Alice', avatar: 'cat' } },
        { playerId: 'p2', points: 25, wentOut: false, player: { id: 'p2', name: 'Bob', avatar: 'fox' } },
      ],
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/rounds',
      payload: {
        roundNumber: 1,
        scores: [
          { playerId: 'p1', points: 0, wentOut: true, wentOutInOneGo: false },
          { playerId: 'p2', points: 25, wentOut: false, wentOutInOneGo: false },
        ],
      },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(201)
    // The create call should have received points: 0 for the wentOut player
    const createCall = vi.mocked(prisma.round.create).mock.calls[0][0]
    const p1Score = (createCall.data.scores?.create as any[])?.find((s: any) => s.playerId === 'p1')
    expect(p1Score.points).toBe(0)
  })

  it('stores -10 points for round 1 one-go', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(mockGame() as any)
    vi.mocked(prisma.round.create).mockResolvedValueOnce({ id: 'r1', roundNumber: 1, scores: [] } as any)

    await app.inject({
      method: 'POST',
      url: '/api/games/game-1/rounds',
      payload: {
        roundNumber: 1,
        scores: [
          { playerId: 'p1', points: 0, wentOut: true, wentOutInOneGo: true },
          { playerId: 'p2', points: 25, wentOut: false, wentOutInOneGo: false },
        ],
      },
      cookies: { token: groupToken(app) },
    })

    const createCall = vi.mocked(prisma.round.create).mock.calls[0][0]
    const p1Score = (createCall.data.scores?.create as any[])?.find((s: any) => s.playerId === 'p1')
    expect(p1Score.points).toBe(-10)
  })

  it('stores -70 points for round 7 one-go', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(mockGame() as any)
    vi.mocked(prisma.round.create).mockResolvedValueOnce({ id: 'r7', roundNumber: 7, scores: [] } as any)

    await app.inject({
      method: 'POST',
      url: '/api/games/game-1/rounds',
      payload: {
        roundNumber: 7,
        scores: [
          { playerId: 'p1', points: 0, wentOut: true, wentOutInOneGo: true },
          { playerId: 'p2', points: 25, wentOut: false, wentOutInOneGo: false },
        ],
      },
      cookies: { token: groupToken(app) },
    })

    const createCall = vi.mocked(prisma.round.create).mock.calls[0][0]
    const p1Score = (createCall.data.scores?.create as any[])?.find((s: any) => s.playerId === 'p1')
    expect(p1Score.points).toBe(-70)
  })

  it('returns 409 if the round was already submitted', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(
      mockGame({ rounds: [{ roundNumber: 1 }] }) as any,
    )

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/rounds',
      payload: { roundNumber: 1, scores: normalScores },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(409)
  })

  it('returns 400 if a game player is missing from the scores payload', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(mockGame() as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/rounds',
      payload: {
        roundNumber: 1,
        scores: [{ playerId: 'p1', points: 15, wentOut: false, wentOutInOneGo: false }], // p2 missing
      },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 if two players both have wentOut: true', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(mockGame() as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/rounds',
      payload: {
        roundNumber: 1,
        scores: [
          { playerId: 'p1', points: 0, wentOut: true, wentOutInOneGo: false },
          { playerId: 'p2', points: 0, wentOut: true, wentOutInOneGo: false },
        ],
      },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 401 without a cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/rounds',
      payload: { roundNumber: 1, scores: normalScores },
    })

    expect(res.statusCode).toBe(401)
  })
})

describe('PATCH /api/rounds/:id', () => {
  it('recomputes points correctly on edit (one-go round 3 → -30)', async () => {
    vi.mocked(prisma.round.findFirst).mockResolvedValueOnce({
      id: 'r1',
      roundNumber: 3,
      game: { status: 'IN_PROGRESS', season: { groupId: 'group-1' } },
    } as any)
    vi.mocked(prisma.roundScore.deleteMany).mockResolvedValueOnce({} as any)
    vi.mocked(prisma.round.update).mockResolvedValueOnce({ id: 'r1', roundNumber: 3, scores: [] } as any)

    await app.inject({
      method: 'PATCH',
      url: '/api/rounds/r1',
      payload: {
        scores: [
          { playerId: 'p1', points: 0, wentOut: true, wentOutInOneGo: true },
          { playerId: 'p2', points: 20, wentOut: false, wentOutInOneGo: false },
        ],
      },
      cookies: { token: groupToken(app) },
    })

    const updateCall = vi.mocked(prisma.round.update).mock.calls[0][0]
    const p1Score = (updateCall.data.scores?.create as any[])?.find((s: any) => s.playerId === 'p1')
    expect(p1Score.points).toBe(-30)
  })

  it('returns 403 when the game is already CLOSED', async () => {
    vi.mocked(prisma.round.findFirst).mockResolvedValueOnce({
      id: 'r1',
      roundNumber: 1,
      game: { status: 'CLOSED', season: { groupId: 'group-1' } },
    } as any)

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/rounds/r1',
      payload: {
        scores: [
          { playerId: 'p1', points: 0, wentOut: true, wentOutInOneGo: false },
          { playerId: 'p2', points: 20, wentOut: false, wentOutInOneGo: false },
        ],
      },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(403)
  })

  it('returns 400 if two players both have wentOut: true', async () => {
    vi.mocked(prisma.round.findFirst).mockResolvedValueOnce({
      id: 'r1',
      roundNumber: 1,
      game: { status: 'IN_PROGRESS', season: { groupId: 'group-1' } },
    } as any)

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/rounds/r1',
      payload: {
        scores: [
          { playerId: 'p1', points: 0, wentOut: true, wentOutInOneGo: false },
          { playerId: 'p2', points: 0, wentOut: true, wentOutInOneGo: false },
        ],
      },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })
})

describe('DELETE /api/rounds/:id', () => {
  it('deletes the last round of an IN_PROGRESS game', async () => {
    vi.mocked(prisma.round.findFirst).mockResolvedValueOnce({
      id: 'r2',
      game: {
        status: 'IN_PROGRESS',
        groupId: null,
        season: { groupId: 'group-1' },
        rounds: [{ id: 'r2', roundNumber: 2 }],
      },
    } as any)
    vi.mocked(prisma.round.delete).mockResolvedValueOnce({} as any)

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/rounds/r2',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(204)
  })

  it('returns 400 when trying to delete a non-last round', async () => {
    vi.mocked(prisma.round.findFirst).mockResolvedValueOnce({
      id: 'r1',
      game: {
        status: 'IN_PROGRESS',
        groupId: null,
        season: { groupId: 'group-1' },
        rounds: [{ id: 'r2', roundNumber: 2 }],
      },
    } as any)

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/rounds/r1',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: 'Can only undo the last round' })
  })

  it('returns 403 when game is CLOSED', async () => {
    vi.mocked(prisma.round.findFirst).mockResolvedValueOnce({
      id: 'r1',
      game: {
        status: 'CLOSED',
        groupId: null,
        season: { groupId: 'group-1' },
        rounds: [{ id: 'r1', roundNumber: 7 }],
      },
    } as any)

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/rounds/r1',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(403)
  })

  it('returns 404 when round not found', async () => {
    vi.mocked(prisma.round.findFirst).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/rounds/not-exist',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(404)
  })
})
