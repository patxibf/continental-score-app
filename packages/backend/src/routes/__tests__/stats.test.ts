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
afterEach(async () => { await app?.close() })

const makeGame = (id: string, players: Array<{ id: string; name: string }>, roundScores: Array<Record<string, number>>) => ({
  id,
  createdAt: new Date('2026-01-01'),
  players: players.map(p => ({ playerId: p.id, player: { id: p.id, name: p.name, avatar: 'cat' } })),
  rounds: roundScores.map((scores, i) => ({
    id: `r${i}`,
    scores: Object.entries(scores).map(([playerId, points]) => ({ playerId, points })),
  })),
})

describe('GET /api/stats/alltime', () => {
  it('returns players sorted by wins descending', async () => {
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce([
      makeGame('g1', [{ id: 'pA', name: 'Alice' }, { id: 'pB', name: 'Bob' }], [{ pA: 10, pB: 50 }]),
      makeGame('g2', [{ id: 'pA', name: 'Alice' }, { id: 'pB', name: 'Bob' }], [{ pA: 20, pB: 80 }]),
    ] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/stats/alltime',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body[0].playerId).toBe('pA')
    expect(body[0].wins).toBe(2)
    expect(body[1].wins).toBe(0)
  })

  it('assigns On Fire badge for 3-game win streak', async () => {
    const games = [1, 2, 3].map(i =>
      makeGame(`g${i}`, [{ id: 'pA', name: 'Alice' }, { id: 'pB', name: 'Bob' }], [{ pA: 10, pB: 50 }])
    )
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce(games as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/stats/alltime',
      cookies: { token: groupToken(app) },
    })

    const alice = res.json().find((p: any) => p.playerId === 'pA')
    expect(alice.currentStreak).toBe(3)
    expect(alice.streakType).toBe('win')
    expect(alice.badges).toContain('🔥 On Fire')
  })

  it('returns empty array when no closed games', async () => {
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce([])

    const res = await app.inject({
      method: 'GET',
      url: '/api/stats/alltime',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })
})

describe('GET /api/stats/h2h', () => {
  it('returns correct win/loss breakdown', async () => {
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce([
      makeGame('g1', [{ id: 'pA', name: 'Alice' }, { id: 'pB', name: 'Bob' }], [{ pA: 10, pB: 50 }]),
      makeGame('g2', [{ id: 'pA', name: 'Alice' }, { id: 'pB', name: 'Bob' }], [{ pA: 80, pB: 30 }]),
    ] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/stats/h2h?playerA=pA&playerB=pB',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ gamesPlayed: 2, winsA: 1, winsB: 1, ties: 0 })
  })

  it('returns 400 when playerA or playerB missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/stats/h2h?playerA=pA',
      cookies: { token: groupToken(app) },
    })
    expect(res.statusCode).toBe(400)
  })
})
