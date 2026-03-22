import { vi } from 'vitest'

export const prisma = {
  admin: {
    findUnique: vi.fn(),
  },
  group: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  game: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  gamePlayer: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  groupPlayer: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  round: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  roundScore: {
    deleteMany: vi.fn(),
  },
  season: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  seasonPlayer: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  $transaction: vi.fn((ops: any) =>
    Array.isArray(ops) ? Promise.all(ops) : ops(prisma),
  ),
}
