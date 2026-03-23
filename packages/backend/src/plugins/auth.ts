import fp from 'fastify-plugin'
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'

export type JWTPayload =
  | { role: 'admin'; adminId: string }
  | { role: 'user'; userId: string; playerId: string; groupId: string; groupRole: 'owner' | 'admin' | 'member' }

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  fastify.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
      const payload = request.user as JWTPayload
      if (payload.role !== 'admin') reply.status(403).send({ error: 'Forbidden' })
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  fastify.decorate('requireGroup', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
      const payload = request.user as JWTPayload
      if (payload.role !== 'user') reply.status(403).send({ error: 'Forbidden' })
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  fastify.decorate('requireGroupAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
      const payload = request.user as JWTPayload
      if (payload.role !== 'user') {
        reply.status(403).send({ error: 'Forbidden' })
        return
      }
      if (payload.groupRole !== 'owner' && payload.groupRole !== 'admin') {
        reply.status(403).send({ error: 'Forbidden: admin access required' })
      }
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  fastify.decorate('requireGroupOwner', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
      const payload = request.user as JWTPayload
      if (payload.role !== 'user' || payload.groupRole !== 'owner') {
        reply.status(403).send({ error: 'Forbidden: owner access required' })
      }
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireGroup: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireGroupAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireGroupOwner: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export default fp(authPlugin)
