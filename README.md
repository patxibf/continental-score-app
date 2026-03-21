# Continental Scorekeeper

Full-stack web app for tracking scores in the Spanish card game Continental.

## Stack

- **Frontend**: React 18 + Vite + TypeScript + Shadcn/ui + Tailwind
- **Backend**: Fastify + TypeScript + Prisma
- **Database**: PostgreSQL
- **Auth**: JWT (httpOnly cookies)
- **Bot**: Telegraf (Telegram)
- **Monorepo**: npm workspaces

## Local Development

### Prerequisites
- Node.js 20+
- Docker (for Postgres)

### Setup

```bash
# 1. Clone & install
npm install

# 2. Start Postgres
docker-compose up -d

# 3. Copy env files
cp packages/backend/.env.example packages/backend/.env
cp packages/bot/.env.example packages/bot/.env

# 4. Edit packages/backend/.env (set JWT_SECRET, ADMIN_PASSWORD)

# 5. Run migrations & seed admin
cd packages/backend
npx prisma migrate dev
ADMIN_PASSWORD=yourpassword npm run db:seed

# 6. Start dev servers
cd ../..
npm run dev         # backend + frontend
npm run dev:bot     # telegram bot (separate terminal, needs BOT_TOKEN)
```

Frontend: http://localhost:5173
Backend API: http://localhost:3001
Prisma Studio: `npm run db:studio`

## Game Rules

| Round | Cards | Required Melds |
|-------|-------|----------------|
| 1 | 7 | Two trios |
| 2 | 8 | One trio + one run |
| 3 | 9 | Two runs |
| 4 | 10 | Three trios |
| 5 | 11 | Two trios + one run |
| 6 | 12 | One trio + two runs |
| 7 | 13 | Three runs |

**Penalty points**: 2–9 = face value, 10/J/Q/K = 10, A = 20, Joker = 50
**Winner**: lowest cumulative score after 7 rounds

## AWS Deployment

See `.github/workflows/` for CI/CD pipelines.

Required GitHub Secrets:
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`
- `EC2_HOST`, `EC2_SSH_KEY`

## Telegram Bot

1. Create a bot via @BotFather, get token
2. Set `TELEGRAM_BOT_TOKEN` in `packages/bot/.env`
3. Run `npm run dev:bot`
4. In your Telegram group: `/login <group_username>`

### Bot Commands
- `/login <username>` — Link chat to group
- `/newgame` — Start a game (inline player selection)
- `/score` — Enter round scores (conversational)
- `/closegame` — Close current game
- `/ranking` — Season standings
