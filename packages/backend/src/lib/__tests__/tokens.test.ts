import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js')
import { prisma } from '../prisma.js'
import { generateToken, createAuthToken, consumeToken } from '../tokens.js'

describe('generateToken', () => {
  it('returns 64-char hex string', () => {
    const t = generateToken()
    expect(t).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns unique values', () => {
    expect(generateToken()).not.toBe(generateToken())
  })
})

describe('createAuthToken', () => {
  beforeEach(() => vi.resetAllMocks())

  it('creates token in db and returns the hex string', async () => {
    vi.mocked(prisma.authToken.create).mockResolvedValueOnce({
      token: 'abc123',
    } as any)

    const result = await createAuthToken('user-1', 'EMAIL_VERIFICATION', 24)
    expect(prisma.authToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          type: 'EMAIL_VERIFICATION',
        }),
      }),
    )
    expect(result).toBe('abc123')
  })
})

describe('consumeToken', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns null when token not found', async () => {
    vi.mocked(prisma.authToken.findUnique).mockResolvedValueOnce(null)
    expect(await consumeToken('bad', 'EMAIL_VERIFICATION')).toBeNull()
  })

  it('returns null when token is expired', async () => {
    vi.mocked(prisma.authToken.findUnique).mockResolvedValueOnce({
      id: 't1', userId: 'u1', type: 'EMAIL_VERIFICATION',
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
    } as any)
    expect(await consumeToken('tok', 'EMAIL_VERIFICATION')).toBeNull()
  })

  it('returns null when token already used', async () => {
    vi.mocked(prisma.authToken.findUnique).mockResolvedValueOnce({
      id: 't1', userId: 'u1', type: 'EMAIL_VERIFICATION',
      expiresAt: new Date(Date.now() + 10000),
      usedAt: new Date(),
    } as any)
    expect(await consumeToken('tok', 'EMAIL_VERIFICATION')).toBeNull()
  })

  it('marks usedAt and returns userId on valid token', async () => {
    vi.mocked(prisma.authToken.findUnique).mockResolvedValueOnce({
      id: 't1', userId: 'u1', type: 'EMAIL_VERIFICATION',
      expiresAt: new Date(Date.now() + 10000),
      usedAt: null,
    } as any)
    vi.mocked(prisma.authToken.update).mockResolvedValueOnce({} as any)

    const result = await consumeToken('tok', 'EMAIL_VERIFICATION')
    expect(result).toEqual({ userId: 'u1' })
    expect(prisma.authToken.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { usedAt: expect.any(Date) },
    })
  })

  it('returns null when type does not match', async () => {
    vi.mocked(prisma.authToken.findUnique).mockResolvedValueOnce({
      id: 't1', userId: 'u1', type: 'PASSWORD_RESET',
      expiresAt: new Date(Date.now() + 10000),
      usedAt: null,
    } as any)
    expect(await consumeToken('tok', 'EMAIL_VERIFICATION')).toBeNull()
  })
})
