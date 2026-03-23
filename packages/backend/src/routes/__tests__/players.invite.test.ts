import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp, groupToken } from '../../test/helpers.js'
import type { FastifyInstance } from 'fastify'

vi.mock('../../lib/prisma.js')
vi.mock('../../lib/mailer.js', () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '../../lib/prisma.js'

let app: FastifyInstance
beforeEach(async () => { app = await buildApp(); vi.resetAllMocks() })
afterEach(async () => { await app?.close() })

// ------------------------------------------------------------------ //
// POST /api/players/invite
// ------------------------------------------------------------------ //
describe('POST /api/players/invite', () => {
  it('returns 201 and sends invitation for a new email', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({ id: 'group-1', name: 'Test Group' } as any)
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce(null)
    vi.mocked(prisma.player.create).mockResolvedValueOnce({ id: 'p-new' } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/players/invite',
      payload: { name: 'Alice', email: 'alice@example.com' },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().message).toBe('Invitation sent')
  })

  it('returns 400 ALREADY_MEMBER if email belongs to an existing group member', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: 'user-99' } as any)
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce({ id: 'p-existing' } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/players/invite',
      payload: { name: 'Alice', email: 'alice@example.com' },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('ALREADY_MEMBER')
  })

  it('returns 400 for invalid email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/players/invite',
      payload: { name: 'Alice', email: 'not-an-email' },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for missing name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/players/invite',
      payload: { email: 'alice@example.com' },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('updates existing pending invite if email+group already has pending player', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({ id: 'group-1', name: 'Test Group' } as any)
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce({ id: 'p-pending', userId: null } as any)
    vi.mocked(prisma.player.update).mockResolvedValueOnce({ id: 'p-pending' } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/players/invite',
      payload: { name: 'Alice', email: 'alice@example.com' },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(201)
    expect(vi.mocked(prisma.player.update)).toHaveBeenCalledTimes(1)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/players/invite',
      payload: { name: 'Alice', email: 'alice@example.com' },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ------------------------------------------------------------------ //
// GET /api/players/invitation/:token
// ------------------------------------------------------------------ //
describe('GET /api/players/invitation/:token', () => {
  it('returns 200 with playerName and groupName for valid token', async () => {
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce({
      id: 'p1',
      name: 'Alice',
      group: { name: 'Test Group' },
    } as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/invitation/valid-token-abc',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ playerName: 'Alice', groupName: 'Test Group' })
  })

  it('returns 404 for invalid or expired token', async () => {
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'GET',
      url: '/api/players/invitation/bad-token',
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('INVALID_TOKEN')
  })
})

// ------------------------------------------------------------------ //
// POST /api/players/invitation/claim
// ------------------------------------------------------------------ //
describe('POST /api/players/invitation/claim', () => {
  it('returns 200 and issues JWT when claiming a valid invite (single group)', async () => {
    vi.mocked(prisma.player.findFirst)
      // First call: find the invite
      .mockResolvedValueOnce({ id: 'p-invite', groupId: 'group-1', userId: null } as any)
      // Second call: check already member
      .mockResolvedValueOnce(null)

    vi.mocked(prisma.$transaction).mockResolvedValueOnce([{ id: 'p-invite', userId: 'user-1' }] as any)

    vi.mocked(prisma.player.findMany).mockResolvedValueOnce([
      {
        id: 'p-invite',
        groupId: 'group-1',
        role: 'MEMBER',
        group: { id: 'group-1', name: 'Test Group', slug: 'test-group', currency: 'EUR' },
      },
    ] as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/players/invitation/claim',
      payload: { token: 'valid-token-abc' },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().message).toBe('Invitation claimed')
  })

  it('returns 400 INVALID_TOKEN when token not found or expired', async () => {
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/players/invitation/claim',
      payload: { token: 'bad-token' },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('INVALID_TOKEN')
  })

  it('returns 400 ALREADY_MEMBER when user is already in the group', async () => {
    vi.mocked(prisma.player.findFirst)
      // First call: find the invite
      .mockResolvedValueOnce({ id: 'p-invite', groupId: 'group-1', userId: null } as any)
      // Second call: already a member
      .mockResolvedValueOnce({ id: 'p-existing' } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/players/invitation/claim',
      payload: { token: 'valid-token-abc' },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('ALREADY_MEMBER')
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/players/invitation/claim',
      payload: { token: 'some-token' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns requiresGroupSelection when user is in multiple groups', async () => {
    vi.mocked(prisma.player.findFirst)
      .mockResolvedValueOnce({ id: 'p-invite', groupId: 'group-1', userId: null } as any)
      .mockResolvedValueOnce(null)

    vi.mocked(prisma.$transaction).mockResolvedValueOnce([{ id: 'p-invite', userId: 'user-1' }] as any)

    vi.mocked(prisma.player.findMany).mockResolvedValueOnce([
      {
        id: 'p-invite',
        groupId: 'group-1',
        role: 'MEMBER',
        group: { id: 'group-1', name: 'Group A', slug: 'group-a', currency: 'EUR' },
      },
      {
        id: 'p-old',
        groupId: 'group-2',
        role: 'ADMIN',
        group: { id: 'group-2', name: 'Group B', slug: 'group-b', currency: 'GBP' },
      },
    ] as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/players/invitation/claim',
      payload: { token: 'valid-token-abc' },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().requiresGroupSelection).toBe(true)
    expect(res.json().groups).toHaveLength(2)
  })
})
