import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { buildApp, groupToken, adminToken } from '../../test/helpers.js'
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

describe('POST /api/auth/login', () => {
  it('sets a cookie and returns role on valid admin credentials', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10)
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce({
      id: 'admin-1',
      username: 'admin',
      passwordHash,
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'correct-password' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ role: 'admin', username: 'admin' })
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('returns 401 on wrong password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10)
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce({
      id: 'admin-1',
      username: 'admin',
      passwordHash,
    } as any)
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'wrong-password' },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ error: 'Invalid credentials' })
  })

  it('sets a cookie and returns groupId on valid group credentials', async () => {
    const passwordHash = await bcrypt.hash('group-pass', 10)
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: 'group-1',
      username: 'mygroup',
      name: 'My Group',
      passwordHash,
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'mygroup', password: 'group-pass' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ role: 'group', groupId: 'group-1', groupName: 'My Group' })
    expect(res.headers['set-cookie']).toBeDefined()
  })
})

describe('POST /api/auth/logout', () => {
  it('clears the token cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
    })

    expect(res.statusCode).toBe(200)
    // Cookie cleared = set-cookie header with empty value and past max-age
    const cookie = res.headers['set-cookie'] as string
    expect(cookie).toMatch(/token=;/)
  })
})

describe('GET /api/auth/me', () => {
  it('returns user info when authenticated as group', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: 'group-1',
      name: 'My Group',
      username: 'mygroup',
    } as any)

    const token = groupToken(app, 'group-1')
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { token },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ role: 'group', groupId: 'group-1' })
  })

  it('returns 401 without a cookie', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(res.statusCode).toBe(401)
  })
})

describe('GET /api/auth/me — currency field', () => {
  it('returns currency for group user', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: 'group-1', name: 'Test Group', username: 'test-group', currency: 'GBP',
    } as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().currency).toBe('GBP')
  })

  it('does not include currency for platform admin', async () => {
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce({
      id: 'admin-1', username: 'admin',
    } as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).not.toHaveProperty('currency')
  })
})

describe('POST /api/auth/login — group dual password', () => {
  it('returns groupAccess=admin when admin password matches', async () => {
    const bcrypt = await import('bcryptjs')
    const adminHash = await bcrypt.hash('adminpass', 1)
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: 'g1', name: 'Test Group', username: 'testgroup',
      passwordHash: adminHash,
      memberPasswordHash: null,
      createdAt: new Date(),
      telegramChats: [],
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testgroup', password: 'adminpass' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ role: 'group', groupAccess: 'admin' })
  })

  it('returns groupAccess=member when member password matches', async () => {
    const bcrypt = await import('bcryptjs')
    const adminHash = await bcrypt.hash('adminpass', 1)
    const memberHash = await bcrypt.hash('memberpass', 1)
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: 'g1', name: 'Test Group', username: 'testgroup',
      passwordHash: adminHash,
      memberPasswordHash: memberHash,
      createdAt: new Date(),
      telegramChats: [],
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testgroup', password: 'memberpass' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ role: 'group', groupAccess: 'member' })
  })

  it('returns 401 when neither password matches', async () => {
    const bcrypt = await import('bcryptjs')
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: 'g1', name: 'Test Group', username: 'testgroup',
      passwordHash: await bcrypt.hash('adminpass', 1),
      memberPasswordHash: await bcrypt.hash('memberpass', 1),
      createdAt: new Date(),
      telegramChats: [],
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testgroup', password: 'wrongpass' },
    })

    expect(res.statusCode).toBe(401)
  })
})
