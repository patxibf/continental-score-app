import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js')
import { prisma } from '../prisma.js'
import { nameToSlug, uniqueSlug } from '../slug.js'

describe('nameToSlug', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(nameToSlug('My Group')).toBe('my-group')
  })

  it('removes special characters', () => {
    expect(nameToSlug("The O'Briens!")).toBe('the-obriens')
  })

  it('collapses multiple dashes', () => {
    expect(nameToSlug('hello---world')).toBe('hello-world')
  })

  it('trims leading and trailing dashes', () => {
    expect(nameToSlug('-hello-')).toBe('hello')
  })

  it('truncates to 50 chars', () => {
    expect(nameToSlug('a'.repeat(60)).length).toBeLessThanOrEqual(50)
  })
})

describe('uniqueSlug', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns base slug when no conflict', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce(null)
    expect(await uniqueSlug('My Group')).toBe('my-group')
  })

  it('appends -2 on first conflict', async () => {
    vi.mocked(prisma.group.findUnique)
      .mockResolvedValueOnce({ id: 'x' } as any) // 'my-group' taken
      .mockResolvedValueOnce(null)               // 'my-group-2' free
    expect(await uniqueSlug('My Group')).toBe('my-group-2')
  })
})
