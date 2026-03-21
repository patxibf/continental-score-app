import { Telegraf, Markup, Scenes, session } from 'telegraf'
import { prisma } from './db.js'
import { ROUNDS } from './gameRules.js'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is required')

const bot = new Telegraf(BOT_TOKEN)

// Helper: get group linked to chat
async function getLinkedGroup(chatId: string) {
  const link = await prisma.telegramChat.findUnique({
    where: { chatId },
    include: { group: true },
  })
  return link?.group || null
}

// Helper: get active game in group's active season
async function getOpenGame(groupId: string) {
  const season = await prisma.season.findFirst({
    where: { groupId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  })
  if (!season) return null

  return prisma.game.findFirst({
    where: { seasonId: season.id, status: 'IN_PROGRESS' },
    include: {
      players: { include: { player: true } },
      rounds: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

// /start
bot.command('start', async ctx => {
  await ctx.reply(
    '🃏 *Continental Scorekeeper Bot*\n\n' +
    'Commands:\n' +
    '/login <group\\_username> — Link this chat to your group\n' +
    '/newgame — Start a new game\n' +
    '/score — Enter round scores\n' +
    '/closegame — Close the current game\n' +
    '/ranking — Season standings',
    { parse_mode: 'Markdown' },
  )
})

// /login <group_username>
bot.command('login', async ctx => {
  const args = ctx.message.text.split(' ')
  if (args.length < 2) {
    return ctx.reply('Usage: /login <group_username>')
  }

  const username = args[1].toLowerCase()
  const group = await prisma.group.findUnique({ where: { username } })
  if (!group) {
    return ctx.reply('Group not found. Check the username and try again.')
  }

  const chatId = String(ctx.chat.id)
  await prisma.telegramChat.upsert({
    where: { chatId },
    create: { chatId, groupId: group.id },
    update: { groupId: group.id },
  })

  return ctx.reply(`✅ Chat linked to group *${group.name}*!`, { parse_mode: 'Markdown' })
})

// /newgame
bot.command('newgame', async ctx => {
  const chatId = String(ctx.chat.id)
  const group = await getLinkedGroup(chatId)
  if (!group) {
    return ctx.reply('This chat is not linked to a group. Use /login first.')
  }

  // Get players in active season
  const season = await prisma.season.findFirst({
    where: { groupId: group.id, status: 'ACTIVE' },
    include: { players: { include: { player: true } } },
  })

  if (!season) {
    return ctx.reply('No active season found.')
  }

  const players = season.players
    .map(sp => sp.player)
    .filter(p => p.active)
  if (players.length < 2) {
    return ctx.reply('Need at least 2 players in the season.')
  }

  // Store selected players in session (simple in-memory approach)
  const sessionKey = `newgame:${chatId}`
  ;(global as any)[sessionKey] = { seasonId: season.id, selected: [] }

  const keyboard = Markup.inlineKeyboard([
    ...players.map(p => [Markup.button.callback(p.name, `toggle_player:${p.id}`)]),
    [Markup.button.callback('✅ Start Game', 'start_game')],
    [Markup.button.callback('❌ Cancel', 'cancel_game')],
  ])

  return ctx.reply('Select players for the game:', keyboard)
})

// Handle player selection for new game
bot.action(/toggle_player:(.+)/, async ctx => {
  const chatId = String(ctx.chat?.id)
  const playerId = ctx.match[1]
  const sessionKey = `newgame:${chatId}`
  const gameSession = (global as any)[sessionKey]

  if (!gameSession) {
    await ctx.answerCbQuery('Session expired. Start over with /newgame')
    return
  }

  const idx = gameSession.selected.indexOf(playerId)
  if (idx >= 0) {
    gameSession.selected.splice(idx, 1)
    await ctx.answerCbQuery('Player removed')
  } else {
    gameSession.selected.push(playerId)
    await ctx.answerCbQuery('Player added')
  }

  // Get player names
  const players = await prisma.player.findMany({
    where: { id: { in: gameSession.selected } },
    select: { name: true },
  })

  await ctx.editMessageText(
    `Selected: ${players.map(p => p.name).join(', ') || '(none)'}\n\nToggle players:`,
    ctx.callbackQuery.message && 'reply_markup' in ctx.callbackQuery.message
      ? { reply_markup: ctx.callbackQuery.message.reply_markup }
      : undefined,
  )
})

bot.action('start_game', async ctx => {
  const chatId = String(ctx.chat?.id)
  const sessionKey = `newgame:${chatId}`
  const gameSession = (global as any)[sessionKey]

  if (!gameSession || gameSession.selected.length < 2) {
    await ctx.answerCbQuery('Select at least 2 players!')
    return
  }

  const game = await prisma.game.create({
    data: {
      seasonId: gameSession.seasonId,
      players: {
        create: gameSession.selected.map((pid: string) => ({ playerId: pid })),
      },
    },
    include: { players: { include: { player: true } } },
  })

  delete (global as any)[sessionKey]
  await ctx.answerCbQuery()
  await ctx.editMessageText(
    `🎮 Game started!\nPlayers: ${game.players.map(gp => gp.player.name).join(', ')}\n\nUse /score to enter round scores.`,
  )
})

bot.action('cancel_game', async ctx => {
  const chatId = String(ctx.chat?.id)
  delete (global as any)[`newgame:${chatId}`]
  await ctx.answerCbQuery('Cancelled')
  await ctx.editMessageText('Game creation cancelled.')
})

// /score — interactive round score entry
bot.command('score', async ctx => {
  const chatId = String(ctx.chat.id)
  const group = await getLinkedGroup(chatId)
  if (!group) return ctx.reply('Link this chat first: /login <group_username>')

  const game = await getOpenGame(group.id)
  if (!game) return ctx.reply('No game in progress. Start one with /newgame')

  const roundNumber = game.rounds.length + 1
  if (roundNumber > 7) {
    return ctx.reply('All 7 rounds complete! Use /closegame to finish.')
  }

  const round = ROUNDS[roundNumber - 1]
  const sessionKey = `score:${chatId}`
  ;(global as any)[sessionKey] = {
    gameId: game.id,
    roundNumber,
    players: game.players.map(gp => ({ id: gp.playerId, name: gp.player.name })),
    scores: {} as Record<string, number>,
    wentOut: null as string | null,
    currentIdx: 0,
  }

  await ctx.reply(
    `🃏 *Round ${roundNumber}/7 — ${round.description}*\n(${round.cardsDealt} cards dealt)\n\nWho went out first? (or skip)`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        ...game.players.map(gp => [
          Markup.button.callback(gp.player.name, `went_out:${gp.playerId}`),
        ]),
        [Markup.button.callback('Nobody went out yet / skip', 'no_went_out')],
      ]),
    },
  )
})

bot.action(/went_out:(.+)/, async ctx => {
  const chatId = String(ctx.chat?.id)
  const playerId = ctx.match[1]
  const sessionKey = `score:${chatId}`
  const scoreSession = (global as any)[sessionKey]
  if (!scoreSession) return ctx.answerCbQuery('Session expired')

  scoreSession.wentOut = playerId
  scoreSession.scores[playerId] = 0
  await ctx.answerCbQuery()

  const player = scoreSession.players.find((p: any) => p.id === playerId)
  await ctx.editMessageText(`✅ ${player?.name} went out (0 pts)`)
  await promptNextScore(ctx, chatId)
})

bot.action('no_went_out', async ctx => {
  const chatId = String(ctx.chat?.id)
  await ctx.answerCbQuery()
  await ctx.editMessageText('No one went out yet.')
  await promptNextScore(ctx, chatId)
})

async function promptNextScore(ctx: any, chatId: string) {
  const sessionKey = `score:${chatId}`
  const scoreSession = (global as any)[sessionKey]
  if (!scoreSession) return

  const remaining = scoreSession.players.filter(
    (p: any) => p.id !== scoreSession.wentOut && !(p.id in scoreSession.scores),
  )

  if (remaining.length === 0) {
    // All scores entered, submit
    await submitRoundScores(ctx, chatId)
    return
  }

  const next = remaining[0]
  await ctx.reply(`Score for *${next.name}*? (reply with a number)`, { parse_mode: 'Markdown' })
  scoreSession.waitingFor = next.id
}

// Handle score replies (text messages during score entry)
bot.on('text', async ctx => {
  const chatId = String(ctx.chat.id)
  const sessionKey = `score:${chatId}`
  const scoreSession = (global as any)[sessionKey]

  if (!scoreSession || !scoreSession.waitingFor) return

  const points = parseInt(ctx.message.text, 10)
  if (isNaN(points) || points < 0) {
    return ctx.reply('Please enter a valid non-negative number.')
  }

  scoreSession.scores[scoreSession.waitingFor] = points
  const player = scoreSession.players.find((p: any) => p.id === scoreSession.waitingFor)
  await ctx.reply(`Got it: ${player?.name} = ${points} pts`)
  scoreSession.waitingFor = null

  await promptNextScore(ctx, chatId)
})

async function submitRoundScores(ctx: any, chatId: string) {
  const sessionKey = `score:${chatId}`
  const scoreSession = (global as any)[sessionKey]
  if (!scoreSession) return

  const scores = scoreSession.players.map((p: any) => ({
    playerId: p.id,
    points: scoreSession.scores[p.id] ?? 0,
    wentOut: p.id === scoreSession.wentOut,
  }))

  const round = await prisma.round.create({
    data: {
      gameId: scoreSession.gameId,
      roundNumber: scoreSession.roundNumber,
      completedAt: new Date(),
      scores: { create: scores },
    },
    include: { scores: { include: { player: true } } },
  })

  delete (global as any)[sessionKey]

  // Build round summary
  const summary = round.scores
    .sort((a, b) => a.points - b.points)
    .map(s => `${s.player.name}: ${s.wentOut ? '0 🏆' : s.points}`)
    .join('\n')

  const msg = `✅ *Round ${scoreSession.roundNumber} saved!*\n\n${summary}`

  if (scoreSession.roundNumber === 7) {
    await ctx.reply(msg + '\n\n🎉 All 7 rounds complete! Use /closegame to close the game.', {
      parse_mode: 'Markdown',
    })
  } else {
    await ctx.reply(msg + `\n\nNext: Round ${scoreSession.roundNumber + 1}/7`, {
      parse_mode: 'Markdown',
    })
  }
}

// /closegame
bot.command('closegame', async ctx => {
  const chatId = String(ctx.chat.id)
  const group = await getLinkedGroup(chatId)
  if (!group) return ctx.reply('Link this chat first: /login <group_username>')

  const game = await getOpenGame(group.id)
  if (!game) return ctx.reply('No game in progress.')

  // Compute totals
  const totals: Record<string, number> = {}
  for (const gp of game.players) totals[gp.playerId] = 0
  for (const round of await prisma.round.findMany({
    where: { gameId: game.id },
    include: { scores: true },
  })) {
    for (const s of round.scores) {
      totals[s.playerId] = (totals[s.playerId] || 0) + s.points
    }
  }

  const standings = game.players
    .sort((a, b) => (totals[a.playerId] || 0) - (totals[b.playerId] || 0))
    .map((gp, idx) => `${idx + 1}. ${gp.player.name}: ${totals[gp.playerId] || 0} pts`)
    .join('\n')

  await ctx.reply(
    `🏁 *Final Standings:*\n\n${standings}\n\nClose this game?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Yes, close game', `confirm_close:${game.id}`)],
        [Markup.button.callback('❌ Cancel', 'cancel_close')],
      ]),
    },
  )
})

bot.action(/confirm_close:(.+)/, async ctx => {
  const gameId = ctx.match[1]
  await prisma.game.update({
    where: { id: gameId },
    data: { status: 'CLOSED', closedAt: new Date() },
  })
  await ctx.answerCbQuery()
  await ctx.editMessageText('✅ Game closed! Use /newgame to start another.')
})

bot.action('cancel_close', async ctx => {
  await ctx.answerCbQuery('Cancelled')
  await ctx.editMessageText('Game stays open.')
})

// /ranking
bot.command('ranking', async ctx => {
  const chatId = String(ctx.chat.id)
  const group = await getLinkedGroup(chatId)
  if (!group) return ctx.reply('Link this chat first: /login <group_username>')

  const season = await prisma.season.findFirst({
    where: { groupId: group.id, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  })
  if (!season) return ctx.reply('No active season.')

  const games = await prisma.game.findMany({
    where: { seasonId: season.id, status: 'CLOSED' },
    include: {
      players: { include: { player: true } },
      rounds: { include: { scores: true } },
    },
  })

  const playerStats: Record<string, { name: string; points: number; games: number; wins: number }> = {}
  for (const game of games) {
    const gameTotals: Record<string, number> = {}
    for (const gp of game.players) {
      gameTotals[gp.playerId] = 0
      if (!playerStats[gp.playerId]) {
        playerStats[gp.playerId] = { name: gp.player.name, points: 0, games: 0, wins: 0 }
      }
      playerStats[gp.playerId].games++
    }
    for (const round of game.rounds) {
      for (const s of round.scores) {
        gameTotals[s.playerId] = (gameTotals[s.playerId] || 0) + s.points
      }
    }
    const min = Math.min(...Object.values(gameTotals))
    for (const [pid, pts] of Object.entries(gameTotals)) {
      playerStats[pid].points += pts
      if (pts === min) playerStats[pid].wins++
    }
  }

  const sorted = Object.values(playerStats).sort((a, b) => a.points - b.points)
  if (sorted.length === 0) return ctx.reply('No completed games yet.')

  const ranking = sorted
    .map((p, i) => `${i + 1}. ${p.name} — ${p.points} pts (${p.wins}W/${p.games}G)`)
    .join('\n')

  return ctx.reply(`🏆 *${season.name} — Standings*\n\n${ranking}`, { parse_mode: 'Markdown' })
})

// Start bot
const start = async () => {
  const webhookUrl = process.env.WEBHOOK_URL

  if (process.env.NODE_ENV === 'production' && webhookUrl) {
    const port = parseInt(process.env.PORT || '3002')
    await bot.launch({
      webhook: {
        domain: webhookUrl,
        port,
      },
    })
    console.log(`Bot running in webhook mode on port ${port}`)
  } else {
    await bot.launch()
    console.log('Bot running in polling mode')
  }

  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))
}

start().catch(err => {
  console.error(err)
  process.exit(1)
})
