import crypto from 'crypto'
import { prisma } from './prisma.js'

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function createAuthToken(
  userId: string,
  type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
  expiryHours: number,
): Promise<string> {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000)
  const record = await prisma.authToken.create({
    data: { token, type, userId, expiresAt },
    select: { token: true },
  })
  return record.token
}

export async function consumeToken(
  token: string,
  type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
): Promise<{ userId: string } | null> {
  const record = await prisma.authToken.findUnique({ where: { token } })
  if (!record) return null
  if (record.type !== type) return null
  if (record.usedAt) return null
  if (record.expiresAt < new Date()) return null

  await prisma.authToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  })
  return { userId: record.userId }
}
