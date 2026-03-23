import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { buildApp, groupToken, adminToken } from '../../test/helpers.js'
import type { FastifyInstance } from 'fastify'

vi.mock('../../lib/prisma.js')
vi.mock('../../lib/mailer.js')
vi.mock('../../lib/tokens.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/tokens.js')>()
  return {
    ...actual,
    createAuthToken: vi.fn().mockResolvedValue('mock-token-hex'),
  }
})

import { prisma } from '../../lib/prisma.js'
import { createAuthToken } from '../../lib/tokens.js'

let app: FastifyInstance

beforeEach(async () => {
  app = await buildApp()
  vi.resetAllMocks()
})

afterEach(async () => {
  await app?.close()
})

// ---- Register ----

describe('POST /api/auth/register', () => {
  it('creates user, group, player and returns 201', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null) // email available
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce(null) // slug available
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn: any) => fn(prisma))
    vi.mocked(prisma.user.create).mockResolvedValueOnce({
      id: 'user-1', email: 'a@b.com', emailVerified: false,
    } as any)
    vi.mocked(prisma.group.create).mockResolvedValueOnce({
      id: 'group-1', name: 'Test Group', slug: 'test-group', currency: 'EUR',
    } as any)
    vi.mocked(prisma.player.create).mockResolvedValueOnce({
      id: 'player-1', name: 'Alice', groupId: 'group-1', userId: 'user-1', role: 'OWNER',
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        groupName: 'Test Group',
        playerName: 'Alice',
        avatar: 'cat',
        email: 'a@b.com',
        password: 'password123',
      },
    })

    expect(res.statusCode).toBe(201)
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('returns 400 EMAIL_TAKEN when email exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: 'u1' } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        groupName: 'Test', playerName: 'Alice', avatar: 'cat',
        email: 'taken@b.com', password: 'password123',
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('EMAIL_TAKEN')
  })

  it('returns 400 when password is too short', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        groupName: 'Test', playerName: 'Alice', avatar: 'cat',
        email: 'a@b.com', password: 'short',
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when groupName is too short', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        groupName: 'X', playerName: 'Alice', avatar: 'cat',
        email: 'a@b.com', password: 'password123',
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when avatar is invalid', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        groupName: 'Test Group', playerName: 'Alice', avatar: 'dragon',
        email: 'a@b.com', password: 'password123',
      },
    })

    expect(res.statusCode).toBe(400)
  })
})

// ---- Verify email ----

describe('POST /api/auth/verify-email', () => {
  it('marks emailVerified and returns 200 on valid token', async () => {
    vi.mocked(prisma.authToken.findUnique).mockResolvedValueOnce({
      id: 't1', userId: 'u1', type: 'EMAIL_VERIFICATION',
      expiresAt: new Date(Date.now() + 10000), usedAt: null,
    } as any)
    vi.mocked(prisma.authToken.update).mockResolvedValueOnce({} as any)
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email',
      payload: { token: 'validtoken' },
    })

    expect(res.statusCode).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { emailVerified: true },
    })
  })

  it('returns 400 INVALID_TOKEN on bad token', async () => {
    vi.mocked(prisma.authToken.findUnique).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email',
      payload: { token: 'badtoken' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('INVALID_TOKEN')
  })
})

// ---- Forgot password ----

describe('POST /api/auth/forgot-password', () => {
  it('always returns 200 (no enumeration)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'unknown@example.com' },
    })

    expect(res.statusCode).toBe(200)
  })

  it('creates reset token when user exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'u1', email: 'a@b.com',
    } as any)
    vi.mocked(prisma.authToken.updateMany).mockResolvedValueOnce({ count: 0 } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'a@b.com' },
    })

    expect(res.statusCode).toBe(200)
    expect(createAuthToken).toHaveBeenCalledWith('u1', 'PASSWORD_RESET', 1)
  })
})

// ---- Reset password ----

describe('POST /api/auth/reset-password', () => {
  it('updates password on valid token', async () => {
    vi.mocked(prisma.authToken.findUnique).mockResolvedValueOnce({
      id: 't1', userId: 'u1', type: 'PASSWORD_RESET',
      expiresAt: new Date(Date.now() + 10000), usedAt: null,
    } as any)
    vi.mocked(prisma.authToken.update).mockResolvedValueOnce({} as any)
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: 'validtoken', password: 'newpassword123' },
    })

    expect(res.statusCode).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    )
  })

  it('returns 400 on expired/used token', async () => {
    vi.mocked(prisma.authToken.findUnique).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: 'bad', password: 'newpassword123' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('INVALID_TOKEN')
  })
})

