import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

async function uniqueSlug(name: string): Promise<string> {
  const base = nameToSlug(name)
  let candidate = base
  let n = 2
  while (await prisma.group.findUnique({ where: { username: candidate } })) {
    candidate = `${base}-${n++}`
  }
  return candidate
}

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  password: z.string().min(6),
  memberPassword: z.string().min(6).optional(),
  currency: z.enum(['GBP', 'EUR', 'USD']).optional(),
})

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  password: z.string().min(6).optional(),
  memberPassword: z.string().min(6).optional().nullable(),
  currency: z.enum(['GBP', 'EUR', 'USD']).optional(),
})

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/admin/groups',
    { preHandler: [fastify.requireAdmin] },
    async (_request, reply) => {
      const groups = await prisma.group.findMany({
        select: {
          id: true, name: true, username: true, createdAt: true,
          memberPasswordHash: true, currency: true,
        },
        orderBy: { createdAt: 'desc' },
      })
      // Return hasMemberPassword boolean, not the hash
      return reply.send(groups.map(g => ({
        ...g,
        hasMemberPassword: !!g.memberPasswordHash,
        memberPasswordHash: undefined,
      })))
    },
  )

  fastify.post(
    '/api/admin/groups',
    { preHandler: [fastify.requireAdmin] },
    async (request, reply) => {
      const body = createGroupSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
      }

      const { name, password, memberPassword, currency } = body.data
      const username = await uniqueSlug(name)
      const passwordHash = await bcrypt.hash(password, 10)
      const memberPasswordHash = memberPassword
        ? await bcrypt.hash(memberPassword, 10)
        : null

      const group = await prisma.group.create({
        data: {
          name, username, passwordHash,
          ...(memberPasswordHash ? { memberPasswordHash } : {}),
          currency: currency ?? 'EUR',
        },
        select: { id: true, name: true, username: true, createdAt: true, currency: true },
      })

      return reply.status(201).send(group)
    },
  )

  fastify.patch(
    '/api/admin/groups/:id',
    { preHandler: [fastify.requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = updateGroupSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
      }

      const group = await prisma.group.findUnique({ where: { id } })
      if (!group) {
        return reply.status(404).send({ error: 'Group not found' })
      }

      const data: {
        name?: string; passwordHash?: string; memberPasswordHash?: string | null; currency?: 'GBP' | 'EUR' | 'USD'
      } = {}
      if (body.data.name) data.name = body.data.name
      if (body.data.password) data.passwordHash = await bcrypt.hash(body.data.password, 10)
      if (body.data.memberPassword !== undefined) {
        data.memberPasswordHash = body.data.memberPassword
          ? await bcrypt.hash(body.data.memberPassword, 10)
          : null
      }
      if (body.data.currency) data.currency = body.data.currency

      const updated = await prisma.group.update({
        where: { id },
        data,
        select: { id: true, name: true, username: true, createdAt: true, currency: true },
      })

      return reply.send(updated)
    },
  )

  fastify.delete(
    '/api/admin/groups/:id',
    { preHandler: [fastify.requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const group = await prisma.group.findUnique({ where: { id } })
      if (!group) {
        return reply.status(404).send({ error: 'Group not found' })
      }

      await prisma.group.delete({ where: { id } })
      return reply.status(204).send()
    },
  )
}

export default adminRoutes
