import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') })

import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import authPlugin from './plugins/auth.js'
import authRoutes from './routes/auth.js'
import adminRoutes from './routes/admin.js'
import playerRoutes from './routes/players.js'
import seasonRoutes from './routes/seasons.js'
import gameRoutes from './routes/games.js'
import roundRoutes from './routes/rounds.js'
import statsRoutes from './routes/stats.js'

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
})

const start = async () => {
  const port = parseInt(process.env.PORT || '3001')
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required')
  }

  await fastify.register(fastifyCors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })

  await fastify.register(fastifyCookie)

  await fastify.register(fastifyJwt, {
    secret: jwtSecret,
    cookie: {
      cookieName: 'token',
      signed: false,
    },
  })

  await fastify.register(authPlugin)

  // Routes
  await fastify.register(authRoutes)
  await fastify.register(adminRoutes)
  await fastify.register(playerRoutes)
  await fastify.register(seasonRoutes)
  await fastify.register(gameRoutes)
  await fastify.register(roundRoutes)
  await fastify.register(statsRoutes)

  fastify.get('/health', async () => ({ status: 'ok' }))

  try {
    await fastify.listen({ port, host: '0.0.0.0' })
    fastify.log.info(`Server listening on port ${port}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()

