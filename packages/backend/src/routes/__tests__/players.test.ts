import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp, groupToken, memberToken } from '../../test/helpers.js'
import type { FastifyInstance } from 'fastify'

vi.mock('../../lib/prisma.js')
import { prisma } from '../../lib/prisma.js'

let app: FastifyInstance
beforeEach(async () => { app = await buildApp(); vi.resetAllMocks() })
afterEach(async () => { await app?.close() })

describe('GET /api/players', () => {
  it('returns players for the group', async () => {
    vi.mocked(prisma.player.findMany).mockResolvedValueOnce([
      { id: 'p1', name: 'Alice', avatar: 'cat', active: true } as any,
    ])
    const res = await app.inject({
      method: 'GET',
      url: '/api/players',
      cookies: { token: groupToken(app) },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/players' })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/players', () => {
  it('creates player for group admin', async () => {
    vi.mocked(prisma.player.create).mockResolvedValueOnce({
      id: 'p2', name: 'Bob', avatar: 'fox', groupId: 'group-1', role: 'MEMBER',
    } as any)
    const res = await app.inject({
      method: 'POST',
      url: '/api/players',
      payload: { name: 'Bob', avatar: 'fox' },
      cookies: { token: groupToken(app) },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().name).toBe('Bob')
  })

  it('returns 403 for member', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/players',
      payload: { name: 'Bob', avatar: 'fox' },
      cookies: { token: memberToken(app) },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('PATCH /api/players/:id', () => {
  it('updates player if in group', async () => {
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce({ id: 'p1' } as any)
    vi.mocked(prisma.player.update).mockResolvedValueOnce({ id: 'p1', name: 'Alicia' } as any)
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/players/p1',
      payload: { name: 'Alicia' },
      cookies: { token: groupToken(app) },
    })
    expect(res.statusCode).toBe(200)
  })

  it('returns 404 if player not in group', async () => {
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce(null)
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/players/p-other',
      payload: { name: 'Alicia' },
      cookies: { token: groupToken(app) },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('PATCH /api/players/:id/role', () => {
  it('allows admin to promote member to admin', async () => {
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce({ id: 'p1', role: 'MEMBER' } as any)
    vi.mocked(prisma.player.update).mockResolvedValueOnce({ id: 'p1', role: 'ADMIN' } as any)
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/players/p1/role',
      payload: { role: 'ADMIN' },
      cookies: { token: groupToken(app) },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('ADMIN')
  })

  it('allows admin to demote admin to member', async () => {
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce({ id: 'p2', role: 'ADMIN' } as any)
    vi.mocked(prisma.player.update).mockResolvedValueOnce({ id: 'p2', role: 'MEMBER' } as any)
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/players/p2/role',
      payload: { role: 'MEMBER' },
      cookies: { token: groupToken(app) },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('MEMBER')
  })

  it('returns 403 when trying to change owner role', async () => {
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce({ id: 'p3', role: 'OWNER' } as any)
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/players/p3/role',
      payload: { role: 'MEMBER' },
      cookies: { token: groupToken(app) },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('CANNOT_CHANGE_OWNER')
  })

  it('returns 404 when player not in group', async () => {
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce(null)
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/players/p-other/role',
      payload: { role: 'ADMIN' },
      cookies: { token: groupToken(app) },
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 for member (non-admin)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/players/p1/role',
      payload: { role: 'ADMIN' },
      cookies: { token: memberToken(app) },
    })
    expect(res.statusCode).toBe(403)
  })
})
