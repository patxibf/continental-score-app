import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildApp, groupToken, memberToken } from '../../test/helpers.js'
import { prisma } from '../../lib/prisma.js'
import type { FastifyInstance } from 'fastify'

vi.mock('../../lib/prisma.js')

const mockPrisma = prisma as any

describe('GET /api/tournaments/preview', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
    vi.resetAllMocks()
  })

  afterEach(async () => {
    await app?.close()
  })

  it('returns bracket structure for valid player count', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tournaments/preview?playerCount=12',
      headers: { cookie: `token=${groupToken(app)}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.stages).toBeInstanceOf(Array)
    expect(body.stages.length).toBeGreaterThan(0)
    expect(body.stages[body.stages.length - 1].advancePerTable).toBe(0)
  })

  it('returns 400 for player count below 3', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tournaments/preview?playerCount=2',
      headers: { cookie: `token=${groupToken(app)}` },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tournaments/preview?playerCount=12' })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/tournaments', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
    vi.resetAllMocks()
  })

  afterEach(async () => {
    await app?.close()
  })

  it('creates tournament and returns full structure', async () => {
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
    // Execute the callback with mocked prisma so transaction logic runs
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma))
    // Set up the individual prisma method mocks that the transaction uses:
    mockPrisma.tournament.create.mockResolvedValue({ id: 't-1', groupId: 'group-1' })
    mockPrisma.tournamentStage.create.mockResolvedValue({ id: 'stage-1' })
    mockPrisma.tournamentTable.create.mockResolvedValue({ id: 'table-1' })
    mockPrisma.tournament.findFirst.mockResolvedValue(mockTournament)

    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      headers: { cookie: `token=${groupToken(app)}`, 'content-type': 'application/json' },
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
    const playerIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']
    mockPrisma.player.findMany.mockResolvedValue(
      playerIds.map(id => ({ id, groupId: 'group-1' })),
    )

    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      headers: { cookie: `token=${groupToken(app)}`, 'content-type': 'application/json' },
      payload: JSON.stringify({
        name: 'Test Cup',
        playerIds,
        stageConfigs: [{ startRound: 1, endRound: 7 }], // only 1, but bracket needs 2
      }),
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 403 for non-admin member', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      headers: { cookie: `token=${memberToken(app)}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'x', playerIds: [], stageConfigs: [] }),
    })

    expect(res.statusCode).toBe(403)
  })
})

describe('GET /api/tournaments', () => {
  let app: FastifyInstance
  beforeEach(async () => { app = await buildApp() })
  afterEach(async () => { await app?.close(); vi.resetAllMocks() })

  it('returns list of tournaments for group', async () => {
    const token = groupToken(app)

    mockPrisma.tournament.findMany.mockResolvedValue([
      { id: 't-1', name: 'Cup', status: 'IN_PROGRESS', createdAt: new Date(), participants: [{ id: 'p1' }] },
    ])

    const res = await app.inject({
      method: 'GET',
      url: '/api/tournaments',
      headers: { cookie: `token=${token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(1)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tournaments' })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /api/tournaments/:id', () => {
  let app: FastifyInstance
  beforeEach(async () => { app = await buildApp() })
  afterEach(async () => { await app?.close(); vi.resetAllMocks() })

  it('returns tournament detail with stages and tables', async () => {
    const token = groupToken(app)

    mockPrisma.tournament.findFirst.mockResolvedValue({
      id: 't-1',
      groupId: 'group-1',
      name: 'Cup',
      status: 'IN_PROGRESS',
      stages: [],
      participants: [],
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/tournaments/t-1',
      headers: { cookie: `token=${token}` },
    })

    expect(res.statusCode).toBe(200)
  })

  it('returns 404 for tournament not in group', async () => {
    const token = groupToken(app)

    mockPrisma.tournament.findFirst.mockResolvedValue(null)

    const res = await app.inject({
      method: 'GET',
      url: '/api/tournaments/not-found',
      headers: { cookie: `token=${token}` },
    })

    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/tournaments/:id/stages/:stageId/advance', () => {
  let app: FastifyInstance
  beforeEach(async () => { app = await buildApp(); vi.resetAllMocks() })
  afterEach(async () => { await app?.close() })

  const mockStage = {
    id: 'stage-1',
    tournamentId: 't-1',
    stageNumber: 1,
    startRound: 5,
    endRound: 7,
    advancePerTable: 3,
    status: 'IN_PROGRESS',
    tables: [
      {
        id: 'table-1',
        stageId: 'stage-1',
        tableNumber: 1,
        status: 'COMPLETED',
        gameId: 'game-1',
        game: {
          rounds: [
            { scores: [{ playerId: 'p1', points: 30 }, { playerId: 'p2', points: 50 }, { playerId: 'p3', points: 40 }] },
            { scores: [{ playerId: 'p1', points: 20 }, { playerId: 'p2', points: 40 }, { playerId: 'p3', points: 30 }] },
          ],
        },
        players: [
          { playerId: 'p1', isBye: false, advanced: false },
          { playerId: 'p2', isBye: false, advanced: false },
          { playerId: 'p3', isBye: false, advanced: false },
        ],
      },
    ],
    tournament: { id: 't-1', groupId: 'group-1', stages: [{ stageNumber: 1 }, { stageNumber: 2 }] },
  }

  it('advances players and creates next stage tables', async () => {
    const token = groupToken(app)

    mockPrisma.tournamentStage.findFirst.mockResolvedValue(mockStage)
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma))
    mockPrisma.tournamentTablePlayer.updateMany.mockResolvedValue({})
    mockPrisma.tournamentStage.update.mockResolvedValue({})
    mockPrisma.tournamentStage.findFirst
      .mockResolvedValueOnce(mockStage)  // first call: fetch stage
    // second call inside tx: find next stage
    mockPrisma.tournamentStage.findFirst.mockResolvedValueOnce({ id: 'stage-2' })
    mockPrisma.tournamentTable.create.mockResolvedValue({})
    mockPrisma.tournament.findFirst.mockResolvedValue({ id: 't-1', stages: [] })

    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments/t-1/stages/stage-1/advance',
      headers: { cookie: `token=${token}` },
    })

    expect(res.statusCode).toBe(200)
  })

  it('returns 400 if called on final stage (advancePerTable=0)', async () => {
    const token = groupToken(app)

    mockPrisma.tournamentStage.findFirst.mockResolvedValue({
      ...mockStage,
      advancePerTable: 0,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments/t-1/stages/stage-1/advance',
      headers: { cookie: `token=${token}` },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 if not all tables are completed', async () => {
    const token = groupToken(app)

    mockPrisma.tournamentStage.findFirst.mockResolvedValue({
      ...mockStage,
      tables: [{ ...mockStage.tables[0], status: 'IN_PROGRESS' }],
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments/t-1/stages/stage-1/advance',
      headers: { cookie: `token=${token}` },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 403 for non-admin', async () => {
    const token = memberToken(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments/t-1/stages/stage-1/advance',
      headers: { cookie: `token=${token}` },
    })

    expect(res.statusCode).toBe(403)
  })

  it('returns 400 if stage is already completed', async () => {
    const token = groupToken(app)

    mockPrisma.tournamentStage.findFirst.mockResolvedValue({
      ...mockStage,
      status: 'COMPLETED',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments/t-1/stages/stage-1/advance',
      headers: { cookie: `token=${token}` },
    })

    expect(res.statusCode).toBe(400)
  })
})
