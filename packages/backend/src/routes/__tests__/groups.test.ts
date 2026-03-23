import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp, groupToken, memberToken } from '../../test/helpers.js'
import type { FastifyInstance } from 'fastify'

vi.mock('../../lib/prisma.js')
import { prisma } from '../../lib/prisma.js'

let app: FastifyInstance
beforeEach(async () => { app = await buildApp(); vi.resetAllMocks() })
afterEach(async () => { await app?.close() })

describe('GET /api/groups/current', () => {
  it('returns current group info', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: 'group-1', name: 'My Group', slug: 'my-group', currency: 'EUR', createdAt: new Date(),
      _count: { players: 3 },
    } as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/groups/current',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: 'group-1', name: 'My Group', slug: 'my-group' })
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/groups/current' })
    expect(res.statusCode).toBe(401)
  })
})

describe('PATCH /api/groups/current', () => {
  it('allows owner/admin to update name', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({ id: 'group-1' } as any)
    vi.mocked(prisma.group.update).mockResolvedValueOnce({
      id: 'group-1', name: 'New Name', slug: 'my-group', currency: 'EUR',
    } as any)

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/groups/current',
      payload: { name: 'New Name' },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('New Name')
  })

  it('returns 403 for member', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/groups/current',
      payload: { name: 'New Name' },
      cookies: { token: memberToken(app) },
    })
    expect(res.statusCode).toBe(403)
  })
})
