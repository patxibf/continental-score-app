# Continental Scorekeeper

Full-stack web app for tracking scores in the Spanish card game Continental. Supports multiple groups, seasons, live in-progress games, standings, stats, a money pot system, and a Telegram bot.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite + TypeScript + Shadcn/ui + Tailwind |
| Backend | Fastify + TypeScript + Prisma (ORM) |
| Database | PostgreSQL 16 |
| Auth | JWT in httpOnly cookies |
| Bot | Telegraf (Telegram) |
| Monorepo | npm workspaces |
| Tests | Vitest + React Testing Library (185 tests) |
| Infra | AWS CDK (ECS Fargate + RDS + S3/CloudFront) |

## Project Structure

```
continental/
├── packages/
│   ├── backend/          # Fastify API (port 3001)
│   │   ├── src/
│   │   │   ├── routes/   # auth, admin, players, seasons, games, rounds, stats
│   │   │   ├── plugins/  # auth plugin (JWT + cookie middleware)
│   │   │   ├── lib/      # prisma client, gameRules constants
│   │   │   └── test/     # buildApp() helper + token factories
│   ├── frontend/         # React SPA (port 5173)
│   │   ├── src/
│   │   │   ├── pages/    # Dashboard, Game, GameHistory, Seasons, Players, Stats, Admin…
│   │   │   ├── components/
│   │   │   ├── hooks/    # useAuth, useToast
│   │   │   └── lib/      # api.ts (typed fetch wrapper), utils.ts
│   └── bot/              # Telegram bot (port 3002)
├── infra/                # AWS CDK stack
├── docker-compose.yml    # Postgres on port 5433
└── package.json          # Root workspaces + scripts
```

## Local Development

### Prerequisites

- Node.js 20+
- Docker (for Postgres)

### Setup

```bash
# 1. Clone & install
npm install

# 2. Start Postgres (maps to port 5433 to avoid conflicts)
docker-compose up -d

# 3. Copy env files
cp packages/backend/.env.example packages/backend/.env
cp packages/bot/.env.example packages/bot/.env

# 4. Edit packages/backend/.env — set JWT_SECRET and ADMIN_PASSWORD

# 5. Run migrations & seed admin
cd packages/backend
npx prisma migrate dev
ADMIN_PASSWORD=yourpassword npm run db:seed

# 6. Start dev servers
cd ../..
npm run dev         # backend :3001 + frontend :5173 (concurrently)
npm run dev:bot     # Telegram bot (separate terminal, needs BOT_TOKEN)
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3001 |
| Health check | http://localhost:3001/health |
| Prisma Studio | `npm run db:studio` |

> **Port note:** If you have another Postgres instance running on 5432, the `docker-compose.yml` maps Continental's DB to **5433** to avoid conflicts.

### Key Commands

```bash
npm test              # run all tests (backend then frontend)
npm run test:watch    # watch mode
npm run test:coverage # coverage report
npm run build         # production build (backend + frontend)
npm run lint          # lint all packages
npm run db:migrate    # run pending migrations
npm run db:seed       # seed admin user
npm run db:studio     # open Prisma Studio
```

## Architecture

### Auth Model

Two roles, both stored in JWT cookie:

- **Admin** (`role: 'admin'`) — platform-level, manages groups via `/admin`
- **Group** (`role: 'group'`) — per-group access with two sub-roles:
  - `groupAccess: 'admin'` — can create/close seasons and games, enter scores
  - `groupAccess: 'member'` — read-only access (view standings, history)

### Data Model

```
Group → Season → Game → Round → RoundScore
   └→ Player (via GroupPlayer)
```

- A group has many seasons; only one can be `ACTIVE` at a time
- A season has many games; multiple can be `IN_PROGRESS` simultaneously
- A game has exactly 7 rounds; a game cannot be closed until all 7 are complete
- Each round has one `RoundScore` per player (points + `wentOut` flag)
- Groups have a configurable currency (GBP/EUR/USD, default EUR)
- Seasons can optionally enable a **money pot**: each player contributes a fixed amount per game; the winner(s) collect the net gain

### Money Pot

When a season is created with `potEnabled: true` and a `contributionAmount`, the pot is active for all games in that season:

- `totalPot` is computed on game creation: `playerCount × contributionAmount`
- On game close, `potAwarded` is written to every `GamePlayer` row:
  - Winner(s): `winnerShare − contribution` (net gain)
  - Losers: `−contribution`
  - Full-table tie: `0` for all (nobody wins or loses)
- The **Earnings Leaderboard** on the season detail page aggregates `potAwarded` across all closed games and sorts players by net earnings

### Scoring

- **Standard**: points = sum of card values of unmelded cards
- **One-go**: player who goes out in one turn scores `-(roundNumber × 10)`
- **Round 7 auto-250**: empty score fields on round 7 default to 250 pts
- **Winner**: lowest cumulative score after 7 rounds

## API Routes

All routes require JWT cookie. Group routes enforce `requireGroup`; write operations enforce `requireGroupAdmin`.

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login (admin or group) |
| POST | `/api/auth/logout` | Clear cookie |
| GET | `/api/auth/me` | Current user info |

### Admin (requireAdmin)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/groups` | List all groups |
| POST | `/api/admin/groups` | Create group |
| PATCH | `/api/admin/groups/:id` | Update group |
| DELETE | `/api/admin/groups/:id` | Delete group |