// ---- Login ----

describe('POST /api/auth/login', () => {
  it('returns 200 with JWT for single-group user', async () => {
    const hash = await bcrypt.hash('pass123', 1)
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'u1', email: 'a@b.com', passwordHash: hash, emailVerified: true,
    } as any)
    vi.mocked(prisma.player.findMany).mockResolvedValueOnce([{
      id: 'p1', groupId: 'g1', role: 'OWNER',
      group: { id: 'g1', name: 'My Group', slug: 'my-group', currency: 'EUR' },
    }] as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'pass123' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['set-cookie']).toBeDefined()
    expect(res.json()).not.toHaveProperty('requiresGroupSelection')
  })

  it('returns requiresGroupSelection when user has multiple groups', async () => {
    const hash = await bcrypt.hash('pass123', 1)
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'u1', email: 'a@b.com', passwordHash: hash, emailVerified: true,
    } as any)
    vi.mocked(prisma.player.findMany).mockResolvedValueOnce([
      { id: 'p1', groupId: 'g1', role: 'OWNER', group: { id: 'g1', name: 'Group 1', slug: 'g1' } },
      { id: 'p2', groupId: 'g2', role: 'MEMBER', group: { id: 'g2', name: 'Group 2', slug: 'g2' } },
    ] as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'pass123' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().requiresGroupSelection).toBe(true)
    expect(res.json().groups).toHaveLength(2)
  })

  it('returns 401 on wrong password', async () => {
    const hash = await bcrypt.hash('correct', 1)
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'u1', email: 'a@b.com', passwordHash: hash,
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'wrong' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 401 on unknown email', async () => {
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@b.com', password: 'pass' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('logs in admin by username via email field', async () => {
    const hash = await bcrypt.hash('adminpass', 1)
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce({
      id: 'admin-1', username: 'admin', passwordHash: hash,
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin', password: 'adminpass' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('admin')
  })
})

// ---- Switch group ----

describe('POST /api/auth/switch-group', () => {
  it('issues new JWT for valid group', async () => {
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce({
      id: 'p2', groupId: 'g2', role: 'MEMBER',
      group: { id: 'g2', name: 'Group 2', slug: 'g2', currency: 'EUR' },
    } as any)
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'user-1', email: 'a@b.com', emailVerified: true,
    } as any)

    const token = groupToken(app, 'g1')
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/switch-group',
      payload: { groupId: 'g2' },
      cookies: { token },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('returns 403 when user not in that group', async () => {
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce(null)

    const token = groupToken(app, 'g1')
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/switch-group',
      payload: { groupId: 'g-other' },
      cookies: { token },
    })

    expect(res.statusCode).toBe(403)
  })
})

// ---- Me ----

describe('GET /api/auth/me', () => {
  it('returns user shape with groupRole and emailVerified', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'user-1', email: 'a@b.com', emailVerified: true,
    } as any)
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce({
      id: 'player-1', name: 'Alice', avatar: 'cat', role: 'OWNER',
      group: { id: 'group-1', name: 'My Group', slug: 'my-group', currency: 'EUR' },
    } as any)

    const token = groupToken(app)
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { token },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.role).toBe('user')
    expect(body.email).toBe('a@b.com')
    expect(body.emailVerified).toBe(true)
    expect(body.groupRole).toBe('owner')
    expect(body.groupSlug).toBe('my-group')
    expect(body.playerName).toBe('Alice')
  })

  it('returns admin shape', async () => {
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce({
      id: 'admin-1', username: 'admin',
    } as any)

    const token = adminToken(app)
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { token },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('admin')
    expect(res.json().username).toBe('admin')
  })

  it('returns 401 without cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' })
    expect(res.statusCode).toBe(401)
  })
})

// ---- Auth guards ----

describe('requireGroupAdmin guard', () => {
  it('allows OWNER', async () => {
    vi.mocked(prisma.season.findMany).mockResolvedValueOnce([])
    const token = groupToken(app, 'group-1', 'owner')
    const res = await app.inject({
      method: 'GET',
      url: '/api/seasons',
      cookies: { token },
    })
    // requireGroup on seasons; check it reaches the handler
    expect(res.statusCode).toBe(200)
  })

  it('returns 403 when MEMBER calls admin-only route', async () => {
    const token = groupToken(app, 'group-1', 'member')
    const res = await app.inject({
      method: 'POST',
      url: '/api/seasons',
      payload: { name: 'S1' },
      cookies: { token },
    })
    expect(res.statusCode).toBe(403)
  })
})
