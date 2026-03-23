import { prisma } from './prisma.js'

export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

export async function uniqueSlug(name: string): Promise<string> {
  const base = nameToSlug(name)
  let candidate = base
  let n = 2
  while (await prisma.group.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${n++}`
  }
  return candidate
}
