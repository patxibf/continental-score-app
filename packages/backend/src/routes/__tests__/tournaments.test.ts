import { describe, it, expect, beforeEach, vi } from 'vitest'
import { buildApp } from '../../test/helpers.js'
import { prisma } from '../../lib/prisma.js'

vi.mock('../../lib/prisma.js')

const mockPrisma = prisma as any

describe('GET /api/tournaments/preview', () => {
  it('returns bracket structure for valid player count', async () => {
    const app = await buildApp()
    const token = (await import('../../test/helpers.js')).groupToken(app)

    const res = await app.inject({
      method: 'GET',
      url: '/api/tournaments/preview?playerCount=12',
      headers: { cookie: `token=${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.stages).toBeInstanceOf(Array)
    expect(body.stages.length).toBeGreaterThan(0)
    expect(body.stages[body.stages.length - 1].advancePerTable).toBe(0)
  })

  it('returns 400 for player count below 3', async () => {
    const app = await buildApp()
    const token = (await import('../../test/helpers.js')).groupToken(app)

    const res = await app.inject({
      method: 'GET',
      url: '/api/tournaments/preview?playerCount=2',
      headers: { cookie: `token=${token}` },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/tournaments/preview?playerCount=12' })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/tournaments', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('creates tournament and returns full structure', async () => {
    const app = await buildApp()
    const token = (await import('../../test/helpers.js')).groupToken(app)

    // 8 players → 2 tables of 4 → final of 4
    const playerIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']

    mockPrisma.player.findMany.mockResolvedValue(
      playerIds.map(id => ({ id, groupId: 'group-1' })),
    )
    const mockTournament = {
      id: 't-1',
      groupId: 'group-1',
      name: 'Test Cup',
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
      stages: [],
      participants: [],
    }
    mockPrisma.$transaction.mockResolvedValue(mockTournament)

    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      headers: { cookie: `token=${token}`, 'content-type': 'application/json' },
      payload: JSON.stringify({
        name: 'Test Cup',
        playerIds,
        stageConfigs: [
          { startRound: 5, endRound: 7 },
          { startRound: 1, endRound: 7 },
        ],
      }),
    })

    expect(res.statusCode).toBe(201)
  })

  it('returns 400 if stageConfigs length mismatches bracket', async () => {
    const app = await buildApp()
    const token = (await import('../../test/helpers.js')).groupToken(app)

    const playerIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']
    mockPrisma.player.findMany.mockResolvedValue(
      playerIds.map(id => ({ id, groupId: 'group-1' })),
    )

    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      headers: { cookie: `token=${token}`, 'content-type': 'application/json' },
      payload: JSON.stringify({
        name: 'Test Cup',
        playerIds,
        stageConfigs: [{ startRound: 1, endRound: 7 }], // only 1, but bracket needs 2
      }),
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 403 for non-admin member', async () => {
    const app = await buildApp()
    const token = (await import('../../test/helpers.js')).memberToken(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      headers: { cookie: `token=${token}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'x', playerIds: [], stageConfigs: [] }),
    })

    expect(res.statusCode).toBe(403)
  })
})
