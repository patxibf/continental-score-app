import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp, adminToken, groupToken } from '../../test/helpers.js'
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

describe('GET /api/admin/groups', () => {
  it('returns list of groups with slug', async () => {
    vi.mocked(prisma.group.findMany).mockResolvedValueOnce([{
      id: 'g1', name: 'Test Group', slug: 'test-group', currency: 'GBP',
      createdAt: new Date(), _count: { players: 3 },
    }] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/groups',
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()[0]).toMatchObject({ id: 'g1', name: 'Test Group', slug: 'test-group', currency: 'GBP' })
  })

  it('returns 401 when no cookie is provided', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/groups' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 403 when called by a group user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/groups',
      cookies: { token: groupToken(app) },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('GET /api/admin/groups/:id', () => {
  it('returns a single group by id', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: 'g1', name: 'Test Group', slug: 'test-group', currency: 'EUR',
      createdAt: new Date(), _count: { players: 2 },
    } as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/groups/g1',
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: 'g1', slug: 'test-group' })
  })

  it('returns 404 when group not found', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/groups/missing',
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(404)
  })

  it('returns 403 when called by a group user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/groups/g1',
      cookies: { token: groupToken(app) },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('DELETE /api/admin/groups/:id', () => {
  it('returns 204 on successful delete', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({ id: 'g1' } as any)
    vi.mocked(prisma.group.delete).mockResolvedValueOnce({} as any)

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/admin/groups/g1',
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(204)
  })

  it('returns 404 when group not found', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/admin/groups/missing',
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(404)
  })

  it('returns 403 when called by a group user', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/admin/groups/g1',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(403)
  })

  it('returns 401 when no cookie is provided', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/admin/groups/g1',
    })

    expect(res.statusCode).toBe(401)
  })
})
