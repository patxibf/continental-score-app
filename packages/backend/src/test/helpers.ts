import Fastify, { FastifyInstance } from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyJwt from '@fastify/jwt'
import authPlugin from '../plugins/auth.js'
import authRoutes from '../routes/auth.js'
import adminRoutes from '../routes/admin.js'
import groupRoutes from '../routes/groups.js'
import roundRoutes from '../routes/rounds.js'
import seasonRoutes from '../routes/seasons.js'
import statsRoutes from '../routes/stats.js'
import gameRoutes from '../routes/games.js'
import playerRoutes from '../routes/players.js'
import tournamentRoutes from '../routes/tournaments.js'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  await app.register(fastifyCookie)
  await app.register(fastifyJwt, {
    secret: 'test-secret-32-chars-minimum-ok',
    cookie: { cookieName: 'token', signed: false },
  })
  await app.register(authPlugin)
  await app.register(authRoutes)
  await app.register(adminRoutes)
  await app.register(groupRoutes)
  await app.register(roundRoutes)
  await app.register(seasonRoutes)
  await app.register(statsRoutes)
  await app.register(gameRoutes)
  await app.register(playerRoutes)
  await app.register(tournamentRoutes)

  await app.ready()
  return app
}

// Group user with owner role (equivalent to old groupToken admin)
export function groupToken(
  app: FastifyInstance,
  groupId = 'group-1',
  groupRole: 'owner' | 'admin' | 'member' = 'owner',
): string {
  return app.jwt.sign({
    role: 'user',
    userId: 'user-1',
    playerId: 'player-1',
    groupId,
    groupRole,
  })
}

// Member token (read-only)
export function memberToken(app: FastifyInstance, groupId = 'group-1'): string {
  return groupToken(app, groupId, 'member')
}

export function adminToken(app: FastifyInstance, adminId = 'admin-1'): string {
  return app.jwt.sign({ role: 'admin', adminId })
}
