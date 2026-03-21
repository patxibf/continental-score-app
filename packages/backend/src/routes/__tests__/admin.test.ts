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
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce(null) // username not taken
    vi.mocked(prisma.group.create).mockResolvedValueOnce({
      id: 'g-new',
      name: 'Test Group',
      username: 'testgroup',
      createdAt: new Date(),
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test Group', username: 'testgroup', password: 'secret123' },
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ name: 'Test Group', username: 'testgroup' })
  })

  it('returns 400 when username is shorter than 3 chars', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test', username: 'ab', password: 'secret123' },
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when password is shorter than 6 chars', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test', username: 'testgroup', password: '123' },
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 403 when called by a non-admin (group role)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test', username: 'testgroup', password: 'secret123' },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(403)
  })

  it('returns 401 when no cookie is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test', username: 'testgroup', password: 'secret123' },
    })

    expect(res.statusCode).toBe(401)
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
