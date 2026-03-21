import bcrypt from 'bcryptjs'
import { prisma } from './lib/prisma.js'

async function seed() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin'
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD env var is required for seeding')
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10)

  const admin = await prisma.admin.upsert({
    where: { username: adminUsername },
    create: { username: adminUsername, passwordHash },
    update: { passwordHash },
  })

  console.log(`Admin seeded: ${admin.username}`)
  await prisma.$disconnect()
}

seed().catch(err => {
  console.error(err)
  process.exit(1)
})
