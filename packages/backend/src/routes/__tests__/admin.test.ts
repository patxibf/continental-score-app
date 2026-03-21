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

describe('POST /api/admin/groups', () => {
  it('creates a group and returns 201', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValue(null) // no slug conflict
    vi.mocked(prisma.group.create).mockResolvedValueOnce({
      id: 'g-new',
      name: 'Test Group',
      username: 'test-group',
      createdAt: new Date(),
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test Group', password: 'secret123' },
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ name: 'Test Group', username: 'test-group' })
  })

  it('returns 400 when password is shorter than 6 chars', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test', password: '123' },
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 403 when called by a non-admin (group role)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test', password: 'secret123' },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(403)
  })

  it('returns 401 when no cookie is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test', password: 'secret123' },
    })

    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/admin/groups — auto-slug + member password', () => {
  it('auto-generates slug from name', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValue(null) // no conflict
    vi.mocked(prisma.group.create).mockResolvedValueOnce({
      id: 'g-new', name: 'Friday Night', username: 'friday-night',
      createdAt: new Date(),
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Friday Night', password: 'secret123' },
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ name: 'Friday Night', username: 'friday-night' })
  })

  it('creates group with member password and hashes it', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.group.create).mockResolvedValueOnce({
      id: 'g-new', name: 'Test', username: 'test', createdAt: new Date(),
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test', password: 'adminpass', memberPassword: 'memberpass' },
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(201)
    const createCall = vi.mocked(prisma.group.create).mock.calls[0][0]
    expect(createCall.data).toHaveProperty('memberPasswordHash')
    expect(typeof (createCall.data as any).memberPasswordHash).toBe('string')
    // The hash must NOT be the plain text password
    expect((createCall.data as any).memberPasswordHash).not.toBe('memberpass')
  })

  it('returns 400 when no name provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { password: 'secret123' },
      cookies: { token: adminToken(app) },
    })
    expect(res.statusCode).toBe(400)
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

  it('returns 403 when called by a group user', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/admin/groups/g1',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(403)
  })
})

describe('POST /api/admin/groups — currency field', () => {
  it('stores currency GBP when provided', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.group.create).mockResolvedValueOnce({
      id: 'g1', name: 'Test', username: 'test', currency: 'GBP', createdAt: new Date(),
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test', password: 'secret123', currency: 'GBP' },
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().currency).toBe('GBP')
  })

  it('defaults to EUR when currency is omitted', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.group.create).mockResolvedValueOnce({
      id: 'g1', name: 'Test', username: 'test', currency: 'EUR', createdAt: new Date(),
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test', password: 'secret123' },
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toHaveProperty('currency')
  })

  it('returns 400 for invalid currency JPY', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test', password: 'secret123', currency: 'JPY' },
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })
})

describe('PATCH /api/admin/groups/:id — currency field', () => {
  it('updates currency to USD', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: 'g1', name: 'Test', username: 'test', currency: 'EUR',
      passwordHash: 'h', memberPasswordHash: null, createdAt: new Date(), seasons: [], groupPlayers: [], telegramChats: [],
    } as any)
    vi.mocked(prisma.group.update).mockResolvedValueOnce({
      id: 'g1', name: 'Test', username: 'test', currency: 'USD', createdAt: new Date(),
    } as any)

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/groups/g1',
      payload: { currency: 'USD' },
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().currency).toBe('USD')
  })

  it('returns 400 for invalid currency XXX', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/groups/g1',
      payload: { currency: 'XXX' },
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })
})

describe('GET /api/admin/groups — includes currency', () => {
  it('returns currency in group list', async () => {
    vi.mocked(prisma.group.findMany).mockResolvedValueOnce([{
      id: 'g1', name: 'Test', username: 'test', currency: 'GBP',
      createdAt: new Date(), memberPasswordHash: null,
    }] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/groups',
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()[0].currency).toBe('GBP')
  })
})