### Players
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/players` | List group players |
| POST | `/api/players` | Create player |
| PATCH | `/api/players/:id` | Update player |
| DELETE | `/api/players/:id` | Remove player from group |

### Seasons
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/seasons` | List seasons |
| POST | `/api/seasons` | Create season |
| GET | `/api/seasons/:id` | Get season detail |
| POST | `/api/seasons/:id/close` | Close season |
| GET | `/api/seasons/:id/standings` | Season standings |

### Games
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/seasons/:seasonId/games` | List games in season |
| POST | `/api/seasons/:seasonId/games` | Create game |
| GET | `/api/games/:id` | Get game with rounds + live totals |
| POST | `/api/games/:id/close` | Close game (requires all 7 rounds) |
| DELETE | `/api/games/:id` | Abort game (only IN_PROGRESS) |

### Rounds
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/games/:gameId/rounds` | Submit round scores |
| DELETE | `/api/games/:gameId/rounds/last` | Undo last round |

### Stats
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/seasons/:id/standings` | Season standings |
| GET | `/api/stats/all-time` | All-time player stats |
| GET | `/api/stats/h2h` | Head-to-head between two players |
| GET | `/api/stats/player/:id` | Individual player stats |

## Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/dashboard` | Dashboard | Live game banners + active season overview + recent activity |
| `/players` | Players | Manage group roster |
| `/seasons` | Seasons | Season list |
| `/seasons/:id` | SeasonDetail | Standings + game list |
| `/seasons/:id/games/new` | NewGame | Player selection → start game |
| `/games/:id` | Game | Live score entry, round progress, undo |
| `/games/:id/history` | GameHistory | Completed game breakdown |
| `/stats` | Stats | Season stats + head-to-head |
| `/stats/all-time` | StatsAllTime | All-time leaderboard |
| `/stats/players/:id` | PlayerStats | Individual player profile |
| `/admin` | Admin | Group management (admin role only) |

## Testing

185 tests across 11 test files, 0 failures.

```bash
npm test
```

### Backend (133 tests, 7 files)

Uses `buildApp()` (registers all routes with a test JWT secret) and a manual Prisma mock at `src/lib/__mocks__/prisma.ts`.

```typescript
// packages/backend/src/test/helpers.ts
const app = await buildApp()
const token = groupToken(app)           // group admin JWT
const memberTok = memberToken(app)      // group member JWT
const adminTok = adminToken(app)        // platform admin JWT

await app.inject({
  method: 'POST',
  url: '/api/seasons',
  headers: { cookie: `token=${token}` },
  payload: { name: 'Season 1' },
})
```

Test files: `auth`, `admin`, `rounds`, `seasons`, `stats`, `games` + `gameRules` unit tests.

### Frontend (52 tests, 4 files)

Uses `renderWithProviders()` which wraps components with `QueryClientProvider` + `MemoryRouter`. API calls are mocked with `vi.mock('@/lib/api')`.

```typescript
// packages/frontend/src/test/wrapper.tsx
renderWithProviders(<Dashboard />, { initialEntries: ['/dashboard'] })
```

Test files: `Game.ScoreEntry`, `Game.closeButton`, `Dashboard.liveGames`, `SeasonDetail.standings` + `buildShareText`, `api`, `utils`, `useAuth`.

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
**Winner**: lowest cumulative score after all 7 rounds

## Telegram Bot

1. Create a bot via @BotFather, get the token
2. Set `TELEGRAM_BOT_TOKEN` in `packages/bot/.env`
3. Run `npm run dev:bot`
4. In your Telegram group: `/login <group_username>`

### Bot Commands

| Command | Description |
|---------|-------------|
| `/login <username>` | Link chat to group |
| `/newgame` | Start a game (inline player selection) |
| `/score` | Enter round scores (conversational) |
| `/closegame` | Close current game |
| `/ranking` | Season standings |

## AWS Deployment

Infrastructure is defined in `infra/` (AWS CDK). CI/CD pipelines live in `.github/workflows/`.

Required GitHub Secrets:
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`
- `EC2_HOST`, `EC2_SSH_KEY`

See `infra/` for the CDK stack and `.github/workflows/` for deployment workflows.
